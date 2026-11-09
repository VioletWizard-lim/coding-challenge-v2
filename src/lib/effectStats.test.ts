import { describe, expect, it } from "vitest";
import { beforeAfter, choices, introMonth, monthlySeries } from "./effectStats";
import type { StatRow } from "./yearEnd";

const row = (month: string, subject: string, cls: string, x: Partial<StatRow>): StatRow => ({
  month,
  subject,
  cls,
  submissions: 0,
  submitStudents: 0,
  loggedSubmissions: 0,
  typedChars: 0,
  pastedChars: 0,
  runs: 0,
  runErrors: 0,
  fixedErrors: 0,
  activeMinutes: 0,
  reflections: 0,
  reflectStudents: 0,
  aiQuestions: 0,
  aiReviews: 0,
  practiceMade: 0,
  practiceSolved: 0,
  studentProblems: 0,
  studentProblemsApproved: 0,
  ...x,
});

const rows = [
  // 예전 사이트: 실행 기록 없음
  row("2026-10", "프로그래밍", "2-3", { submissions: 10, submitStudents: 5, loggedSubmissions: 10, typedChars: 600, pastedChars: 400, activeMinutes: 100 }),
  row("2026-10", "정보", "1-1", { submissions: 4, submitStudents: 4, loggedSubmissions: 4, typedChars: 400, pastedChars: 0 }),
  // 새 사이트
  row("2027-03", "프로그래밍", "2-3", {
    submissions: 10,
    submitStudents: 5,
    loggedSubmissions: 10,
    typedChars: 900,
    pastedChars: 100,
    runs: 40,
    runErrors: 12,
    fixedErrors: 8,
    activeMinutes: 150,
    reflectStudents: 4,
  }),
  row("2027-03", "프로그래밍", "2-4", { submissions: 2, submitStudents: 2, loggedSubmissions: 2, typedChars: 100, runs: 3, fixedErrors: 2, reflectStudents: 3 }),
];

describe("수업 효과 통계", () => {
  it("과목·반으로 골라 월별로 합치고 비율을 만든다", () => {
    const all = monthlySeries(rows, "프로그래밍");
    expect(all.map((p) => p.month)).toEqual(["2026-10", "2027-03"]);
    expect(all[0].typedPct).toBe(60);
    expect(all[0].fixedPer).toBeNull(); // 실행 기록이 없으면(예전 사이트) 비율을 만들지 않는다
    expect(all[0].reflectPct).toBeNull(); // 성찰도 새 사이트 기능
    expect(all[1].submissions).toBe(12);
    expect(all[1].typedPct).toBe(90.9);
    expect(all[1].fixedPer).toBe(0.8);
    expect(all[1].reflectPct).toBe(100); // 7/7 → 100을 넘지 않음
    expect(monthlySeries(rows, "프로그래밍", "2-4")).toHaveLength(1);
    expect(monthlySeries(rows)[0].typedPct).toBe(71.4); // 1000/1400
  });

  it("실행 기록이 처음 나온 달을 도입 시점으로 보고 전후를 비교한다", () => {
    const points = monthlySeries(rows, "프로그래밍", "2-3");
    const intro = introMonth(points);
    expect(intro).toBe("2027-03");
    const { before, after } = beforeAfter(points, intro);
    expect(before.months).toBe(1);
    expect(before.typedPct).toBe(60);
    expect(before.minutesPer).toBe(10);
    expect(before.reflectPct).toBeNull();
    expect(after.typedPct).toBe(90);
    expect(after.reflectPct).toBe(80);
    expect(beforeAfter(points, null).before.months).toBe(0);
  });

  it("고를 수 있는 과목·반", () => {
    expect(choices(rows)).toEqual({ subjects: ["정보", "프로그래밍"], classes: ["1-1", "2-3", "2-4"] });
    expect(choices(rows, "정보").classes).toEqual(["1-1"]);
  });
});
