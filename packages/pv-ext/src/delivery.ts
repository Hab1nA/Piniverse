/**
 * 信箱监视与注入（docs/02 §4、docs/03 §6–7）。
 * fs.watch + 防抖 + 2s 兜底轮询（Windows 语义，docs/11 §6）；游标读 + 去重 → 注入 → 推进游标 → 审计 deliver。
 */
import type { Envelope } from "pv-core";
import type { ExtRuntime } from "./tools.js";
import type { ExtensionContext, PiExtensionApi } from "./pi-types.js";

/**
 * 把信封渲染为模型见到的固定文本模板（docs/03 §7）。
 * 头部一行给类型/来源/关联，正文逐行列 body 字段，尾行给"如何回复"提示。
 */
export function renderEnvelope(_envelope: Envelope): string {
  throw new Error("[pv-ext] renderEnvelope 未实现（M1，见 docs/03 §7 渲染模板）");
}

/**
 * 依据会话 idle/busy 与消息类型选择注入策略（docs/03 §7 表）：
 * - idle：followUp + triggerTurn；
 * - busy 且 steer / (urgent 且 cancel|escalate)：deliverAs=steer 打断；
 * - busy 其余：followUp 排队；超每 turn 上限留信箱下一 idle 批量处理。
 */
export function startInboxWatcher(
  _pi: PiExtensionApi,
  _ctx: ExtensionContext,
  _runtime: ExtRuntime,
): () => void {
  // TODO(M1): fs.watch(runtime.root/mailboxes/<pid>) + 游标 + 去重 + 注入；返回停止函数（session_shutdown 用）。
  return () => {};
}
