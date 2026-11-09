import { describe, expect, it } from "vitest";
import { filterKind, groupByStudent, kindCounts, snippet, type ViewItem } from "./aiChatView";

const item = (key: string, type: ViewItem["type"], userId: string, problem: string, createdAt: string, flaggedBy: string | null = null): ViewItem => ({
  key,
  type,
  userId,
  subject: "프로그래밍",
  problem,
  createdAt,
  flaggedBy,
});

const items = [
  item("c1", "chat", "a", "1-2", "2026-11-08T01:00:00Z"),
  item("c2", "chat", "a", "1-2", "2026-11-08T01:05:00Z", "student"),
  item("r1", "review", "a", "1-2", "2026-11-08T01:20:00Z"),
  item("p1", "practice", "a", "P7", "2026-11-07T00:00:00Z"),
  item("c3", "chat", "a", "P7", "2026-11-07T00:10:00Z"),
  item("c4", "chat", "b", "1-1", "2026-11-09T00:00:00Z"),
];

describe("AI 대화 보기 정리", () => {
  it("종류로 거르고 센다", () => {
    expect(filterKind(items, "review").map((x) => x.key)).toEqual(["r1"]);
    expect(filterKind(items, "flagged").map((x) => x.key)).toEqual(["c2"]);
    expect(kindCounts(items)).toEqual({ all: 6, chat: 4, review: 1, practice: 1, flagged: 1 });
  });

  it("학생 → 문제로 묶고, 문제 안은 일어난 순서로", () => {
    const g = groupByStudent(items);
    expect(g.map((s) => s.userId)).toEqual(["b", "a"]); // 최근 활동 순
    const a = g[1];
    expect(a.count).toBe(5);
    expect(a.flagged).toBe(1);
    expect(a.topics.map((t) => t.problem)).toEqual(["1-2", "P7"]);
    expect(a.topics[0].items.map((x) => x.key)).toEqual(["c1", "c2", "r1"]); // 질문 → 질문 → 되돌아보기
    expect(a.topics[1].items.map((x) => x.key)).toEqual(["p1", "c3"]); // 연습 문제와 그 도우미 대화가 함께
  });

  it("한 줄 미리 보기", () => {
    expect(snippet("가\n나   다", 10)).toBe("가 나 다");
    expect(snippet("가나다라마", 3)).toBe("가나다…");
  });
});
