import { describe, expect, it } from "vitest";
import type { LogEvent } from "./editLog";
import { addDays, buildJourney, countFixedErrors, kstDate, summarizeSubmission, weekStartOf } from "./journey";

describe("날짜", () => {
  it("한국 시간으로 날짜를 정한다 (UTC 15시 = 한국 다음 날 0시)", () => {
    expect(kstDate("2026-10-28T14:59:00Z")).toBe("2026-10-28");
    expect(kstDate("2026-10-28T15:00:00Z")).toBe("2026-10-29");
  });
  it("주는 월요일에 시작한다", () => {
    expect(weekStartOf("2026-10-29")).toBe("2026-10-26"); // 목 → 월
    expect(weekStartOf("2026-11-01")).toBe("2026-10-26"); // 일 → 그 주 월
    expect(weekStartOf("2026-10-26")).toBe("2026-10-26");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });
});

describe("스스로 고친 오류", () => {
  it("오류 뒤 성공을 한 번으로 센다 (연속 오류도 한 번)", () => {
    const log: LogEvent[] = [
      [1, "r:NameError"],
      [2, "r:NameError"],
      [3, "i", 0, 0, 0, 0, "x"],
      [4, "r:ok"],
      [5, "r:ok"],
      [6, "r:TypeError"],
      [7, "r:ok"],
      [8, "r:SyntaxError"],
    ];
    expect(countFixedErrors(log)).toBe(2);
    expect(countFixedErrors(null)).toBe(0);
  });
});

const sub = (id: number, problem: string, submitted_at: string, log: LogEvent[] = []) =>
  summarizeSubmission({ id, subject: "프로그래밍", problem, submitted_at, init_code: "", edit_log: log });

describe("학습 여정", () => {
  const S = 1000;
  const subs = [
    sub(1, "1-1", "2026-10-20T01:00:00Z", [
      [0, "i", 0, 0, 0, 0, "print(x)"],
      [10 * S, "r:NameError"],
      [20 * S, "p", 0, 0, 0, 0, "x=1\n"],
      [25 * S, "r:ok"],
    ]),
    sub(2, "1-1", "2026-10-28T01:00:00Z", [[0, "i", 0, 0, 0, 0, "print(1)"], [5 * S, "r:ok"]]),
    sub(3, "2-1", "2026-10-28T03:00:00Z", [[0, "i", 0, 0, 0, 0, "ab"], [40 * S, "i", 0, 2, 0, 2, "c"]]),
    sub(4, "2-2", "2026-09-01T01:00:00Z"), // 기록 없는 예전 제출
  ];
  const j = buildJourney(subs, "2026-10-29");

  it("전체 요약", () => {
    expect(j.totals).toEqual({
      problems: 3,
      submissions: 4,
      days: 3,
      activeMs: 25 * S + 5 * S + 0, // 3번은 간격 40초라 실제 작업 0
      typedRatio: (8 + 8 + 3) / (8 + 8 + 3 + 4),
      fixedErrors: 1,
    });
  });

  it("활동 달력: 12주, 오늘 이후는 미래로 표시", () => {
    expect(j.calendar).toHaveLength(12);
    const last = j.calendar[11];
    expect(last.weekStart).toBe("2026-10-26");
    expect(last.days.find((d) => d.date === "2026-10-28")?.count).toBe(2);
    expect(last.days.find((d) => d.date === "2026-10-30")?.future).toBe(true);
    expect(j.calendar[0].weekStart).toBe("2026-08-10");
  });

  it("주별 변화: 기록 있는 제출로 직접 작성 비율·고친 오류 계산", () => {
    const w = Object.fromEntries(j.weekly.map((x) => [x.weekStart, x]));
    expect(w["2026-10-19"]).toEqual({ weekStart: "2026-10-19", submissions: 1, typedRatio: 8 / 12, fixedErrors: 1 });
    expect(w["2026-10-26"]).toMatchObject({ submissions: 2, typedRatio: 1, fixedErrors: 0 });
    expect(w["2026-08-31"]).toMatchObject({ submissions: 1, typedRatio: null });
  });

  it("단원별: 기록 있는 제출만, 단원 번호 순", () => {
    expect(j.units.map((u) => [u.unit, u.problems, u.avgActiveMs, u.runErrors])).toEqual([
      ["1", 1, 15 * S, 1],
      ["2", 1, 0, 0],
    ]);
  });

  it("날짜별 목록: 최근 날짜·최근 제출부터", () => {
    expect(j.days.map((d) => [d.date, d.items.map((s) => s.id)])).toEqual([
      ["2026-10-28", [3, 2]],
      ["2026-10-20", [1]],
      ["2026-09-01", [4]],
    ]);
  });
});
