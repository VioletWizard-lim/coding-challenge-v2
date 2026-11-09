import { describe, expect, it } from "vitest";
import { canFollowUp, countFollowUpsSince, normalizeAnswers, readFollowUp, toFollowUp, toReview, type ReviewQuestion } from "./aiReview";
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

describe("되돌아보기 이어 묻기", () => {
  const moments: Moment[] = [
    { id: "M1", at: 1000, kind: "run-error", label: "NameError (1번째)" },
    { id: "M2", at: 5000, kind: "run-ok", label: "실행 성공" },
  ];
  const meta = { createdAt: "2026-11-09T01:00:00.000Z", model: "m", inputTokens: 10, outputTokens: 5 };

  it("순간을 이어 붙이고 없는 번호는 지운다", () => {
    const f = toFollowUp({ reply: "[[M1]]에서 이름을 다시 본 게 좋았어요 [[M9]]", question: "[[M2]] 다음에는 무엇을 먼저 확인할 건가요?" }, moments, "print(x)", meta)!;
    expect(f.reply).toBe("[[M1]]에서 이름을 다시 본 게 좋았어요");
    expect(f.moments.map((m) => m.id)).toEqual(["M1", "M2"]);
    expect(f.answer).toBe("");
    expect(toFollowUp({ reply: " ", question: "" }, moments, "", meta)).toBeNull();
  });

  it("고친 코드를 주면 코드 부분을 지운다", () => {
    const f = toFollowUp({ reply: "이렇게 고치면 돼요 `print(y)`", question: "왜 그랬을까요?" }, moments, "y = 1\nprint(x)", meta)!;
    expect(f.reply).not.toContain("print(y)");
  });

  it("질문 하나에 한 번, 오늘 만든 수를 센다", () => {
    const q: ReviewQuestion = { moment: null, question: "q", answer: "" };
    expect(canFollowUp(q)).toBe(false);
    expect(canFollowUp({ ...q, answer: "변수 이름" })).toBe(true);
    const done = { ...q, answer: "a", followUp: readFollowUp({ reply: "r", question: "q2", createdAt: meta.createdAt }) };
    expect(canFollowUp(done)).toBe(false);
    expect(countFollowUpsSince([q, done], "2026-11-08T15:00:00.000Z")).toBe(1);
    expect(countFollowUpsSince([q, done], "2026-11-09T15:00:00.000Z")).toBe(0);
    expect(readFollowUp(null)).toBeNull();
  });
});
