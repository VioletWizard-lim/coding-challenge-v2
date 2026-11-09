/**
 * 교사 🤖 AI 대화 탭의 보기 정리 (순수 함수, 단위 테스트: aiChatView.test.ts)
 * - 종류로 거르기: 도우미 대화 / 되돌아보기 / 연습 문제 / 🚩 표시된 것
 * - 학생·문제별로 묶기: 같은 학생이 같은 문제에서 한 것(도우미 질문들 → 되돌아보기)을 하나의 흐름으로
 */
export type ViewKind = "chat" | "review" | "practice";
export type KindFilter = "all" | ViewKind | "flagged";

export type ViewItem = {
  key: string;
  type: ViewKind;
  userId: string;
  subject: string;
  /** 문제 키 (수업 "1-2", 연습 "P12", 학생이 만든 문제 "S7") — 연습 문제 자체도 "P12"로 넣으면 그 문제의 도우미 대화와 함께 묶인다 */
  problem: string;
  createdAt: string;
  flaggedBy: string | null;
};

export function filterKind<T extends ViewItem>(items: T[], kind: KindFilter): T[] {
  if (kind === "all") return items;
  if (kind === "flagged") return items.filter((x) => x.flaggedBy);
  return items.filter((x) => x.type === kind);
}

export function kindCounts(items: ViewItem[]): Record<KindFilter, number> {
  return {
    all: items.length,
    chat: items.filter((x) => x.type === "chat").length,
    review: items.filter((x) => x.type === "review").length,
    practice: items.filter((x) => x.type === "practice").length,
    flagged: items.filter((x) => x.flaggedBy).length,
  };
}

export type TopicGroup<T> = { key: string; subject: string; problem: string; latest: string; items: T[]; flagged: number };
export type StudentGroup<T> = { userId: string; latest: string; count: number; flagged: number; topics: TopicGroup<T>[] };

/** 학생 → 문제로 묶는다. 학생·문제는 최근 활동 순, 한 문제 안은 일어난 순서(오래된 것부터)로 흐름처럼 읽히게 */
export function groupByStudent<T extends ViewItem>(items: T[]): StudentGroup<T>[] {
  const students = new Map<string, Map<string, T[]>>();
  for (const x of items) {
    const topics = students.get(x.userId) ?? students.set(x.userId, new Map()).get(x.userId)!;
    const k = `${x.subject}|${x.problem}`;
    (topics.get(k) ?? topics.set(k, []).get(k)!).push(x);
  }
  const latestOf = (list: { createdAt: string }[]) => list.reduce((m, x) => (x.createdAt > m ? x.createdAt : m), "");
  return [...students.entries()]
    .map(([userId, topics]) => {
      const groups = [...topics.entries()]
        .map(([key, list]) => {
          const sorted = [...list].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
          return { key, subject: sorted[0].subject, problem: sorted[0].problem, latest: latestOf(sorted), items: sorted, flagged: sorted.filter((x) => x.flaggedBy).length };
        })
        .sort((a, b) => b.latest.localeCompare(a.latest));
      const flat = groups.flatMap((g) => g.items);
      return { userId, latest: latestOf(flat), count: flat.length, flagged: flat.filter((x) => x.flaggedBy).length, topics: groups };
    })
    .sort((a, b) => b.latest.localeCompare(a.latest));
}

/** 한 줄 미리 보기: 줄바꿈을 없애고 n자까지 */
export const snippet = (text: string, n = 60) => {
  const one = text.replace(/\s+/g, " ").trim();
  return one.length > n ? `${one.slice(0, n)}…` : one;
};
