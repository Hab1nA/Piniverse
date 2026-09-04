# AGENTS.md — 给在本仓库工作的 AI 编码会话

本项目是 **Piniverse**：基于 [Pi](https://github.com/earendil-works/pi)（`@earendil-works/pi-coding-agent`）的对等会话网络。动手改代码前，先读 `README.md` 与 `docs/`（快速路径：`docs/00 → 01 → 11`）。

## 常用命令

```bash
npm install          # 安装依赖（npm workspaces 单仓）
npm run build        # tsc -b，按 project references 顺序构建四个包
npm run build:force  # 全量重建（类型检查）
npm run clean        # 清理 dist 与 .tsbuildinfo
npm test             # vitest run，跑 packages/*/test 下的单元测试
```

环境要求：Node.js >= 20（开发环境为 Windows，win32 是一级测试平台，文件 watch/锁必须兼容，见 `docs/11 §6`）。

## 架构与不可违背的约束

- 单仓四包（`docs/11 §1`），依赖方向强制：
  - `pv-ext → pv-core`、`pv-hub → pv-core`、`pv → pv-ext/pv-core`；
  - **`pv-core` 绝不 import Pi，也不含任何 LLM 提示词**——它是纯逻辑 + 文件原语。
- **P6 基础设施无决策**（`docs/02 §6`）：代码只做校验、投递、记录、按策略拦截；绝不选择目标、不撮合、不主动代发消息（唯一例外：契约已授权的预算超限自动 `result(failed)`，`docs/04 推荐节`）。
- **P3 关系即协议**：契约状态只能由已审计消息经纯函数 `transition()` 推导；`contracts/active.json` 是可删除重建的物化缓存，没有日志之外的状态跃迁通道。
- 协议字段、16 种消息类型、契约 8 状态以 `docs/03`、`docs/04` 为唯一规范；pv-core 的类型必须与文档逐字一致，改协议先走 ADR。

## 目录

```
packages/pv-core   信封/信箱/注册表/契约 FSM/重放/策略类型（纯逻辑，可独立单测）
packages/pv-ext    每个对等会话加载一份的 Pi 扩展（唯一在消息路径上的组件）
packages/pv-hub    可选旁路观察者（M3，永不在消息路径上）
packages/pv        启动器 CLI（Form B）
.piniverse/        运行期状态域：registry/contracts/mailboxes/audit/config（docs/02 §3）
docs/adr/          实现期决策记录
```

## 当前里程碑与验收

- 现状：**M1 · 两会话通信**（施工图 `docs/11 §5`）。范围：注册分片、文件信箱、`send_message`/`check_inbox`、idle/busy 注入、审计 send/deliver。
- 验收剧本取自 `docs/09`（文档即测试用例）：两个 Form A 终端互发 notify/request；关闭接收方再开能补收；审计重放与信箱一致。
- 未实现的函数以 `throw new Error("[pkg] xxx 未实现（Mx，见 docs/…）")` 标注，实现时删除对应存根并补测试。

## 决策纪律

`docs/open-questions.md` 中状态为 Open/Leaning 的问题**不得在代码里悄悄定案**；实现中需要收敛时，按 `docs/adr/README.md` 立 ADR，并回写 open-questions 状态。
