"use server";

import { AiNotConfiguredError, AiRefusedError, makePractice } from "@/lib/ai";
import { getUserProfile } from "@/lib/auth";
import { isValidLog } from "@/lib/editLog";
import {
  levelLabel,
  practiceLimit,
  toDraft,
  verifyDraft,
  type PracticeDraft,
  type PracticeProblem,
  type PracticeSettings,
} from "@/lib/practice";
import {
  countTodayPractice,
  forStudent,
  getPractice,
  getPracticeSettings,
  insertPractice,
  listMyPractice,
  PracticeNotReadyError,
  recentTitles,
  savePracticeWork,
  setPracticeFlag,
} from "@/lib/practiceStore";
import { stuckBrief, stuckPoints, type StuckPoint } from "@/lib/process-summary";
import { allowedSubjects } from "@/lib/problems";
import { listAllProblems } from "@/lib/problemStore";
import { runPythonTests } from "@/lib/pyRunner";
import { getSession } from "@/lib/session";
import { getMyJourneyData, type Owner } from "@/lib/submissions";

/** 학생 화면에 보내는 막힌 곳 (AI에 보낼 근거 글과 코드는 빼고) */
export type StuckChoice = Pick<StuckPoint, "id" | "kind" | "subject" | "concept" | "label" | "evidence">;

export type PracticeHome =
  | {
      ok: true;
      ready: boolean;
      settings: PracticeSettings[];
      stuck: StuckChoice[];
      problems: PracticeProblem[];
      remaining: number;
      limit: number;
    }
  | { ok: false; error: string };

/** 내 작성 기록에서 찾은 막힌 곳 (최근 제출 기준) */
async function myStuckPoints(profile: Owner, subjects: string[]): Promise<StuckPoint[]> {
  const [{ records, inits }, { problems }] = await Promise.all([getMyJourneyData(profile), listAllProblems()]);
  const titles = new Map(problems.map((p) => [`${p.subject}_${p.number}`, p.title]));
  return stuckPoints(
    records
      .map((r, i) => ({
        id: r.id,
        subject: r.subject,
        problem: r.problem,
        title: titles.get(`${r.subject}_${r.problem}`) ?? "",
        init: inits[i] ?? "",
        log: r.log,
      }))
      .filter((s) => subjects.includes(s.subject)),
  );
}

/** 연습 탭 처음: 과목별 설정, 내가 막혔던 곳, 내 연습 문제, 오늘 남은 만들기 횟수 */
export async function loadPracticeHome(): Promise<PracticeHome> {
  const session = await getSession();
  if (!session || session.role !== "student") return { ok: false, error: "다시 로그인하세요." };
  try {
    const profile = await getUserProfile(session.id);
    if (!profile) return { ok: false, error: "다시 로그인하세요." };
    const subjects = allowedSubjects(profile.subjects);
    const { ready, settings } = await getPracticeSettings(subjects);
    const limit = practiceLimit();
    if (!ready) return { ok: true, ready, settings, stuck: [], problems: [], remaining: limit, limit };
    const [points, problems, used] = await Promise.all([
      myStuckPoints(profile, subjects),
      listMyPractice(session.id),
      countTodayPractice(session.id),
    ]);
    const stuck = points.map(({ id, kind, subject, concept, label, evidence }) => ({ id, kind, subject, concept, label, evidence }));
    return { ok: true, ready, settings, stuck, problems, remaining: Math.max(0, limit - used), limit };
  } catch (err) {
    if (err instanceof PracticeNotReadyError) return { ok: false, error: "선생님이 연습 모드를 준비하고 있어요." };
    console.error("연습 모드 불러오기 오류:", err);
    return { ok: false, error: "연습 모드를 불러오지 못했어요. 잠시 후 다시 시도하세요." };
  }
}

export type CreateInput =
  | { subject: string; mode: "stuck"; pointId: string; level: number }
  | { subject: string; mode: "concept"; concept: string; level: number };

export type CreateResult = { ok: true; problem: PracticeProblem; remaining: number } | { ok: false; error: string; remaining?: number };

/** AI가 만든 문제를 서버에서 확인하고, 통과 못 하면 이유를 알려 주고 한 번 더 만든다 */
const MAX_TRIES = 2;

/**
 * 연습 문제 만들기. 내 작성 기록에서 찾은 막힌 곳(stuckPoints)을 근거로 AI가 문제·테스트·참고 답안을 만들고,
 * 서버가 참고 답안을 실제로 돌려 테스트를 통과한 문제만 저장한다. 참고 답안은 학생에게 보내지 않는다.
 */
export async function createPractice(input: CreateInput): Promise<CreateResult> {
  const session = await getSession();
  if (!session || session.role !== "student") return { ok: false, error: "다시 로그인하세요." };
  const level = [1, 2, 3].includes(Number(input.level)) ? Number(input.level) : 2;
  try {
    const profile = await getUserProfile(session.id);
    if (!profile) return { ok: false, error: "다시 로그인하세요." };
    const subjects = allowedSubjects(profile.subjects);
    if (!subjects.includes(input.subject)) return { ok: false, error: "과목이 맞지 않아요." };
    const { ready, settings: [settings] } = await getPracticeSettings([input.subject]);
    if (!ready) return { ok: false, error: "선생님이 연습 모드를 준비하고 있어요." };
    if (!settings.enabled) return { ok: false, error: "이 과목은 지금 연습 모드가 꺼져 있어요." };

    const limit = practiceLimit();
    const used = await countTodayPractice(session.id);
    if (used >= limit) return { ok: false, error: `오늘 연습 문제 ${limit}개를 모두 만들었어요. 내일 또 만들 수 있어요.`, remaining: 0 };

    const points = await myStuckPoints(profile, [input.subject]);
    let concept: string;
    let basis = "";
    let stuckText: string;
    let request: string;
    if (input.mode === "stuck") {
      const point = points.find((p) => p.id === input.pointId);
      if (!point) return { ok: false, error: "그 막힌 곳을 찾지 못했어요. 새로고침 후 다시 골라 주세요." };
      concept = point.concept;
      basis = `${point.label} · ${point.evidence}`;
      stuckText = point.text;
      request = `위의 막힌 곳을 다시 연습할 수 있는 "${levelLabel(level)}" 난이도 문제를 하나 만들어 주세요.`;
    } else {
      concept = String(input.concept ?? "");
      if (!settings.concepts.includes(concept)) return { ok: false, error: "선생님이 정한 개념 중에서 골라 주세요." };
      stuckText = `## 이 학생이 최근 작성 기록에서 자주 막힌 곳 (참고)\n${stuckBrief(points, input.subject)}`;
      request = `개념 "${concept}"을(를) 연습하는 "${levelLabel(level)}" 난이도 문제를 하나 만들어 주세요. 위의 막힌 곳이 이 개념과 관련 있으면 그 부분을 함께 연습하게 해 주세요.`;
    }
    const scopeText = [
      `과목: ${input.subject} (고등학교 파이썬)`,
      `쓸 수 있는 문법(선생님이 정한 범위): ${settings.concepts.join(", ") || "기본 문법"}`,
      settings.note ? `선생님 안내: ${settings.note}` : "",
    ]
      .filter(Boolean)
      .join("\n");
    const avoidTitles = await recentTitles(session.id, input.subject);

    let fix: { previous: unknown; problem: string } | undefined;
    let tokens = { input: 0, output: 0 };
    let model = "";
    for (let attempt = 0; attempt < MAX_TRIES; attempt++) {
      const reply = await makePractice({ scopeText, request, stuckText, avoidTitles, fix });
      tokens = { input: tokens.input + reply.inputTokens, output: tokens.output + reply.outputTokens };
      model = reply.model;
      const draft = toDraft(reply.raw);
      let problem: string | null;
      if (typeof draft === "string") problem = draft;
      else problem = await check(draft);
      if (!problem && typeof draft !== "string") {
        const saved = await insertPractice({
          userId: session.id,
          subject: input.subject,
          source: input.mode,
          concept,
          level,
          basis,
          draft,
          model,
          inputTokens: tokens.input,
          outputTokens: tokens.output,
        });
        return { ok: true, problem: saved, remaining: Math.max(0, limit - used - 1) };
      }
      console.warn("연습 문제 확인 실패:", problem);
      fix = { previous: reply.raw, problem: problem ?? "" };
    }
    return { ok: false, error: "AI가 확인을 통과하는 문제를 만들지 못했어요. 다시 한 번 눌러 주세요. (이번 것은 횟수에 세지 않아요)" };
  } catch (err) {
    if (err instanceof PracticeNotReadyError) return { ok: false, error: "선생님이 연습 모드를 준비하고 있어요." };
    if (err instanceof AiNotConfiguredError) return { ok: false, error: "선생님이 AI 기능을 준비하고 있어요." };
    if (err instanceof AiRefusedError) return { ok: false, error: "AI가 이 문제는 만들지 않았어요. 다른 것을 골라 주세요." };
    console.error("연습 문제 만들기 오류:", err);
    return { ok: false, error: "연습 문제를 만들지 못했어요. 잠시 후 다시 시도하세요." };
  }
}

/** 참고 답안과 시작 코드를 서버에서 돌려 확인한다 (문제가 없으면 null) */
async function check(draft: PracticeDraft): Promise<string | null> {
  try {
    const [solution, starter] = await runPythonTests(
      [draft.solution, draft.starterCode],
      draft.tests.map((t) => t.inputs),
    );
    return verifyDraft(draft, solution, starter);
  } catch (err) {
    return `참고 답안을 실행하지 못함: ${(err as Error).message}`;
  }
}

const MAX_CODE = 100_000;

/** 확인 버튼을 누를 때마다: 지금 코드·작성 기록·통과 수를 저장한다 (연습 과정도 재생할 수 있게) */
export async function savePracticeCheck(
  id: number,
  work: { code: string; init: string; log: unknown; passed: number },
): Promise<{ ok: true; solvedAt: string | null; checks: number } | { ok: false; error: string }> {
  const session = await getSession();
  if (!session || session.role !== "student") return { ok: false, error: "다시 로그인하세요." };
  const code = String(work.code ?? "");
  const init = String(work.init ?? "");
  if (code.length > MAX_CODE || init.length > MAX_CODE || !isValidLog(work.log)) {
    return { ok: false, error: "작성 기록을 저장하지 못했어요. 새로고침 후 다시 확인해 주세요." };
  }
  try {
    const problem = await getPractice(Number(id), session.id);
    if (!problem) return { ok: false, error: "연습 문제를 찾지 못했어요." };
    const total = problem.tests.length;
    const passed = Math.max(0, Math.min(total, Math.floor(Number(work.passed) || 0)));
    const saved = await savePracticeWork(problem.id, session.id, { code, init, log: work.log, passed, total });
    return saved ? { ok: true, ...saved } : { ok: false, error: "연습 문제를 찾지 못했어요." };
  } catch (err) {
    console.error("연습 기록 저장 오류:", err);
    return { ok: false, error: "기록을 저장하지 못했어요. 코드는 이 브라우저에 남아 있어요." };
  }
}

/** 내 연습 문제 하나 (저장된 코드·작성 기록 포함, 참고 답안은 빼고) */
export async function loadMyPractice(id: number): Promise<{ ok: true; problem: PracticeProblem } | { ok: false; error: string }> {
  const session = await getSession();
  if (!session || session.role !== "student") return { ok: false, error: "다시 로그인하세요." };
  try {
    const problem = await getPractice(Number(id), session.id);
    return problem ? { ok: true, problem: forStudent(problem) } : { ok: false, error: "연습 문제를 찾지 못했어요." };
  } catch (err) {
    console.error("연습 문제 조회 오류:", err);
    return { ok: false, error: "연습 문제를 불러오지 못했어요." };
  }
}

/** 이상한 연습 문제를 선생님께 알린다 (내 것만) */
export async function flagMyPractice(id: number): Promise<{ ok: boolean; error?: string }> {
  const session = await getSession();
  if (!session || session.role !== "student") return { ok: false, error: "다시 로그인하세요." };
  try {
    return (await setPracticeFlag(Number(id), "student", session.id)) ? { ok: true } : { ok: false, error: "찾지 못했어요." };
  } catch (err) {
    console.error("연습 문제 표시 오류:", err);
    return { ok: false, error: "알리지 못했어요. 잠시 후 다시 시도하세요." };
  }
}
