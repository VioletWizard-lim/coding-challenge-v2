import { describe, expect, it } from "vitest";
import { normalizeAnswers, toReview } from "./aiReview";
import type { Moment } from "./process-summary";

const moments: Moment[] = [
  { id: "M1", at: 1000, kind: "run-ok", label: "실행 성공" },
  { id: "M3", at: 3000, kind: "run-error", label: "NameError (2번째)" },
];

describe("AI 되돌아보기", () => {
  it("순간 번호를 실제 순간으로, 없는 번호는 null, 글 속 [[M]]은 ‹설명›으로", () => {
    const r = toReview(
      {
        intro: "[[M1]]에서 끝까지 해냈어요!",
        questions: [
          { moment: "M3", question: "[[M3]] 같은 오류가 또 났을 때 무엇을 보고 고쳤나요?" },
          { moment: "[[M9]]", question: "처음 계획은 무엇이었나요?" },
          { moment: "M1", question: "  " },
        ],
      },
      moments,
    );
    expect(r.intro).toBe("‹실행 성공›에서 끝까지 해냈어요!");
    expect(r.questions).toHaveLength(2);
    expect(r.questions[0]).toMatchObject({ moment: { id: "M3" }, question: "‹NameError (2번째)› 같은 오류가 또 났을 때 무엇을 보고 고쳤나요?", answer: "" });
    expect(r.questions[1].moment).toBeNull();
  });
  it("이상한 응답이면 빈 목록", () => {
    expect(toReview(null, moments).questions).toEqual([]);
    expect(toReview({ questions: "x" }, moments).questions).toEqual([]);
  });
  it("질문은 3개까지", () => {
    const qs = Array.from({ length: 5 }, (_, i) => ({ moment: "M1", question: `질문 ${i}` }));
    expect(toReview({ intro: "", questions: qs }, moments).questions).toHaveLength(3);
  });
  it("학생 답 정리", () => {
    expect(normalizeAnswers([" 변수 이름을 봤어요 ", ""], 2)).toEqual(["변수 이름을 봤어요", ""]);
    expect(normalizeAnswers(["a"], 2)).toBeNull();
    expect(normalizeAnswers(["a".repeat(1001), ""], 2)).toBeNull();
  });
});
