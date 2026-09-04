/**
 * 注册表分片：身份、档案、心跳、信誉、发现（docs/05）。
 * 每对等体一个分片文件 <pid>.json，各写各的、无全局锁（docs/05 §1）。
 */
import type { Spend } from "./envelope.js";

/** 对等体生命周期状态（docs/05 §3）。 */
export type PeerStatus = "launching" | "idle" | "busy" | "frozen" | "offline" | "retired";

/** 标准能力标签集（可自由扩展，docs/05 §4）。 */
export const STANDARD_CAPABILITIES = [
  "backend",
  "frontend",
  "testing",
  "research",
  "writing",
  "review",
  "ops",
  "data",
] as const;

export interface Reputation {
  completed: number;
  failed: number;
  resigned: number;
}

/** 注册表分片结构（docs/05 §1）。 */
export interface RegistryShard {
  pid: string;
  name: string;
  role: "peer" | "operator" | "hub";
  model?: string;
  profile: string;
  capabilities: string[];
  topics_subscribed: string[];
  /** 推导值：busy ⇔ 持有任一非终态契约（docs/05 §1）。 */
  status: PeerStatus;
  frozen: boolean;
  workspace: string;
  contracts_in: string[];
  contracts_out: string[];
  reputation: Reputation;
  spend_today: Spend;
  /** 心跳续期时间戳；过期判离线（默认续期 90s，docs/05 §3）。 */
  alive_until: string;
  registered_at: string;
  /** spawn 来源备注，不产生权限含义（docs/05 §5）。 */
  spawned_by?: string;
  versions: { pv_ext: string; pi?: string };
}

/** list_peers 返回的摘要（发现只给事实，不排序，docs/05 §4）。 */
export interface PeerSummary {
  pid: string;
  name: string;
  capabilities: string[];
  status: PeerStatus;
  reputation: Reputation;
  profile: string;
}

export interface QueryPeersFilter {
  capability?: string;
  idle_only?: boolean;
  topic?: string;
  text?: string;
}

// ---- 文件原语（M1 实现，docs/02 §3、docs/11 §1）----------------------------

/** 读取一个分片；不存在返回 null。 */
export function readShard(_dir: string, _pid: string): RegistryShard | null {
  throw new Error("[pv-core] readShard 未实现（M1）");
}

/** 原子写本会话自己的分片（各写各的，无锁）。 */
export function writeShard(_dir: string, _shard: RegistryShard): void {
  throw new Error("[pv-core] writeShard 未实现（M1）");
}

/** 列出全部分片（发现 / 清扫用）。 */
export function listShards(_dir: string): RegistryShard[] {
  throw new Error("[pv-core] listShards 未实现（M1）");
}

/** 名字域内唯一查重（docs/05 §2）。 */
export function isNameTaken(_dir: string, _name: string, _exceptPid?: string): boolean {
  throw new Error("[pv-core] isNameTaken 未实现（M1）");
}

/** 清扫：把 alive_until 过期的分片幂等标记 offline（谁先看到谁标记，docs/05 §1）。 */
export function sweepOffline(_dir: string, _now?: Date): string[] {
  throw new Error("[pv-core] sweepOffline 未实现（M2）");
}
