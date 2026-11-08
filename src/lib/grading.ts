/**
 * 채점: 과목마다 교사가 정한 채점 기준(영역 이름·배점)으로 점수를 준다. 브라우저·서버 공용 순수 함수.
 * - 기준이 없으면 v1과 같은 기능 40 · 코드 설명 40 · 도전 20
 * - 채점할 때 그때의 기준 사본을 제출에 함께 저장(submission_scores) → 기준을 바꿔도 예전 제출은 그때 기준으로 보인다
 * - 채점표가 없는 v1 채점은 기본 기준 + v1 칸(score_function 등)으로 읽는다
 * - 채점됨 = 합계 > 0 또는 오답 처리 (v1 "미채점만 보기"와 같음). 오답 처리는 합계가 0일 때만
 * 단위 테스트: grading.test.ts
 */
/** 채점 영역: 이름, 배점, 설명(무엇을 보면 만점인지 — 채점 화면·학생 점수표·AI 채점 초안에 쓰임) */
export type RubricPart = { name: string; max: number; desc?: string };
export type ScorePart = RubricPart & { score: number };

export const DEFAULT_RUBRIC: RubricPart[] = [
  { name: "기능", max: 40 },
  { name: "코드 설명", max: 40 },
  { name: "도전", max: 20 },
];

export const MAX_PARTS = 6;
export const MAX_PART_NAME = 20;
export const MAX_PART_SCORE = 100;
export const MAX_PART_DESC = 300;
/** 채점 목록 한 쪽에 보이는 제출 수 */
export const GRADING_PAGE_SIZE = 10;
export const MAX_FEEDBACK = 2000;
export const MAX_WRONG_REASON = 300;

export type GradingRow = {
  id: number;
  submittedAt: string;
  userId: string | null;
  name: string;
  grade: string | null;
  cls: string | null;
  subject: string;
  problem: string;
  code: string;
  description: string;
  /** 이 제출의 채점표 (채점 전이면 null) */
  sheet: ScorePart[] | null;
  total: number | null;
  feedback: string;
  wrongReason: string;
};

/** v1 칸으로 읽은 점수 (채점표가 없는 제출) */
export type V1Scores = { fn: number | null; und: number | null; ch: number | null; total: number | null };

/** 이 제출의 채점표: 저장된 채점표가 있으면 그것, 없고 v1 점수가 있으면 기본 기준에 v1 점수, 둘 다 없으면 null */
export function sheetOf(saved: unknown, v1: V1Scores): ScorePart[] | null {
  const parts = parseSheet(saved);
  if (parts) return parts;
  if (v1.fn === null && v1.und === null && v1.ch === null) return null;
  return DEFAULT_RUBRIC.map((p, i) => ({ ...p, score: [v1.fn, v1.und, v1.ch][i] ?? 0 }));
}

/** DB의 채점표(jsonb)를 안전하게 읽는다 */
export function parseSheet(value: unknown): ScorePart[] | null {
  if (!Array.isArray(value) || !value.length) return null;
  const parts = value.map((p) => ({
    name: String(p?.name ?? ""),
    max: Number(p?.max),
    score: Number(p?.score),
    ...(p?.desc ? { desc: String(p.desc) } : {}),
  }));
  return parts.every((p) => p.name && Number.isFinite(p.max) && Number.isFinite(p.score)) ? parts : null;
}

/** DB의 채점 기준(jsonb)을 읽는다. 이상하면 기본 기준 */
export function parseRubric(value: unknown): RubricPart[] {
  const r = validateRubric(value);
  return r.ok ? r.parts : DEFAULT_RUBRIC;
}

/** 채점 기준 확인: 1~6개 영역, 이름 1~20자(겹치지 않게), 배점 1~100 정수 */
export function validateRubric(value: unknown): { ok: true; parts: RubricPart[] } | { ok: false; error: string } {
  if (!Array.isArray(value) || value.length < 1 || value.length > MAX_PARTS) {
    return { ok: false, error: `채점 영역은 1~${MAX_PARTS}개로 정해 주세요.` };
  }
  const parts: RubricPart[] = value.map((p) => {
    const desc = String(p?.desc ?? "").trim();
    return { name: String(p?.name ?? "").trim(), max: Number(p?.max), ...(desc ? { desc } : {}) };
  });
  for (const p of parts) {
    if ((p.desc ?? "").length > MAX_PART_DESC) return { ok: false, error: `'${p.name}' 설명은 ${MAX_PART_DESC}자까지 쓸 수 있어요.` };
    if (!p.name || p.name.length > MAX_PART_NAME) return { ok: false, error: `영역 이름은 1~${MAX_PART_NAME}자로 적어 주세요.` };
    if (!Number.isInteger(p.max) || p.max < 1 || p.max > MAX_PART_SCORE) {
      return { ok: false, error: `'${p.name}' 배점은 1~${MAX_PART_SCORE} 사이의 정수로 적어 주세요.` };
    }
  }
  if (new Set(parts.map((p) => p.name)).size !== parts.length) return { ok: false, error: "영역 이름이 겹치지 않게 적어 주세요." };
  return { ok: true, parts };
}

export const rubricTotal = (parts: RubricPart[]) => parts.reduce((a, p) => a + p.max, 0);
/** 영역 이름·배점이 같은지 (설명만 고친 것은 같은 기준으로 본다) */
export const sameRubric = (a: RubricPart[], b: RubricPart[]) =>
  a.length === b.length && a.every((p, i) => p.name === b[i].name && p.max === b[i].max);

/** 점수 확인: 영역마다 0 이상 배점 이하의 정수 */
export function validateScores(
  rubric: RubricPart[],
  scores: unknown,
): { ok: true; sheet: ScorePart[]; total: number } | { ok: false; error: string } {
  if (!Array.isArray(scores) || scores.length !== rubric.length) return { ok: false, error: "점수를 모두 적어 주세요." };
  const sheet: ScorePart[] = [];
  for (let i = 0; i < rubric.length; i++) {
    const v = Number(scores[i]);
    const p = rubric[i];
    if (!Number.isInteger(v) || v < 0 || v > p.max) return { ok: false, error: `${p.name} 점수는 0~${p.max} 사이의 정수로 적어 주세요.` };
    sheet.push({ ...p, score: v });
  }
  return { ok: true, sheet, total: sheet.reduce((a, p) => a + p.score, 0) };
}

/** v1 칸에 함께 저장할 값: 영역이 3개면 순서대로, 아니면 비운다 (v1 화면은 합계·피드백만 의미 있게 보임) */
export function v1Columns(sheet: ScorePart[]) {
  const three = sheet.length === 3;
  return {
    score_function: three ? sheet[0].score : null,
    score_understanding: three ? sheet[1].score : null,
    score_challenge: three ? sheet[2].score : null,
  };
}

/** 만점이 아닌 영역 (학생 화면 "감점" 표시) */
export const lostParts = (sheet: ScorePart[]) => sheet.filter((p) => p.score < p.max).map((p) => p.name);

/** 채점됐는지 (v1 "미채점만 보기"와 같은 기준) */
export const isGraded = (r: { total: number | null; wrongReason: string }) => (r.total ?? 0) > 0 || !!r.wrongReason.trim();

/** 오답 처리할 수 있는지: 점수가 없을 때만 */
export const canMarkWrong = (total: number | null) => !((total ?? 0) > 0);

/** 기능 영역이 만점인지 ("기능" 영역, 없으면 첫 영역) — 업적 "한 번에 성공"에 쓴다 */
export function functionFull(sheet: ScorePart[] | null): boolean {
  if (!sheet?.length) return false;
  const part = sheet.find((p) => p.name === "기능") ?? sheet[0];
  return part.score >= part.max;
}

/**
 * 설명이 빠진 영역에 지금 기준의 설명을 채운다 (이름·배점이 같은 영역만).
 * 설명을 적기 전에 채점해 둔 제출도 채점 화면·AI 채점 초안에서 지금 설명을 쓰게 한다.
 */
export function withDescs<T extends RubricPart>(parts: T[], current: RubricPart[]): T[] {
  return parts.map((p) => {
    if (p.desc) return p;
    const desc = current.find((c) => c.name === p.name && c.max === p.max)?.desc;
    return desc ? { ...p, desc } : p;
  });
}
