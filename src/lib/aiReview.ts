/**
 * AI 되돌아보기: 제출한 뒤 AI가 작성 과정의 순간을 짚어 질문하고, 학생이 답하며 성찰한다.
 * 브라우저·서버 공용 순수 함수와 타입 (DB: aiReviewStore.ts, AI 호출: ai.ts). 단위 테스트: aiReview.test.ts
 */
import type { Moment } from "./process-summary";

export type ReviewQuestion = {
  /** AI가 짚은 과정의 순간 (누르면 재생기의 그 시점). 짚지 않았으면 null */
  moment: Moment | null;
  question: string;
  /** 학생의 답 */
  answer: string;
};

export type AiReview = {
  id: number;
  userId: string;
  submissionId: number;
  subject: string;
  problem: string;
  intro: string;
  questions: ReviewQuestion[];
  flaggedBy: "student" | "teacher" | null;
  createdAt: string;
  updatedAt: string;
  model: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
};

export const MAX_REVIEW_ANSWER = 1000;
export const MIN_QUESTIONS = 2;
export const MAX_QUESTIONS = 3;

/** AI 응답 형식 (structured output) */
export const REVIEW_SCHEMA = {
  type: "object",
  properties: {
    intro: { type: "string" },
    questions: {
      type: "array",
      items: {
        type: "object",
        properties: { moment: { type: "string" }, question: { type: "string" } },
        required: ["moment", "question"],
        additionalProperties: false,
      },
    },
  },
  required: ["intro", "questions"],
  additionalProperties: false,
} as const;

/**
 * AI 응답을 되돌아보기 질문으로: 순간 번호("M3")를 실제 순간으로 바꾸고(없는 번호면 null),
 * 글 속의 [[M3]] 표시는 ‹순간 설명›으로 바꾼다(없는 번호면 지움). 빈 질문은 버리고 3개까지만.
 */
export function toReview(raw: unknown, moments: Moment[]): { intro: string; questions: ReviewQuestion[] } {
  const r = (raw ?? {}) as { intro?: unknown; questions?: unknown };
  const clean = (s: string) =>
    s
      .replace(/\[\[(M\d+)\]\]/g, (_, id: string) => {
        const m = moments.find((x) => x.id === id);
        return m ? `‹${m.label}›` : "";
      })
      .replace(/ {2,}/g, " ")
      .trim();
  const questions = (Array.isArray(r.questions) ? r.questions : [])
    .map((q) => {
      const item = (q ?? {}) as { moment?: unknown; question?: unknown };
      const id = String(item.moment ?? "").replace(/[^M\d]/g, "");
      return { moment: moments.find((m) => m.id === id) ?? null, question: clean(String(item.question ?? "")), answer: "" };
    })
    .filter((q) => q.question)
    .slice(0, MAX_QUESTIONS);
  return { intro: clean(String(r.intro ?? "")), questions };
}

/** 학생 답 정리: 질문 수만큼, 글자 수 제한 */
export function normalizeAnswers(answers: unknown, count: number): string[] | null {
  if (!Array.isArray(answers) || answers.length !== count) return null;
  const list = answers.map((a) => String(a ?? "").trim());
  return list.some((a) => a.length > MAX_REVIEW_ANSWER) ? null : list;
}
