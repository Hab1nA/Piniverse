/**
 * Pi 扩展面的最小本地类型（依据 docs/11 §2 Pi API 映射表与已核实的扩展机制）。
 *
 * M1 对接真实 `@earendil-works/pi-coding-agent` 时：
 * - 用其官方扩展类型替换本文件；
 * - 开发期固定 Pi 精确版本（docs/11 §6 风险表）。
 * 本文件只声明 pv-ext 实际用到的面，不追求完整。
 */

/** pv-ext 注入 LLM 上下文的自定义消息类型（docs/03 §7）。 */
export const PV_MESSAGE_TYPE = "pv-message" as const;

/** 注入方式（docs/03 §7、docs/11 §2）。 */
export type DeliverAs = "followUp" | "steer" | "nextTurn";

export interface SendMessageOptions {
  deliverAs?: DeliverAs;
  /** idle 时立即开新 turn。 */
  triggerTurn?: boolean;
}

export interface OutgoingCustomMessage {
  customType: typeof PV_MESSAGE_TYPE;
  content: string;
}

/** 自定义工具定义（schema 用 TypeBox，在 M1 tools.ts 落地强校验）。 */
export interface ToolDefinition {
  description: string;
  schema: unknown;
  execute: (args: unknown) => Promise<unknown> | unknown;
}

/** tool_call 钩子的拦截裁决（docs/08 §3、docs/11 §2）。 */
export interface ToolCallVerdict {
  block: boolean;
  reason?: string;
  /** 允许在拦截前机械改写参数（谨慎，须符合 P6 无决策边界）。 */
  rewrittenArgs?: unknown;
}

export type PiLifecycleEvent =
  | "session_start"
  | "session_shutdown"
  | "session_before_fork"
  | "before_agent_start"
  | "turn_end"
  | "tool_execution_end"
  | "tool_call"
  | "input"
  | "context";

export interface UiApi {
  /** 本会话视角的契约面板（网络图的局部，docs/02 §2）。 */
  setWidget: (widget: unknown) => void;
  notify: (message: string) => void;
}

export interface ExtensionContext {
  isIdle: () => boolean;
  abort: () => void;
  compact: () => Promise<void>;
  getContextUsage: () => { tokens?: number; cost?: number };
  ui: UiApi;
  sessionManager: { list: () => unknown[]; newSession: (opts?: { parentSession?: unknown }) => unknown };
}

/** pv-ext 使用的 Pi 扩展 API 子集。 */
export interface PiExtensionApi {
  registerTool: (name: string, def: ToolDefinition) => void;
  setActiveTools?: (names: string[]) => void;
  on: (event: PiLifecycleEvent, handler: (payload: unknown) => unknown | Promise<unknown>) => void;
  sendMessage: (message: OutgoingCustomMessage, options?: SendMessageOptions) => void;
  /** 簿记/游标/去重：不进 LLM 上下文、跨 compaction 存活（docs/07 §5）。 */
  appendEntry: (type: string, data: unknown) => void;
  exec?: (command: string) => Promise<unknown>;
}
