import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { appendFile, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  appendAudit,
  auditFilePath,
  readAuditDir,
  readAuditFile,
  type AuditEvent,
} from "../src/index.js";

let dir: string;

function ev(kind: AuditEvent["kind"], extra: Partial<AuditEvent> = {}): AuditEvent {
  return { ts: "2026-08-29T14:02:11+08:00", kind, pid: "pv-3f8a12c0", ...extra };
}

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "pv-audit-"));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("审计 · 分片路径", () => {
  it("auditFilePath 按月分片且月份补零", () => {
    expect(auditFilePath(dir, new Date(2026, 7, 29)).replace(/[\\/]/g, "/")).toBe(`${dir.replace(/[\\/]/g, "/")}/audit/2026-08.jsonl`);
    expect(auditFilePath(dir, new Date(2026, 0, 3))).toMatch(/2026-01\.jsonl$/);
    expect(auditFilePath(dir, new Date(2026, 11, 31))).toMatch(/2026-12\.jsonl$/);
  });
});

describe("审计 · 追加与读回", () => {
  it("按 docs/08 §5 示例写三类事件并逐字段、按序读回", async () => {
    const p = join(dir, "2026-08.jsonl");
    const send = ev("send", { msg: "m1", type: "request", to: "pv-81b0de47", task: "t-9f3e21ab" });
    const deliver = ev("deliver", { pid: "pv-81b0de47", msg: "m1", note: "injected:followUp" });
    const transition = ev("transition", {
      pid: "pv-81b0de47",
      task: "t-9f3e21ab",
      from: "proposed",
      to: "active",
      by: "b41e7f09",
    });
    for (const e of [send, deliver, transition]) await appendAudit(p, e);

    const raw = await readFile(p, "utf8");
    expect(raw.trim().split("\n")).toHaveLength(3); // 一行一个事件
    const got = await readAuditFile(p);
    expect(got).toEqual([send, deliver, transition]);
    expect(got[2]?.to).toBe("active"); // transition 的 to 是目标状态
  });

  it("缺 ts / 非法 kind / 缺 pid 一律拒绝", async () => {
    const p = join(dir, "a.jsonl");
    await expect(appendAudit(p, { kind: "send", pid: "p" } as AuditEvent)).rejects.toBeInstanceOf(TypeError);
    await expect(appendAudit(p, ev("nope" as AuditEvent["kind"]))).rejects.toBeInstanceOf(TypeError);
    await expect(appendAudit(p, { ...ev("send"), pid: "" })).rejects.toBeInstanceOf(TypeError);
  });

  it("自动创建不存在的 audit 目录", async () => {
    const p = auditFilePath(join(dir, "state"), new Date(2026, 8, 1));
    await appendAudit(p, ev("send"));
    expect(await readAuditFile(p)).toHaveLength(1);
  });

  it("读取不存在的分片返回空数组", async () => {
    expect(await readAuditFile(join(dir, "x.jsonl"))).toEqual([]);
  });
});

describe("审计 · 崩溃安全与分片合并", () => {
  it("末尾半行不读，补全换行后可读", async () => {
    const p = join(dir, "a.jsonl");
    await appendAudit(p, ev("send", { msg: "full" }));
    await appendFile(p, '{"ts":"t","kind":"deliver","pid":"p2"}', { flag: "a" }); // 无换行=半行

    expect(await readAuditFile(p)).toHaveLength(1);
    await appendFile(p, "\n", { flag: "a" });
    const got = await readAuditFile(p);
    expect(got).toHaveLength(2);
    expect(got[1]?.pid).toBe("p2");
  });

  it("完整行 JSON 损坏时抛错", async () => {
    const p = join(dir, "b.jsonl");
    await appendFile(p, "{bad}\n", { flag: "a" });
    await expect(readAuditFile(p)).rejects.toThrow(/损坏/);
  });

  it("readAuditDir 按月份升序拼接，忽略非分片文件；目录缺失返回空", async () => {
    const sep = join;
    // 故意先建 09 再建 08，验证按文件名而非创建顺序
    await appendAudit(sep(dir, "2026-09.jsonl"), ev("send", { pid: "z" }));
    await appendAudit(sep(dir, "2026-08.jsonl"), ev("send", { pid: "a" }));
    await appendAudit(sep(dir, "2026-08.jsonl"), ev("deliver", { pid: "b" }));
    await appendFile(sep(dir, "notes.txt"), "ignore me", { flag: "a" });

    const got = await readAuditDir(dir);
    expect(got.map((e) => e.pid)).toEqual(["a", "b", "z"]); // 08 月两条在前，09 月在后
    expect(await readAuditDir(join(dir, "missing"))).toEqual([]);
  });
});
