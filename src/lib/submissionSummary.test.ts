import { describe, expect, it } from "vitest";
import { summarizeSubmission } from "./journey";
import { isSummaryData, summaryDataOf, toSubmissionSummary } from "./submissionSummary";

const log = [
  [1000, "i", 0, 0, 0, 0, "print(a)"],
  [2000, "r:NameError"],
  [3000, "q"],
  [4000, "p", 0, 0, 0, 0, "a = 1\n"],
  [5000, "r:ok"],
  [6000, "b"],
  [9000, "f"],
];
const row = { id: 7, subject: "정보", problem: "1-2", submitted_at: "2026-10-01T01:00:00Z", init_code: "", edit_log: log };

describe("제출 요약 (저장해 두는 숫자)", () => {
  it("저장한 요약으로 만든 학습 여정 항목은 기록에서 바로 계산한 것과 같다", () => {
    const data = summaryDataOf(row.init_code, row.edit_log, "a = 1\nprint(a)");
    expect(toSubmissionSummary(row, data)).toEqual(summarizeSubmission(row));
  });

  it("DB(JSON)를 거쳐도 그대로이고, 업적 판정 값이 들어 있다", () => {
    const data = summaryDataOf("", log, "# 하나\n# 둘\n# 셋\ndef f():\n    pass");
    const back = JSON.parse(JSON.stringify(data));
    expect(isSummaryData(back)).toBe(true);
    expect(back).toEqual(data);
    expect(data.events).toBe(7);
    expect(data.fixedErrors).toBe(1);
    expect(data.facts).toMatchObject({ firstFix: 5000, helpOwn: null, oneShot: null, fixedKinds: [["NameError", 5000]], commentLines: 3, hasFunction: true });
  });

  it("기록이 없는 제출(v1의 옛 제출)도 요약한다", () => {
    const data = summaryDataOf(null, null, null);
    expect(data).toMatchObject({ hasLog: false, events: 0, fixedErrors: 0 });
    expect(isSummaryData(data)).toBe(true);
  });

  it("모양이 다른 값은 쓰지 않는다", () => {
    for (const v of [null, {}, { stats: {} }, "x", { stats: { totalMs: 1 }, hasLog: true }]) expect(isSummaryData(v)).toBe(false);
  });
});
