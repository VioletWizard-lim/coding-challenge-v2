/**
 * AI 되돌아보기: 제출한 뒤 AI가 작성 과정의 순간을 짚어 질문하고, 학생이 답하며 성찰한다.
 * 브라우저·서버 공용 순수 함수와 타입 (DB: aiReviewStore.ts, AI 호출: ai.ts). 단위 테스트: aiReview.test.ts
 */
import { dropUnknownRefs, leaksAnswer, momentsUsed, stripAnswerCode } from "./aiChat";
import type { Moment } from "./process-summary";

/**
 * 학생 답을 본 AI가 한 번 이어서 묻기 (질문 하나에 한 번만 — 끝없는 대화가 아니라 성찰을 한 걸음 더).
 * questions jsonb 안에 함께 저장한다 (새 칸·표 없음).
 */
export type FollowUp = {
  /** 학생 답에 대한 짧은 반응 (한두 문장, [[M3]] 순간을 가리킬 수 있음) */
  reply: string;
  /** 이어지는 질문 하나 */
  question: string;
  /** reply·question에 나온 순간 (누르면 재생기의 그 시점) */
  moments: Moment[];
  /** 학생의 두 번째 답 */
  answer: string;
  createdAt: string;
  model: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
};

export type ReviewQuestion = {
  /** AI가 짚은 과정의 순간 (누르면 재생기의 그 시점). 짚지 않았으면 null */
  moment: Moment | null;
  question: string;
  /** 학생의 답 */
  answer: string;
  /** 학생 답을 본 AI의 이어 묻기 (없으면 null) */
  followUp?: FollowUp | null;
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

/* ───────── 이어 묻기 ───────── */

/** AI 응답 형식 (structured output) */
export const FOLLOWUP_SCHEMA = {
  type: "object",
  properties: { reply: { type: "string" }, question: { type: "string" } },
  required: ["reply", "question"],
  additionalProperties: false,
} as const;

/** 이어 묻기를 받을 수 있는지: 답을 저장했고 아직 이어 묻기가 없을 때 (질문 하나에 한 번) */
export const canFollowUp = (q: ReviewQuestion) => q.answer.trim().length > 0 && !q.followUp;

/**
 * AI 응답을 이어 묻기로: 없는 순간 번호는 지우고, 정답 수준의 코드가 섞이면 코드 부분을 지운다(되돌아보기는 코드를 주지 않음).
 * 반응과 질문이 모두 비면 null.
 */
export function toFollowUp(
  raw: unknown,
  moments: Moment[],
  studentCode: string,
  meta: { createdAt: string; model: string | null; inputTokens: number | null; outputTokens: number | null },
): FollowUp | null {
  const r = (raw ?? {}) as { reply?: unknown; question?: unknown };
  const tidy = (x: unknown) => {
    const text = dropUnknownRefs(String(x ?? ""), moments).replace(/ {2,}/g, " ").trim();
    return leaksAnswer(text, studentCode) ? stripAnswerCode(text, studentCode) : text;
  };
  const reply = tidy(r.reply).slice(0, 600);
  const question = tidy(r.question).slice(0, 400);
  if (!reply && !question) return null;
  return { reply, question, moments: momentsUsed(`${reply} ${question}`, moments), answer: "", ...meta };
}

/** 저장된 이어 묻기 정리 (DB의 jsonb를 믿지 않고 모양을 맞춘다) */
export function readFollowUp(x: unknown): FollowUp | null {
  if (!x || typeof x !== "object") return null;
  const f = x as Partial<FollowUp>;
  const num = (v: unknown) => (typeof v === "number" ? v : null);
  return {
    reply: String(f.reply ?? ""),
    question: String(f.question ?? ""),
    moments: Array.isArray(f.moments) ? f.moments.filter((m) => m && typeof m.at === "number" && typeof m.id === "string") : [],
    answer: String(f.answer ?? ""),
    createdAt: String(f.createdAt ?? ""),
    model: typeof f.model === "string" ? f.model : null,
    inputTokens: num(f.inputTokens),
    outputTokens: num(f.outputTokens),
  };
}

/** 이 시각 뒤에 만든 이어 묻기 수 (AI 하루 한도에 함께 센다) */
export function countFollowUpsSince(questions: ReviewQuestion[], sinceIso: string): number {
  const since = Date.parse(sinceIso);
  return questions.filter((q) => q.followUp && Date.parse(q.followUp.createdAt) >= since).length;
}
