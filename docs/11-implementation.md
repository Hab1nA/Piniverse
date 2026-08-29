# 11 · 实现路线（基于 Pi）

> 状态：草案 Draft v0.1 · 2026-08-29
> 上游：[02 架构](02-architecture.md) · [08 安全与治理](08-safety-governance.md) ｜ 下游：M1 开工

本文件把设计落到 [Pi](https://github.com/earendil-works/pi)（`@earendil-works/pi-coding-agent`）的真实扩展面上：每个机制由哪个 API 承载、组件如何组织、里程碑如何验收。**本仓库当前处于 M0（设计阶段），尚无代码**——本文是 M1 的施工图。

## 本章要点

- 一切机制都压在 pv-ext 一个扩展上；Pi 的 `registerTool` / `on(...)` / `sendMessage` / `appendEntry` 四个原语覆盖了全部需求，无需 fork Pi。
- 两种起步形态（人工开终端 Form A / 启动器托管 Form B）共用同一个扩展；M1 用 A 起步，自动化测试用 B。
- 里程碑 M1–M4 的验收脚本就是 [09 场景走查](09-scenarios.md) 的三个剧本——**文档即测试用例**。

---

## 1. 组件与仓库布局

```text
Piniverse/
├── docs/                        # 本文档体系
├── packages/
│   ├── pv-core/                 # 纯逻辑库（无 Pi 依赖，Node 环境）
│   │   ├── envelope.ts          #   信封类型 + 校验（[03](03-message-protocol.md)）
│   │   ├── mailbox.ts           #   追加写/游标读/文件锁封装
│   │   ├── registry.ts          #   分片读写、心跳、清扫、环检测、预算求和
│   │   ├── contract.ts          #   状态机纯函数 transition(state, env)
│   │   └── replay.ts            #   审计日志重放（[04 §5](04-control-relations.md#5-关系即协议状态由消息推导)）
│   ├── pv-ext/                  # Pi 扩展（每会话加载一份）
│   │   ├── index.ts             #   钩子接线（见 §2 映射表）
│   │   ├── tools.ts             #   registerTool: send_message / check_inbox / list_peers /
│   │   │                        #   query_peers / set_name / subscribe
│   │   ├── delivery.ts          #   fs.watch → 注入策略（idle/busy/合并）
│   │   ├── policy.ts            #   tool_call 钩子执行（限流/限权/冻结/深度）
│   │   ├── card.ts              #   状态卡生成与 before_agent_start 注入
│   │   └── ui.ts                #   ctx.ui.setWidget 契约面板
│   ├── pv-hub/                  # 可选旁路：网络图页面、预算看板、操作员控制台
│   └── pv/                      # 启动器 CLI（Form B）
└── .piniverse/                  # 运行期状态（[02 §3](02-architecture.md#3-进程与文件布局)）
```

依赖方向强制：`pv-ext → pv-core`，`pv-hub → pv-core`，`pv → pv-ext`（为会话注入扩展路径）；`pv-core` 不 import Pi。

## 2. Pi API 映射表

| Piniverse 机制 | Pi 扩展 API | 备注 |
|----------------|------------|------|
| 注册 / 注销 | `pi.on("session_start")` / `pi.on("session_shutdown")` | 注销时自动代发 resign（[05 §3](05-registry-lifecycle.md#3-生命周期)） |
| 消息与发现工具 | `pi.registerTool(name, {schema, execute})` | TypeBox schema 做信封级强校验；校验失败的报错直接回给 LLM（模型自纠） |
| 收信注入 | `pi.sendMessage({customType:"pv-message", content}, {deliverAs, triggerTurn})` | idle→followUp+triggerTurn；steer/urgent→deliverAs:"steer"（[03 §7](03-message-protocol.md#7-与-pi-注入机制的对齐)） |
| 信箱监视 | `fs.watch`（delivery.ts 内） | 防抖 + 游标读；Windows 语义见 §6 风险表 |
| 簿记 / 游标 / 去重 | `pi.appendEntry(type, data)` | 不进 LLM 上下文、跨 compaction 存活（[07 §5](07-context-information.md#5-与-compaction-协同)） |
| 心跳 | `pi.on("turn_end"/"tool_execution_end")` + 低频 timer | 事件驱动为主，timer 兜底 |
| 契约限权 / 冻结 / 限流 | `pi.on("tool_call")` → `{block: true}` / 参数改写；`pi.setActiveTools()` | [08 §3](08-safety-governance.md#3-策略执行点) |
| 状态卡 | `pi.on("before_agent_start")` 注入 | ≤1 KB，compaction 后自动再现（[07 §4](07-context-information.md#4-进入-pi-上下文)） |
| fork/clone 防契约继承 | `pi.on("session_before_fork")` | 新实例重置簿记（[05 §6](05-registry-lifecycle.md#6-恢复与异常)） |
| 本会话契约面板 | `ctx.ui.setWidget()` / `ctx.ui.notify()` | 网络图的局部视角 |
| 用量计量 | 消息事件中的 usage 字段 / `ctx.getContextUsage()` | 会话级实测；契约级自报+交叉校验（[08 §4](08-safety-governance.md#4-预算与计量)） |
| 会话内辅助命令 | `pi.exec()`、自定义 slash command | 如 `/pv-status` 打印本会话契约台账 |
| 协议指南 | 扩展的 `systemPromptAppend` | ~1.5 KB 固定文本（决策启发式、汇报纪律、答复规范） |
| Form B 托管 | `pi --mode rpc`（子进程）或 SDK `createAgentSession()` | 测试与无头部署用；RPC 事件流同时是集成测试的观测面 |

## 3. 两种起步形态

| | Form A · 人工对等网 | Form B · 启动器托管 |
|---|---|---|
| 做法 | 操作员手工开 N 个终端跑 `pi`；项目级 `.pi/extensions/pv-ext` 自动加载 | `pv up --peers 4` 拉起 N 个 `pi --mode rpc` 子进程，注入同一环境 |
| 新对等体加入 | 人开一个新终端 | 运行中的会话用 `spawn_peer` 工具（经 pv 启动器）拉起 |
| 适用 | 日常使用、MVP、与"对等"哲学最一致 | 自动化测试、无头 CI、未来沙箱对等体的宿主 |
| 依赖 | 无（复用 Pi TUI） | pv 启动器进程 |

**推荐**：pv-ext 从第一天起就兼容两种形态（同一扩展代码，差异只在谁拉起会话）；M1 以 Form A 验证人类体验，集成测试始终用 Form B（可控、可断言）。

## 4. pv-ext 内部结构

pv-ext 是唯一的"在消息路径上"的组件，其生命周期钩子接线：

```text
session_start ──► 生成/确认 PID → 写注册分片 → 启动 fs.watch(自己的 inbox)
                                          └► 首次: LLM 自述 profile（一次轻量调用）
turn_end / tool_execution_end ──► 心跳续期 + spend 累计 + 欠账检查
fs.watch(新信封) ──► 游标读 + 去重 → 注入策略（§2）→ 游标推进 → 审计 deliver
send_message 工具 ──► pv-core 校验（R1/R3/深度/预算/限流）→ 审计 send → 追加对方 inbox
任何状态变化 ──► transition() 纯函数 → contracts/active.json（短锁）→ appendEntry 簿记 → setWidget 刷新
session_shutdown ──► 自动代发 resign(shutdown) → 分片标记 offline → 停 watch
```

实现要点：

- **状态机即代码**：`transition()` 的跃迁表与 [04 §3](04-control-relations.md#3-状态机) 逐行对应；非法跃迁抛错 → 转 `reject` 审计事件 + 工具报错。
- **文件锁**：只有 `contracts/active.json` 需要跨进程写锁（`proper-lockfile` 或原子 rename），临界区 < 5ms；注册分片与信箱各写各的，无锁。
- **policy 读取**：钩子每次触发重读 policy.json（文件小，OS 缓存足够），保证 `policy_write` 即时生效（[08 §2](08-safety-governance.md#2-策略文件)）。
- **扩展自身故障隔离**：pv-ext 的任何异常不得炸掉宿主会话——钩子内 try/catch，降级为"本会话暂离网络"（分片标记 offline + 审计 `ext-error`），Pi 原生功能不受影响。

## 5. 里程碑

| 里程碑 | 目标 | 范围 | 验收标准（可演示） |
|--------|------|------|-------------------|
| **M1 · 两会话通信** | 信箱跑通 | 注册分片、信箱、`send_message`/`check_inbox`、idle/busy 注入、审计 send/deliver | 两个手工终端（Form A）互发 notify/request；关掉接收方再开，补收成功；审计日志重放与信箱一致 |
| **M2 · 契约生效** | 状态机跑通 | 全部 16 类型、契约 FSM、环检测、深度/预算校验、状态卡、appendEntry、欠账提醒 | [09 S1+S2](09-scenarios.md) 剧本完整走通；**删除 `contracts/active.json` 后重放审计能逐字节重建**；模拟 compaction 后会话仍能正确 review/resign |
| **M3 · 网络可观测** | 全局视角 | pv-hub：网络图页面、预算看板、清扫、操作员控制台；信誉统计 | hub 不在场时 S3（故障恢复）照常工作；在场时能实时看到 S2 剧本的拓扑生长与消亡 |
| **M4 · 治理强化** | 放心放权 | policy 热更新、按契约限权（`setActiveTools`+`tool_call` 路径校验）、freeze/halt、沙箱能力标签、（可选）哈希链 | policy 修改即时生效；只读契约的会话被机械拦截写操作；halt 后全网契约 5 秒内全终态 |

每个里程碑的集成测试脚本直接取自 [09](09-scenarios.md)（Form B 驱动真实 pi 会话执行剧本，断言消息流与终态）。

## 6. 风险与缓解

| 风险 | 影响 | 缓解 |
|------|------|------|
| **Pi 扩展 API 演进** | 钩子失效 | 开发期固定 Pi 精确版本；升级时跑 M1 冒烟测试；映射表（§2）集中管理 API 触点，改动面可控 |
| **Windows 文件语义** | 丢消息 / 锁死 | 追加写 + 显式 flush；watch 事件防抖 + 兜底轮询（每 2s 扫游标增量）；锁重试上限与超时降级；开发环境即 win32，一级测试平台 |
| **LLM 不守协议** | 状态机报错、流程卡死 | schema 强校验 + 报错回灌（模型自纠）；非法跃迁恒被拒绝（无破坏力，只有无效力）；集成测试在换模型时捕获退化 |
| **上下文洪水** | 会话质量下降 | [03 §7](03-message-protocol.md#7-与-pi-注入机制的对齐) 的注入上限与合并；M2 实测长剧本的上下文增长曲线 |
| **费用失控** | 账单 | 预算四件套默认开启（[06 §4](06-network-dynamics.md#4-失控防护四件套)）；hub 看板实时可见 |
| **契约文件写竞争** | 卡顿 | 短临界区 + 实测；退化方案：每契约一个文件（[02 · 推荐节](02-architecture.md)） |

## 7. 测试策略

- **单元**：跃迁表全行覆盖；信封校验用例；环检测（含菱形合法、三角拒绝）；子树预算求和。
- **性质测试**：随机生成合法消息序列 → 不变量恒成立（无环、预算单调、终态不复活、重放幂等）。
- **重放即 oracle**：所有集成测试产生真实审计日志；断言"重放结果 == 物化状态"。这同时测试了 [04 §5](04-control-relations.md#5-关系即协议状态由消息推导) 的核心承诺。
- **集成**：Form B 驱动 2–4 个真实 pi 会话执行 [09](09-scenarios.md) 剧本；RPC 事件流作为观测面断言；设每测试预算上限，超限即失败。
- **人工体验测试**：Form A 双终端剧本，每周跑一次（机器测不出"人用着别扭"）。

## 推荐 / 备选 / 开放问题

**推荐**：单仓四包布局；pv-ext 独挑消息路径；M1 用 Form A 起步；文档剧本作为集成测试。

**备选**：(a) pv-core 并入 pv-ext（少一个包）——重放与 hub 依赖纯逻辑库，保持独立利于测试，不合并；(b) 先做 hub 再做契约（先看到再跑通）——可观测性依赖可观测的对象，顺序颠倒，否决；(c) 用 SQLite 起步（绕开文件锁）——失去文本可审计性与 git 红利，违背 P8，否决。

**开放问题**：实现期新增的问题（如 `spawn_peer` 工具的权限边界、pv-hub 的技术栈选型、跨平台 watch 的统一封装选型）随时补充到 [open-questions](open-questions.md)；与 Pi 上游的协作点（例如"custom 消息的渲染钩子"若上游有意支持）记录在 Q13。
