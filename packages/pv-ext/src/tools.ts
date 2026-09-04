/**
 * 消息与发现工具注册（docs/11 §1/§2）。
 * 工具：send_message / check_inbox / list_peers / query_peers / set_name / subscribe。
 * schema 用 TypeBox 做强校验，校验失败报错回给 LLM 自纠（docs/11 §2）。
 */
import type { ExtensionContext, PiExtensionApi } from "./pi-types.js";

export interface ExtRuntime {
  /** .piniverse 根目录。 */
  root: string;
  /** 本会话 PID。 */
  pid: string;
}

/**
 * 注册全部消息/发现工具。M1 实现 send_message / check_inbox / list_peers；
 * query_peers / set_name / subscribe 在 M1 末或 M2 补齐。
 * 边界：发现工具只返回事实列表，绝不排序/撮合（P6，docs/05 §4）。
 */
export function registerMessageTools(
  _pi: PiExtensionApi,
  _ctx: ExtensionContext,
  _runtime: ExtRuntime,
): void {
  // M1：见 docs/03 §3 R1/R3、docs/05 §4、docs/11 §2。
  // TODO(M1): pi.registerTool("send_message", …) 内做信封校验 + 策略检查 + 审计 send + 追加对方 inbox。
}
