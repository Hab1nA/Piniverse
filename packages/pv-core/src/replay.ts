/**
 * 审计日志与重放（docs/04 §5、docs/08 §5）。
 * 关系即协议：契约全部状态是审计日志的纯函数，重放可逐字节重建物化缓存。
 */
import { join } from "node:path";
import type { ContractStore } from "./contract.js";
import type { MessageType } from "./envelope.js";

/** 审计事件种类（docs/08 §5）。 */
export type AuditKind =
  | "send"
  | "deliver"
  | "reject"
  | "expire"
  | "transition"
  | "inject-merge"
  | "ext-error";

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

/** 追加一条审计事件（谁写谁的事件，无锁竞争）。 */
export function appendAudit(_path: string, _event: AuditEvent): Promise<void> {
  throw new Error("[pv-core] appendAudit 未实现（M1）");
}

/**
 * 重放：按 (ts, 文件内序) 排序重放 send/deliver/transition，从零重建契约台账。
 * M2 验收：删除 contracts/active.json 后重放结果与物化状态逐字节一致（docs/11 §5）。
 */
export function replayAudit(_auditDir: string): ContractStore {
  throw new Error("[pv-core] replayAudit 未实现（M2，见 docs/04 §5）");
}
