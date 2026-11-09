"use server";

import { AiNotConfiguredError, AiRefusedError, askHelper, makePractice, makeReview, makeReviewFollowUp } from "@/lib/ai";
import { dropUnknownRefs, leaksAnswer, MAX_QUESTION, momentsUsed, problemForAi, stripAnswerCode, validateQuestion, type AiChat } from "@/lib/aiChat";
import { MAX_REVIEW_ANSWER, MIN_QUESTIONS, toFollowUp, toReview, type AiReview, type FollowUp } from "@/lib/aiReview";
import { isValidLog } from "@/lib/editLog";
import { processSummaryText, stuckBrief, stuckPoints, summarizeProcess, type StuckPoint, type StuckSource } from "@/lib/process-summary";
import { DEFAULT_CONCEPTS, levelLabel, MAX_CONCEPTS_PER_PROBLEM, toDraft, verifyDraft, type PracticeDraft, type PracticeTest } from "@/lib/practice";
import { runPythonTests } from "@/lib/pyRunner";
import { validEntries } from "@/lib/replay";
import { getSession, grantTrial, hasTrial, openTrialProblem, sealTrialProblem } from "@/lib/session";
import { findTrialProblem, trialCodeMatches, trialLimit, TRIAL_SUBJECT } from "@/lib/trial";
import { isTrialVisible, recordTrialUsage, takeTrialTurn, trialRemaining } from "@/lib/trialStore";

/*
 * 🧪 체험 페이지(/try) 서버 기능. 로그인 없이 쓰므로:
 * - 진짜 AI는 체험 코드(TRY_ACCESS_CODE)를 넣은 브라우저만 (서명된 쿠키), 사이트 전체 하루 횟수(TRY_AI_DAILY_LIMIT) 안에서
 * - 체험 문제만, 작성 기록은 브라우저가 보낸 것으로 과정 요약을 만들어 AI에 보낸다 (CLAUDE.md 규칙 1)
 * - 대화·기록은 저장하지 않는다 (하루 횟수와 토큰 수만 app_status에)
 * - 안전 지침·정답 검사는 학생 기능과 같다
 */

const MAX_LOG_EVENTS = 50_000;
const MAX_CODE = 20_000;

export type TrialStatus = {
  /** 관리자가 체험 페이지를 열어 두었는지 */
  open: boolean;
  /** 숨겨져 있지만 관리자라서 미리 보는 중 */
  preview: boolean;
  enabled: boolean;
  unlocked: boolean;
  remaining: number;
  limit: number;
};

/** 체험 페이지를 볼 수 있는지: 관리자가 열어 두었거나, 관리자 계정으로 미리 보기 */
async function access(): Promise<{ open: boolean; preview: boolean }> {
  const [visible, session] = await Promise.all([isTrialVisible().catch(() => false), getSession()]);
  return { open: visible, preview: !visible && session?.role === "admin" };
}

/** 체험 AI를 쓸 수 있는지 (페이지가 열렸는지, 코드를 정했는지, 이 브라우저가 코드를 넣었는지, 오늘 남은 횟수) */
export async function trialStatus(): Promise<TrialStatus> {
  const { open, preview } = await access();
  if (!open && !preview) return { open, preview, enabled: false, unlocked: false, remaining: 0, limit: trialLimit() };
  const enabled = !!process.env.TRY_ACCESS_CODE?.trim() && !!process.env.ANTHROPIC_API_KEY;
  const unlocked = enabled && (await hasTrial());
  let remaining = 0;
  if (unlocked) {
    try {
      remaining = await trialRemaining();
    } catch (err) {
      console.error("체험 사용량 조회 오류:", err);
    }
  }
  return { open, preview, enabled, unlocked, remaining, limit: trialLimit() };
}

/** 체험 코드 넣기 */
export async function unlockTrial(code: string): Promise<{ ok: true; status: TrialStatus } | { ok: false; error: string }> {
  const a = await access();
  if (!a.open && !a.preview) return { ok: false, error: "지금은 체험 페이지가 열려 있지 않아요." };
  if (!process.env.TRY_ACCESS_CODE?.trim()) return { ok: false, error: "현재 체험용 AI는 사용하지 않도록 설정되어 있습니다." };
  if (!trialCodeMatches(code)) return { ok: false, error: "체험 코드가 맞지 않습니다. 접속 안내문의 코드를 다시 확인해 주세요." };
  await grantTrial();
  return { ok: true, status: await trialStatus() };
}

/** practiceToken: 체험 중에 만든 연습 문제 (문제·참고 답안을 서버가 암호화해 브라우저에 맡긴 것) */
type Rec = { problemId: string; init: string; log: unknown; code?: string; practiceToken?: string };

/** 공통 확인: 코드를 넣었는지, 체험 문제인지, 기록 모양이 맞는지 */
async function check(input: Rec): Promise<{ ok: true; problemText: string; solution: string } | { ok: false; error: string }> {
  const gate = await gateAi();
  if (gate) return { ok: false, error: gate };
  if (!isValidLog(input.log) || (input.log as unknown[]).length > MAX_LOG_EVENTS) return { ok: false, error: "작성 기록을 읽지 못했어요." };
  if (String(input.init ?? "").length > MAX_CODE || String(input.code ?? "").length > MAX_CODE) return { ok: false, error: "코드가 너무 길어요." };
  if (input.practiceToken) {
    // 체험 중에 만든 연습 문제: 참고 답안으로도 정답 알려 주기를 검사한다 (학생 연습 모드와 같음)
    const sealed = await openTrialProblem(input.practiceToken);
    if (!sealed) return { ok: false, error: "연습 문제가 만료됐어요(8시간). ⑤ 연습 문제에서 새로 만들어 주세요." };
    return { ok: true, problemText: sealed.problemText, solution: sealed.solution };
  }
  const problem = findTrialProblem(String(input.problemId));
  if (!problem) return { ok: false, error: "체험 문제를 찾지 못했어요." };
  return { ok: true, problemText: problemForAi(problem.view), solution: "" };
}

/** 체험 AI를 쓸 수 있는지 (페이지가 열렸고, 지금의 체험 코드를 넣었는지). 안 되면 이유 */
async function gateAi(): Promise<string | null> {
  const a = await access();
  if (!a.open && !a.preview) return "지금은 체험 페이지가 열려 있지 않아요.";
  if (!(await hasTrial())) return "체험 코드를 먼저 넣어 주세요.";
  return null;
}

/** 하루 횟수를 하나 쓴다 */
async function takeTurn(): Promise<string | null> {
  return (await takeTrialTurn()) ? null : `오늘 체험 AI ${trialLimit()}번을 모두 썼어요. 내일 다시 써 보거나 예시 기록을 둘러봐 주세요.`;
}

function aiError(err: unknown, what: string): string {
  if (err instanceof AiNotConfiguredError) return "지금은 체험 AI가 꺼져 있어요.";
  if (err instanceof AiRefusedError) return "AI가 이 내용에는 답하지 않았어요. 문제와 관련된 질문으로 다시 해 보세요.";
  console.error(`체험 ${what} 오류:`, err);
  return "AI가 답하지 못했어요. 잠시 후 다시 해 보세요.";
}

export type TrialAskResult = { ok: true; chat: AiChat; remaining: number } | { ok: false; error: string };

/** 체험 AI 도우미: 학생 도우미와 같은 방식 (과정 요약 + 질문, 정답 코드 검사) */
export async function trialAsk(input: Rec & { question: string; at: number; history: { question: string; answer: string }[] }): Promise<TrialAskResult> {
  const question = String(input.question ?? "").trim();
  const invalid = validateQuestion(question);
  if (invalid) return { ok: false, error: invalid };
  const ok = await check(input);
  if (!ok.ok) return ok;
  try {
    const limited = await takeTurn();
    if (limited) return { ok: false, error: limited };
    const at = Number.isFinite(input.at) ? Number(input.at) : Date.now();
    const summary = summarizeProcess(String(input.init ?? ""), input.log, at);
    const ownCode = `${summary.currentCode}\n${summary.lastSuccess?.code ?? ""}`;
    const history = (Array.isArray(input.history) ? input.history : [])
      .slice(-3)
      .map((h) => ({ question: String(h?.question ?? "").slice(0, MAX_QUESTION), answer: String(h?.answer ?? "").slice(0, 4000) }));
    const reply = await askHelper({
      problemText: ok.problemText,
      processText: processSummaryText(summary),
      history,
      question,
      leaks: (text) => leaksAnswer(text, ownCode, ok.solution),
    });
    await recordTrialUsage({ model: reply.model, inputTokens: reply.inputTokens, outputTokens: reply.outputTokens }).catch(() => {});
    const checked =
      reply.retried && leaksAnswer(reply.text, ownCode, ok.solution) ? stripAnswerCode(reply.text, ownCode, ok.solution) : reply.text;
    const answer = dropUnknownRefs(checked, summary.moments);
    const chat: AiChat = {
      id: at,
      userId: "",
      subject: TRIAL_SUBJECT,
      problem: String(input.problemId),
      at,
      question,
      answer,
      moments: momentsUsed(answer, summary.moments),
      flaggedBy: null,
      flagNote: null,
      createdAt: new Date().toISOString(),
      model: reply.model,
      inputTokens: reply.inputTokens,
      outputTokens: reply.outputTokens,
    };
    return { ok: true, chat, remaining: await trialRemaining().catch(() => 0) };
  } catch (err) {
    return { ok: false, error: aiError(err, "도우미") };
  }
}

export type TrialReviewResult = { ok: true; review: AiReview; remaining: number } | { ok: false; error: string };

/** 체험 AI 되돌아보기: 학생 되돌아보기와 같은 방식 (과정 요약 + 최종 코드 → 순간을 짚는 질문) */
export async function trialReview(input: Rec): Promise<TrialReviewResult> {
  const ok = await check(input);
  if (!ok.ok) return ok;
  if (validEntries(input.log).length < 2) return { ok: false, error: "먼저 코드를 쓰고 실행해 보세요." };
  try {
    const limited = await takeTurn();
    if (limited) return { ok: false, error: limited };
    const summary = summarizeProcess(String(input.init ?? ""), input.log);
    const draft = await makeReview({ problemText: ok.problemText, processText: processSummaryText(summary), finalCode: String(input.code ?? summary.currentCode) });
    await recordTrialUsage({ model: draft.model, inputTokens: draft.inputTokens, outputTokens: draft.outputTokens }).catch(() => {});
    const { intro, questions } = toReview(draft.raw, summary.moments);
    if (questions.length < MIN_QUESTIONS) return { ok: false, error: "AI가 질문을 만들지 못했어요. 잠시 후 다시 눌러 주세요." };
    const now = new Date().toISOString();
    return {
      ok: true,
      review: {
        id: 0,
        userId: "",
        submissionId: 0,
        subject: TRIAL_SUBJECT,
        problem: String(input.problemId),
        intro,
        questions,
        flaggedBy: null,
        createdAt: now,
        updatedAt: now,
        model: draft.model,
        inputTokens: draft.inputTokens,
        outputTokens: draft.outputTokens,
      },
      remaining: await trialRemaining().catch(() => 0),
    };
  } catch (err) {
    return { ok: false, error: aiError(err, "되돌아보기") };
  }
}

export type TrialFollowUpResult = { ok: true; followUp: FollowUp; remaining: number } | { ok: false; error: string };

/** 체험 이어 묻기: 질문·학생 답 + 같은 과정 요약 → 짧은 반응과 질문 하나 */
export async function trialFollowUp(input: Rec & { question: string; momentLabel: string | null; answer: string }): Promise<TrialFollowUpResult> {
  const answer = String(input.answer ?? "").trim();
  if (!answer) return { ok: false, error: "먼저 내 답을 적어 주세요." };
  if (answer.length > MAX_REVIEW_ANSWER) return { ok: false, error: "답은 1000자까지 쓸 수 있어요." };
  const ok = await check(input);
  if (!ok.ok) return ok;
  try {
    const limited = await takeTurn();
    if (limited) return { ok: false, error: limited };
    const summary = summarizeProcess(String(input.init ?? ""), input.log);
    const draft = await makeReviewFollowUp({
      problemText: ok.problemText,
      processText: processSummaryText(summary),
      question: String(input.question ?? "").slice(0, 600),
      momentLabel: input.momentLabel ? String(input.momentLabel).slice(0, 100) : null,
      answer,
    });
    await recordTrialUsage({ model: draft.model, inputTokens: draft.inputTokens, outputTokens: draft.outputTokens }).catch(() => {});
    const followUp = toFollowUp(draft.raw, summary.moments, String(input.code ?? summary.currentCode), {
      createdAt: new Date().toISOString(),
      model: draft.model,
      inputTokens: draft.inputTokens,
      outputTokens: draft.outputTokens,
    });
    if (!followUp) return { ok: false, error: "AI가 이어 묻지 못했어요. 잠시 후 다시 눌러 주세요." };
    return { ok: true, followUp, remaining: await trialRemaining().catch(() => 0) };
  } catch (err) {
    return { ok: false, error: aiError(err, "이어 묻기") };
  }
}

/* ───────── 체험 연습 문제 (학생 연습 모드와 같은 방식, 저장하지 않음) ───────── */

/** 체험하며 쓴 기록 (문제마다 하나, 브라우저 localStorage에서) */
export type TrialRecord = { problemId: string; title: string; init: string; log: unknown };

const MAX_RECORDS = 10;

function sources(records: TrialRecord[]): StuckSource[] {
  return (Array.isArray(records) ? records : [])
    .slice(0, MAX_RECORDS)
    .filter((r) => isValidLog(r?.log) && (r.log as unknown[]).length <= MAX_LOG_EVENTS && String(r.init ?? "").length <= MAX_CODE)
    .map((r, i) => ({ id: i + 1, subject: TRIAL_SUBJECT, problem: String(r.problemId).slice(0, 40), title: String(r.title ?? "").slice(0, 60), init: String(r.init ?? ""), log: r.log }));
}

/** 체험 기록에서 막혔던 곳 (AI 호출 없음, 횟수에 세지 않음) */
export async function trialStuck(records: TrialRecord[]): Promise<{ ok: true; points: StuckPoint[] } | { ok: false; error: string }> {
  const a = await access();
  if (!a.open && !a.preview) return { ok: false, error: "지금은 체험 페이지가 열려 있지 않아요." };
  return { ok: true, points: stuckPoints(sources(records)) };
}

export type TrialPractice = {
  /** 화면에 보일 문제 (참고 답안은 없음) */
  title: string;
  description: string;
  conditions: string[];
  starterCode: string;
  tests: PracticeTest[];
  concept: string;
  basis: string;
  level: number;
  /** 문제·참고 답안을 암호화한 것 (AI 도우미·되돌아보기 때 돌려보냄) */
  token: string;
};

const MAX_TRIES = 2;

/** 체험 연습 문제 만들기: 막힌 곳(체험 기록) 또는 개념을 근거로 AI가 만들고, 서버에서 참고 답안을 실제로 돌려 확인 */
export async function createTrialPractice(input: {
  mode: "stuck" | "concept";
  pointId?: string;
  concepts?: string[];
  level: number;
  records: TrialRecord[];
}): Promise<{ ok: true; practice: TrialPractice; remaining: number } | { ok: false; error: string }> {
  const gate = await gateAi();
  if (gate) return { ok: false, error: gate };
  const level = [1, 2, 3].includes(Number(input.level)) ? Number(input.level) : 2;
  const points = stuckPoints(sources(input.records));
  let concept: string;
  let basis = "";
  let stuckText: string;
  let request: string;
  if (input.mode === "stuck") {
    const point = points.find((p) => p.id === input.pointId);
    if (!point) return { ok: false, error: "그 막힌 곳을 찾지 못했어요. 다시 골라 주세요." };
    concept = point.concept;
    basis = `${point.label} · ${point.evidence}`;
    stuckText = point.text;
    request = `위의 막힌 곳을 다시 연습할 수 있는 "${levelLabel(level)}" 난이도 문제를 하나 만들어 주세요.`;
  } else {
    const picked = [...new Set((Array.isArray(input.concepts) ? input.concepts : []).map(String))];
    if (!picked.length || picked.length > MAX_CONCEPTS_PER_PROBLEM || picked.some((c) => !DEFAULT_CONCEPTS.includes(c))) {
      return { ok: false, error: `개념을 ${MAX_CONCEPTS_PER_PROBLEM}개까지 골라 주세요.` };
    }
    concept = picked.join(" + ");
    stuckText = `## 이 학생이 최근 작성 기록에서 자주 막힌 곳 (참고)\n${stuckBrief(points, TRIAL_SUBJECT)}`;
    request =
      picked.length === 1
        ? `개념 "${picked[0]}"을(를) 연습하는 "${levelLabel(level)}" 난이도 문제를 하나 만들어 주세요.`
        : `개념 ${picked.map((c) => `"${c}"`).join(", ")}을(를) 모두 함께 써야 풀리는 "${levelLabel(level)}" 난이도 문제를 하나 만들어 주세요.`;
  }
  const scopeText = `과목: 고등학교 파이썬 (체험)\n쓸 수 있는 문법: ${DEFAULT_CONCEPTS.join(", ")}`;
  try {
    const limited = await takeTurn();
    if (limited) return { ok: false, error: limited };
    let fix: { previous: unknown; problem: string } | undefined;
    for (let attempt = 0; attempt < MAX_TRIES; attempt++) {
      const reply = await makePractice({ scopeText, request, stuckText, avoidTitles: [], fix });
      await recordTrialUsage({ model: reply.model, inputTokens: reply.inputTokens, outputTokens: reply.outputTokens }).catch(() => {});
      const draft = toDraft(reply.raw);
      const problem = typeof draft === "string" ? draft : await verify(draft);
      if (!problem && typeof draft !== "string") {
        const view = { title: draft.title, description: draft.description, conditions: draft.conditions, starterCode: draft.starterCode, tests: draft.tests };
        const problemText = problemForAi({
          number: "연습",
          title: draft.title,
          description: draft.description,
          conditions: draft.conditions.join("\n"),
          examples: draft.tests.map((t) => ({ input: t.inputs.join("\n"), output: t.output })),
          goal: "",
        });
        const token = await sealTrialProblem({ title: draft.title, problemText, solution: draft.solution });
        return { ok: true, practice: { ...view, concept, basis, level, token }, remaining: await trialRemaining().catch(() => 0) };
      }
      console.warn("체험 연습 문제 확인 실패:", problem);
      fix = { previous: reply.raw, problem: problem ?? "" };
    }
    return { ok: false, error: "AI가 확인을 통과하는 문제를 만들지 못했어요. 다시 한 번 눌러 주세요." };
  } catch (err) {
    return { ok: false, error: aiError(err, "연습 문제") };
  }
}

/** 참고 답안과 시작 코드를 서버에서 돌려 확인 (학생 연습 모드와 같음) */
async function verify(draft: PracticeDraft): Promise<string | null> {
  try {
    const [solution, starter] = await runPythonTests([draft.solution, draft.starterCode], draft.tests.map((t) => t.inputs));
    return verifyDraft(draft, solution, starter);
  } catch (err) {
    return `참고 답안을 실행하지 못함: ${(err as Error).message}`;
  }
}
