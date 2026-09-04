/**
 * 策略钩子执行（docs/08 §3、docs/11 §2/§4）。
 * on("tool_call")：限流 / 限权 / 冻结 / 深度；每次触发重读 policy.json 以热更新。
 */
import type { Policy } from "pv-core";
import type { ToolCallVerdict } from "./pi-types.js";

export interface ToolCallInput {
  tool: string;
  args: unknown;
  pid: string;
  /** 当前会话作为当事方的活跃契约（用于按契约限权）。 */
  activeContracts?: { contract_id: string; state: string }[];
}

/**
 * 机械执行策略：返回是否拦截及原因。拒绝是策略的机械执行，不是决策（docs/02 §6）。
 * M2 实现限流计数、frozen、按契约 read-only/workspace-only 路径校验。
 */
export function evaluateToolCall(_input: ToolCallInput, _policy: Policy): ToolCallVerdict {
  throw new Error("[pv-ext] evaluateToolCall 未实现（M2，见 docs/08 §3）");
}
