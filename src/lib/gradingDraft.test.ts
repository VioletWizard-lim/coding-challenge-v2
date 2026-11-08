import { describe, expect, it } from "vitest";
import { draftMatches, toDraft } from "./gradingDraft";

const rubric = [
  { name: "기능", max: 40, desc: "조건을 모두 지키면 만점" },
  { name: "코드 설명", max: 40 },
  { name: "도전", max: 20 },
];

describe("AI 채점 초안", () => {
  it("기준에 맞춰 점수를 0~배점으로 자르고, 이름이 다르면 순서로", () => {
    const d = toDraft(
      {
        parts: [
          { name: "코드 설명", score: 35, reason: "흐름을 잘 설명함" },
          { name: "기능", score: 55, reason: "조건 모두 지킴" },
          { name: "도전과제", score: -3, reason: "시도 없음" },
        ],
        feedback: " 60점 이상 조건(>=)을 확인해 보세요 ",
        note: "오류를 스스로 고침",
      },
      rubric,
    );
    expect(d?.parts.map((p) => [p.name, p.score, p.reason])).toEqual([
      ["기능", 40, "조건 모두 지킴"],
      ["코드 설명", 35, "흐름을 잘 설명함"],
      ["도전", 0, "시도 없음"],
    ]);
    expect(d?.parts[0].desc).toBe("조건을 모두 지키면 만점");
    expect(d?.feedback).toBe("60점 이상 조건(>=)을 확인해 보세요");
  });
  it("영역이 모자라거나 형식이 이상하면 null", () => {
    expect(toDraft({ parts: [{ name: "기능", score: 1, reason: "" }], feedback: "", note: "" }, rubric)).toBeNull();
    expect(toDraft(null, rubric)).toBeNull();
  });
  it("기준이 바뀌었는지", () => {
    const parts = rubric.map((p) => ({ ...p, score: 0, reason: "" }));
    expect(draftMatches(parts, rubric)).toBe(true);
    expect(draftMatches(parts, [{ name: "기능", max: 50 }, ...rubric.slice(1)])).toBe(false);
  });
});
