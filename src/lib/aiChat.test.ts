import { describe, expect, it } from "vitest";
import { dailyLimit, dropUnknownRefs, estimateCost, kstDayStart, kstMonthStart, momentsUsed, problemForAi, validateQuestion } from "./aiChat";
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
