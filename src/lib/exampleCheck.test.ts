import { describe, expect, it } from "vitest";
import { checkEvent, exampleTests, judgeExamples, parseCheck, splitExampleInput } from "./exampleCheck";

describe("예시로 확인", () => {
  it("예시 입력 나누기", () => {
    expect(splitExampleInput("")).toEqual([]);
    expect(splitExampleInput("3")).toEqual(["3"]);
    expect(splitExampleInput("3\n5\n")).toEqual(["3", "5"]);
    expect(splitExampleInput("길동 / 돈까스 / 볶음밥")).toEqual(["길동", "돈까스", "볶음밥"]);
    expect(splitExampleInput("2026/11/03")).toEqual(["2026/11/03"]);
  });
  it("출력이 없는 예시는 빼고, 기록 표시는 t:통과/전체", () => {
    expect(exampleTests([{ input: "1", output: "" }, { input: "a / b", output: "ab" }])).toEqual([{ inputs: ["a", "b"], output: "ab" }]);
    expect(checkEvent(2, 3)).toBe("t:2/3");
    expect(parseCheck("t:3/3")).toEqual({ pass: 3, total: 3 });
    expect(parseCheck("t:4/3")).toBeNull();
    expect(parseCheck("r:ok")).toBeNull();
  });
  it("안내 글 없이 맞거나, 안내 글까지 맞으면 통과", () => {
    const tests = [{ inputs: ["3"], output: "6" }, { inputs: ["3"], output: "수: 3\n6" }, { inputs: ["3"], output: "7" }];
    const plain = tests.map(() => ({ output: "6\n", error: null }));
    const echoed = tests.map(() => ({ output: "수: 3\n6\n", error: null }));
    expect(judgeExamples(tests, plain, echoed).map((o) => o.pass)).toEqual([true, true, false]);
    expect(judgeExamples(tests.slice(0, 1), [{ output: "6", error: "NameError: x" }], [{ output: "6", error: "NameError: x" }])[0].pass).toBe(false);
  });
});

describe("재생 타임라인 표시", async () => {
  const { analyzeLog } = await import("./replay");
  it("t: 표시가 ✔ 예시로 확인으로 보인다", () => {
    const { marks } = analyzeLog("", [[1000, "i", 0, 0, 0, 0, "x"], [2000, "t:1/2"], [3000, "t:2/2"]]);
    expect(marks.filter((m) => m.kind === "check").map((m) => m.detail)).toEqual(["예시 확인: 1/2 통과", "예시 확인: 모두 통과 (2/2)"]);
  });
});
