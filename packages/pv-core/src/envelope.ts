/**
 * PVMP 消息协议类型定义（docs/03）。
 *
 * 这里只放"已定稿规范"的类型翻译与常量：
 * - 信封固定 11 字段（docs/03 §2）
 * - 16 种消息类型，body 按 type 取对应 schema（docs/03 §3–4）
 * - 结构校验 {@link validateEnvelope}：只做信封自身可判定的规则（字段形状、R2、task_id 必填/必空、
 *   body schema、大小、request 不得自发自收）；R1 与 R3 的方向校验需要契约/注册表上下文，在发送工具层做（docs/03 §3）。
 */
import { CONTRACT_ID_PATTERN, PID_PATTERN, PV_HUMAN, isTopicAddress } from "./ids.js";

/** 协议主版本（docs/03 §2、§8：接收方接受 v ≤ 自身主版本）。 */
export const PROTOCOL_VERSION = 1 as const;

/** body 默认大小上限（字节，policy 可调，docs/03 §2）。 */
export const BODY_MAX_BYTES_DEFAULT = 8192;

/** 信封整体硬上限（字节，docs/03 §2）。 */
export const ENVELOPE_MAX_BYTES = 64 * 1024;

/** steer/cancel 的默认 TTL（秒）：过时的指令不如不发（docs/03 §6）。 */
export const CONTROL_TTL_DEFAULT_SECONDS = 300;

export type MessagePriority = "low" | "normal" | "high" | "urgent";

/** 16 种消息类型（docs/03 §3 总表，heartbeat 为控制面）。 */
export type MessageType =
  | "request"
  | "accept"
  | "decline"
  | "counter"
  | "report"
  | "result"
  | "review"
  | "steer"
  | "cancel"
  | "resign"
  | "escalate"
  | "notify"
  | "query"
  | "reply"
  | "broadcast"
  | "heartbeat";

/** 契约族：携带/改变契约状态，task_id 必填（docs/03 §3）。 */
export const CONTRACT_MESSAGE_TYPES = [
  "request",
  "accept",
  "decline",
  "counter",
  "report",
  "result",
  "review",
  "steer",
  "cancel",
  "resign",
] as const;

/** in_reply_to 必填的应答类型（R2，docs/03 §3）。 */
export const REPLY_TYPES = ["accept", "decline", "counter", "review", "reply"] as const;

/** 全部 16 种消息类型的运行时清单（与 {@link MessageType} 一一对应，docs/03 §3）。 */
export const MESSAGE_TYPES = [
  ...CONTRACT_MESSAGE_TYPES,
  "escalate",
  "notify",
  "query",
  "reply",
  "broadcast",
  "heartbeat",
] as const satisfies readonly MessageType[];

/** task_id 必须为 null 的类型：自由族单向/控制面（docs/03 §2、§4.7）。 */
export const TASK_ID_FORBIDDEN_TYPES = ["notify", "broadcast", "heartbeat"] as const satisfies readonly MessageType[];

export const MESSAGE_PRIORITIES = ["low", "normal", "high", "urgent"] as const satisfies readonly MessagePriority[];

export const DECLINE_REASONS = ["busy", "capability", "policy", "cost", "scope", "cycle", "other"] as const satisfies readonly DeclineReason[];

export const RESIGN_REASONS = ["blocked", "policy", "capability", "overload", "shutdown", "other"] as const satisfies readonly ResignReason[];

export const RESULT_STATUSES = ["success", "partial", "failed"] as const satisfies readonly ResultStatus[];

export const REVIEW_VERDICTS = ["accepted", "rejected", "rework"] as const satisfies readonly ReviewVerdict[];

export const ESCALATION_URGENCIES = ["normal", "high", "urgent"] as const;

/** 小写 UUID v4（docs/03 §2：UUID v4 小写）。 */
const UUID_V4_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/** ISO 8601 本地时区或 UTC（docs/03 §2：ISO 8601 本地时区）。 */
const ISO_TS_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

/** 所有 body 可附加的通用字段（docs/03 §4 约定）。 */
export interface CommonBodyFields {
  /** 一句话备注。 */
  note?: string;
  /** 工件路径指针（传指针不传全文，docs/07）。 */
  refs?: string[];
}

/** 任务规格（docs/03 §4.1）。 */
export interface TaskSpec {
  /** 要达成什么（一段话）。 */
  goal: string;
  /** 交付物定义（通常是文件路径/形态）。 */
  deliverable: string;
  /** 可检验的验收标准（逐条）。 */
  acceptance: string[];
  /** 约束（不许改什么、风格要求等）。 */
  constraints?: string[];
  /** 背景工件指针（路径），不放内容只放指针。 */
  context?: string[];
}

/** 预算上限，至少给一维（docs/03 §4.1、docs/08 §4）。 */
export interface Budget {
  tokens?: number;
  cost?: number;
  minutes?: number;
}

/** 累计消耗（契约累计值，非增量，docs/03 §4.3）。 */
export interface Spend {
  tokens: number;
  cost: number;
}

/** 工件指针 + 可选摘要（docs/03 §4.3）。 */
export interface ArtifactRef {
  path: string;
  digest?: string;
}

// ---- 各类型 body（docs/03 §4）---------------------------------------------

export interface RequestBody extends CommonBodyFields {
  spec: TaskSpec;
  budget: Budget;
  /** ISO 8601 截止时刻；deadline 与信封 ttl 至少其一必填。 */
  deadline?: string;
  /** 是否要求沙箱执行（MVP 仅愿望标记，docs/08 §7）。 */
  sandbox?: boolean;
}

export interface AcceptBody extends CommonBodyFields {
  /** 三句以内的执行计划。 */
  plan?: string;
  eta?: string;
}

/** decline 原因（docs/03 §4.2）；`cycle` 为成环机械拒绝时代发（docs/04 §6、docs/09）。 */
export type DeclineReason =
  | "busy"
  | "capability"
  | "policy"
  | "cost"
  | "scope"
  | "cycle"
  | "other";

export interface DeclineBody extends CommonBodyFields {
  reason: DeclineReason;
  detail?: string;
  alternative_hint?: string;
}

export interface CounterBody extends CommonBodyFields {
  proposed: {
    budget?: Budget;
    deadline?: string;
    deliverable?: string;
    scope_notes?: string;
  };
  /** 为何要改。 */
  rationale: string;
}

export interface ReportBody extends CommonBodyFields {
  /** 0–1。 */
  progress: number;
  milestone?: string;
  spend: Spend;
  blockers?: string[];
}

export type ResultStatus = "success" | "partial" | "failed";

export interface ResultBody extends CommonBodyFields {
  status: ResultStatus;
  /** ≤300 字，逐跳摘要的起点（docs/07 §3）。 */
  summary: string;
  artifacts: ArtifactRef[];
  spend: Spend;
  /** partial/failed 时必填：给接管者的交接单。 */
  handoff_notes?: string;
}

export type ReviewVerdict = "accepted" | "rejected" | "rework";

export interface ReviewBody extends CommonBodyFields {
  verdict: ReviewVerdict;
  feedback?: string;
}

export interface SteerBody extends CommonBodyFields {
  /** 一段话指令。 */
  directive: string;
  reason?: string;
}

export interface CancelBody extends CommonBodyFields {
  reason?: string;
}

/** resign 原因（docs/03 §4.4）；`shutdown` 为优雅退出时代发（docs/05 §3）。 */
export type ResignReason = "blocked" | "policy" | "capability" | "overload" | "shutdown" | "other";

export interface ResignBody extends CommonBodyFields {
  reason: ResignReason;
  /** 0–1。 */
  progress: number;
  artifacts?: ArtifactRef[];
  handoff_notes?: string;
}

export interface EscalateBody extends CommonBodyFields {
  /** 一句话问题。 */
  subject: string;
  /** 2–4 个候选决策（把开放题变选择题是协议纪律）。 */
  options: { label: string; implication: string }[];
  urgency: "normal" | "high" | "urgent";
  context_refs?: string[];
}

export interface NotifyBody {
  subject: string;
  detail?: string;
}

export interface QueryBody {
  subject: string;
  question: string;
}

export interface ReplyBody {
  answer: string;
  note?: string;
}

export interface BroadcastBody {
  topic: string;
  subject: string;
  detail?: string;
}

/** 控制面心跳（不走信箱，直接更新注册表分片，docs/03 §4.7）。 */
export interface HeartbeatBody {
  pid: string;
  status: string;
  contracts_active: number;
  spend_delta: Spend;
  alive_until: string;
}

/** body 判别表，供 {@link Envelope} 联合按 type 收窄。 */
export interface BodyByType {
  request: RequestBody;
  accept: AcceptBody;
  decline: DeclineBody;
  counter: CounterBody;
  report: ReportBody;
  result: ResultBody;
  review: ReviewBody;
  steer: SteerBody;
  cancel: CancelBody;
  resign: ResignBody;
  escalate: EscalateBody;
  notify: NotifyBody;
  query: QueryBody;
  reply: ReplyBody;
  broadcast: BroadcastBody;
  heartbeat: HeartbeatBody;
}

/**
 * 信封固定字段（除 body 外的 10 字段，docs/03 §2）。
 * 线上 `to` 只允许 PID / `topic:<name>` / `pv-human`；按名字发送是工具层语法糖。
 */
export interface EnvelopeBase {
  v: 1;
  /** UUID v4 小写，全网络唯一。 */
  id: string;
  /** 发送方 PID。 */
  from: string;
  /** 接收方 PID / topic 定址 / pv-human。 */
  to: string;
  /** 发送时刻，ISO 8601 本地时区。 */
  ts: string;
  /** 契约类必填；notify/broadcast 为 null；query/reply 可选。 */
  task_id: string | null;
  /** 应答类必填（R2）。 */
  in_reply_to: string | null;
  priority: MessagePriority;
  /** 投递时限（秒），null 表示不过期。 */
  ttl: number | null;
}

/** 类型化信封：type 与 body 一一对应。 */
export type Envelope = {
  [K in MessageType]: EnvelopeBase & { type: K; body: BodyByType[K] };
}[MessageType];

export type EnvelopeOf<T extends MessageType> = EnvelopeBase & { type: T; body: BodyByType[T] };

/** 结构校验结果（M1 由 validateEnvelope 产出）。 */
export interface ValidationResult {
  ok: boolean;
  errors: string[];
}

export interface ValidateEnvelopeOptions {
  /** body 字节上限，默认 {@link BODY_MAX_BYTES_DEFAULT}（由 policy.message_body_max_bytes 注入）。 */
  maxBodyBytes?: number;
  /** 信封整体字节硬上限，默认 {@link ENVELOPE_MAX_BYTES}。 */
  maxEnvelopeBytes?: number;
}

/**
 * 信封结构校验（docs/03 §2–4）。
 *
 * 只做**仅凭信封自身即可判定**的规则，一次累积全部错误（便于回灌 LLM 自纠，docs/11 §2）：
 * 字段形状与必填、v 向后兼容、UUID/PID/契约 ID 形状、R2（in_reply_to）、
 * task_id 的族规则、body 按 type 的 schema、body/整体大小、broadcast 定址、request 不得自发自收（R3 的纯字段部分）。
 *
 * **不在此做**（需要契约/注册表上下文）：R1（task_id 指向已存在契约且发送方为当事双方）、
 * R3 的 master→worker 方向、深度/预算/环检测——这些在发送工具层结合注册表与契约存储判定。
 */
export function validateEnvelope(input: unknown, options: ValidateEnvelopeOptions = {}): ValidationResult {
  const errors: string[] = [];
  if (!isPlainObject(input)) return { ok: false, errors: ["信封必须是 JSON 对象"] };
  const e = input as Record<string, unknown>;

  const envelopeBytes = byteSize(input);
  if (envelopeBytes > (options.maxEnvelopeBytes ?? ENVELOPE_MAX_BYTES)) {
    errors.push(`信封整体 ${envelopeBytes}B 超过硬上限 ${options.maxEnvelopeBytes ?? ENVELOPE_MAX_BYTES}B`);
  }

  // v：接收 v ≤ 自身主版本（docs/03 §8）
  if (typeof e.v !== "number" || !Number.isInteger(e.v) || e.v < 1 || e.v > PROTOCOL_VERSION) {
    errors.push(`v 必须是 1..${PROTOCOL_VERSION} 的整数（收到 ${fmt(e.v)}）`);
  }

  if (typeof e.id !== "string" || !UUID_V4_PATTERN.test(e.id)) errors.push("id 必须是小写 UUID v4");
  if (typeof e.from !== "string" || !PID_PATTERN.test(e.from)) errors.push("from 必须是 PID（pv-xxxxxxxx）");

  const type: MessageType | undefined = oneOf(e.type, MESSAGE_TYPES) ? (e.type as MessageType) : undefined;
  if (!type) errors.push(`type 必须是 ${MESSAGE_TYPES.length} 种消息类型之一（收到 ${fmt(e.type)}）`);

  // to：broadcast 必须 topic:；其余必须 PID / pv-human，且不许用 topic:
  if (typeof e.to !== "string" || e.to.length === 0) {
    errors.push("to 必须是非空地址");
  } else if (type === "broadcast") {
    if (!isTopicAddress(e.to) || e.to.length <= "topic:".length) errors.push("broadcast 的 to 必须是 topic:<name>");
  } else if (isTopicAddress(e.to)) {
    errors.push("只有 broadcast 可使用 topic: 定址");
  } else if (e.to !== PV_HUMAN && !PID_PATTERN.test(e.to)) {
    errors.push("to 必须是 PID 或 pv-human（broadcast 用 topic:<name>）");
  }

  if (!isIsoTs(e.ts)) errors.push("ts 必须是 ISO 8601 时间（如 2026-09-04T18:00:00+08:00）");
  if (!oneOf(e.priority, MESSAGE_PRIORITIES)) errors.push("priority 必须是 low/normal/high/urgent 之一");
  if (e.ttl !== null && (typeof e.ttl !== "number" || !Number.isInteger(e.ttl) || e.ttl <= 0)) {
    errors.push("ttl 必须为 null 或正整数秒");
  }

  validateTaskIdField(e, type, errors);
  validateInReplyToField(e, type, errors);

  // R3 中不依赖契约上下文的一条：request 不能自发自收（docs/03 §3）
  if (type === "request" && typeof e.from === "string" && e.from === e.to) {
    errors.push("request 的 to 不允许是发件人自己（R3）");
  }

  if (!isPlainObject(e.body)) {
    errors.push("body 必须是对象");
  } else {
    const bodyBytes = byteSize(e.body);
    if (bodyBytes > (options.maxBodyBytes ?? BODY_MAX_BYTES_DEFAULT)) {
      errors.push(`body ${bodyBytes}B 超过上限 ${options.maxBodyBytes ?? BODY_MAX_BYTES_DEFAULT}B`);
    }
    if (type) validateBody(type, e.body, e, errors);
  }

  return { ok: errors.length === 0, errors };
}

function validateTaskIdField(e: Record<string, unknown>, type: MessageType | undefined, errors: string[]): void {
  if (!type) return;
  const v = e.task_id;
  if ((CONTRACT_MESSAGE_TYPES as readonly string[]).includes(type)) {
    if (typeof v !== "string" || !CONTRACT_ID_PATTERN.test(v)) {
      errors.push(`${type} 属于契约族，task_id 必须是 t-xxxxxxxx（docs/03 §2）`);
    }
  } else if ((TASK_ID_FORBIDDEN_TYPES as readonly string[]).includes(type)) {
    if (v !== null) errors.push(`${type} 的 task_id 必须为 null`);
  } else if (v !== null && (typeof v !== "string" || !CONTRACT_ID_PATTERN.test(v))) {
    // escalate/query/reply：可携带指向契约的 t-id，也可为 null
    errors.push("task_id 必须为 null 或 t-xxxxxxxx");
  }
}

function validateInReplyToField(e: Record<string, unknown>, type: MessageType | undefined, errors: string[]): void {
  if (!type) return;
  const v = e.in_reply_to;
  if ((REPLY_TYPES as readonly string[]).includes(type)) {
    if (typeof v !== "string" || !UUID_V4_PATTERN.test(v)) {
      errors.push(`${type} 的 in_reply_to 必填，且为所应答消息的小写 UUID v4（R2）`);
    }
  } else if (v !== null) {
    errors.push(`${type} 的 in_reply_to 应为 null（R2）`);
  }
}

/** 按 type 校验 body 特有字段（docs/03 §4）；通用 note/refs 与额外字段宽松放行（§8 向后兼容）。 */
function validateBody(
  type: MessageType,
  b: Record<string, unknown>,
  envelope: Record<string, unknown>,
  errors: string[],
): void {
  const need = (field: string, ok: boolean, rule: string): void => {
    if (!ok) errors.push(`body.${field} ${rule}`);
  };

  switch (type) {
    case "request": {
      if (isPlainObject(b.spec)) {
        const s = b.spec;
        need("spec.goal", isNonEmptyString(s.goal), "必须是非空字符串");
        need("spec.deliverable", isNonEmptyString(s.deliverable), "必须是非空字符串");
        need("spec.acceptance", Array.isArray(s.acceptance) && s.acceptance.length > 0 && s.acceptance.every(isNonEmptyString), "必须是非空字符串数组");
        if (s.constraints !== undefined && !isStringArray(s.constraints)) errors.push("body.spec.constraints 必须是字符串数组");
        if (s.context !== undefined && !isStringArray(s.context)) errors.push("body.spec.context 必须是字符串数组");
      } else {
        errors.push("body.spec 必须是对象");
      }
      const budget = b.budget;
      const hasOneDim =
        isPlainObject(budget) &&
        [budget.tokens, budget.cost, budget.minutes].some((d) => isFiniteNumber(d) && d >= 0);
      need("budget", hasOneDim, "必须是对象，且 tokens/cost/minutes 至少一维为非负数");
      if (b.deadline !== undefined && !isIsoTs(b.deadline)) errors.push("body.deadline 必须是 ISO 8601 时间");
      // deadline 与信封 ttl 至少其一（docs/03 §4.1，终止性基石）
      const hasDeadline = isIsoTs(b.deadline);
      if (!hasDeadline && envelope.ttl === null) errors.push("request 的 deadline 与信封 ttl 至少必填其一");
      if (b.sandbox !== undefined && typeof b.sandbox !== "boolean") errors.push("body.sandbox 必须是布尔值");
      break;
    }
    case "accept":
      break; // plan/eta 均可选
    case "decline":
      need("reason", oneOf(b.reason, DECLINE_REASONS), "必须是 busy/capability/policy/cost/scope/cycle/other 之一");
      break;
    case "counter":
      need("proposed", isPlainObject(b.proposed), "必须是对象（budget/deadline/deliverable/scope_notes 的子集修订）");
      need("rationale", isNonEmptyString(b.rationale), "必须是非空字符串");
      break;
    case "report":
      need("progress", isFiniteNumber(b.progress) && b.progress >= 0 && b.progress <= 1, "必须是 0..1 的数");
      need("spend", isSpend(b.spend), "必须是 {tokens:number, cost:number}");
      break;
    case "result": {
      need("status", oneOf(b.status, RESULT_STATUSES), "必须是 success/partial/failed 之一");
      need("summary", isNonEmptyString(b.summary), "必须是非空字符串");
      need(
        "artifacts",
        Array.isArray(b.artifacts) && b.artifacts.every((a) => isPlainObject(a) && isNonEmptyString(a.path)),
        "必须是数组，且每项含非空 path",
      );
      need("spend", isSpend(b.spend), "必须是 {tokens:number, cost:number}");
      if ((b.status === "partial" || b.status === "failed") && !isNonEmptyString(b.handoff_notes)) {
        errors.push("body.status 为 partial/failed 时 handoff_notes 必填");
      }
      break;
    }
    case "review":
      need("verdict", oneOf(b.verdict, REVIEW_VERDICTS), "必须是 accepted/rejected/rework 之一");
      break;
    case "steer":
      need("directive", isNonEmptyString(b.directive), "必须是非空字符串");
      break;
    case "cancel":
      break; // reason 可选
    case "resign":
      need("reason", oneOf(b.reason, RESIGN_REASONS), "必须是 blocked/policy/capability/overload/shutdown/other 之一");
      need("progress", isFiniteNumber(b.progress) && b.progress >= 0 && b.progress <= 1, "必须是 0..1 的数");
      break;
    case "escalate": {
      need("subject", isNonEmptyString(b.subject), "必须是非空字符串");
      const opts = b.options;
      need(
        "options",
        Array.isArray(opts) &&
          opts.length >= 2 &&
          opts.length <= 4 &&
          opts.every((o) => isPlainObject(o) && isNonEmptyString(o.label) && isNonEmptyString(o.implication)),
        "必须是 2..4 项，每项含非空 label 与 implication",
      );
      need("urgency", oneOf(b.urgency, ESCALATION_URGENCIES), "必须是 normal/high/urgent 之一");
      break;
    }
    case "notify":
      need("subject", isNonEmptyString(b.subject), "必须是非空字符串");
      break;
    case "query":
      need("subject", isNonEmptyString(b.subject), "必须是非空字符串");
      need("question", isNonEmptyString(b.question), "必须是非空字符串");
      break;
    case "reply":
      need("answer", isNonEmptyString(b.answer), "必须是非空字符串");
      break;
    case "broadcast":
      need("topic", isNonEmptyString(b.topic), "必须是非空字符串");
      need("subject", isNonEmptyString(b.subject), "必须是非空字符串");
      break;
    case "heartbeat":
      need("pid", typeof b.pid === "string" && PID_PATTERN.test(b.pid), "必须是 PID（pv-xxxxxxxx）");
      need("status", isNonEmptyString(b.status), "必须是非空字符串");
      need("contracts_active", typeof b.contracts_active === "number" && Number.isInteger(b.contracts_active) && b.contracts_active >= 0, "必须是非负整数");
      need("spend_delta", isSpend(b.spend_delta), "必须是 {tokens:number, cost:number}");
      need("alive_until", isIsoTs(b.alive_until), "必须是 ISO 8601 时间");
      break;
  }
}

// ---- 纯工具辅助 -------------------------------------------------------------

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === "string");
}

function isSpend(v: unknown): boolean {
  return isPlainObject(v) && isFiniteNumber(v.tokens) && isFiniteNumber(v.cost);
}

function isIsoTs(v: unknown): v is string {
  return typeof v === "string" && ISO_TS_PATTERN.test(v) && !Number.isNaN(Date.parse(v));
}

function oneOf<T extends string>(v: unknown, list: readonly T[]): v is T {
  return typeof v === "string" && (list as readonly string[]).includes(v);
}

function byteSize(v: unknown): number {
  return Buffer.byteLength(JSON.stringify(v) ?? "", "utf8");
}

function fmt(v: unknown): string {
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}
