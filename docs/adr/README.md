# 架构决策记录（ADR）

约定见 [../open-questions.md](../open-questions.md) 文末：走向实现后，凡"改变协议字段、状态机语义、policy 默认值、组件职责边界"的收敛，必须在此立档。

- 文件名：`NNNN-标题.md`（四位序号，从 `0001` 起）。
- 一个 ADR 只记一个决策；被推翻不删除，标记 `Superseded by ADR-MMMM`。
- 立档后把 open-questions 中对应问题状态改为 `Decided→ADR-NNNN`。

## 模板

```markdown
# ADR-NNNN · <标题>
- 状态：Proposed | Accepted | Superseded by ADR-MMMM
- 日期：YYYY-MM-DD
- 背景：<为什么现在要决策，关联 open-questions Qxx>
- 决策：<一句话结论>
- 理由：<备选与权衡，为何选它>
- 影响：<需要改动的文档章节与代码模块>
```
