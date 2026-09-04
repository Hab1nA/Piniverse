/**
 * 追加式文件信箱（docs/02 §3、docs/03 §6）。
 * 一行一个信封（JSONL）；同一 (from→to) 对内 FIFO，at-least-once，崩溃安全。
 */
import { join } from "node:path";
import type { Envelope } from "./envelope.js";

/** 某对等体的信箱目录：.piniverse/mailboxes/<pid>/。 */
export function mailboxDir(root: string, pid: string): string {
  return join(root, "mailboxes", pid);
}

/** 信箱文件路径：.piniverse/mailboxes/<pid>/inbox.jsonl。 */
export function inboxPath(root: string, pid: string): string {
  return join(mailboxDir(root, pid), "inbox.jsonl");
}

/**
 * 读取游标：接收方持久化在 pi.appendEntry（docs/03 §6、docs/11 §2）。
 * 注入成功后才推进；崩溃重启重放游标之后的信封（可能重复注入，幂等去重）。
 */
export interface InboxCursor {
  /** 已处理到的字节偏移（或行号，实现期二选一并固定）。 */
  offset: number;
  /** 最近 256 条 msg_id 环形去重记录（docs/03 §6）。 */
  seen: string[];
}

export function emptyCursor(): InboxCursor {
  return { offset: 0, seen: [] };
}

/** 追加一条信封到目标信箱（发送方调用；显式 flush，Windows 语义见 docs/11 §6）。 */
export function appendEnvelope(_path: string, _envelope: Envelope): Promise<void> {
  throw new Error("[pv-core] appendEnvelope 未实现（M1）");
}

/** 自游标起读取新信封并给出推进后的新游标（防抖 + 兜底轮询由 pv-ext 负责）。 */
export function readSince(
  _path: string,
  _cursor: InboxCursor,
): Promise<{ envelopes: Envelope[]; cursor: InboxCursor }> {
  throw new Error("[pv-core] readSince 未实现（M1）");
}
