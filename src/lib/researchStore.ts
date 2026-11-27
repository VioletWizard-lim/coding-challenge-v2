import "server-only";
import { createHmac } from "node:crypto";
import { listChatsSince } from "./aiChatStore";
import { loadStatRows } from "./classStatsStore";
import { LOAD_TEST_PREFIX } from "./loadTest";
import { listAllProblems } from "./problemStore";
import type { ResearchChat, ResearchProblem, ResearchSubmission } from "./researchStats";

/**
 * 연구용 익명 ID: 학생 아이디를 비밀 키로 바꾼 값 ("R" + 8글자). 같은 학생은 언제 내보내도 같은 ID라서
 * 사전·사후, 여러 번 내보낸 파일을 이어 붙일 수 있고, 키 없이는 아이디로 되돌릴 수 없다.
 * 키: RESEARCH_ID_SECRET (없으면 SESSION_SECRET). 연구 기간 중에는 바꾸지 않는다 (바꾸면 ID가 모두 달라짐).
 */
export function researchId(studentKey: string): string {
  const secret = process.env.RESEARCH_ID_SECRET || process.env.SESSION_SECRET;
  if (!secret) throw new Error("RESEARCH_ID_SECRET 또는 SESSION_SECRET이 필요해요.");
  return `R${createHmac("sha256", secret).update(`research-id:${studentKey}`).digest("hex").slice(0, 8).toUpperCase()}`;
}

/**
 * 한 과목·연도(·반)의 연구용 원자료: 제출(작성 기록 포함), AI 대화, 문제 태그.
 * 부하 테스트 계정은 뺀다. 나중에 학교별로 나누면 여기에 학교 조건을 넣는다.
 */
export async function loadResearchData(subject: string, year: number, cls = "") {
  const [{ rows, logs }, { problems }, { chats }] = await Promise.all([
    loadStatRows(subject, year, true),
    listAllProblems(),
    listChatsSince(new Date(Date.UTC(year - 1, 11, 31, 15)).toISOString()), // 한국 시간 그해 1월 1일부터
  ]);
  const yearEnd = new Date(Date.UTC(year, 11, 31, 15)).toISOString();
  const real = (key: string) => !key.startsWith(LOAD_TEST_PREFIX);
  const picked = rows.filter((r) => real(r.key) && (!cls || r.cls === cls));
  const students = new Set(picked.map((r) => r.key));
  const submissions: ResearchSubmission[] = picked.map((r) => ({
    id: r.id,
    student: r.key,
    problem: r.problem,
    submittedAt: r.submittedAt,
    score: r.score,
    log: logs.get(r.id) ?? [],
  }));
  const researchChats: ResearchChat[] = chats
    .filter((c) => c.subject === subject && c.createdAt < yearEnd && real(c.userId) && (!cls || students.has(c.userId)))
    .map((c) => ({ ...c, student: c.userId }));
  const problemMap = new Map<string, ResearchProblem>(
    problems
      .filter((p) => p.subject === subject)
      .map((p) => [
        p.number,
        {
          number: p.number,
          title: p.title,
          lesson: p.lesson ?? null,
          lessonOrder: p.lessonOrder ?? null,
          level: p.level ?? null,
          anchor: !!p.anchor,
          standards: p.standards ?? [],
        },
      ]),
  );
  return { submissions, chats: researchChats, problems: problemMap };
}
