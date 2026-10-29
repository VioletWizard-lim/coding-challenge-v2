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
