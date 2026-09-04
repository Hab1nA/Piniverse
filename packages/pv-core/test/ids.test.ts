import { describe, expect, it } from "vitest";
import {
  CONTRACT_ID_PATTERN,
  PID_PATTERN,
  PV_HUMAN,
  isContractId,
  isPid,
  newContractId,
  newPid,
  topicAddress,
} from "../src/index.js";

describe("id generators (docs/05 §2, docs/04 §2)", () => {
  it("生成符合格式的 PID 且两次不重复", () => {
    const a = newPid();
    const b = newPid();
    expect(a).toMatch(PID_PATTERN);
    expect(b).toMatch(PID_PATTERN);
    expect(a).not.toBe(b);
    expect(isPid(a)).toBe(true);
  });

  it("生成符合格式的契约 ID", () => {
    const t = newContractId();
    expect(t).toMatch(CONTRACT_ID_PATTERN);
    expect(isContractId(t)).toBe(true);
  });

  it("保留地址与话题定址", () => {
    expect(PV_HUMAN).toBe("pv-human");
    expect(topicAddress("build")).toBe("topic:build");
    expect(isPid("pv-zzzz")).toBe(false);
  });
});
