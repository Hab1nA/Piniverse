/**
 * pv-ext 入口：每个对等 Pi 会话加载一份（docs/11 §4 生命周期接线）。
 *
 * session_start        → 生成/确认 PID → 写注册分片 → 启动 inbox watcher → 首次自述 profile
 * turn_end/tool_*_end  → 心跳续期 + spend 累计 + 欠账检查
 * fs.watch(新信封)     → 游标读+去重 → 注入策略 → 推进游标 → 审计 deliver
 * send_message 工具    → pv-core 校验 → 审计 send → 追加对方 inbox
 * 任何状态变化         → transition() → contracts/active.json（短锁）→ appendEntry → setWidget
 * session_shutdown     → 自动代发 resign(shutdown) → 分片 offline → 停 watcher
 *
 * 故障隔离：本扩展任何异常不得炸掉宿主会话——钩子内 try/catch，
 * 降级为"本会话暂离网络"（分片 offline + 审计 ext-error，docs/11 §4）。
 */
import { DEFAULT_POLICY } from "pv-core";
import type { ExtensionContext, PiExtensionApi } from "./pi-types.js";
import { registerMessageTools } from "./tools.js";
import { startInboxWatcher } from "./delivery.js";

export interface ActivateOptions {
  /** .piniverse 根目录；缺省取当前工作区。 */
  root?: string;
}

/** Pi 扩展激活入口（对接真实 Pi 时由其扩展加载器调用）。 */
export function activate(pi: PiExtensionApi, ctx: ExtensionContext, options: ActivateOptions = {}): void {
  const root = options.root ?? ".piniverse";
  // PID 在 session_start 内生成（M1）；此处先占位，保证接线可读。
  const runtime = { root, pid: "" };

  // 兜底常量来自 pv-core，实际每次钩子重读 config/policy.json（热更新，docs/11 §4）。
  void DEFAULT_POLICY;

  registerMessageTools(pi, ctx, runtime);
  const stopWatcher = startInboxWatcher(pi, ctx, runtime);

  pi.on("session_start", async () => {
    // TODO(M1): newPid → 查重 → writeShard → fs.watch 自身 inbox → 首次自述 profile。
  });

  pi.on("session_shutdown", async () => {
    // TODO(M2): 对活跃入向契约代发 resign(shutdown)，分片标记 offline，停 watcher。
    stopWatcher();
  });

  pi.on("session_before_fork", () => {
    // TODO(M2): fork/clone 新实例重置契约簿记，不继承契约（docs/05 §6）。
  });
}

export * from "./pi-types.js";
export * from "./tools.js";
export * from "./delivery.js";
export * from "./policy.js";
export * from "./card.js";
export * from "./ui.js";
