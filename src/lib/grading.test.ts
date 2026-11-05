import { describe, expect, it } from "vitest";
import {
  canMarkWrong,
  DEFAULT_RUBRIC,
  functionFull,
  isGraded,
  lostParts,
  parseRubric,
  sheetOf,
  v1Columns,
  validateRubric,
  validateScores,
} from "./grading";

const rubric = [
  { name: "내용", max: 50 },
  { name: "표현", max: 30 },
];

describe("채점 기준", () => {
  it("확인", () => {
    expect(validateRubric(rubric)).toEqual({ ok: true, parts: rubric });
    expect(validateRubric([])).toMatchObject({ ok: false });
    expect(validateRubric([{ name: "", max: 10 }])).toMatchObject({ ok: false });
    expect(validateRubric([{ name: "기능", max: 0 }])).toMatchObject({ ok: false });
    expect(validateRubric([{ name: "기능", max: 10 }, { name: "기능", max: 5 }])).toMatchObject({ ok: false });
    expect(validateRubric(Array.from({ length: 7 }, (_, i) => ({ name: `영역${i}`, max: 10 })))).toMatchObject({ ok: false });
  });
  it("이상한 값이면 기본 기준", () => {
    expect(parseRubric(null)).toEqual(DEFAULT_RUBRIC);
    expect(parseRubric(rubric)).toEqual(rubric);
  });
});

describe("점수", () => {
  it("기준대로 확인하고 합계", () => {
    expect(validateScores(rubric, [45, 30])).toEqual({
      ok: true,
      sheet: [
        { name: "내용", max: 50, score: 45 },
        { name: "표현", max: 30, score: 30 },
      ],
      total: 75,
    });
    expect(validateScores(rubric, [51, 0])).toMatchObject({ ok: false });
    expect(validateScores(rubric, [10])).toMatchObject({ ok: false });
    expect(validateScores(rubric, [1.5, 0])).toMatchObject({ ok: false });
  });
  it("채점표: 저장된 것 → v1 점수 → 없음", () => {
    expect(sheetOf([{ name: "내용", max: 50, score: 40 }], { fn: 1, und: 1, ch: 1, total: 3 })).toEqual([{ name: "내용", max: 50, score: 40 }]);
    expect(sheetOf(null, { fn: 40, und: 30, ch: null, total: 70 })).toEqual([
      { name: "기능", max: 40, score: 40 },
      { name: "코드 설명", max: 40, score: 30 },
      { name: "도전", max: 20, score: 0 },
    ]);
    expect(sheetOf(null, { fn: null, und: null, ch: null, total: null })).toBeNull();
  });
  it("v1 칸: 영역이 3개일 때만", () => {
    const three = validateScores(DEFAULT_RUBRIC, [40, 35, 10]);
    expect(three.ok && v1Columns(three.sheet)).toEqual({ score_function: 40, score_understanding: 35, score_challenge: 10 });
    const two = validateScores(rubric, [40, 20]);
    expect(two.ok && v1Columns(two.sheet)).toEqual({ score_function: null, score_understanding: null, score_challenge: null });
  });
  it("감점 영역", () => {
    expect(lostParts([{ name: "내용", max: 50, score: 50 }, { name: "표현", max: 30, score: 20 }])).toEqual(["표현"]);
  });
});

describe("채점 상태 (v1과 같음)", () => {
  it("채점됨 = 합계 > 0 또는 오답", () => {
    expect(isGraded({ total: null, wrongReason: "" })).toBe(false);
    expect(isGraded({ total: 0, wrongReason: "" })).toBe(false);
    expect(isGraded({ total: 80, wrongReason: "" })).toBe(true);
    expect(isGraded({ total: 0, wrongReason: "출력 형식" })).toBe(true);
  });
  it("오답 처리는 점수가 없을 때만", () => {
    expect(canMarkWrong(null)).toBe(true);
    expect(canMarkWrong(60)).toBe(false);
  });
});

describe("기능 만점 (업적)", () => {
  it("기능 영역, 없으면 첫 영역", () => {
    expect(functionFull([{ name: "도전", max: 20, score: 0 }, { name: "기능", max: 40, score: 40 }])).toBe(true);
    expect(functionFull([{ name: "내용", max: 50, score: 49 }])).toBe(false);
    expect(functionFull(null)).toBe(false);
  });
});
