import { describe, expect, it } from "vitest";
import { applyEditEvent, editRange, type LogEvent } from "./editLog";
import { analyzeLog, formatDuration } from "./replay";

const S = 1000;
const MIN = 60 * S;

describe("기록 분석", () => {
  const log: LogEvent[] = [
    [0, "i", 0, 0, 0, 0, "print(x)"],
    [2 * S, "r:NameError"],
    [3 * S, "b"],
    [4 * S, "b"], // 겹친 이탈 신호는 한 번으로
    [13 * S, "f"],
    [14 * S, "f"],
    [15 * S, "p", 0, 0, 0, 0, "x = 1\n"],
    [16 * S, "r:ok"],
    [16 * S + 2 * MIN, "i", 1, 8, 1, 8, "\n" + "a".repeat(40)],
    [3 * MIN, "d", 2, 0, 2, 40, ""],
    [3 * MIN + S, "q"],
  ];
  const { edits, marks, stats } = analyzeLog("", log);

  it("편집 이벤트만 재생 대상으로 뽑는다", () => {
    expect(edits.map((e) => e[1])).toEqual(["i", "p", "i", "d"]);
  });

  it("통계를 v1과 같은 기준으로 센다", () => {
    expect(stats).toMatchObject({
      totalMs: 3 * MIN + S,
      typedChars: 8 + 41,
      pastedChars: 6,
      pasteCount: 1,
      editCount: 1,
      awayCount: 1,
      awayMs: 10 * S,
      runCount: 2,
      runErrorCount: 1,
      pauseCount: 1,
      askCount: 1,
    });
    // 30초 넘는 간격(2분 멈춤, 44초)은 실제 작업 시간에서 빠진다 → 16초 + 1초
    expect(stats.activeMs).toBe(17 * S);
  });

  it("타임라인 표시와 재생 위치(at)", () => {
    expect(marks.map((m) => [m.kind, m.at, m.detail])).toEqual([
      ["run-error", 1, "실행 오류: NameError"],
      ["away", 1, "다른 창으로 이동 (10초)"],
      ["paste", 1, "6자 붙여넣기"],
      ["run-ok", 2, "실행 성공"],
      ["pause", 2, "2분 0초 멈춤"],
      ["bigdelete", 3, "40자 지움"],
      ["ask", 4, "AI에게 도움 요청"],
    ]);
  });

  it("창 밖에 있던 시간은 '멈춤'으로 치지 않는다", () => {
    const { marks } = analyzeLog("", [
      [0, "b"],
      [5 * MIN, "f"],
    ]);
    expect(marks.map((m) => m.kind)).toEqual(["away"]);
  });

  it("잘못된 기록은 무시한다", () => {
    expect(analyzeLog("x", null).edits).toEqual([]);
    expect(analyzeLog("x", [["a", "b"], [1], 5]).stats.totalMs).toBe(0);
  });
});

describe("위치 당기기 (v1 clipPos와 같음)", () => {
  it("줄 끝 너머·문서 끝 너머 위치를 당긴다", () => {
    expect(editRange([2, 2], [0, "i", 0, 9, 0, 9, ""])).toEqual({ from: 2, to: 2 });
    expect(editRange([2, 2], [0, "d", 0, 1, 9, 0, ""])).toEqual({ from: 1, to: 5 });
    expect(applyEditEvent("ab\ncd", [0, "i", 5, 0, 5, 0, "!"])).toBe("ab\ncd!");
  });
});

it("시간 표시", () => {
  expect(formatDuration(45 * S)).toBe("45초");
  expect(formatDuration(200 * S)).toBe("3분 20초");
  expect(formatDuration(125 * MIN)).toBe("2시간 5분");
});
