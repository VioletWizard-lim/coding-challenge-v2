import { describe, expect, it } from "vitest";
import { canClean, confirmPhrase, schoolYearOf, schoolYearRange, statsCsv, yearStats } from "./yearEnd";

describe("학년도", () => {
  it("3월 1일 ~ 다음 해 2월 말 (한국 시간)", () => {
    expect(schoolYearRange(2026)).toMatchObject({ from: "2026-03-01T00:00:00+09:00", to: "2027-03-01T00:00:00+09:00" });
    expect(schoolYearOf("2027-02-28T14:59:00Z")).toBe(2026); // 한국 2월 28일 23:59
    expect(schoolYearOf("2027-02-28T15:00:00Z")).toBe(2027); // 한국 3월 1일 0시
    expect(schoolYearOf("2026-11-09T01:00:00Z")).toBe(2026);
  });

  it("학년도가 끝난 뒤(다음 해 3월 1일부터)만 지울 수 있다", () => {
    expect(canClean(2026, new Date("2027-02-28T14:59:00Z"))).toBe(false);
    expect(canClean(2026, new Date("2027-02-28T15:00:00Z"))).toBe(true);
    expect(confirmPhrase(2026)).toBe("2026학년도 삭제");
  });
});

describe("이름 없는 통계", () => {
  const log = [
    [1000, "i", 0, 0, 0, 0, "abc"],
    [2000, "r:NameError"],
    [3000, "p", 0, 3, 0, 3, "d"],
    [4000, "r:ok"],
  ];
  const rows = yearStats({
    submissions: [
      { subject: "프로그래밍", grade: 2, class: 3, who: "a", submitted_at: "2026-11-02T01:00:00Z", init_code: "", edit_log: log },
      { subject: "프로그래밍", grade: 2, class: 3, who: "a", submitted_at: "2026-11-03T01:00:00Z", init_code: "", edit_log: [] },
      { subject: "프로그래밍", grade: 2, class: 3, who: "b", submitted_at: "2026-11-03T01:00:00Z", init_code: null, edit_log: null },
    ],
    reflections: [{ subject: "프로그래밍", grade: "2", class: "3", user_id: "s1", class_date: "2026-11-02" }],
    users: new Map([["s1", { grade: 2, class: 3, programming_grade: null, programming_class: null }]]),
    chats: [{ user_id: "s1", subject: "프로그래밍", created_at: "2026-11-02T02:00:00Z" }],
    reviews: [],
    practice: [{ user_id: "s1", subject: "프로그래밍", created_at: "2026-11-05T02:00:00Z", solved_at: "2026-11-05T03:00:00Z" }],
    studentProblems: [{ author_id: "zz", subject: "프로그래밍", created_at: "2026-12-01T02:00:00Z", status: "approved" }],
  });

  it("월 × 과목 × 반으로 숫자만 모은다 (학생 수는 서로 다른 학생)", () => {
    const nov = rows.find((r) => r.month === "2026-11" && r.cls === "2-3")!;
    expect(nov).toMatchObject({ submissions: 3, submitStudents: 2, loggedSubmissions: 1, typedChars: 3, pastedChars: 1, runs: 2, runErrors: 1, fixedErrors: 1 });
    expect(nov).toMatchObject({ reflections: 1, reflectStudents: 1, aiQuestions: 1, practiceMade: 1, practiceSolved: 1 });
    // 계정이 없는 학생의 문제는 "반 없음"
    expect(rows.find((r) => r.month === "2026-12")).toMatchObject({ cls: "반 없음", studentProblems: 1, studentProblemsApproved: 1 });
  });

  it("CSV에는 이름·아이디가 없고 직접 작성 비율이 붙는다", () => {
    const csv = statsCsv(rows);
    expect(csv.split("\r\n")[0]).toContain("직접 작성 비율(%)");
    expect(csv).toContain("2026-11,프로그래밍,2-3,3,2,1,3,1,2,1,1");
    expect(csv).not.toMatch(/s1|zz/);
  });
});

describe("지우는 표", () => {
  it("제출·채점·연습 문제·학생이 만든 문제는 지우지 않는다", async () => {
    const { CLEANUP_TABLES } = await import("./yearEnd");
    const tables = CLEANUP_TABLES.map((t) => t.table as string);
    for (const keep of ["submissions", "submission_scores", "practice_problems", "student_problems", "student_problem_attempts", "users", "problems"]) {
      expect(tables).not.toContain(keep);
    }
    expect(tables).toEqual(["ai_chats", "ai_reviews", "reflections", "timeline_notes", "replay_views", "grading_drafts"]);
  });
});
