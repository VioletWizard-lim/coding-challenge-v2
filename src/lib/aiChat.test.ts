import { describe, expect, it } from "vitest";
import {
  dailyLimit,
  dropUnknownRefs,
  estimateCost,
  kstDayStart,
  kstMonthStart,
  leaksAnswer,
  momentsUsed,
  problemForAi,
  similarity,
  usageByModel,
  stripAnswerCode,
  validateQuestion,
} from "./aiChat";
import type { Moment } from "./process-summary";

const moments: Moment[] = [
  { id: "M1", at: 1000, kind: "run-ok", label: "실행 성공" },
  { id: "M2", at: 2000, kind: "run-error", label: "NameError (1번째)" },
];

describe("aiChat", () => {
  it("하루 한도: 환경변수가 없거나 이상하면 50", () => {
    expect(dailyLimit(undefined)).toBe(50);
    expect(dailyLimit("abc")).toBe(50);
    expect(dailyLimit("0")).toBe(50);
    expect(dailyLimit("30")).toBe(30);
  });

  it("질문 확인", () => {
    expect(validateQuestion("  ")).toMatch(/적어/);
    expect(validateQuestion("a".repeat(1001))).toMatch(/1000자/);
    expect(validateQuestion("왜 오류가 나요?")).toBeNull();
  });

  it("답에 나온 순간만 남기고, 지어낸 번호는 지운다", () => {
    const answer = "[[M2]]에서 오류가 났어요. [[M9]]도 보세요.";
    expect(momentsUsed(answer, moments).map((m) => m.id)).toEqual(["M2"]);
    expect(dropUnknownRefs(answer, moments)).toBe("[[M2]]에서 오류가 났어요. 도 보세요.");
  });

  it("한국 시간 기준 오늘·이번 달 시작", () => {
    const now = new Date("2026-11-03T16:30:00Z"); // 한국 11월 4일 01:30
    expect(kstDayStart(now)).toBe("2026-11-04T00:00:00+09:00");
    expect(kstMonthStart(now)).toBe("2026-11-01T00:00:00+09:00");
  });

  it("예상 비용: 아는 모델은 달러, 모르는 모델이 섞이면 known=false", () => {
    const c = estimateCost([{ model: "claude-haiku-5-5", inputTokens: 1_000_000, outputTokens: 1_000_000 }]);
    expect(c.dollars).toBeCloseTo(0.6);
    expect(c.known).toBe(true);
    expect(estimateCost([{ model: "claude-sonnet-5-5", inputTokens: 1_000_000, outputTokens: 0 }]).dollars).toBeCloseTo(2);
    expect(estimateCost([{ model: "claude-opus-5-5", inputTokens: 0, outputTokens: 1_000_000 }]).dollars).toBeCloseTo(20);
    expect(estimateCost([{ model: "mystery", inputTokens: 10, outputTokens: 10 }]).known).toBe(false);
  });

  it("AI에 보낼 문제 설명", () => {
    const text = problemForAi({
      number: "1-1",
      title: "급식 안내",
      description: "메뉴를 출력하세요.",
      conditions: "- print를 쓸 것\n- 변수 menu",
      examples: [{ input: "카레", output: "오늘은 카레" }],
      goal: "변수 이해",
    });
    expect(text).toContain("1-1 급식 안내");
    expect(text).toContain("1. print를 쓸 것");
    expect(text).toContain("입력: 카레");
    expect(text).toContain("문제 목표: 변수 이해");
  });
});

describe("답 검사 (정답 수준의 코드)", () => {
  const student = 'menu = "카레"\nprint("오늘은 " + menuu)';
  it("힌트만 있으면 통과", () => {
    expect(leaksAnswer("[[M1]] 이후 바뀐 줄의 변수 이름을 위에서 만든 이름과 비교해 볼래요?", student)).toBeNull();
  });
  it("학생 줄을 그대로 가리키는 것은 괜찮다 (띄어쓰기 차이도)", () => {
    expect(leaksAnswer('`print("오늘은 "+menuu)` 줄을 다시 보세요.', student)).toBeNull();
  });
  it("상관없는 1~2줄 문법 예시는 괜찮다", () => {
    expect(leaksAnswer("예를 들면:\n```python\nx = 3\nprint(x)\n```", student)).toBeNull();
  });
  it("코드 블록이 3줄 이상이면 완성 코드", () => {
    expect(leaksAnswer("```python\na = 1\nb = 2\nprint(a + b)\n```", student)).toBe("완성 코드");
  });
  it("학생 줄을 고친 버전이 있으면 걸린다", () => {
    expect(leaksAnswer('이렇게 바꿔 보세요: `print("오늘은 " + menu)`', student)).toBe("고친 줄");
    expect(leaksAnswer('```\nprint("오늘은 " + menu)\n```', student)).toBe("고친 줄");
  });
  it("마지막 안전장치: 코드 블록과 고친 줄을 지운다", () => {
    const out = stripAnswerCode('바꿔 보세요: `print("오늘은 " + menu)` 그리고\n```\na\nb\nc\n```\n`len()`도 있어요', student);
    expect(out).not.toContain("menu)");
    expect(out).toContain("(이 부분은 직접 고쳐 보세요)");
    expect(out).toContain("(코드는 직접 써 보세요)");
    expect(out).toContain("`len()`");
  });
  it("비슷한 정도", () => {
    expect(similarity("abc", "abc")).toBe(1);
    expect(similarity("print(menu)", "print(menuu)")).toBeGreaterThan(0.9);
    expect(similarity("abc", "xyz")).toBe(0);
  });
});

describe("답 검사: 학생이 쓴 코드를 가리키는 것은 괜찮다", () => {
  const current = 'score = int(input("점수: "))\nif score > 60:\n    print("합격입니다!")';
  it("학생 줄의 일부를 짚으며 칭찬", () => {
    expect(leaksAnswer("`int(input())`로 숫자로 바꾼 것과 `print(\"합격입니다!\")`를 들여쓰기한 것 좋아요", current)).toBeNull();
    expect(leaksAnswer('`int(input("점수: "))`로 숫자로 바꾼 것 좋아요', current)).toBeNull();
  });
  it("조건을 고친 줄은 걸린다", () => {
    expect(leaksAnswer("`if score >= 60:`로 바꿔 보세요", current)).toBe("고친 줄");
  });
  it("마지막 성공 코드에 있던 줄도 학생이 쓴 코드", () => {
    const own = `${current}\nscore = input("점수: ")`;
    expect(leaksAnswer('처음엔 `score = input("점수: ")`였죠', own)).toBeNull();
  });
});

describe("모델별 사용량", () => {
  it("모델마다 나눠 합친다", () => {
    const list = usageByModel([
      { model: "claude-opus-5-5", inputTokens: 5000, outputTokens: 1000 },
      { model: "claude-opus-5-5", inputTokens: 5000, outputTokens: 1000 },
      { model: "claude-haiku-5-5", inputTokens: 5000, outputTokens: 1000 },
    ]);
    expect(list.map((m) => [m.model, m.count, m.inputTokens])).toEqual([["claude-opus-5-5", 2, 10000], ["claude-haiku-5-5", 1, 5000]]);
    expect(list[0].dollars).toBeCloseTo(0.08); // (10000×4 + 2000×20) / 1백만
  });
});
