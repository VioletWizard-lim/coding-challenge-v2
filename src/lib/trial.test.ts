import { describe, expect, it } from "vitest";
import { summarizeProcess } from "./process-summary";
import { analyzeLog } from "./replay";
import {
  findTrialProblem,
  SAMPLE_CHAT,
  SAMPLE_RECORDING,
  sampleChats,
  sampleMoments,
  sampleReview,
  TRIAL_PROBLEMS,
  trialCodeMatches,
  trialLimit,
} from "./trial";

describe("체험 페이지 데이터", () => {
  it("체험 문제는 예시(테스트)가 있고 번호로 찾는다", () => {
    expect(TRIAL_PROBLEMS.map((p) => p.id)).toEqual(["체험1", "체험2", "체험3"]);
    for (const p of TRIAL_PROBLEMS) expect(p.view.examples.length).toBe(p.tests.length);
    expect(findTrialProblem("체험2")?.view.title).toBe("짝수일까 홀수일까");
    expect(findTrialProblem("1-1")).toBeNull();
  });

  it("예시 기록을 재생하면 최종 코드가 된다 (편집 위치가 맞음)", () => {
    expect(summarizeProcess(SAMPLE_RECORDING.init, SAMPLE_RECORDING.log).currentCode).toBe(SAMPLE_RECORDING.code);
    expect(SAMPLE_RECORDING.code).toContain("age = int(input())");
    const { stats } = analyzeLog(SAMPLE_RECORDING.init, SAMPLE_RECORDING.log);
    expect(stats.runCount).toBe(3);
    expect(stats.runErrorCount).toBe(2);
    expect(stats.pastedChars).toBe(0);
  });

  it("예시 AI 답·되돌아보기가 가리키는 순간이 과정 요약에 있다", () => {
    const ids = new Set(sampleMoments().map((m) => m.id));
    const refs = (t: string) => [...t.matchAll(/\[\[(M\d+)\]\]/g)].map((m) => m[1]);
    const review = sampleReview();
    const texts = [SAMPLE_CHAT.answer, review.intro, ...review.questions.flatMap((q) => [q.question, q.followUp?.reply ?? "", q.followUp?.question ?? ""])];
    for (const id of texts.flatMap(refs)) expect(ids.has(id)).toBe(true);
    expect(review.questions.every((q) => q.moment)).toBe(true);
    expect(sampleMoments().find((m) => m.id === "M3")?.kind).toBe("pause");
    expect(sampleChats()[0].at).toBeGreaterThan(0);
  });

  it("체험 코드와 하루 횟수", () => {
    expect(trialCodeMatches(" Line2027 ", "line2027")).toBe(true);
    expect(trialCodeMatches("x", "line2027")).toBe(false);
    expect(trialCodeMatches("", "")).toBe(false); // 코드를 정하지 않으면 진짜 AI는 꺼짐
    expect(trialLimit()).toBe(30);
  });
});
