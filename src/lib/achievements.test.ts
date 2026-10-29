import { describe, expect, it } from "vitest";
import {
  computeAchievements,
  earnedKeys,
  firstFixTime,
  fixedErrorKinds,
  focusTime,
  oneShotTime,
  persistTime,
  type AchievementSubmission,
} from "./achievements";

const MIN = 60_000;
let seq = 0;
function sub(over: Partial<AchievementSubmission> = {}): AchievementSubmission {
  seq++;
  return {
    id: seq,
    subject: "프로그래밍",
    problem: "1-1",
    submittedAt: `2026-10-${String(seq).padStart(2, "0")}T01:00:00Z`,
    date: `2026-10-${String(seq).padStart(2, "0")}`,
    log: [],
    code: "print(1)",
    wrongReason: null,
    scoreTotal: null,
    hasLog: true,
    typedChars: 10,
    pasteCount: 0,
    editCount: 0,
    ...over,
  };
}
const find = (list: ReturnType<typeof computeAchievements>, code: string) => list.find((a) => a.code === code)!;

describe("실행 기록 판정", () => {
  const log = [[1000, "i", 0, 0, 0, 0, "a"], [2000, "r:NameError"], [3000, "r:NameError"], [4000, "r:TypeError"], [5000, "r:ok"]];
  it("오류 뒤 첫 성공, 오류 3번 뒤 성공", () => {
    expect(firstFixTime(log)).toBe(5000);
    expect(persistTime(log)).toBe(5000);
    expect(persistTime(log, 4)).toBeNull();
    expect(firstFixTime([[1, "r:ok"]])).toBeNull();
  });
  it("한 번에 성공은 오류가 한 번도 없어야", () => {
    expect(oneShotTime([[1, "i", 0, 0, 0, 0, "a"], [5, "r:ok"], [9, "r:ok"]])).toBe(5);
    expect(oneShotTime(log)).toBeNull();
    expect(oneShotTime([[1, "i", 0, 0, 0, 0, "a"]])).toBeNull();
  });
  it("고쳐 낸 오류 종류", () => {
    expect([...fixedErrorKinds(log).keys()]).toEqual(["NameError", "TypeError"]);
    expect(fixedErrorKinds([[1, "r:SyntaxError"]]).size).toBe(0); // 고치지 못했으면 안 셈
  });
});

describe("몰입 10분", () => {
  const typing = (from: number, minutes: number) =>
    Array.from({ length: minutes * 2 + 1 }, (_, i) => [from + i * 30_000, "i", 0, 0, 0, 0, "a"]);
  it("10분 이어서 작업하면 그 순간", () => {
    expect(focusTime(typing(0, 11))).toBe(10 * MIN);
  });
  it("1초 넘게 창을 벗어나면 다시 센다, 1초 미만 이탈(input 창)은 무시", () => {
    const away = [...typing(0, 6), [6 * MIN + 1, "b"], [6 * MIN + 5000, "f"], ...typing(6 * MIN + 6000, 6)];
    expect(focusTime(away)).toBeNull();
    const blink = [...typing(0, 6), [6 * MIN + 1, "b"], [6 * MIN + 300, "f"], ...typing(6 * MIN + 30_000, 6)];
    expect(focusTime(blink)).not.toBeNull();
  });
  it("1분 넘게 멈추면 다시 센다", () => {
    expect(focusTime([...typing(0, 6), ...typing(8 * MIN, 6)])).toBeNull();
  });
});

describe("업적 계산", () => {
  it("직접 쓴 제출 수로 첫 한 줄·내 손으로 완성 단계", () => {
    const subs = Array.from({ length: 6 }, (_, i) => sub({ problem: `1-${i + 1}`, pasteCount: i === 0 ? 1 : 0 }));
    const list = computeAchievements(subs, [], {});
    expect(find(list, "first_line").steps[0].earned?.submissionId).toBe(subs[1].id); // 첫 제출은 붙여넣기가 있어서 둘째
    const hands = find(list, "own_hands");
    expect(hands.current).toBe(5);
    expect(hands.steps.map((s) => !!s.earned)).toEqual([true, false, false]);
    expect(hands.steps[0].earned?.submissionId).toBe(subs[5].id);
  });
  it("작성 기록이 없는 옛 제출은 직접 작성으로 치지 않는다", () => {
    const list = computeAchievements([sub({ hasLog: false })], [], {});
    expect(find(list, "first_line").steps[0].earned).toBeNull();
  });
  it("다시 도전: 오답 뒤 같은 문제를 다시 내서 점수를 받음", () => {
    const wrong = sub({ problem: "2-1", wrongReason: "출력 형식이 달라요" });
    const again = sub({ problem: "2-1", scoreTotal: 90 });
    expect(find(computeAchievements([again, wrong], [], {}), "retry").steps[0].earned?.submissionId).toBe(again.id);
    expect(find(computeAchievements([sub({ problem: "2-2", scoreTotal: 90 })], [], {}), "retry").steps[0].earned).toBeNull();
  });
  it("단원 정복과 진행률", () => {
    const units = { 프로그래밍_3: ["3-1", "3-2", "3-3"] };
    const partial = computeAchievements([sub({ problem: "3-1" }), sub({ problem: "3-2" })], [], units);
    expect(find(partial, "unit_master").steps[0].earned).toBeNull();
    expect(find(partial, "unit_master").current).toBe(67);
    const all = computeAchievements([sub({ problem: "3-1" }), sub({ problem: "3-2" }), sub({ problem: "3-3" })], [], units);
    expect(find(all, "unit_master").steps[0].earned).not.toBeNull();
  });
  it("꾸준한 발걸음은 서로 다른 날 5일", () => {
    const sameDay = Array.from({ length: 6 }, () => sub({ date: "2026-10-01" }));
    expect(find(computeAchievements(sameDay, [], {}), "steady5").current).toBe(1);
    const fiveDays = Array.from({ length: 5 }, () => sub());
    expect(find(computeAchievements(fiveDays, [], {}), "steady5").steps[0].earned).not.toBeNull();
  });
  it("성찰 단계는 서로 다른 날 수로", () => {
    const r = (date: string) => ({ date, savedAt: `${date}T08:00:00Z` });
    const list = computeAchievements([], [r("2026-10-01"), r("2026-10-02")], {});
    expect(find(list, "reflector").steps.map((s) => !!s.earned)).toEqual([true, false]);
    expect(find(list, "reflector").current).toBe(2);
  });
  it("숨은 업적: 주석 3줄, 함수, 같은 문제 세 번째, 오류 수집가", () => {
    const code = "# 이름 받기\nname = input()\n# 인사\n# 출력\ndef hello(n):\n    print(n)";
    const fix = (kind: string) => [[1, `r:${kind}`], [2, "r:ok"]];
    const subs = [
      sub({ code, log: fix("NameError") }),
      sub({ log: fix("TypeError") }),
      sub({ log: fix("SyntaxError") }),
    ];
    const list = computeAchievements(subs, [], {});
    expect(find(list, "commenter").steps[0].earned?.submissionId).toBe(subs[0].id);
    expect(find(list, "own_function").steps[0].earned?.submissionId).toBe(subs[0].id);
    expect(find(list, "third_try").steps[0].earned?.submissionId).toBe(subs[2].id);
    expect(find(list, "error_collector").steps[0].earned).toMatchObject({ submissionId: subs[2].id, at: 2 });
    expect(find(list, "one_shot").steps[0].earned).toBeNull();
    expect(earnedKeys(list)).toContain("commenter:0");
  });
});
