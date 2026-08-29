# 03 · 消息协议（PVMP）

> 状态：草案 Draft v0.1 · 2026-08-29
> 上游：[02 架构](02-architecture.md) ｜ 下游：[04 控制关系](04-control-relations.md) · [09 场景走查](09-scenarios.md)

PVMP（Piniverse Message Protocol）定义对等会话之间的全部通信。本文件是协议的规范文档：信封格式、16 种消息类型、寻址、投递语义、与 Pi 注入机制的对齐。

## 本章要点

- 双面协议：**邮件面**（信箱里的信封，会话间通信）与**控制面**（注册表写入，仅 `heartbeat` 一种）。
- 信封固定 11 个字段；`body` 按 `type` 取 16 种 schema 之一。
- 投递语义：at-least-once + 同一收发对内 FIFO + msg_id 去重 + TTL 过期丢弃。
- 所有类型都能映射为 Pi 的 `sendMessage` 注入或 `check_inbox` 拉取；关键设计是**steer 类消息可打断在途 turn，其余排队**。

---

## 1. 设计目标

1. **LLM-native**：格式对模型友好——JSON 可严格校验（工具 schema 强制），渲染后文本可被任何模型稳定阅读。
2. **可重放**：信封是自包含的事实记录；重放审计日志即可重建全部契约状态（P3，见 [04 §5](04-control-relations.md#5-关系即协议状态由消息推导)）。
3. **小而硬**：信封字段极少；语义放在类型化的 body 里，由 pv-core 严格校验，不靠约定。
4. **无版本地狱**：`v` 字段 + 宽松向后兼容（见 §8）。

## 2. 信封（Envelope）

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `v` | int | ✓ | 协议版本，当前 `1` |
| `id` | string | ✓ | 全网络唯一，UUID v4 小写 |
| `from` | string | ✓ | 发送方 PID（`pv-xxxxxxxx`）。**线上只允许 PID**；按名字发送是 `send_message` 工具在发送时解析的语法糖 |
| `to` | string | ✓ | 接收方 PID，或话题定址 `topic:<name>`（仅 `broadcast`），或 `pv-human` |
| `type` | enum | ✓ | 16 种消息类型之一（§3） |
| `ts` | string | ✓ | 发送时刻，ISO 8601 本地时区 |
| `task_id` | string? | 契约类必填 | 关联的契约 ID（`t-xxxxxxxx`）；契约类消息必填，`notify`/`broadcast` 为 null，`query`/`reply` 可选携带（指向特定契约的问询，如催报） |
| `in_reply_to` | string? | 应答类必填 | 所应答消息的 `id`（accept/decline/counter/review/reply） |
| `priority` | enum | ✓ | `low` / `normal` / `high` / `urgent`。影响注入时机（§7），不影响投递顺序 |
| `ttl` | int? | 默认 null | 投递时限（秒）。投递时已过期则丢弃并记审计 `expire` 事件；null 表示不过期 |
| `body` | object | ✓ | 按类型取 §4 中的 schema |

完整示例——一条委托：

```json
{
  "v": 1,
  "id": "0c9d6a52-8f1e-4d3a-9b7c-2e5f1a8d4b60",
  "from": "pv-3f8a12c0",
  "to": "pv-81b0de47",
  "type": "request",
  "ts": "2026-08-29T14:02:11+08:00",
  "task_id": "t-9f3e21ab",
  "in_reply_to": null,
  "priority": "high",
  "ttl": null,
  "body": {
    "spec": {
      "goal": "为 pipeline 模块补充单元测试",
      "deliverable": "tests/pipeline.spec.ts 及通过截图/日志",
      "acceptance": ["覆盖全部 6 个导出函数", "npm test 全绿"],
      "constraints": ["不改动 src/ 既有实现", "沿用现有 vitest 风格"],
      "context": ["docs/pipeline-design.md", "src/pipeline/index.ts"]
    },
    "budget": { "tokens": 120000, "cost": 0.8 },
    "deadline": "2026-08-29T18:00:00+08:00",
    "sandbox": false,
    "note": "验收人为我；完成后发 result。"
  }
}
```

大小限制：`body` 默认 ≤ 8 KB（policy 可调），信封整体硬上限 64 KB，超限由 pv-core 拒绝入箱并回审计 `reject` 事件。大数据一律走文件指针（[07](07-context-information.md)）。

## 3. 消息类型总表

分两族：**契约族**（携带/改变契约状态，`task_id` 必填）与**自由族**（无契约语义）。

| type | 族 | 方向 | 建契约? | 需回复? | 一句话语义 |
|------|----|------|--------|--------|-----------|
| `request` | 契约 | master→worker | 建立(proposed) | ✓ 必须 | 委托任务/提出请求 |
| `accept` | 契约 | worker→master | proposed→active | – | 接受，可附执行计划与 ETA |
| `decline` | 契约 | worker→master | proposed→declined | – | 拒绝，必须给 reason |
| `counter` | 契约 | worker→master | 协商中 | ✓ master 应答 | 还价：修订预算/期限/范围 |
| `report` | 契约 | worker→master | 不变 | 可选 | 进度汇报（含花费与工件指针） |
| `result` | 契约 | worker→master | active→reviewing | ✓ 必须验收 | 交付（success/partial/failed） |
| `review` | 契约 | master→worker | reviewing→completed 或回 active | – | 验收裁决：accepted / rejected / rework |
| `steer` | 契约 | master→worker | 不变 | 可选 | 中途指令（转向/补充约束） |
| `cancel` | 契约 | master→worker | →cancelled | 可选 | 取消契约 |
| `resign` | 契约 | worker→master | →failed(resigned) | – | 辞任：附已完成进度与工件 |
| `escalate` | 契约/自由 | 任意→上级或 pv-human | 不变 | ✓ 强期望 | 升级请求裁决（卡死/超权限/超预算） |
| `notify` | 自由 | 任意 | – | ✗ | 单向通知 |
| `query` | 自由 | 任意 | – | ✓ | 问询 |
| `reply` | 自由 | 任意 | – | – | `in_reply_to` 的应答（答 query 等） |
| `broadcast` | 自由 | 任意→topic | – | ✗ | 话题广播（需订阅，强限流） |
| `heartbeat` | 控制面 | 任意→注册表 | – | – | 心跳与状态续期（不走信箱） |

规则：

- **R1** 契约族消息的 `task_id` 必须指向已存在的契约，且发送方必须是该契约的当前 master 或 worker——否则 pv-core 拒绝发送（这是"权力沿契约边传播"的机械保证）。
- **R2** `accept/decline/counter/review/reply` 的 `in_reply_to` 必填；其余类型应为 null。
- **R3** `request` 的 `to` 不允许是发件人自己；`steer/cancel/review` 只允许 master→worker 方向；`report/result/resign` 只允许 worker→master——方向错误一律拒发。

## 4. 各类型 body 规范

约定：所有 body 可附加 `note?: string`（一句话备注）与 `refs?: string[]`（工件路径指针）。下表只列**特有字段**；`required` 加粗。

### 4.1 request

| 字段 | 类型 | 说明 |
|------|------|------|
| **`spec.goal`** | string | 要达成什么（一段话） |
| **`spec.deliverable`** | string | 交付物定义（通常是文件路径/形态） |
| **`spec.acceptance`** | string[] | 可检验的验收标准（逐条） |
| `spec.constraints` | string[] | 约束（不许改什么、风格要求等） |
| `spec.context` | string[] | 背景工件指针（路径），**不放内容只放指针** |
| **`budget`** | `{tokens?, cost?, minutes?}` | 上限，至少给一维；子契约预算必须 ⊆ 母契约（[08 §4](08-safety-governance.md#4-预算与计量)） |
| `deadline` | string | ISO 8601 截止时刻。**deadline 与信封 `ttl` 至少其一必填**（pv-core 校验）——这是全网络终止性的基石（[06 §6](06-network-dynamics.md#6-终止性论证)） |
| `sandbox` | bool | 是否要求受托方在沙箱中执行（MVP 仅声明，[08 §7](08-safety-governance.md#7-与-pi-容器化的对接)） |

master 生成 `task_id` 并在发出 request 前把契约记为 `proposed`。

### 4.2 accept / decline / counter

- **accept**: `plan?: string`（三句以内的执行计划）、`eta?: string`。
- **decline**: **`reason`** ∈ `busy | capability | policy | cost | scope | other`、`detail?`、`alternative_hint?`（如"pv-gamma 可能有空"）。
- **counter**: **`proposed`**（`{budget?, deadline?, deliverable?, scope_notes?}` 的子集修订）、**`rationale`**（为何要改）。master 收到 counter 后：接受 → 重发修订版 `request`（同 task_id）；或放弃 → `cancel`（proposed 阶段取消不产生违约记录）。

### 4.3 report / result / review

- **report**: **`progress`**（0–1）、`milestone?: string`、`spend: {tokens, cost}`（**契约累计值**，非增量）、`blockers?: string[]`。节奏要求见 [04 §4](04-control-relations.md#4-权利义务)。
- **result**: **`status`** ∈ `success | partial | failed`、**`summary`**（≤300 字，逐跳摘要的起点，见 [07 §3](07-context-information.md#3-逐跳摘要与验收)）、**`artifacts`**（`{path, digest?}[]`）、**`spend`**。partial/failed 时必填 `handoff_notes`（已完成什么/剩余什么/坑在哪）——这是给接管者的交接单。
- **review**: **`verdict`** ∈ `accepted | rejected | rework`、`feedback?`。`rejected` 表示验收不通过且**不返工**（契约走向 failed(quality)；少见，通常直接 rework）；`rework` 附具体意见，契约回到 `active`。

### 4.4 steer / cancel / resign

- **steer**: **`directive`**（一段话指令）、`reason?`。受托方按 [04 §4](04-control-relations.md#4-权利义务) 的义务处理：在契约范围内必须遵守，越界可拒绝并 `escalate`。
- **cancel**: `reason?`。proposed 阶段=撤回要约（无记录）；active 阶段=解约，受托方应尽快停止并回一条最终 `report`（尽力而为，不强制——可能已被取消时正在崩溃）。
- **resign**: **`reason`** ∈ `blocked | policy | capability | overload | other`、**`progress`**、`artifacts?`、`handoff_notes?`。

### 4.5 escalate

| 字段 | 说明 |
|------|------|
| **`subject`** | 一句话问题 |
| **`options`** | `{label, implication}[]`，2–4 个候选决策（把"开放题"变"选择题"是协议纪律） |
| **`urgency`** | `normal \| high \| urgent` |
| `context_refs` | 背景工件指针 |

发送对象：有问题契约时发给该契约 master；无契约或问题是"网络级"的，直接发 `pv-human`。响应义务见 [04 §4](04-control-relations.md#4-权利义务)。

### 4.6 自由族

- **notify**: **`subject`**、`detail?`。不需要也不应被回复（LLM 指南：收到 notify 不要回话）。
- **query**: **`subject`**、**`question`**。对方以 `reply` 应答。
- **reply**: **`answer`**；`in_reply_to` 必填。
- **broadcast**: **`topic`**、**`subject`**、`detail?`。`to` 必须是 `topic:<name>`；仅投递给注册表中订阅了该话题的对等体；policy 默认限流为每对等体每分钟 2 条（[08 §3](08-safety-governance.md#3-策略执行点)）。

### 4.7 heartbeat（控制面）

不进信箱，直接更新注册表分片：`{pid, status, contracts_active, spend_delta, alive_until}`。由 pv-ext 挂在 Pi 事件上发射（turn 结束/工具调用间隙），默认 30s 周期 + 事件驱动兜底。

## 5. 寻址与名字

- **规范地址是 PID**。信封 `to` 只接受 PID / `topic:` / `pv-human`。
- `send_message` 工具接受 `name`（如 `pv-beta`）或 PID：发送前经注册表解析，解析失败立即报错给 LLM（"无此名字"），消息不产生。
- **名字唯一性**：单个 `.piniverse/` 域内唯一，注册时冲突则要求改名（见 [05 §2](05-registry-lifecycle.md#2-身份pid)）。
- **`pv-human`** 是保留名，绑定操作员节点（[05 §7](05-registry-lifecycle.md#7-操作员节点)）。
- **话题订阅**：对等体通过 `subscribe(topic)` / `unsubscribe(topic)` 维护注册表中的订阅集；`broadcast` 只投递给订阅者。默认无任何预置订阅——没有"全体必达"通道（防风暴，P6）。

## 6. 投递语义

| 性质 | 语义 |
|------|------|
| 可靠性 | **at-least-once**。发送方 append 成功即视为"已发送"；接收方以自己的读取游标（存于 `pi.appendEntry`）推进，注入成功后才推进游标。崩溃后重启会重放游标之后的信封——可能重复注入，可接受（LLM 看到重复消息无害；契约类消息有状态机幂等保护） |
| 去重 | 接收方按 `msg_id` 去重（最近 256 条环形记录，存 appendEntry） |
| 顺序 | **同一 (from→to) 对内 FIFO**（单文件追加天然保证）；跨发送方无顺序保证——依赖因果的消息用 `in_reply_to` 关联 |
| TTL | 投递时检查；过期丢弃 + 审计 `expire`。`steer/cancel` 默认 ttl=300s（过时的指令不如不发） |
| 失败路径 | 目标信箱不存在（对等体从未注册/已清理）→ 拒发并告知 LLM；目标离线 → 信箱照写（离线对等体恢复后可补收），是否等待由发送方自己决定（可设 ttl 或转投他人） |
| 审计 | 每个信封两条事件：发送方 ext 写 `send`，接收方 ext 写 `deliver`（注入成功后）。审计是追加式，谁写谁的事件，无锁竞争 |

## 7. 与 Pi 注入机制的对齐

投递的最后一公里是把信封变成 LLM 能看到的上下文。全部经 `pi.sendMessage({customType: "pv-message", content: render(envelope)}, opts)` 注入：

| 消息情形 | 注入策略 |
|---------|---------|
| 会话 idle | `followUp` + `triggerTurn: true` —— 立即开新 turn 处理 |
| 会话 busy，`type=steer` 或 (`priority=urgent` 且 type ∈ {cancel, escalate}) | `deliverAs: "steer"` —— **打断当前 turn**，保证控制指令及时性 |
| 会话 busy，其余类型 | `followUp`（当前 turn 结束后排队注入） |
| 超过每 turn 注入上限（policy，默认 10 条） | 留在信箱，下一 idle 批量处理 |

渲染模板（pv-ext 固定实现，模型见到的样子）：

```text
📡 [PV] request · from pv-alpha (pv-3f8a12c0) · task t-9f3e21ab · prio high
    goal: 为 pipeline 模块补充单元测试
    deliverable: tests/pipeline.spec.ts
    acceptance: ① 覆盖全部 6 个导出函数 ② npm test 全绿
    budget: 120k tokens / $0.8 · deadline: 2026-08-29T18:00
    ▸ 回复方式: send_message(type=accept|decline|counter, in_reply_to=…)
```

渲染纪律：头部一行给类型/来源/关联（高频扫描用），正文按 body 字段逐行列出，尾行给"如何回复"提示。`check_inbox` 工具支持按 `task_id` 过滤批量拉取，渲染为同一模板的连续块——主要用于 compaction 之后恢复上下文全貌（[07 §4](07-context-information.md#4-进入-pi-上下文)）。

**上下文预算防护**：单次 turn 注入总量 > 32 KB 时，pv-ext 自动把同 task 的连续 `report` 合并为一条摘要注入（合并事件记审计）；契约类消息永不合并。

## 8. 版本化

- 信封 `v` 只含主版本。接收方接受 `v ≤ 自身主版本` 的信封（宽松向后读），拒绝更高主版本并回 `notify(reason=version-mismatch)`。
- 混版本共存的现实场景极少（单工作区通常同时升级）；完整策略见 [open-questions](open-questions.md) Q12。

## 推荐 / 备选 / 开放问题

**推荐**：上述 16 类型、11 字段信封、"线上只有 PID"、push 注入 + pull 兜底、at-least-once。

**备选**：(a) 更少类型（把 decline/counter 合并进 reply、用 body.discriminator 区分）——信封更薄但校验变弱、状态机分支隐藏在自由文本里，否决；(b) `to` 允许名字直投（省一次解析）——牺牲邮箱的规范性与重命名安全性，否决；(c) 引入 `ack` 应用层回执类型——契约族消息的状态机本身就是回执，自由族需要确认的应该用 query/reply，暂不引入（Q10）。

**开放问题**：消息签名/哈希链的必要性（Q10）；`broadcast` 的 `all` 模式是否永久移除（Q3）；report 的合并策略与节奏参数化（Q8）。
