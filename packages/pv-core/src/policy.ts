/**
 * 策略文件类型（.piniverse/config/policy.json，docs/08 §2）。
 * 全部硬规则的唯一来源，仅 operator 可写；钩子每次触发重读以即时生效（docs/11 §4）。
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";

/** operator 角色权力（docs/08 §6）。 */
export type OperatorPower =
  | "freeze"
  | "halt"
  | "cancel_any"
  | "policy_write"
  | "depth_exempt"
  | "read_all";

export interface PolicyDefaults {
  /** 委托链硬深度上限（docs/06 §4.1）。 */
  max_depth: number;
  /** 本地根预算上限。 */
  budget_cap: { tokens: number; cost: number };
  /** 每对等体每分钟发送硬上限（docs/06 §4.3）。 */
  send_rate_per_min: number;
  broadcast_rate_per_min: number;
  broadcast_mode: "topics-only";
  message_body_max_bytes: number;
  /** 超预算自动代发 result(failed)，可关（docs/04 推荐节、docs/08 §4）。 */
  auto_fail_on_budget: boolean;
  sandbox_required: boolean;
  request_ttl_default_seconds: number;
  /** 心跳超时判离线阈值（docs/05 §3）。 */
  stale_offline_seconds: number;
  /** offline 分片保留天数，超期可归档（docs/05 §1）。 */
  shard_retention_days: number;
}

export interface Policy {
  v: 1;
  defaults: PolicyDefaults;
  roles: {
    operator: { can: OperatorPower[] };
    peer: Record<string, never>;
  };
  /** 按 PID 的定点覆盖（docs/08 §2 示例）。 */
  overrides: Record<string, Partial<PolicyDefaults> & { note?: string }>;
}

/** 文档默认值（docs/08 §2、docs/06 §4），与 .piniverse/config/policy.json 保持一致。 */
export const DEFAULT_POLICY: Policy = {
  v: 1,
  defaults: {
    max_depth: 4,
    budget_cap: { tokens: 500000, cost: 5.0 },
    send_rate_per_min: 30,
    broadcast_rate_per_min: 2,
    broadcast_mode: "topics-only",
    message_body_max_bytes: 8192,
    auto_fail_on_budget: true,
    sandbox_required: false,
    request_ttl_default_seconds: 3600,
    stale_offline_seconds: 90,
    shard_retention_days: 7,
  },
  roles: {
    operator: {
      can: ["freeze", "halt", "cancel_any", "policy_write", "depth_exempt", "read_all"],
    },
    peer: {},
  },
  overrides: {},
};

/** 每次钩子触发重读 policy.json（docs/11 §4）；读取失败时的降级策略由 pv-ext 决定。 */
export async function loadPolicy(root: string): Promise<Policy> {
  const raw = await readFile(join(root, "config", "policy.json"), "utf8");
  return JSON.parse(raw) as Policy;
}
