/**
 * pv-core：Piniverse 纯协议/核心库（docs/02 §2、docs/11 §1）。
 *
 * 边界：不直接调用 Pi API、不含任何 LLM 提示词、无 I/O 决策；
 * 只做信封类型与校验、信箱/注册表文件原语、契约状态机纯函数、环检测、预算、重放。
 */

export * from "./ids.js";
export * from "./envelope.js";
export * from "./contract.js";
export * from "./registry.js";
export * from "./mailbox.js";
export * from "./replay.js";
export * from "./policy.js";
