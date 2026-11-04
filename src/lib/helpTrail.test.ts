import { describe, expect, it } from "vitest";
import { aiPasteTimes, fromAnswer, helpTrail, type HelpChat } from "./helpTrail";

const chat = (at: number, answer: string, question = "왜 오류가 나요?"): HelpChat => ({ at, question, answer, moments: [] });

describe("AI 답 붙여넣기 판정", () => {
  it("답 안의 코드·글을 붙여넣으면 AI 답에서 온 것", () => {
    expect(fromAnswer("if score >= 60:", "조건을 `if score >= 60:`처럼 바꿔 보세요")).toBe(true);
    expect(fromAnswer('print("합격")', "이렇게:\n```python\nprint(\"합격\")\n```")).toBe(true);
  });
  it("짧거나 답에 없는 글은 아님", () => {
    expect(fromAnswer(")", "괄호를 닫아 보세요 )")).toBe(false);
    expect(fromAnswer("name = input()", "변수 이름을 확인해 보세요")).toBe(false);
  });
  it("답을 받기 전의 붙여넣기는 세지 않는다", () => {
    const log = [[100, "p", 0, 0, 0, 0, "if score >= 60:"], [300, "q"], [500, "p", 0, 0, 0, 0, "if score >= 60:"]];
    expect([...aiPasteTimes(log, [chat(300, "`if score >= 60:`로 바꿔요")])]).toEqual([500]);
  });
});

describe("도움 요청 → 그 뒤 행동", () => {
  const log = [
    [100, "r:NameError"],
    [200, "q"],
    [250, "i", 0, 0, 0, 0, "x"],
    [400, "r:ok"],
    [500, "q"],
    [600, "p", 0, 0, 0, 0, "for i in range(5):"],
    [700, "r:TypeError"],
  ];
  const chats = [chat(200, "이름을 확인해 보세요", "NameError가 왜?"), chat(501, "`for i in range(5):`를 써 보세요")];
  it("질문·답, 도움 뒤 첫 실행, AI 답 붙여넣기", () => {
    const trail = helpTrail(log, chats);
    expect(trail).toHaveLength(2);
    expect(trail[0]).toMatchObject({ askAt: 200, aiPastes: [], nextRun: { at: 400, ok: true, error: null } });
    expect(trail[0].chat?.question).toBe("NameError가 왜?");
    expect(trail[1]).toMatchObject({ askAt: 500, aiPastes: [600], nextRun: { at: 700, ok: false, error: "TypeError" } });
    expect(trail[1].chat?.at).toBe(501); // 2초 안이면 같은 요청
  });
  it("대화 기록이 없어도 요청 순간은 남는다", () => {
    expect(helpTrail(log, [])[0]).toMatchObject({ askAt: 200, chat: null });
  });
});
