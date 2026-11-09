"use server";

import { AiNotConfiguredError, AiRefusedError, askHelper, makeReview, makeReviewFollowUp } from "@/lib/ai";
import { dropUnknownRefs, leaksAnswer, MAX_QUESTION, momentsUsed, problemForAi, stripAnswerCode, validateQuestion, type AiChat } from "@/lib/aiChat";
import { MAX_REVIEW_ANSWER, MIN_QUESTIONS, toFollowUp, toReview, type AiReview, type FollowUp } from "@/lib/aiReview";
import { isValidLog } from "@/lib/editLog";
import { processSummaryText, summarizeProcess } from "@/lib/process-summary";
import { validEntries } from "@/lib/replay";
import { getSession, grantTrial, hasTrial } from "@/lib/session";
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

type Rec = { problemId: string; init: string; log: unknown; code?: string };

/** 공통 확인: 코드를 넣었는지, 체험 문제인지, 기록 모양이 맞는지 */
async function check(input: Rec): Promise<{ ok: true; problemText: string } | { ok: false; error: string }> {
  const a = await access();
  if (!a.open && !a.preview) return { ok: false, error: "지금은 체험 페이지가 열려 있지 않아요." };
  if (!(await hasTrial())) return { ok: false, error: "체험 코드를 먼저 넣어 주세요." };
  const problem = findTrialProblem(String(input.problemId));
  if (!problem) return { ok: false, error: "체험 문제를 찾지 못했어요." };
  if (!isValidLog(input.log) || (input.log as unknown[]).length > MAX_LOG_EVENTS) return { ok: false, error: "작성 기록을 읽지 못했어요." };
  if (String(input.init ?? "").length > MAX_CODE || String(input.code ?? "").length > MAX_CODE) return { ok: false, error: "코드가 너무 길어요." };
  return { ok: true, problemText: problemForAi(problem.view) };
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
      leaks: (text) => leaksAnswer(text, ownCode),
    });
    await recordTrialUsage({ model: reply.model, inputTokens: reply.inputTokens, outputTokens: reply.outputTokens }).catch(() => {});
    const checked = reply.retried && leaksAnswer(reply.text, ownCode) ? stripAnswerCode(reply.text, ownCode) : reply.text;
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
