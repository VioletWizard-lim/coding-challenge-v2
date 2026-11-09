import { describe, expect, it } from "vitest";
import { MAX_REFLECTION_TEXT, normalizeReflection, validateReflection } from "./reflection";

const base = { subject: "프로그래밍", hardestProblem: "", hardestReason: "", aiQuestions: "", keyConcepts: "" };

describe("오늘의 성찰 검사", () => {
  it("공백을 지우고 줄바꿈을 맞춘다", () => {
    expect(normalizeReflection({ ...base, keyConcepts: "  변수\r\n문자열 연결  " }).keyConcepts).toBe("변수\n문자열 연결");
  });
  it("한 칸만 써도 저장, 다 비면 거부", () => {
    expect(validateReflection(base)).toContain("한 칸 이상");
    expect(validateReflection({ ...base, keyConcepts: "input()" })).toBeNull();
    expect(validateReflection({ ...base, hardestProblem: "1-6" })).toBeNull();
  });
  it("문제 번호 형식과 글자 수 한도", () => {
    expect(validateReflection({ ...base, hardestProblem: "1-6번" })).toContain("문제를 목록에서");
    expect(validateReflection({ ...base, aiQuestions: "가".repeat(MAX_REFLECTION_TEXT + 1) })).toContain("AI에게 질문한 내용");
  });
});

describe("내 성찰 CSV", () => {
  it("날짜 순, 학습지와 같은 칸 이름", async () => {
    const { reflectionCsvRows } = await import("./reflection");
    const base = { userId: "s1", grade: "2", class: "3", updatedAt: "", hardestProblem: "", hardestReason: "", aiQuestions: "", keyConcepts: "" };
    const rows = reflectionCsvRows([
      { ...base, subject: "프로그래밍", classDate: "2026-11-05", keyConcepts: "반복문" },
      { ...base, subject: "프로그래밍", classDate: "2026-11-02", hardestProblem: "1-6", hardestReason: "=SUM 같은 글" },
    ]);
    expect(rows.map((r) => r["날짜"])).toEqual(["2026-11-02", "2026-11-05"]);
    expect(rows[0]).toMatchObject({ "가장 어려웠던 문제": "1-6", "어려웠던 이유": "=SUM 같은 글" });
    expect(Object.keys(rows[0])).toEqual(["날짜", "과목", "가장 어려웠던 문제", "어려웠던 이유", "AI에게 질문한 내용", "오늘 배운 핵심 개념"]);
  });
});
