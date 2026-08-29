# 08 · 安全与治理

> 状态：草案 Draft v0.1 · 2026-08-29
> 上游：[06 网络动力学](06-network-dynamics.md) ｜ 下游：[11 实现路线](11-implementation.md)

Pi 本体没有权限系统（官方立场是把安全交给容器化）。Piniverse 在应用层自建治理：**结构规则用代码强制，行为纪律用指南约束，最终裁决权归操作员**。

## 本章要点

- 威胁模型先行：治理防的是"诚实但会犯错的 LLM"+ 失控的网络动力学，不是有 FS 权限的恶意人类。
- 一份 `policy.json` 管全部硬规则；执行点收敛到 pv-ext 的钩子（`tool_call` 等）与 pv-core 校验。
- 预算是放权的底气：根预算是全网消耗的数学上界（[06 §4.2](06-network-dynamics.md#42-预算传播防费用爆炸)）。
- 审计日志支持完整重放；操作员拥有 freeze（拒新工作）与 halt（全网清账）两级急停。

---

## 1. 威胁模型

| 威胁 | 在范围内？ | 对策 |
|------|-----------|------|
| LLM 犯错：劣质 spec、错漏 review、错误实现 | ✓ | 可检验的 acceptance、review 程序、逐跳摘要、工件指针 |
| 失控委托（递归环、深度爆炸、费用爆炸） | ✓ | [06 §4](06-network-dynamics.md#4-失控防护四件套) 四件套，全部机械执行 |
| 消息洪水 / 广播滥用 | ✓ | 限流 + 注入合并 + 无默认订阅 |
| 对等体失实汇报（说做了其实没做） | ✓（缓解） | review 检查**工件**而非说辞；信誉展示；事后审计。不能根除——见 §8 |
| 工件投毒（工作区文件里的注入内容操纵收件对等体） | ✓（缓解） | 契约限权（§3）、沙箱声明（§7）、操作员可审计全部消息来源。无法根除 |
| 对等体被诱导执行危险操作（写系统文件、外发数据） | ✓ | `tool_call` 钩子拦截 + 冻结 + 容器化（§7） |
| 恶意操作员（有 FS 权限的人类） | ✗ | 信任域之外——单用户假设 |
| 攻击 Pi 本体 / 主机 / 模型供应链 | ✗ | Pi 自身安全边界，[Pi 官方文档](https://github.com/earendil-works/pi) |

## 2. 策略文件

`.piniverse/config/policy.json`——全部硬规则的唯一来源，操作员可写（唯一有 `policy_write` 权的角色），pv-ext 在每次钩子触发时读取（改完即生效，无需重启）：

```json
{
  "v": 1,
  "defaults": {
    "max_depth": 4,
    "budget_cap": { "tokens": 500000, "cost": 5.0 },
    "send_rate_per_min": 30,
    "broadcast_rate_per_min": 2,
    "broadcast_mode": "topics-only",
    "message_body_max_bytes": 8192,
    "auto_fail_on_budget": true,
    "sandbox_required": false,
    "request_ttl_default_seconds": 3600,
    "stale_offline_seconds": 90,
    "shard_retention_days": 7
  },
  "roles": {
    "operator": { "can": ["freeze", "halt", "cancel_any", "policy_write", "depth_exempt", "read_all"] },
    "peer": {}
  },
  "overrides": {
    "pv-3f8a12c0": { "max_depth": 2, "note": "新加入对等体，先限深观察" }
  }
}
```

设计取舍：**规则尽量少**（P5）。上表之外的一切（汇报节奏、spec 质量、是否该委托）都是指南——策略管"结构性安全"，不管"好不好"。

## 3. 策略执行点

| 规则 | 执行点 | 触发时机 |
|------|--------|---------|
| R1/R3 契约合法性与消息方向 | pv-core 校验（`send_message` 工具内） | 发送 |
| max_depth | pv-core（构造 request 时）+ 注册表复核（accept 时） | 发送 / 接受 |
| 成环拒绝 | 注册表图检查（accept 时） | 接受 |
| 预算不变量 | 注册表子树求和（accept）+ pv-ext 累计（report/result/turn 统计） | 接受 / 汇报 |
| 发送/广播限流 | pv-ext 进程内计数器 | 每次 send |
| body 大小上限 | pv-core | 发送 |
| frozen（冻结） | `on("tool_call")`：拒发 request/accept；拦危险工具 | 每次工具调用 |
| **按契约限权** | `on("tool_call")` + `pi.setActiveTools()` | 每次工具调用 / 契约状态变化 |

**按契约限权**是执行层的核心创新点：契约的 `spec.constraints` 可以声明权限等级（如 `read-only`、`workspace-only`），pv-ext 据此：

- 契约存续期间用 `setActiveTools` 收窄工具集（只读研究契约 → 摘除 `write/edit`）；
- 更细粒度的（"可以写 tests/ 下的文件"）在 `on("tool_call")` 里对 `write/bash` 的参数做路径校验，越界即拦截并提示 LLM 走 escalate。

注意边界：这套限权约束的是**以该契约名义做的工作**；pv-ext 无法区分"会话在同一 turn 里为自己私活调用的 write"（技术上同进程无标签）——MVP 采用诚实简化：限权契约活跃期间，整会话按最严等级受限（指南要求会话不要混做私活；彻底的执行级隔离靠 §7 容器）。此限制记为 Q7 关联问题。

## 4. 预算与计量

- **计量**：pv-ext 从 Pi 的消息用量事件累计**会话级**消耗（真实测量）；**契约级**消耗由 worker 在 report/result 中**自报**（`spend` 字段），pv-ext 校验自报值 ≤ 会话级实测值（自报虚高被机械拒绝）。
- **聚合**：hub 汇总注册表分片的 `spend_today` 与契约台账，给出网络总消耗、按契约/按对等体分解的看板；hub 不在场时数据仍在，可离线统计。
- **执行**：两级——软告警（80% 预算时 pv-ext 给本会话注入提醒，欠账机制同 [04 §4](04-control-relations.md#4-权利义务)）与硬失效（超预算自动 `result(failed, reason=budget-exhausted)`，`auto_fail_on_budget` 可关）。accept 时的子树求和保证"超支的契约根本无法建立"（[06 §4.2](06-network-dynamics.md#42-预算传播防费用爆炸)）。

## 5. 审计日志

`.piniverse/audit/YYYY-MM.jsonl`，一行一个事件：

```json
{"ts":"2026-08-29T14:02:11+08:00","kind":"send","pid":"pv-3f8a12c0","msg":"0c9d6a52-…","type":"request","to":"pv-81b0de47","task":"t-9f3e21ab"}
{"ts":"2026-08-29T14:02:12+08:00","kind":"deliver","pid":"pv-81b0de47","msg":"0c9d6a52-…","note":"injected:followUp"}
{"ts":"2026-08-29T14:02:40+08:00","kind":"transition","pid":"pv-81b0de47","task":"t-9f3e21ab","from":"proposed","to":"active","by":"b41e7f09-…"}
```

- 事件种类：`send` / `deliver` / `reject` / `expire` / `transition` / `inject-merge`。信封原文不复制进审计（信箱文件 + 审计指针即可复原），保持日志精瘦。
- **重放规程**：send/deliver 事件驱动 pv-core 的状态机 → 完整重建契约台账与关系图（[04 §5](04-control-relations.md#5-关系即协议状态由消息推导)）。`contracts/active.json` 损坏时的恢复手段，也是回归测试的 oracle（[11 §7](11-implementation.md#7-测试策略)）。
- **完整性**（可选，M4）：行间哈希链（每行含 `prev_hash`），使事后删改可见。单用户单机场景收益有限，故为可选项（Q10）。
- **保留**：随工作区走，建议纳入 git（文本、追加式、天然可 diff——P8 的红利）。

## 6. 操作员权力

全部通过 operator 会话中的工具行使，由钩子机械执行（[05 §7](05-registry-lifecycle.md#7-操作员节点)）：

| 工具 | 语义 | 实现 |
|------|------|------|
| `freeze(target?)` | 全网或定点冻结：拒新 request/accept，拦危险工具；**在途契约可收尾** | 写注册表 frozen 位 + 钩子读取 |
| `halt()` | 急停：对全部非终态契约代发 `cancel(reason=halt)`；配合 freeze 使用 | 遍历契约台账（机械执行 operator 的明确指令，非自作主张） |
| `cancel_any(t)` | 解散任意一份契约，附原因 | 以 pv-human 名义发标准 `cancel` |
| `policy_write(patch)` | 修改 policy.json | 原子写 + 审计 |
| `inject(peer, text)` | 以 pv-human 名义向任意对等体发消息（含 steer 他人的契约？——**否**：operator 的 steer 也只能对**自己持有**的契约发出；想干预他人契约，走 `cancel_any` 或 `escalate` 链） | 标准 `send_message` |
| `read_all` | 查看任意审计/信箱/台账 | 文件读取 |

`inject` 的边界值得强调：**operator 也不能凭身份越权指挥别人的契约**——这是把"人即节点"贯彻到底。操作员的超然地位体现在 freeze/halt/policy 这类**系统级**权力，而不是日常指令的越级插手。日常干预的正确姿势：接受一份契约（成为 master）再行使 master 权利。

## 7. 与 Pi 容器化的对接

- request.sandbox 声明（[03 §4.1](03-message-protocol.md#41-request)）在 MVP 是**愿望标记**：诚实地讲，pv-ext 无法验证对方真的进了容器。
- 演进：`sandbox_required: true` 的契约只允许 accept 自**宣告沙箱能力**的对等体（能力标签 `sandboxed`，由启动环境如实标注）；对等体用 Pi 官方文档的容器方案（Docker / Gondolin micro-VM）启动时声明。验证深度（自声明 vs hub 拉起时注入的运行时凭证）记为 Q6/Q13。
- 单机共享 FS 是最大的隔离缺口（§3 的诚实简化）；需要硬隔离的高风险子任务，MVP 建议操作员手工在容器内开对等体，网络通过共享挂载点与其交换工件。

## 8. 诚实的局限

1. **审计是事后追责，不是事前预防**。日志能告诉你谁在哪个契约下发了什么，不能阻止失实汇报发生。
2. **语义级纪律不可机械强制**。"summary 必须如实""review 必须真的检查"——这些最终依赖模型品行与验收设计的质量。缓解手段（工件核验、信誉、操作员抽查）是概率性的。
3. **review 本身可能橡皮图章**。LLM reviewer 有"顺从偏差"倾向。缓解：acceptance 必须可机械检验（测试命令、存在性检查）；指南要求 review 附检查证据（"npm test 输出末 10 行"）。
4. **共享 FS 无硬隔离**（§3/§7）。
5. **单用户信任域**。所有机制假设操作员可信、主机无恶意软件；Piniverse 不解决多租户问题。

## 推荐 / 备选 / 开放问题

**推荐**：单 policy.json + 表列执行点；预算双级执行；双事件审计 + 可选哈希链；freeze/halt 两级急停；operator 无契约不插手。

**备选**：(a) 每契约独立审批弹窗（交互式权限）——违背"对等体自主运转"的设计初衷，且人在回路会成为吞吐瓶颈；操作员的价值在异常裁决，不在逐笔审批；(b) 消息级 ACL（谁能给谁发什么类型）——R1/R3 + 限流已覆盖真实需求，更多 ACL 是复杂度陷阱；(c)把 `auto_fail_on_budget` 默认关闭（改为只告警）——预费用敏感环境可开，默认保留硬失效以维持终止性论证（[06 §6](06-network-dynamics.md#6-终止性论证)）。

**开放问题**：审计哈希链与签名（Q10）；沙箱凭证的验证深度（Q6）；限权契约与私活混做的执行级隔离（Q7）；policy 热更新的一致性窗口（两钩子间读到新旧两版，影响可忽略但需文档化，Q13）。
