import { describe, expect, it } from "vitest";
import { latestPerStudent, liveFlags, livePayload } from "./liveStatus";
import { activityEntries, analyzeLog } from "./replay";

const MIN = 60_000;

describe("작성 중 상태 (P3)", () => {
  const log = [
    [0, "i", 0, 0, 0, 0, "old"], // 지난번에 연 때의 입력 (이번 상태에는 안 셈)
    [10 * MIN, "open"],
    [12 * MIN, "i", 0, 0, 0, 0, "a"],
    [13 * MIN, "r:NameError"],
    [14 * MIN, "n:error-repeat@13"],
    [14 * MIN + 5000, "n:close"],
    [15 * MIN, "n:same-line@12"],
  ];

  it("이번에 연 뒤의 기록으로: 첫 입력, 마지막 활동, 막힘 알림 수(반응은 안 셈)", () => {
    expect(livePayload(log, 10 * MIN)).toEqual({
      openedAt: 10 * MIN,
      firstInputAt: 12 * MIN,
      lastActiveAt: 13 * MIN,
      nudgeCount: 2,
      lastNudgeRule: "same-line",
    });
    expect(livePayload([[10 * MIN, "open"]], 10 * MIN)).toMatchObject({ firstInputAt: null, lastActiveAt: null, nudgeCount: 0 });
  });

  it("시작 지연: 연 지 5분 넘게 첫 입력 없음 / 막힘 반복: 알림 2번 이상 / 3분 넘게 소식이 없으면 화면에 없는 것으로", () => {
    const base = { openedAt: 0, firstInputAt: null, nudgeCount: 0, updatedAt: 6 * MIN };
    expect(liveFlags(base, 6 * MIN)).toMatchObject({ present: true, lateStart: true, repeatedStuck: false, openMinutes: 6 });
    expect(liveFlags({ ...base, firstInputAt: 1 }, 6 * MIN).lateStart).toBe(false);
    expect(liveFlags(base, 4 * MIN).lateStart).toBe(false);
    expect(liveFlags({ ...base, nudgeCount: 2 }, 6 * MIN).repeatedStuck).toBe(true);
    expect(liveFlags(base, 10 * MIN)).toMatchObject({ present: false, lateStart: false });
  });

  it("문제를 연 순간 표시는 멈춤·작업 시간 계산에 들어가지 않는다", () => {
    expect(activityEntries([[0, "open"], [1, "r:ok"]])).toEqual([[1, "r:ok"]]);
    expect(analyzeLog("", [[0, "i", 0, 0, 0, 0, "a"], [5 * MIN, "open"], [10 * MIN, "i", 0, 0, 0, 0, "b"]]).stats.pauseCount).toBe(1);
  });
});

describe("학생마다 최근 문제 하나만", () => {
  it("문제를 바꾸면 앞 문제 줄은 숨긴다", () => {
    const rows = [
      { userId: "a", problem: "1-1", updatedAt: 1 },
      { userId: "a", problem: "1-4", updatedAt: 5 },
      { userId: "b", problem: "1-2", updatedAt: 3 },
    ];
    expect(latestPerStudent(rows).map((r) => `${r.userId}/${r.problem}`)).toEqual(["a/1-4", "b/1-2"]);
  });
});
