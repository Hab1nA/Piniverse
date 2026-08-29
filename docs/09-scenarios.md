# 09 · 场景走查

> 状态：草案 Draft v0.1 · 2026-08-29
> 上游：[03 消息协议](03-message-protocol.md) · [04 控制关系](04-control-relations.md) · [06 网络动力学](06-network-dynamics.md)

三个端到端场景，把前文的机制串成可运行的剧本。所有消息类型、契约状态均与 [03](03-message-protocol.md)/[04](04-control-relations.md) 的规范一一对应；建议对照阅读。

## S1 · 最小网络：两会话协作

剧情：操作员要一份模块设计评审报告；`pv-alpha` 自己写分析，把"跑测试套件并汇总数据"委托给 `pv-beta`。

```mermaid
sequenceDiagram
    participant H as pv-human (operator)
    participant A as pv-alpha
    participant B as pv-beta

    H->>A: request t-1a2b3c4d «评审 pipeline 设计，产出报告»
    A-->>H: accept t-1a2b3c4d (plan + eta)
    Note over A: 契约 t-1a2b3c4d: proposed→active<br/>alpha 局部决策：测试数据部分委托
    A->>A: query_peers(testing) → 选定 beta
    A->>B: request t-9f3e21ab «跑 npm test，汇总覆盖率»<br/>budget{80k tokens} deadline 17:00 · depth=2
    Note over B: idle → 注入 → triggerTurn
    B-->>A: accept t-9f3e21ab (plan+eta)
    Note over A,B: 契约 t-9f3e21ab: proposed→active · 关系图出现 A→B 边
    B-->>A: report (progress 0.5, spend{41k}, 两个用例失败待修)
    A->>B: steer «失败的用例允许 skip 并在报告注明原因»
    Note over B: steer 打断在途 turn（deliverAs: steer）
    B-->>A: result t-9f3e21ab (success, summary≤300字, artifacts[path+digest])
    Note over A,B: active→reviewing
    A->>B: review t-9f3e21ab (accepted ✓ 对照 acceptance 逐条)
    Note over A,B: reviewing→completed · 双方信誉+1 · 关系图边消失
    A-->>H: result t-1a2b3c4d (success)
    H->>A: review t-1a2b3c4d (accepted)
```

要点回顾：alpha 对 beta 的全部权力只存在于 t-9f3e21ab 之内；操作员对 t-9f3e21ab 没有直接话语权（想干预得成为它的 master 或走 escalate）。

## S2 · 多层委托、还价与中途转向

剧情：`pv-alpha` 接到"给 pipeline 模块补测试"的契约，把文档部分再委托给 `pv-gamma`；期间需求变化，master steer，gamma 还价。

```mermaid
sequenceDiagram
    participant A as pv-alpha (master of t-2b…)
    participant B as pv-beta
    participant G as pv-gamma

    A->>B: request t-3c4d5e6f «补齐 tests/pipeline.spec.ts»<br/>budget{120k, $0.8} deadline 18:00
    B-->>A: counter t-3c4d5e6f «时间不够全量，先做 6 个导出函数中的 4 个核心»<br/>proposed{deadline 18:00 不变, scope 减半}
    Note over A: 权衡后接受修订
    A->>B: request t-3c4d5e6f 修订版（acceptance 相应缩减）
    Note over B: 同一 task_id 重发修订要约，覆盖原 proposed
    B-->>A: accept t-3c4d5e6f
    Note over A,B: active · depth=2
    B->>G: query_peers(writing) → request t-7e8f9a0b «写模块使用文档»<br/>budget{30k} ⊆ 120k · depth=3
    G-->>B: counter t-7e8f9a0b «30k 不够，示例部分要跑代码验证，40k»
    Note over B: 子树预算校验: 40k + 已耗 12k ≤ 120k ✓ 允许接受
    B->>G: request t-7e8f9a0b 修订版（budget 40k）
    G-->>B: accept t-7e8f9a0b
    Note over B,G: 关系图: A→B→G 链 · A 对 G 无任何直接权力
    A->>B: steer «API 形状变了：pipeline.run 现在返回 stream»
    B->>B: 影响评估：波及文档契约 → B 以 t-7e8f9a0b 的 master 身份自行 steer（不是转发 A 的 steer）
    B->>G: steer t-7e8f9a0b «示例改用 stream API»
    G-->>B: report (progress 0.9, 已按新 API 改写)
    G-->>B: result t-7e8f9a0b (success)
    B->>G: review t-7e8f9a0b (rework «第 3 节示例输出与实测不符»)
    Note over B,G: reviewing→active（返工）· G 修正后重发 result → accepted
    B-->>A: result t-3c4d5e6f (success, summary 汇总自测+文档)
    Note over A,B: B 交付前清账: 名下无活跃子契约 ✓
    A->>B: review t-3c4d5e6f (accepted)
```

要点回顾：counter 是修订要约（同 task_id 覆盖 proposed）；再委托受**子树预算校验**；steer 沿契约边逐层传递（A 不能直接 steer G）；rework 使契约回 active；**交付前清账**（[06 §6](06-network-dynamics.md#6-终止性论证)）保证 B 的 result 只在子账结清后发出。

## S3 · 故障与恢复

剧情：`pv-beta` 在执行中崩溃；`pv-alpha` 检测、善后、重委托。

```mermaid
sequenceDiagram
    participant A as pv-alpha
    participant B as pv-beta
    participant R as Registry/Audit
    participant G as pv-gamma

    Note over A,B: t-3c4d5e6f active，beta 已 report 至 62%
    B--xB: 进程崩溃（心跳停止）
    R->>R: alive_until 过期 → 分片标记 offline
    A->>R: 心跳/查询发现 beta offline
    A->>B: cancel t-3c4d5e6f (reason=worker-lost)
    Note over A: 消息投进信箱无人读（机械事实）；契约→cancelled
    A->>G: request t-5d6e7f80 «续作：跑测试补漏»<br/>spec.context 指向 beta 已提交的工件<br/>note 附 handoff 摘要 «62% 完成，见 tests/…jsonl»
    G-->>A: accept t-5d6e7f80
    Note over A,G: 新契约、新身份（beta 的 PID 已退役，不复用）
    G-->>A: result (success)
    A->>G: review (accepted)
```

两个微案例（防失控机制的实际样子）：

**案例一：成环请求被机械拒绝。** A→B 的契约 t-1 active 期间，B 向 A 发 request t-2。A 的 accept 触发注册表检查：加入 B→A 边后 A⇄B 成环 → accept 被拒绝，pv-ext 自动代发 `decline(reason=cycle)`，A 的 LLM 收到的是一条明确的机械拒绝而不是两难判断（[06 §3](06-network-dynamics.md#3-等待与死锁)）。

**案例二：预算击穿自动止损。** B 的契约 t-3 budget 80k tokens；B 的累计 spend 到 81k → pv-ext 自动代发 `result(failed, reason=budget-exhausted, handoff_notes=…)`，契约进入 failed 终态；master 重委托时以剩余预算为界（[08 §4](08-safety-governance.md#4-预算与计量)）。

## 走查结论

三个场景覆盖了协议的主要路径：协商三态（accept/decline/counter）、中途控制（steer/rework/cancel/resign）、再委托与清账、故障接管、两类机械防护。对照检查点：

- 每条箭头都是一种 [03](03-message-protocol.md) 中定义的消息类型，无协议外通道；
- 每个契约的状态变化都能在 [04 §3](04-control-relations.md#3-状态机) 跃迁表中找到行号；
- 人的每一次出现都是标准节点动作（request/review），无越权插手；
- 失控防护在剧情内被触发（预算校验、成环拒绝、心跳判离线），而不是靠角色自觉。

M1–M4 的实现验收（[11 §5](11-implementation.md#5-里程碑)）将以这三个场景的剧本作为集成测试脚本——文档即测试用例。
