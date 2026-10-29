import { describe, expect, it } from "vitest";
import { toProblems, validNumberCount } from "./worksheet";

describe("AI가 읽은 학습지 → 문제", () => {
  it("학습지 1-6 형식을 문제로 바꾼다", () => {
    const [p] = toProblems(
      {
        problems: [
          {
            number: "1-6",
            title: "급식 추천 카드 완성",
            difficulty: 3,
            description: "  영양사 선생님이 …  ",
            conditions: ["1. input()을 4번 이상 사용할 것", "추천 조합 메뉴는 결합해서 만들 것", ""],
            examples: [
              { input: "길동 / 돈까스 / 볶음밥 / 된장국", output: "=== 급식 추천 카드 ===\n이름: 길동" },
              { input: "", output: "" },
            ],
            goal: "여러 input 값을 종합적으로 관리",
            challenge: "구분선(====)을 넣어 보기",
          },
        ],
      },
      "프로그래밍",
    );
    expect(p).toEqual({
      subject: "프로그래밍",
      number: "1-6",
      title: "급식 추천 카드 완성",
      difficulty: 3,
      description: "영양사 선생님이 …",
      conditions: "input()을 4번 이상 사용할 것\n추천 조합 메뉴는 결합해서 만들 것",
      examples: [{ input: "길동 / 돈까스 / 볶음밥 / 된장국", output: "=== 급식 추천 카드 ===\n이름: 길동" }],
      goal: "여러 input 값을 종합적으로 관리",
      challenge: "구분선(====)을 넣어 보기",
      starterCode: "",
    });
  });

  it("어긋난 값은 고치거나 비운다", () => {
    const list = toProblems(
      { problems: [{ number: "2 . 3", difficulty: 0 }, { number: "가-나", title: "x", difficulty: 9, examples: "x" }, null] },
      "정보",
    );
    expect(list[0]).toMatchObject({ number: "2-3", title: "2-3", difficulty: null, examples: [], conditions: "" });
    expect(list[1].difficulty).toBeNull();
    expect(validNumberCount(list)).toBe(1);
    expect(toProblems(null, "정보")).toEqual([]);
    expect(toProblems({ problems: "x" }, "정보")).toEqual([]);
  });
});
