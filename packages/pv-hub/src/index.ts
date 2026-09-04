/**
 * pv-hub：可选旁路进程（M3，docs/02 §2、docs/11 §5）。
 *
 * 职责上限（Q11，Leaning）：读一切（注册表/审计/信箱）、发审计性质 notify、
 * 执行 operator 工具（freeze/halt/cancel_any/policy_write）、注册表清扫。
 *
 * 铁律：**永不在消息路径上**——拔掉 hub，网络照常工作，只是不可视（docs/02 §5）。
 * 技术栈选型未定（open-questions Q13），M3 前不引入框架依赖。
 */
import type { ContractStore, RegistryShard } from "pv-core";

export interface HubSnapshot {
  peers: RegistryShard[];
  contracts: ContractStore;
}

/** 聚合一次只读快照（不修改任何状态）。M3 实现。 */
export function collectSnapshot(_root: string): Promise<HubSnapshot> {
  throw new Error("[pv-hub] collectSnapshot 未实现（M3）");
}

function main(): void {
  // M3：启动只读看板 / 操作员控制台的 HTTP 或 TUI 服务。
  console.error("[pv-hub] 尚未实现（规划于 M3，见 docs/11 §5）。");
}

// 仅在被直接执行时运行（被 import 时不触发）。
if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, "/")}`) {
  main();
}
