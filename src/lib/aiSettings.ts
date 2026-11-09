/**
 * 과목별 AI 기능 설정: 브라우저·서버가 함께 쓰는 순수 함수와 타입. (DB는 aiSettingsStore.ts)
 * 저장된 것이 없으면 모두 켜짐. 단위 테스트: aiSettings.test.ts
 */

export type AiSettings = {
  subject: string;
  /** AI 도우미 (수업 문제·연습 문제·학생이 만든 문제) */
  helper: boolean;
  /** AI 되돌아보기 (제출 뒤) */
  review: boolean;
  /** AI 도우미를 끈 단원 ("3" = 3-1, 3-2… 수업 문제) */
  offUnits: string[];
  /** 선생님 지침 (AI에 함께 보냄) */
  note: string;
};

export const MAX_AI_NOTE = 500;

export const defaultAiSettings = (subject: string): AiSettings => ({ subject, helper: true, review: true, offUnits: [], note: "" });

/** 문제 번호의 단원 ("3-2" → "3") */
export const unitOfProblem = (problem: string) => problem.split("-")[0];

/** 브라우저·DB에서 온 설정을 정리한다 (잘못된 값이면 null) */
export function normalizeAiSettings(value: unknown, subject: string): AiSettings | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Partial<AiSettings>;
  const units = Array.isArray(v.offUnits) ? v.offUnits : [];
  const offUnits = [...new Set(units.map((u) => String(u ?? "").trim()).filter((u) => /^\d{1,2}$/.test(u)))].sort((a, b) => Number(a) - Number(b));
  const note = String(v.note ?? "").trim();
  if (note.length > MAX_AI_NOTE || units.length > 50) return null;
  return { subject, helper: v.helper !== false, review: v.review !== false, offUnits, note };
}

/**
 * 이 문제에서 AI 도우미를 쓸 수 있는지. 안 되면 학생에게 보일 말.
 * problem: 수업 문제 "3-2", 연습 문제 "P12", 학생이 만든 문제 "S7" (단원 끄기는 수업 문제에만)
 */
export function helperBlocked(s: AiSettings, problem: string): string | null {
  if (!s.helper) return "선생님이 지금 이 과목의 AI 도우미를 꺼 두었어요.";
  if (/^\d/.test(problem) && s.offUnits.includes(unitOfProblem(problem))) {
    return `선생님이 ${unitOfProblem(problem)}단원에서는 AI 도우미를 꺼 두었어요. 스스로 해결해 봐요!`;
  }
  return null;
}

export function reviewBlocked(s: AiSettings): string | null {
  return s.review ? null : "선생님이 지금 이 과목의 AI 되돌아보기를 꺼 두었어요.";
}
