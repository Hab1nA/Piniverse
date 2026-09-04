import { describe, expect, it } from "vitest";
import {
  BODY_MAX_BYTES_DEFAULT,
  validateEnvelope,
  type Envelope,
} from "../src/index.js";

// 合法固定值（形状符合 docs/03）
const UUID = "0c9d6a52-8f1e-4d3a-9b7c-2e5f1a8d4b60";
const UUID2 = "b41e7f09-1234-4abc-8def-0123456789ab";
const FROM = "pv-3f8a12c0";
const TO = "pv-81b0de47";
const TS = "2026-09-04T18:00:00+08:00";
const TASK = "t-9f3e21ab";

function outer(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    v: 1,
    id: UUID,
    from: FROM,
    to: TO,
    type: "request",
    ts: TS,
    task_id: TASK,
    in_reply_to: null,
    priority: "normal",
    ttl: null,
    ...overrides,
  };
}

const requestBody = {
  spec: {
    goal: "补单元测试",
    deliverable: "tests/x.spec.ts",
    acceptance: ["覆盖导出函数", "npm test 全绿"],
    constraints: ["不改 src"],
    context: ["docs/x.md"],
  },
  budget: { tokens: 120000, cost: 0.8 },
  deadline: TS,
  sandbox: false,
};

function validRequest(overrides: Record<string, unknown> = {}, bodyOverrides: Record<string, unknown> = {}) {
  return outer({ ...overrides, body: { ...requestBody, ...bodyOverrides } });
}

function typed(body: Record<string, unknown>, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return outer({ body, ...overrides });
}

describe("validateEnvelope · 合法信封通过", () => {
  it("合法 request（带 deadline）", () => {
    expect(validateEnvelope(validRequest()).ok).toBe(true);
  });

  it("request 无 deadline 但有 ttl 合法", () => {
    const e = validRequest({ ttl: 300 }, { deadline: undefined });
    expect(validateEnvelope(e).ok).toBe(true);
  });

  it("budget 只给 minutes 一维也合法", () => {
    const e = validRequest({}, { budget: { minutes: 30 } });
    expect(validateEnvelope(e).ok).toBe(true);
  });

  it("notify（task_id/in_reply_to 均为 null）", () => {
    const e = typed({ subject: "hi", detail: "x" }, { type: "notify", task_id: null });
    expect(validateEnvelope(e).ok).toBe(true);
  });

  it("accept 带 in_reply_to", () => {
    const e = typed({ plan: "三步走", eta: TS }, { type: "accept", in_reply_to: UUID2 });
    expect(validateEnvelope(e).ok).toBe(true);
  });

  it("reply 带 in_reply_to，query 的 task_id 可空", () => {
    expect(validateEnvelope(typed({ answer: "ok" }, { type: "reply", in_reply_to: UUID2, task_id: null })).ok).toBe(true);
    expect(validateEnvelope(typed({ subject: "s", question: "q" }, { type: "query", task_id: null })).ok).toBe(true);
  });

  it("broadcast 定址 topic: 且 body 带 topic", () => {
    const e = typed({ topic: "build", subject: "迁移" }, { type: "broadcast", to: "topic:build", task_id: null });
    expect(validateEnvelope(e).ok).toBe(true);
  });

  it("heartbeat 控制面", () => {
    const e = typed(
      { pid: FROM, status: "idle", contracts_active: 0, spend_delta: { tokens: 10, cost: 0 }, alive_until: TS },
      { type: "heartbeat", task_id: null, from: FROM, to: FROM },
    );
    expect(validateEnvelope(e).ok).toBe(true);
  });

  it("result success 无需 handoff_notes；partial 需要且给了就合法", () => {
    // result 不是 R2 应答类型：靠 task_id 关联，in_reply_to 必须为 null
    const body = { status: "success", summary: "done", artifacts: [{ path: "a.ts" }], spend: { tokens: 1, cost: 0 } };
    expect(validateEnvelope(typed(body, { type: "result" })).ok).toBe(true);
    const partial = { ...body, status: "partial", handoff_notes: "剩余 X" };
    expect(validateEnvelope(typed(partial, { type: "result" })).ok).toBe(true);
  });
});

describe("validateEnvelope · 外层字段", () => {
  it("非对象直接拒绝", () => {
    for (const bad of [null, [], "str", 42]) {
      const r = validateEnvelope(bad);
      expect(r.ok).toBe(false);
    }
  });

  it("v 只接受 1（拒绝更高主版本与非整数）", () => {
    expect(validateEnvelope(validRequest({ v: 2 })).ok).toBe(false);
    expect(validateEnvelope(validRequest({ v: 0 })).ok).toBe(false);
    expect(validateEnvelope(validRequest({ v: "1" })).ok).toBe(false);
  });

  it("id 必须是小写 UUID v4", () => {
    expect(validateEnvelope(validRequest({ id: "0c9d6a52-8f1e-4d3a-9b7c-2e5f1a8d4b6z" })).ok).toBe(false); // 非 hex
    expect(validateEnvelope(validRequest({ id: "0C9D6A52-8F1E-4D3A-9B7C-2E5F1A8D4B60" })).ok).toBe(false); // 大写
    expect(validateEnvelope(validRequest({ id: "0c9d6a52-8f1e-5d3a-9b7c-2e5f1a8d4b60" })).ok).toBe(false); // 版本位非 4
  });

  it("from 必须是 PID", () => {
    expect(validateEnvelope(validRequest({ from: "pv-alpha" })).ok).toBe(false);
    expect(validateEnvelope(validRequest({ from: "pv-3f8a12" })).ok).toBe(false);
  });

  it("type/priority/ts 非法被拒", () => {
    expect(validateEnvelope(validRequest({ type: "hello" })).ok).toBe(false);
    expect(validateEnvelope(validRequest({ priority: "urgent+" })).ok).toBe(false);
    expect(validateEnvelope(validRequest({ ts: "2026-09-04 18:00:00" })).ok).toBe(false);
  });

  it("ttl 必须是 null 或正整数", () => {
    expect(validateEnvelope(validRequest({ ttl: -1 })).ok).toBe(false);
    expect(validateEnvelope(validRequest({ ttl: 1.5 })).ok).toBe(false);
    expect(validateEnvelope(validRequest({ ttl: "300" })).ok).toBe(false);
  });

  it("to：非 broadcast 不许 topic；PID 形状错误被拒", () => {
    expect(validateEnvelope(validRequest({ to: "topic:build" })).ok).toBe(false);
    expect(validateEnvelope(validRequest({ to: "pv-xxxx" })).ok).toBe(false);
    expect(validateEnvelope(validRequest({ to: "pv-human" })).ok).toBe(true);
  });

  it("一次累积多个错误", () => {
    const r = validateEnvelope(validRequest({ id: "bad", priority: "bad" }));
    expect(r.ok).toBe(false);
    expect(r.errors.length).toBeGreaterThanOrEqual(2);
  });
});

describe("validateEnvelope · task_id 与 R2", () => {
  it("契约族缺 task_id 拒；notify 带 task_id 拒", () => {
    expect(validateEnvelope(validRequest({ task_id: null })).ok).toBe(false);
    const notify = typed({ subject: "s" }, { type: "notify", task_id: TASK });
    expect(validateEnvelope(notify).ok).toBe(false);
  });

  it("accept 缺/坏 in_reply_to 拒；notify 带 in_reply_to 拒", () => {
    expect(validateEnvelope(typed({}, { type: "accept", in_reply_to: null })).ok).toBe(false);
    expect(validateEnvelope(typed({}, { type: "accept", in_reply_to: "not-uuid" })).ok).toBe(false);
    const notify = typed({ subject: "s" }, { type: "notify", in_reply_to: UUID });
    expect(validateEnvelope(notify).ok).toBe(false);
  });
});

describe("validateEnvelope · 定址与 request 跨字段", () => {
  it("request 不能自发自收（R3）", () => {
    expect(validateEnvelope(validRequest({ to: FROM })).ok).toBe(false);
  });

  it("broadcast 必须 topic 定址且名字非空", () => {
    const ok = typed({ topic: "b", subject: "s" }, { type: "broadcast", to: TO, task_id: null });
    expect(validateEnvelope(ok).ok).toBe(false); // 用了 PID
    const empty = typed({ topic: "b", subject: "s" }, { type: "broadcast", to: "topic:", task_id: null });
    expect(validateEnvelope(empty).ok).toBe(false);
  });

  it("request 缺 deadline 且 ttl=null 拒", () => {
    const e = validRequest({ ttl: null }, { deadline: undefined });
    expect(validateEnvelope(e).ok).toBe(false);
  });

  it("request body 字段问题", () => {
    expect(validateEnvelope(validRequest({}, { budget: {} })).ok).toBe(false); // 无一维
    expect(validateEnvelope(validRequest({}, { budget: { tokens: -1 } })).ok).toBe(false); // 负数
    expect(validateEnvelope(validRequest({}, { sandbox: "yes" })).ok).toBe(false);
    const badSpec = { spec: { goal: "", deliverable: "d", acceptance: ["a"] }, budget: { tokens: 1 }, deadline: TS };
    expect(validateEnvelope(typed(badSpec, { type: "request", ttl: null })).ok).toBe(false);
    const emptyAcceptance = {
      spec: { goal: "g", deliverable: "d", acceptance: [] },
      budget: { tokens: 1 },
      deadline: TS,
    };
    expect(validateEnvelope(typed(emptyAcceptance, { type: "request" })).ok).toBe(false);
  });
});

describe("validateEnvelope · 各类型 body", () => {
  const replyTo = { in_reply_to: UUID2 };

  it("decline", () => {
    expect(validateEnvelope(typed({ reason: "busy" }, { type: "decline", ...replyTo })).ok).toBe(true);
    expect(validateEnvelope(typed({}, { type: "decline", ...replyTo })).ok).toBe(false);
    expect(validateEnvelope(typed({ reason: "nope" }, { type: "decline", ...replyTo })).ok).toBe(false);
  });

  it("report：progress 0..1 且 spend 完整", () => {
    const ok = { progress: 0.5, spend: { tokens: 10, cost: 0.1 } };
    expect(validateEnvelope(typed(ok, { type: "report" })).ok).toBe(true);
    expect(validateEnvelope(typed({ ...ok, progress: 1.2 }, { type: "report" })).ok).toBe(false);
    expect(validateEnvelope(typed({ progress: 0.5, spend: { tokens: 10 } }, { type: "report" })).ok).toBe(false);
  });

  it("result：partial 需 handoff；artifacts 每项有 path", () => {
    // result 靠 task_id 关联，按 R2 不带 in_reply_to
    const base = { status: "failed", summary: "s", artifacts: [], spend: { tokens: 1, cost: 0 } };
    expect(validateEnvelope(typed(base, { type: "result" })).ok).toBe(false); // 缺 handoff
    expect(validateEnvelope(typed({ ...base, handoff_notes: "h" }, { type: "result" })).ok).toBe(true);
    const badArt = { ...base, status: "success", artifacts: [{ digest: "x" }] };
    expect(validateEnvelope(typed(badArt, { type: "result" })).ok).toBe(false);
  });

  it("review / counter / steer / resign", () => {
    expect(validateEnvelope(typed({ verdict: "accepted" }, { type: "review", ...replyTo })).ok).toBe(true);
    expect(validateEnvelope(typed({ verdict: "maybe" }, { type: "review", ...replyTo })).ok).toBe(false);
    expect(validateEnvelope(typed({ proposed: {}, rationale: "r" }, { type: "counter", ...replyTo })).ok).toBe(true);
    expect(validateEnvelope(typed({ proposed: {} }, { type: "counter", ...replyTo })).ok).toBe(false);
    expect(validateEnvelope(typed({ directive: "d" }, { type: "steer" })).ok).toBe(true);
    expect(validateEnvelope(typed({}, { type: "steer" })).ok).toBe(false);
    expect(validateEnvelope(typed({ reason: "overload", progress: 0 }, { type: "resign" })).ok).toBe(true);
    expect(validateEnvelope(typed({ reason: "tired", progress: 0 }, { type: "resign" })).ok).toBe(false);
  });

  it("escalate：options 2..4、urgency 合法", () => {
    const opt = (n: number) => Array.from({ length: n }, (_, i) => ({ label: `l${i}`, implication: `i${i}` }));
    const mk = (n: number, urgency = "high") =>
      typed({ subject: "s", options: opt(n), urgency }, { type: "escalate", task_id: null });
    expect(validateEnvelope(mk(1)).ok).toBe(false);
    expect(validateEnvelope(mk(2)).ok).toBe(true);
    expect(validateEnvelope(mk(4)).ok).toBe(true);
    expect(validateEnvelope(mk(5)).ok).toBe(false);
    expect(validateEnvelope(mk(3, "ASAP")).ok).toBe(false);
  });

  it("notify/query/reply/broadcast 缺必填被拒", () => {
    expect(validateEnvelope(typed({}, { type: "notify", task_id: null })).ok).toBe(false);
    expect(validateEnvelope(typed({ subject: "s" }, { type: "query", task_id: null })).ok).toBe(false);
    expect(validateEnvelope(typed({}, { type: "reply", ...replyTo, task_id: null })).ok).toBe(false);
    expect(validateEnvelope(typed({ subject: "s" }, { type: "broadcast", to: "topic:b", task_id: null })).ok).toBe(false);
  });

  it("heartbeat 字段", () => {
    const hb = { pid: FROM, status: "busy", contracts_active: 2, spend_delta: { tokens: 1, cost: 0 }, alive_until: TS };
    const env = { type: "heartbeat", task_id: null, from: FROM, to: FROM };
    expect(validateEnvelope(typed(hb, env)).ok).toBe(true);
    expect(validateEnvelope(typed({ ...hb, pid: "bad" }, env)).ok).toBe(false);
    expect(validateEnvelope(typed({ ...hb, contracts_active: -1 }, env)).ok).toBe(false);
    expect(validateEnvelope(typed({ ...hb, alive_until: "tomorrow" }, env)).ok).toBe(false);
  });
});

describe("validateEnvelope · 大小限制", () => {
  it("body 超过注入上限被拒", () => {
    const r = validateEnvelope(validRequest(), { maxBodyBytes: 10 });
    expect(r.ok).toBe(false);
    expect(r.errors.some((m) => m.includes("body"))).toBe(true);
  });

  it("默认上限常量为 8192（docs/03 §2）", () => {
    expect(BODY_MAX_BYTES_DEFAULT).toBe(8192);
    const bigGoal = "x".repeat(BODY_MAX_BYTES_DEFAULT);
    expect(validateEnvelope(validRequest({}, { spec: { ...requestBody.spec, goal: bigGoal } })).ok).toBe(false);
  });
});

// 编译期对齐：合法 request 工厂可被视作 Envelope（类型不报错即可）
describe("类型对齐（编译期）", () => {
  it("EnvelopeOf request 字段齐全", () => {
    const e = validRequest() as unknown as Envelope;
    expect(e.v).toBe(1);
  });
});
