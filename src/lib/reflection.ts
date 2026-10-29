/**
 * 오늘의 성찰: 학생이 수업을 마치고 하루에 한 번(과목마다) 쓴다. 학습지의 "오늘의 성찰" 칸과 같다.
 * 여기는 순수 함수만 (DB는 reflectionStore.ts).
 */

export type ReflectionInput = {
  subject: string;
  /** 가장 어려웠던 문제 번호 (예: "1-6"). 고르지 않으면 "" */
  hardestProblem: string;
  hardestReason: string;
  aiQuestions: string;
  keyConcepts: string;
};

export type Reflection = ReflectionInput & {
  userId: string;
  /** 수업 날짜 (한국 시간, "2026-10-29") */
  classDate: string;
  grade: string | null;
  class: string | null;
  updatedAt: string;
};

/** 칸마다 글자 수 한도 */
export const MAX_REFLECTION_TEXT = 2000;

/** 학습지와 같은 칸 이름 */
export const REFLECTION_FIELDS = {
  hardestReason: "어려웠던 이유",
  aiQuestions: "AI에게 질문한 내용",
  keyConcepts: "오늘 배운 핵심 개념",
} as const;

/** 앞뒤 공백을 지우고 줄바꿈을 \n으로 맞춘다 */
export function normalizeReflection(input: ReflectionInput): ReflectionInput {
  const clean = (v: unknown) => String(v ?? "").replace(/\r\n?/g, "\n").trim();
  return {
    subject: clean(input.subject),
    hardestProblem: clean(input.hardestProblem),
    hardestReason: clean(input.hardestReason),
    aiQuestions: clean(input.aiQuestions),
    keyConcepts: clean(input.keyConcepts),
  };
}

/** 저장할 수 없으면 이유를, 괜찮으면 null */
export function validateReflection(r: ReflectionInput): string | null {
  if (r.hardestProblem && !/^\d{1,2}-\d{1,2}$/.test(r.hardestProblem)) return "문제를 목록에서 골라 주세요.";
  for (const [key, label] of Object.entries(REFLECTION_FIELDS)) {
    if (r[key as keyof typeof REFLECTION_FIELDS].length > MAX_REFLECTION_TEXT) {
      return `'${label}'은(는) ${MAX_REFLECTION_TEXT}자까지 쓸 수 있어요.`;
    }
  }
  if (!r.hardestProblem && !r.hardestReason && !r.aiQuestions && !r.keyConcepts) return "한 칸 이상 써 주세요.";
  return null;
}

/** 다 비었는지 (목록에서 "아직 안 씀"과 구분) */
export const isEmptyReflection = (r: ReflectionInput) =>
  !r.hardestProblem && !r.hardestReason && !r.aiQuestions && !r.keyConcepts;
