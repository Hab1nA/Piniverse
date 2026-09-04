/**
 * 追加式文件信箱（docs/02 §3、docs/03 §6、docs/11 §6）。
 * 一行一个信封（JSONL）；同一 (from→to) 对内 FIFO（追加天然有序），at-least-once，崩溃安全。
 *
 * 实现期固定决策（内部机制，不改协议）：
 * - 游标用**字节偏移**（非行号）：watch/轮询触发时只读新增字节，与追加写天然配合。
 * - 一条消息只有在遇到结尾 `\n` 时才算完整；末尾半行不消费、游标不越过，下次重读（写进程崩溃在半行也不损坏已提交消息）。
 * - 去重窗口为最近 {@link DEDUP_WINDOW} 条 msg_id（docs/03 §6）。
 * - 本层只做"增量读出 + 去重"；TTL 过期丢弃属投递层策略（要记 expire 审计），不在此过滤，读到即推进游标。
 */
import { mkdir, open, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { Envelope } from "./envelope.js";

/** 某对等体的信箱目录：.piniverse/mailboxes/<pid>/。 */
export function mailboxDir(root: string, pid: string): string {
  return join(root, "mailboxes", pid);
}

/** 信箱文件路径：.piniverse/mailboxes/<pid>/inbox.jsonl。 */
export function inboxPath(root: string, pid: string): string {
  return join(mailboxDir(root, pid), "inbox.jsonl");
}

/** msg_id 环形去重窗口大小（docs/03 §6：最近 256 条）。 */
export const DEDUP_WINDOW = 256;

/**
 * 读取游标：接收方持久化在 pi.appendEntry（docs/03 §6、docs/11 §2）。
 * 注入成功后才推进；崩溃重启重放游标之后的信封（可能重复注入，靠 seen 幂等去重）。
 */
export interface InboxCursor {
  /** 已消费到的字节偏移。 */
  offset: number;
  /** 最近 DEDUP_WINDOW 条已见 msg_id。 */
  seen: string[];
}

export function emptyCursor(): InboxCursor {
  return { offset: 0, seen: [] };
}

/**
 * 追加一条信封到信箱（发送方调用）。
 *
 * 单行 = `JSON.stringify(envelope) + "\n"`，O_APPEND 追加后 fsync 显式落盘（docs/11 §6）。
 * 父目录不存在时自动创建（"目标从未注册是否拒发"由发送工具层结合注册表判定，文件层只保证可追加）。
 * 不在此重复完整 schema 校验（那是 validateEnvelope 的职责），仅断言携带字符串 id（去重依赖它）。
 */
export async function appendEnvelope(path: string, envelope: Envelope): Promise<void> {
  if (!envelope || typeof envelope.id !== "string" || envelope.id.length === 0) {
    throw new TypeError("appendEnvelope: 信封必须携带非空字符串 id");
  }
  await mkdir(dirname(path), { recursive: true });
  const line = `${JSON.stringify(envelope)}\n`;
  const fh = await open(path, "a");
  try {
    // 字符串重载：write(data, position?, encoding?)；默认编码即 utf8。
    await fh.write(line);
    // 显式 flush 落盘，进程/断电时刻已 fsync 的行不丢（docs/11 §6）。
    await fh.sync();
  } finally {
    await fh.close();
  }
}

/** readSince 的返回：新信封 + 推进后的游标。 */
export interface InboxRead {
  envelopes: Envelope[];
  cursor: InboxCursor;
}

/**
 * 自游标起增量读取信箱，返回新信封与推进后的游标。
 *
 * - 信箱不存在：视为无新消息，原样返回游标。
 * - 游标越过文件末尾（信箱被重建/轮转）：从 0 重读。
 * - 只消费以 `\n` 结尾的完整行；末尾半行保留、游标停在其起点之前。
 * - 完整行 JSON 损坏（外部破坏，append 路径不会产生）直接抛错，不静默吞消息。
 * - msg_id 命中 seen 视为重复注入而跳过（at-least-once 去重）。
 */
export async function readSince(path: string, cursor: InboxCursor): Promise<InboxRead> {
  let size: number;
  try {
    size = (await stat(path)).size;
  } catch {
    return { envelopes: [], cursor };
  }

  let start = Number.isInteger(cursor.offset) && cursor.offset >= 0 ? cursor.offset : 0;
  if (start > size) start = 0; // 文件被重建
  if (start === size) return { envelopes: [], cursor };

  const fh = await open(path, "r");
  const buf: Buffer = Buffer.allocUnsafe(size - start);
  try {
    await fh.read(buf, 0, buf.length, start);
  } finally {
    await fh.close();
  }

  const seen = [...cursor.seen];
  const envelopes: Envelope[] = [];
  let lineStart = 0;

  for (let i = 0; i < buf.length; i++) {
    if (buf[i] !== 0x0a) continue; // 0x0A === '\n'
    const line = buf.subarray(lineStart, i).toString("utf8").replace(/\r$/, "").trim();
    lineStart = i + 1;
    if (line.length === 0) continue; // 防御空行：推进但不产出

    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      throw new Error(`readSince: 信箱出现损坏的完整行（字节 ${start + i} 附近）: ${line.slice(0, 80)}`);
    }
    const id = (parsed as { id?: unknown } | null)?.id;
    if (typeof id === "string" && seen.includes(id)) continue; // 重复注入，幂等跳过
    envelopes.push(parsed as Envelope);
    if (typeof id === "string") {
      seen.push(id);
      while (seen.length > DEDUP_WINDOW) seen.shift();
    }
  }

  // lineStart 之后若仍有字节，即末尾半行：不消费，offset 停在其起点（下次重读）。
  return { envelopes, cursor: { offset: start + lineStart, seen } };
}
