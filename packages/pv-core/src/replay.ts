/**
 * 审计日志与重放（docs/04 §5、docs/08 §5）。
 * 关系即协议：契约全部状态是审计日志的纯函数，重放可逐字节重建物化缓存。
 */
import { mkdir, open, readFile, readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { ContractStore } from "./contract.js";
import type { MessageType } from "./envelope.js";

/** 审计事件种类（docs/08 §5）。ext-error 为扩展运行期异常的工程事件。 */
export const AUDIT_KINDS = [
  "send",
  "deliver",
  "reject",
  "expire",
  "transition",
  "inject-merge",
  "ext-error",
] as const;

/** 审计事件种类（docs/08 §5）。ext-error 为扩展运行期异常的工程事件。 */
export type AuditKind = (typeof AUDIT_KINDS)[number];

/** 一条审计事件（信封原文不复制，信箱 + 指针即可复原，保持日志精瘦）。 */
export interface AuditEvent {
  ts: string;
  kind: AuditKind;
  /** 写事件的对等体 PID。 */
  pid: string;
  /** 关联信封 msg id。 */
  msg?: string;
  type?: MessageType;
  to?: string;
  task?: string;
  note?: string;
  /** transition 事件专用。 */
  from?: string;
  by?: string;
}

/** 按月分片：.piniverse/audit/YYYY-MM.jsonl（docs/08 §5）。 */
export function auditFilePath(root: string, date = new Date()): string {
  const y = date.getFullYear();
  const m = `${date.getMonth() + 1}`.padStart(2, "0");
  return join(root, "audit", `${y}-${m}.jsonl`);
}

/**
 * 追加一条审计事件（谁写谁的事件，无锁竞争——每个对等体只追加自己视角的事件）。
 * 单行 JSONL，O_APPEND 后 fsync 显式落盘，崩溃不损坏已提交事件（docs/02 §3、docs/11 §6）。
 * 仅做最小健全性断言（ts/kind/pid），不做任何业务判定——审计只"记录"，不"决策"（P6）。
 */
export async function appendAudit(path: string, event: AuditEvent): Promise<void> {
  if (!event || typeof event.ts !== "string" || event.ts.length === 0) {
    throw new TypeError("appendAudit: 事件必须携带非空字符串 ts");
  }
  if (!(AUDIT_KINDS as readonly string[]).includes(event.kind)) {
    throw new TypeError(`appendAudit: 非法审计事件种类 ${String(event.kind)}`);
  }
  if (typeof event.pid !== "string" || event.pid.length === 0) {
    throw new TypeError("appendAudit: 事件必须携带非空字符串 pid");
  }
  await mkdir(dirname(path), { recursive: true });
  const fh = await open(path, "a");
  try {
    await fh.write(`${JSON.stringify(event)}\n`);
    await fh.sync();
  } finally {
    await fh.close();
  }
}

/** 审计分片文件名：YYYY-MM.jsonl（校验用，忽略非此形状的杂项文件）。 */
const AUDIT_MONTH_FILE = /^\d{4}-\d{2}\.jsonl$/;

/**
 * 读取单个审计分片，按文件内追加顺序返回事件。
 * - 文件不存在 → 空数组。
 * - 末尾无换行的半行（写进程崩溃在半行）忽略，等补全后下次再读；空行跳过。
 * - 完整行 JSON 损坏直接抛错（审计是追责证据，不静默丢弃）。
 */
export async function readAuditFile(path: string): Promise<AuditEvent[]> {
  let text: string;
  try {
    text = await readFile(path, "utf8");
  } catch {
    return [];
  }
  const lines = text.split("\n");
  const complete = text.endsWith("\n") ? lines.length : lines.length - 1; // 末尾半行不计
  const events: AuditEvent[] = [];
  for (let i = 0; i < complete; i++) {
    const line = (lines[i] ?? "").replace(/\r$/, "").trim();
    if (line.length === 0) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      throw new Error(`readAuditFile: 审计分片出现损坏的完整行: ${line.slice(0, 80)}`);
    }
    events.push(parsed as AuditEvent);
  }
  return events;
}

/**
 * 读取整个审计目录：按分片名（YYYY-MM）升序拼接各月事件，片内保持追加序。
 * 分片名升序即月份升序；目录不存在或为空 → []。非分片形状的文件忽略。
 * 全局按 ts 重排是 M2 replayAudit 的职责（正常单调时钟下二者等价，此处保留真实写入顺序）。
 */
export async function readAuditDir(auditDir: string): Promise<AuditEvent[]> {
  let names: string[];
  try {
    names = await readdir(auditDir);
  } catch {
    return [];
  }
  const months = names.filter((n) => AUDIT_MONTH_FILE.test(n)).sort();
  const all: AuditEvent[] = [];
  for (const name of months) {
    all.push(...(await readAuditFile(join(auditDir, name))));
  }
  return all;
}

/**
 * 重放：按 (ts, 文件内序) 排序重放 send/deliver/transition，从零重建契约台账。
 * M2 验收：删除 contracts/active.json 后重放结果与物化状态逐字节一致（docs/11 §5）。
 */
export function replayAudit(_auditDir: string): ContractStore {
  throw new Error("[pv-core] replayAudit 未实现（M2，见 docs/04 §5）");
}
