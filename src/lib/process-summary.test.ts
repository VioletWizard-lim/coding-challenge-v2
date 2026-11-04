import { describe, expect, it } from "vitest";
import { lineDiff, processSummaryText, splitMomentRefs, summarizeProcess } from "./process-summary";

const MIN = 60_000;
// 한 줄 입력: 문서 끝(line, ch)에 text를 넣는 편집 이벤트
const typeAt = (t: number, line: number, ch: number, text: string) => [t, "i", line, ch, line, ch, text];

describe("과정 기록 요약", () => {
  // 시작: 빈 코드 → name = input() 성공 → print(nmae) 로 NameError 3번 → 1분 넘게 멈춤 → 도움 요청
  const log = [
    typeAt(0, 0, 0, "name = input()"),
    [1000, "r:ok"],
    typeAt(2000, 0, 14, "\nprint(nmae)"),
    [3000, "r:NameError"],
    [4000, "r:NameError"],
    [5000, "r:NameError"],
    [5000 + 2 * MIN, "q"],
  ];
  const s = summarizeProcess("", log, 5000 + 3 * MIN);

  it("마지막 성공 코드와 그 뒤 바뀐 줄", () => {
    expect(s.lastSuccess?.code).toBe("name = input()");
    expect(s.lastSuccess?.minutesAgo).toBe(3);
    expect(s.changesSinceSuccess).toEqual({ added: ["print(nmae)"], removed: [] });
    expect(s.currentCode).toBe("name = input()\nprint(nmae)");
  });

  it("반복된 오류와 지금 이어지는 오류, 막힌 개념", () => {
    expect(s.errors).toEqual([
      { kind: "NameError", count: 3, longestStreak: 3, fixed: false, firstAt: "M2", lastAt: "M4" },
    ]);
    expect(s.currentStreak).toEqual({ kind: "NameError", count: 3 });
    expect(s.concepts[0]).toContain("변수");
  });

  it("오래 멈춘 구간과 도움 요청도 순간 번호로", () => {
    expect(s.pauses).toEqual([{ moment: "M5", minutes: 2 }]);
    expect(s.asks).toEqual(["M6"]);
    expect(s.moments.map((m) => [m.id, m.kind, m.at])).toEqual([
      ["M1", "run-ok", 1000],
      ["M2", "run-error", 3000],
      ["M3", "run-error", 4000],
      ["M4", "run-error", 5000],
      ["M5", "pause", 5000],
      ["M6", "ask", 5000 + 2 * MIN],
    ]);
  });

  it("고친 오류는 fixed, 다른 창에 가 있던 시간은 멈춤이 아님", () => {
    const fixed = summarizeProcess("", [typeAt(0, 0, 0, "x"), [1000, "r:TypeError"], [2000, "b"], [2000 + 5 * MIN, "f"], [2001 + 5 * MIN, "r:ok"]]);
    expect(fixed.errors[0].fixed).toBe(true);
    expect(fixed.currentStreak).toBeNull();
    expect(fixed.pauses).toEqual([]);
  });

  it("AI에 보낼 글: 과정이 들어 있고 학생 정보는 없음", () => {
    const text = processSummaryText(s);
    expect(text).toContain("마지막으로 실행에 성공한 순간: [[M1]]");
    expect(text).toContain("NameError: 3번");
    expect(text).toContain("+ 더함: print(nmae)");
    expect(text).toContain("[[M6]] AI 도움 요청");
  });

  it("기록이 없으면 시작 코드 기준", () => {
    const empty = summarizeProcess("print(1)", []);
    expect(empty.lastSuccess).toBeNull();
    expect(empty.currentCode).toBe("print(1)");
    expect(processSummaryText(empty)).toContain("아직 실행에 성공한 적이 없음");
  });
});

describe("줄 차이와 순간 표시", () => {
  it("줄 차이", () => {
    expect(lineDiff("a\nb\nc", "a\nB\nc\nd")).toEqual({ added: ["B", "d"], removed: ["b"] });
  });
  it("AI 응답 속 [[M1]]을 순간으로, 없는 번호는 글로 둔다", () => {
    const parts = splitMomentRefs("[[M1]]에서는 됐는데 [[M9]] 이후 달라졌어요", s0().moments);
    expect(parts[0]).toEqual({ moment: { id: "M1", at: 1000, kind: "run-ok", label: "실행 성공" } });
    expect(parts.slice(1)).toEqual([{ text: "에서는 됐는데 [[M9]] 이후 달라졌어요" }]);
  });
});

function s0() {
  return summarizeProcess("", [typeAt(0, 0, 0, "x"), [1000, "r:ok"]]);
}
