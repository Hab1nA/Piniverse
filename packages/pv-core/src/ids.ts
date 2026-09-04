import { randomBytes } from "node:crypto";

/**
 * 身份与契约标识符（docs/05 §2、docs/04 §2）。
 * 仅负责按格式生成；PID 查重、契约登记属于 registry / contract 层职责。
 */

/** PID 形如 `pv-3f8a12c0`：`pv-` + 8 位小写 hex。 */
export const PID_PATTERN = /^pv-[0-9a-f]{8}$/;

/** 契约 ID 形如 `t-9f3e21ab`：`t-` + 8 位小写 hex。 */
export const CONTRACT_ID_PATTERN = /^t-[0-9a-f]{8}$/;

/** 保留地址：操作员节点（docs/05 §7）。 */
export const PV_HUMAN = "pv-human";

/** 保留身份：hub 的只读身份（docs/05 §2）。 */
export const PV_HUB = "pv-hub";

/** 生成一个新 PID（随机 4 字节 → 8 位小写 hex）。 */
export function newPid(): string {
  return `pv-${randomBytes(4).toString("hex")}`;
}

/** 生成一个新契约 ID（master 在发出 request 前生成，docs/03 §4.1）。 */
export function newContractId(): string {
  return `t-${randomBytes(4).toString("hex")}`;
}

export function isPid(value: unknown): value is string {
  return typeof value === "string" && PID_PATTERN.test(value);
}

export function isContractId(value: unknown): value is string {
  return typeof value === "string" && CONTRACT_ID_PATTERN.test(value);
}

/** 话题定址：`topic:<name>`，仅 broadcast 使用（docs/03 §5）。 */
export function topicAddress(topic: string): string {
  return `topic:${topic}`;
}

export function isTopicAddress(value: unknown): value is string {
  return typeof value === "string" && value.startsWith("topic:");
}
