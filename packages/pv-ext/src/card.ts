/**
 * 状态卡：本会话视角的契约台账摘要（docs/07 §4–5）。
 * 在 before_agent_start 注入，≤1 KB，compaction 后自动再现；数据源为 appendEntry 簿记。
 */
export interface StateCardData {
  pid: string;
  name: string;
  /** 我作为 worker 欠谁什么。 */
  contractsIn: { contract_id: string; master: string; state: string; goal: string }[];
  /** 我作为 master，谁欠我什么。 */
  contractsOut: { contract_id: string; worker: string; state: string; goal: string }[];
}

/** 生成状态卡文本（≤1KB；内容取舍在 Q14 定稿，M2 按实测上下文收益调整）。 */
export function buildStateCard(_data: StateCardData): string {
  throw new Error("[pv-ext] buildStateCard 未实现（M2，见 docs/07 §4）");
}
