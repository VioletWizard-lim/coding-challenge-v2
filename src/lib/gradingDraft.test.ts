import { describe, expect, it } from "vitest";
import { draftMatches, scoreFormula, toDraft } from "./gradingDraft";

const rubric = [
  { name: "기능", max: 40, desc: "조건 하나 빠질 때마다 -5" },
  { name: "코드 설명", max: 40 },
  { name: "도전", max: 20, desc: "기본 0점, 추가 구현마다 +5" },
];

describe("AI 채점 초안", () => {
  const raw = {
    parts: [
      { name: "코드 설명", start: 40, changes: [{ reason: "설명이 문제 번호뿐", points: -5 }], comment: "교사 확인 필요" },
      { name: "기능", start: 40, changes: [{ reason: "60점 이상 조건(>=)이 아님", points: -5 }], comment: "입력·출력은 맞음" },
      { name: "도전과제", start: 0, changes: [{ reason: "불합격 문구 추가", points: 5 }, { reason: "", points: 5 }], comment: "" },
    ],
    feedback: " 60점일 때도 합격이 나오는지 확인해 보세요 ",
    note: "AI 도움 뒤 직접 고침",
  };
  it("점수는 시작 + 항목 합계로 서버가 계산한다 (이름이 다르면 순서로)", () => {
    const d = toDraft(raw, rubric)!;
    expect(d.parts.map((p) => [p.name, p.score])).toEqual([
      ["기능", 35],
      ["코드 설명", 35],
      ["도전", 5],
    ]);
    expect(d.parts[2].changes).toEqual([{ reason: "불합격 문구 추가", points: 5 }]); // 이유 없는 항목은 버림
    expect(d.parts[0].desc).toBe("조건 하나 빠질 때마다 -5");
    expect(d.feedback).toBe("60점일 때도 합격이 나오는지 확인해 보세요");
  });
  it("0~배점 밖이면 자른다", () => {
    const d = toDraft(
      { parts: [{ name: "기능", start: 50, changes: [], comment: "" }, { name: "코드 설명", start: 40, changes: [{ reason: "a", points: -50 }], comment: "" }, { name: "도전", start: 0, changes: [{ reason: "b", points: 30 }], comment: "" }], feedback: "", note: "" },
      rubric,
    )!;
    expect(d.parts.map((p) => p.score)).toEqual([40, 0, 20]);
    expect(scoreFormula(d.parts[1])).toBe("40 − 50 = -10 → 0 (0~40 안으로)");
  });
  it("계산식 글", () => {
    const d = toDraft(raw, rubric)!;
    expect(scoreFormula(d.parts[0])).toBe("40 − 5 = 35");
    expect(scoreFormula({ name: "x", max: 10, score: 7, reason: "" })).toBeNull(); // 예전 초안
  });
  it("영역이 모자라거나 형식이 이상하면 null", () => {
    expect(toDraft({ parts: [{ name: "기능", start: 1, changes: [], comment: "" }], feedback: "", note: "" }, rubric)).toBeNull();
    expect(toDraft(null, rubric)).toBeNull();
  });
  it("기준이 바뀌었는지", () => {
    const parts = rubric.map((p) => ({ ...p, score: 0, reason: "", start: p.max, changes: [] }));
    expect(draftMatches(parts, rubric)).toBe(true);
    expect(draftMatches(parts, [{ name: "기능", max: 50 }, ...rubric.slice(1)])).toBe(false);
    expect(draftMatches(parts, [{ ...rubric[0], desc: "조건 하나 빠질 때마다 -10" }, ...rubric.slice(1)])).toBe(false); // 설명이 바뀜
    expect(draftMatches(rubric.map((p) => ({ ...p, score: 0, reason: "" })), rubric)).toBe(false); // 예전 형식
  });
});
