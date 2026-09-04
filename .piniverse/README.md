# .piniverse/ — 运行期状态域（docs/02 §3）

一个工作区即一个网络域，全部运行期状态落在本目录。**一切皆文本（P8）**：可 grep、可 `git diff`、可离线分析。

| 路径 | 内容 | 写入者 | 版本管理 |
|------|------|--------|---------|
| `config/policy.json` | 全部硬规则的唯一来源（docs/08 §2），仅 operator 可写、热更新 | 人类 / policy_write | **纳入 git** |
| `registry/<pid>.json` | 对等体注册分片：身份、档案、状态、心跳、信誉（docs/05 §1） | 各会话只写自己分片 | 运行期产物，gitignore |
| `contracts/active.json` | 活跃契约物化缓存，可由审计重放重建（docs/04 §5） | 短临界区文件锁 | 运行期产物，gitignore |
| `mailboxes/<pid>/inbox.jsonl` | 追加式信箱，一行一个信封（docs/03 §6） | 发送方追加 | 运行期产物，gitignore |
| `audit/YYYY-MM.jsonl` | 按月分片审计日志（send/deliver/transition…，docs/08 §5） | 谁写谁的事件 | **建议纳入 git**（追加式、可 diff） |

崩溃安全：全部为追加式 JSONL / 单写者分片，进程任意时刻死亡都不损坏已提交状态（docs/02 §3）。
