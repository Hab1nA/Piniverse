import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { appendFile, mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  DEDUP_WINDOW,
  appendEnvelope,
  emptyCursor,
  inboxPath,
  mailboxDir,
  readSince,
  type Envelope,
} from "../src/index.js";

let dir: string;
let file: string;
let seq = 0;

function env(id?: string): Envelope {
  seq += 1;
  return {
    id: id ?? `00000000-0000-4000-8000-${String(seq).padStart(12, "0")}`,
    v: 1,
    from: "pv-3f8a12c0",
    to: "pv-81b0de47",
    type: "notify",
    ts: "2026-09-04T18:00:00+08:00",
    task_id: null,
    in_reply_to: null,
    priority: "normal",
    ttl: null,
    body: { subject: "你好，世界" },
  } as Envelope;
}

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "pv-mail-"));
  file = join(dir, "inbox.jsonl");
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("文件信箱 · 追加与增量读取", () => {
  it("信箱不存在视为空，不抛错", async () => {
    const r = await readSince(file, emptyCursor());
    expect(r.envelopes).toEqual([]);
    expect(r.cursor.offset).toBe(0);
  });

  it("append 后可读回，游标推进到文件尾；再次读无新增", async () => {
    const e = env();
    await appendEnvelope(file, e);
    const r1 = await readSince(file, emptyCursor());
    expect(r1.envelopes).toHaveLength(1);
    expect(r1.envelopes[0]).toEqual(e);
    expect(r1.cursor.offset).toBe((await stat(file)).size);

    const r2 = await readSince(file, r1.cursor);
    expect(r2.envelopes).toHaveLength(0);
    expect(r2.cursor.offset).toBe(r1.cursor.offset);
  });

  it("多条保持 FIFO 顺序", async () => {
    const a = env();
    const b = env();
    const c = env();
    for (const e of [a, b, c]) await appendEnvelope(file, e);
    const r = await readSince(file, emptyCursor());
    expect(r.envelopes.map((x) => x.id)).toEqual([a.id, b.id, c.id]);
  });

  it("游标增量：只返回上次之后的新消息", async () => {
    await appendEnvelope(file, env("a"));
    await appendEnvelope(file, env("b"));
    const first = await readSince(file, emptyCursor());
    expect(first.envelopes.map((e) => e.id)).toEqual(["a", "b"]);

    await appendEnvelope(file, env("c"));
    const second = await readSince(file, first.cursor);
    expect(second.envelopes.map((e) => e.id)).toEqual(["c"]);
  });

  it("多字节（中文）内容下字节偏移正确，游标恰好到文件尾", async () => {
    await appendEnvelope(file, env());
    const r = await readSince(file, emptyCursor());
    expect(r.envelopes).toHaveLength(1);
    expect(r.cursor.offset).toBe((await stat(file)).size);
  });
});

describe("文件信箱 · at-least-once 去重", () => {
  it("跨次读到相同 msg_id 跳过（重复注入幂等）", async () => {
    await appendEnvelope(file, env("dup"));
    const r1 = await readSince(file, emptyCursor());
    expect(r1.envelopes.map((e) => e.id)).toEqual(["dup"]);

    await appendEnvelope(file, env("dup"));
    const r2 = await readSince(file, r1.cursor);
    expect(r2.envelopes).toHaveLength(0); // 同 id 去重
    expect(r2.cursor.offset).toBe((await stat(file)).size); // 但游标仍前进
  });

  it("游标回退重放时，seen 中已有的全部幂等跳过", async () => {
    await appendEnvelope(file, env("a"));
    await appendEnvelope(file, env("b"));
    // 模拟崩溃后从文件头重放，但 seen 已记录 a/b
    const r = await readSince(file, { offset: 0, seen: ["a", "b"] });
    expect(r.envelopes).toHaveLength(0);
  });

  it(`seen 只保留最近 ${DEDUP_WINDOW} 条（环形窗口）`, async () => {
    const total = DEDUP_WINDOW + 4;
    for (let i = 0; i < total; i++) await appendEnvelope(file, env(`m${i}`));
    const r = await readSince(file, emptyCursor());
    expect(r.envelopes).toHaveLength(total);
    expect(r.cursor.seen).toHaveLength(DEDUP_WINDOW);
    expect(r.cursor.seen[0]).toBe(`m${total - DEDUP_WINDOW}`);
    expect(r.cursor.seen.at(-1)).toBe(`m${total - 1}`);
  });
});

describe("文件信箱 · 崩溃安全与健壮性", () => {
  it("末尾半行不消费、游标不越过；补全后可读", async () => {
    await appendEnvelope(file, env("full"));
    await appendFile(file, '{"id":"half"', { flag: "a" }); // 写进程崩在半行，无换行

    const r1 = await readSince(file, emptyCursor());
    expect(r1.envelopes.map((e) => e.id)).toEqual(["full"]);
    // 半行未被消费：游标前进过 full，但停在半行之前、未到文件尾
    expect(r1.cursor.offset).toBeGreaterThan(0);
    expect(r1.cursor.offset).toBeLessThan((await stat(file)).size);

    await appendFile(file, "}\n", { flag: "a" }); // 补全半行
    const r2 = await readSince(file, r1.cursor);
    expect(r2.envelopes.map((e) => e.id)).toEqual(["half"]);
  });

  it("游标越过文件大小（信箱被重建）时从头读", async () => {
    await appendEnvelope(file, env("a"));
    const r = await readSince(file, { offset: 999_999, seen: [] });
    expect(r.envelopes.map((e) => e.id)).toEqual(["a"]);
  });

  it("兼容 CRLF 行尾", async () => {
    await appendFile(file, '{"id":"crlf"}\r\n', { flag: "a" });
    const r = await readSince(file, emptyCursor());
    expect(r.envelopes.map((e) => e.id)).toEqual(["crlf"]);
  });

  it("完整行 JSON 损坏时抛错而非静默吞掉", async () => {
    await appendFile(file, "{bad}\n", { flag: "a" });
    await expect(readSince(file, emptyCursor())).rejects.toThrow(/损坏/);
  });

  it("append 缺少字符串 id 时拒绝", async () => {
    await expect(appendEnvelope(file, { id: "" } as unknown as Envelope)).rejects.toBeInstanceOf(TypeError);
    await expect(appendEnvelope(file, {} as Envelope)).rejects.toBeInstanceOf(TypeError);
  });

  it("append 自动创建不存在的嵌套信箱目录", async () => {
    const p = inboxPath(join(dir, "state"), "pv-abcdef12");
    expect(p.endsWith(join("mailboxes", "pv-abcdef12", "inbox.jsonl"))).toBe(true);
    await appendEnvelope(p, env("x"));
    const r = await readSince(p, emptyCursor());
    expect(r.envelopes.map((e) => e.id)).toEqual(["x"]);
    expect(mailboxDir(join(dir, "state"), "pv-abcdef12").split(/[\\/]/).at(-1)).toBe("pv-abcdef12");
  });
});
