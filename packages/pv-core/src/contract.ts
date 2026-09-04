/**
 * 任务契约与状态机（docs/04）。
 * 状态机是纯函数 transition(state, envelope)，非法跃迁抛错（docs/04 §3、docs/11 §4）。
 */
import type { Budget, Envelope, Spend, TaskSpec } from "./envelope.js";
import type { MessagePriority } from "./envelope.js";

/** 契约 8 个状态（docs/04 §3）。 */
export type ContractState =
  | "proposed"
  | "active"
  | "reviewing"
  | "declined"
  | "cancelled"
  | "expired"
  | "failed"
  | "completed";

/** 5 个终态（docs/04 §3 状态图）。 */
export const TERMINAL_STATES = [
  "declined",
  "cancelled",
  "expired",
  "failed",
  "completed",
] as const satisfies readonly ContractState[];

export function isTerminal(state: ContractState): boolean {
  return (TERMINAL_STATES as readonly string[]).includes(state);
}

/** 活跃（非终态）状态：持有这些状态的契约构成关系图。 */
export function isActive(state: ContractState): boolean {
  return !isTerminal(state);
}

/**
 * 契约物化记录（contracts/active.json 中的一条，docs/04 §2）。
 * 该文件是可由审计日志重建的物化缓存（docs/04 §5）。
 */
export interface ContractRecord {
  contract_id: string;
  master: string;
  worker: string;
  state: ContractState;
  /** 链深：发送方最深入向活跃契约 depth + 1（根为 1，docs/04 §2）。 */
  depth: number;
  spec: TaskSpec;
  budget: Budget;
  deadline?: string;
  priority: MessagePriority;
  sandbox: boolean;
  /** worker 汇报的累计消耗。 */
  spend: Spend;
  created_at: string;
  /** 驱动每次状态跃迁的 msg_id 序列——状态的唯一凭证（docs/04 §2/§5）。 */
  history: string[];
}

/** 契约存储文件 contracts/active.json 的结构（物化视图）。 */
export interface ContractStore {
  v: 1;
  contracts: ContractRecord[];
}

/** transition 产出：新记录 + 待审计事件（docs/04 §3、docs/11 §4）。 */
export interface TransitionOutcome {
  record: ContractRecord;
  /** 追加到审计日志的 transition 事件（docs/08 §5）。 */
  events: { kind: "transition"; from: ContractState; to: ContractState; by: string }[];
}

/**
 * 纯函数状态机：f(状态, 消息) → 状态（docs/04 §3 跃迁表 13 行，docs/11 §4）。
 * 非法跃迁抛错 → 上层转 reject 审计事件 + 工具报错；重复消息幂等（docs/04 §3）。
 * M2 实现全部跃迁；M1 只需 proposed/active 相关最小路径。
 */
export function transition(_record: ContractRecord, _envelope: Envelope): TransitionOutcome {
  throw new Error("[pv-core] transition 未实现（M2，见 docs/04 §3 跃迁表）");
}

/**
 * 交付前清账校验：result(success) 仅当 worker 名下无活跃出向子契约（docs/06 §6）。
 */
export function assertClearToDeliver(_workerPid: string, _store: ContractStore): void {
  throw new Error("[pv-core] assertClearToDeliver 未实现（M2，见 docs/06 §6）");
}
