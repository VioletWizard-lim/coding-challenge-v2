"use client";

import AiHelperButton from "@/components/AiHelperButton";
import { useEffect, useRef, useState } from "react";
import ProblemView from "@/components/ProblemView";
import RecordingEditor, { type RecorderHandle } from "@/components/RecordingEditor";
import Replayer from "@/components/Replayer";
import { Outcomes, runTests } from "@/components/TestOutcomes";
import type { AiChat } from "@/lib/aiChat";
import type { AiReview } from "@/lib/aiReview";
import type { Recording } from "@/lib/editLog";
import type { HelpChat } from "@/lib/helpTrail";
import { asProblem, DEFAULT_CONCEPTS, errorName, judge, LEVELS, levelLabel, MAX_CONCEPTS_PER_PROBLEM, type TestOutcome } from "@/lib/practice";
import type { StuckPoint } from "@/lib/process-summary";
import {
  SAMPLE_CHAT,
  SAMPLE_PROBLEM_ID,
  SAMPLE_RECORDING,
  sampleChats,
  sampleMoments,
  sampleReview,
  TRIAL_PROBLEMS,
  TRIAL_SUBJECT,
  trialStorageKey,
  type TrialProblem,
} from "@/lib/trial";
import AiHelper, { type HelperBackend } from "../student/AiHelper";
import ReviewPanel, { type ReviewBackend } from "../student/ReviewPanel";
import {
  createTrialPractice,
  trialAsk,
  trialFollowUp,
  trialReview,
  trialStatus,
  trialStuck,
  unlockTrial,
  type TrialPractice,
  type TrialRecord,
  type TrialStatus,
} from "./actions";

type Step = "intro" | "sample" | "write" | "replay" | "practice" | "reflect";
/** 체험 순서 (왼쪽 메뉴, 위에서 아래로 차례대로) */
const STEPS: [Step, string, string][] = [
  ["intro", "① 시작하기", "이 사이트가 무엇인지, 체험 AI를 쓰는 방법"],
  ["sample", "② 예시 학생의 기록", "실제 학생 기록처럼 만든 예시로 재생·AI 도움·되돌아보기를 먼저 봐요."],
  ["write", "③ 코드 쓰기", "편집기가 입력·붙여넣기·실행을 기록해요. 막히면 AI 도우미에게 물어봐요."],
  ["replay", "④ 재생하며 되돌아보기", "내가 쓴 과정을 다시 보고, AI가 그 과정의 순간을 짚어 질문해요."],
  ["practice", "⑤ 연습 문제", "내가 막혔던 곳(작성 기록)이나 고른 개념으로 AI가 나에게 맞는 연습 문제를 만들어요."],
  ["reflect", "⑥ 오늘의 성찰", "수업을 마치며 오늘을 글로 정리해요."],
];

/** 이 브라우저에 남아 있는 체험 문제의 작성 기록 (④에서 다른 문제의 과정을 볼 때) */
function savedRecording(problemId: string): Recording | null {
  try {
    const saved = JSON.parse(localStorage.getItem(trialStorageKey(problemId)) ?? "null");
    if (saved && Array.isArray(saved.log) && typeof saved.code === "string") return { init: String(saved.init ?? ""), log: saved.log, code: saved.code };
  } catch {}
  return null;
}

/** 코드를 쓰거나 실행한 기록이 있는지 (창 이탈·복귀만 있으면 재생할 것이 없음) */
const hasWork = (rec: Recording | null) =>
  !!rec && Array.isArray(rec.log) && (rec.log as unknown[]).some((e) => Array.isArray(e) && (e.length >= 3 || String(e[1]).startsWith("r:")));

/** 체험 중에 만든 연습 문제 (이 브라우저에만, 참고 답안은 서버가 암호화한 token 안에) */
type Practice = TrialPractice & { id: string; n: number };
const PRACTICE_KEY = "try_practices";

function loadPractices(): Practice[] {
  try {
    const list = JSON.parse(localStorage.getItem(PRACTICE_KEY) ?? "[]");
    return Array.isArray(list) ? list.filter((p) => p && typeof p.id === "string" && typeof p.token === "string") : [];
  } catch {
    return [];
  }
}

/** 연습 문제를 ③·④에서 체험 문제처럼 쓰는 모양으로 */
function practiceAsProblem(p: Practice): TrialProblem & { token: string } {
  const view = { ...asProblem({ ...p, subject: TRIAL_SUBJECT }), number: `연습 ${p.n}` };
  return { id: p.id, view, tests: p.tests, token: p.token };
}

const toHelp = (c: AiChat): HelpChat => ({ at: c.at ?? 0, question: c.question, answer: c.answer, moments: c.moments });

/**
 * 🧪 체험 페이지 본문. 실제 학생 화면의 부품(기록 편집기, 재생기, AI 도우미, AI 되돌아보기)을 그대로 쓰고,
 * 서버에는 저장하지 않는다(작성 기록은 이 브라우저에만). 진짜 AI는 체험 코드를 넣은 뒤에.
 */
export default function TryClient() {
  const [status, setStatus] = useState<TrialStatus | null>(null);
  const [step, setStep] = useState<Step>("intro");
  const [visited, setVisited] = useState<Set<Step>>(new Set(["intro"]));
  const [problemId, setProblemId] = useState(TRIAL_PROBLEMS[0].id);
  const [resetKey, setResetKey] = useState(0);
  const recorder = useRef<RecorderHandle>(null);
  const [rec, setRec] = useState<Recording | null>(null);
  const [chats, setChats] = useState<Record<string, AiChat[]>>({});
  const [reviews, setReviews] = useState<Record<string, AiReview | null>>({});
  const [outcomes, setOutcomes] = useState<TestOutcome[] | null>(null);
  const [checking, setChecking] = useState(false);
  // 체험에서는 핵심 기능인 AI 도우미 창을 처음부터 열어 둔다 (닫으면 큰 버튼으로 다시 열기)
  const [aiOpen, setAiOpen] = useState(true);
  const [note, setNote] = useState<string | null>(null);

  const [practices, setPractices] = useState<Practice[]>([]);
  useEffect(() => {
    setPractices(loadPractices()); // eslint-disable-line react-hooks/set-state-in-effect -- 브라우저에 남은 연습 문제를 처음 한 번 읽어 옴
  }, []);
  const addPractice = (p: TrialPractice) => {
    const next: Practice = { ...p, id: `P${Date.now()}`, n: practices.length + 1 };
    const list = [...practices, next];
    setPractices(list);
    try {
      localStorage.setItem(PRACTICE_KEY, JSON.stringify(list));
    } catch {}
    return next.id;
  };
  const allProblems: (TrialProblem & { token?: string })[] = [...TRIAL_PROBLEMS, ...practices.map(practiceAsProblem)];
  const problem = allProblems.find((p) => p.id === problemId) ?? allProblems[0];
  const problemName = (p: TrialProblem & { token?: string }) => `${p.token ? "🧪" : "체험"} ${p.view.number}. ${p.view.title}`;
  /** 연습 문제면 서버가 문제·참고 답안을 알 수 있게 token을 함께 보낸다 */
  const practiceToken = problem.token;
  /** ⑤에서 막힌 곳을 찾을 때 보내는 체험 기록 (코드를 쓴 문제만) */
  const myRecords = (): TrialRecord[] =>
    allProblems.flatMap((p) => {
      const r = savedRecording(p.id);
      return r && hasWork(r) ? [{ problemId: p.id, title: p.view.title, init: r.init, log: r.log }] : [];
    });
  const unlocked = !!status?.unlocked;

  useEffect(() => {
    trialStatus().then(setStatus);
  }, []);

  function go(next: Step) {
    // 재생·되돌아보기는 지금까지의 기록으로
    const r = recorder.current?.getRecording();
    if (r) setRec(r);
    setStep(next);
    setVisited((v) => new Set(v).add(next));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function pickProblem(id: string) {
    setProblemId(id);
    setOutcomes(null);
    setNote(null);
    setRec(null);
  }

  function startOver() {
    if (!confirm("이 문제의 체험 기록을 지우고 처음부터 쓸까요?")) return;
    try {
      localStorage.removeItem(trialStorageKey(problemId));
    } catch {}
    setChats((c) => ({ ...c, [problemId]: [] }));
    setReviews((r) => ({ ...r, [problemId]: null }));
    setOutcomes(null);
    setRec(null);
    setResetKey((k) => k + 1);
  }

  async function runChecks() {
    const r = recorder.current?.getRecording();
    if (!r) return;
    if (!r.code.trim()) return setNote("코드를 먼저 써 주세요.");
    setChecking(true);
    setNote(null);
    try {
      const judged = judge(problem.tests, await runTests(r.code, problem.tests));
      setOutcomes(judged);
      const firstError = judged.find((o) => o.error)?.error;
      // 확인도 실행이다: 작성 기록에 실행 결과로 남긴다 (재생 타임라인·과정 요약에 보임)
      recorder.current?.addMark(firstError ? `r:${errorName(firstError)}` : "r:ok");
    } catch (err) {
      setNote(String((err as Error)?.message ?? err));
    } finally {
      setChecking(false);
    }
  }

  /** 체험 문제 1·2·3 버튼 (③ 코드 쓰기, ④ 재생하며 되돌아보기에서 함께 씀) */
  const problemButtons = (onPick: (id: string) => void) =>
    allProblems.map((p) => (
      <button
        key={p.id}
        type="button"
        onClick={() => onPick(p.id)}
        aria-pressed={p.id === problemId}
        className={`rounded-lg border px-3 py-1.5 text-sm ${p.id === problemId ? "border-brand bg-brand-soft font-bold text-brand" : "border-line bg-white"}`}
      >
        {p.token ? "🧪 " : "체험 "}
        {p.view.number}. {p.view.title}
      </button>
    ));
  /** ④에서 다른 문제를 고르면: 그 문제를 고르고(③ 편집기도 그 문제로), 이 브라우저에 남은 그 문제의 기록으로 재생 */
  const replayProblem = (id: string) => {
    pickProblem(id);
    setRec(savedRecording(id));
  };

  const remainingNote = (remaining: number) => setStatus((s) => (s ? { ...s, remaining } : s));

  const helper: HelperBackend = {
    load: async () =>
      unlocked
        ? { ok: true, chats: chats[problemId] ?? [], remaining: status?.remaining ?? 0, limit: status?.limit ?? 0 }
        : {
            ok: false,
            error: status?.enabled
              ? "① 시작하기에서 체험 코드를 넣으면 진짜 AI 도우미를 써 볼 수 있어요."
              : "지금은 체험 AI가 꺼져 있어요. AI 도우미가 어떻게 돕는지는 ② 예시 학생의 기록에서 볼 수 있어요.",
          },
    ask: async (x) => {
      const r = await trialAsk({ problemId, practiceToken, ...x, history: (chats[problemId] ?? []).map((c) => ({ question: c.question, answer: c.answer })) });
      if (r.ok) {
        setChats((all) => ({ ...all, [problemId]: [...(all[problemId] ?? []), r.chat] }));
        remainingNote(r.remaining);
      }
      return r;
    },
    note: (
      <>
        AI는 <b>내가 코드를 써 온 과정</b>(실행에 성공한 순간, 반복된 오류, 오래 멈춘 곳)을 보고 힌트를 줘요. 정답 코드는 알려 주지 않아요. 파란
        버튼을 누르면 그 순간의 재생을 볼 수 있어요. 체험에서는 대화를 저장하지 않아요.
      </>
    ),
    remainingLabel: "오늘 남은 체험 AI",
  };

  const review = reviews[problemId] ?? null;
  const setReview = (r: AiReview) => setReviews((all) => ({ ...all, [problemId]: r }));
  const reviewBackend: ReviewBackend = {
    start: async () => {
      if (!rec) return { ok: false, error: "먼저 코드를 써 주세요." };
      const r = await trialReview({ problemId, practiceToken, init: rec.init, log: rec.log, code: rec.code });
      if (!r.ok) return r;
      setReview(r.review);
      remainingNote(r.remaining);
      return { ok: true, review: r.review };
    },
    save: async (answers, follows) => {
      const cur = reviews[problemId];
      if (!cur) return { ok: false, error: "되돌아보기를 먼저 받아 주세요." };
      const next = {
        ...cur,
        questions: cur.questions.map((q, i) => ({
          ...q,
          answer: answers[i] ?? "",
          followUp: q.followUp ? { ...q.followUp, answer: follows[i] ?? "" } : null,
        })),
      };
      setReview(next);
      return { ok: true, review: next };
    },
    followUp: async (i) => {
      const cur = reviews[problemId];
      const q = cur?.questions[i];
      if (!cur || !q || !rec) return { ok: false, error: "되돌아보기를 먼저 받아 주세요." };
      const r = await trialFollowUp({
        problemId,
        practiceToken,
        init: rec.init,
        log: rec.log,
        code: rec.code,
        question: q.question,
        momentLabel: q.moment ? `${q.moment.id} ${q.moment.label}` : null,
        answer: q.answer,
      });
      if (!r.ok) return r;
      const next = { ...cur, questions: cur.questions.map((x, k) => (k === i ? { ...x, followUp: r.followUp } : x)) };
      setReview(next);
      remainingNote(r.remaining);
      return { ok: true, review: next };
    },
    savedText: "✅ 적어 두었어요. (체험에서는 이 화면에만 있고, 실제 수업에서는 저장되어 선생님도 봐요)",
  };

  if (!status) return <p className="text-muted">불러오는 중…</p>;
  if (!status.open && !status.preview) {
    return (
      <section className="flex flex-col gap-2 rounded-2xl border border-line bg-white p-6 text-center">
        <h1 className="text-xl font-black">🧪 체험 페이지</h1>
        <p className="text-muted">지금은 체험 페이지가 열려 있지 않아요. 계정이 있으면 첫 화면에서 로그인해 주세요.</p>
      </section>
    );
  }

  const at = STEPS.findIndex(([id]) => id === step);
  const [, stepLabel, stepNote] = STEPS[at];
  const aiNote = !status.enabled
    ? "체험 AI 꺼짐 (예시로 보기)"
    : unlocked
      ? `🔑 체험 AI 켜짐 · 오늘 ${status.remaining}/${status.limit}`
      : "🔑 체험 코드를 넣으면 AI 사용";

  return (
    <div className="flex flex-col gap-4 md:flex-row md:items-start">
      {/* 왼쪽: 체험 순서 (좁은 화면에서는 위쪽 가로 메뉴) */}
      <nav
        aria-label="체험 순서"
        className="flex gap-1 overflow-x-auto rounded-xl border border-line bg-white p-2 md:sticky md:top-4 md:w-60 md:shrink-0 md:flex-col md:overflow-visible md:p-3"
      >
        {STEPS.map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => go(id)}
            aria-current={step === id ? "step" : undefined}
            className={`flex shrink-0 items-center gap-2 rounded-lg px-4 py-2.5 text-left whitespace-nowrap md:w-full ${
              step === id ? "bg-brand-soft font-bold text-brand" : "text-muted hover:bg-page hover:text-ink"
            }`}
          >
            {label}
            {visited.has(id) && step !== id && <span className="ml-auto text-xs text-green-700">✓</span>}
          </button>
        ))}
        <button
          type="button"
          onClick={() => go("intro")}
          className="hidden border-t border-line px-2 pt-3 text-left text-xs leading-5 text-muted hover:text-ink md:mt-2 md:block"
        >
          {aiNote}
        </button>
      </nav>

      <div className="flex min-w-0 flex-1 flex-col gap-5">
        {status.preview && (
          <p className="rounded-lg bg-amber-50 px-4 py-2 text-sm text-amber-900">
            👀 <b>관리자 미리 보기</b>: 지금 체험 페이지는 <b>숨김</b> 상태라 다른 사람에게는 보이지 않아요. 🛠 관리자 페이지에서 보이게 할 수 있어요.
          </p>
        )}
        <div>
          <h1 className="text-2xl font-black">{stepLabel}</h1>
          <p className="text-sm text-muted">{stepNote}</p>
        </div>

        {step === "intro" && (
          <section className="flex flex-col gap-2 rounded-2xl border border-line bg-white p-5">
            <h2 className="text-xl font-black">🧪 로그인 없이 체험해 보기</h2>
            <p className="leading-7 text-muted">
              이 사이트는 <b className="text-ink">결과가 아니라 코드를 써 온 과정</b>을 기록하고, 그 과정을 다시 보며 AI와 함께 되돌아보는 수업
              도구예요. 실제 학생 화면과 같은 편집기·재생기·AI를 쓰지만, 체험한 내용은 <b className="text-ink">서버에 저장하지 않아요</b>(이
              브라우저에만 남아요).
            </p>
            <ul className="flex flex-col gap-1 text-sm leading-6 text-muted">
            <li>
              ② <b className="text-ink">예시 학생의 기록</b>으로 재생·AI 도움·되돌아보기가 어떻게 보이는지 먼저 봐요.
            </li>
            <li>
              ③ <b className="text-ink">코드 쓰기</b>에서 체험 문제를 직접 풀어요. 막히면 AI 도우미에게 물어봐요.
            </li>
            <li>
              ④ <b className="text-ink">재생하며 되돌아보기</b>에서 내 과정을 다시 보고 AI 질문에 답해요.
            </li>
            <li>
              ⑤ <b className="text-ink">연습 문제</b>: 내가 막혔던 곳이나 고른 개념으로 AI가 새 문제를 만들어 줘요.
            </li>
            <li>
              ⑥ <b className="text-ink">오늘의 성찰</b>을 써요.
            </li>
          </ul>
            <TrialGate status={status} onStatus={setStatus} />
          </section>
        )}

        {step === "sample" && <SampleRecord />}

        {/* ① 코드 쓰기: 단계를 오가도 편집기가 사라지지 않게 숨기기만 한다 */}
        <section className={step === "write" ? "flex flex-col gap-4" : "hidden"}>
          <div className="flex flex-wrap gap-2">
            {problemButtons(pickProblem)}
          </div>
          <div
            className={`grid gap-5 lg:grid-cols-[minmax(280px,2fr)_3fr] ${aiOpen ? "xl:grid-cols-[minmax(240px,1.4fr)_2.4fr_minmax(300px,1.6fr)]" : ""}`}
          >
            <aside className="flex flex-col gap-3 rounded-xl border border-line bg-white p-5 lg:self-start">
              <ProblemView problem={problem.view} />
            </aside>
            <div className="flex min-w-0 flex-col gap-4">
              {!aiOpen && <AiHelperButton onOpen={() => setAiOpen(true)} />}
              <RecordingEditor key={`${problemId}:${resetKey}`} ref={recorder} storageKey={trialStorageKey(problemId)} initialCode={problem.view.starterCode} />
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={runChecks}
                  disabled={checking}
                  className="rounded-xl bg-gradient-to-br from-brand to-violet-600 px-6 py-2.5 font-bold text-white disabled:opacity-60"
                >
                  {checking ? "확인하는 중…" : "✅ 예시로 확인하기"}
                </button>
                <button type="button" onClick={startOver} className="ml-auto text-sm text-muted hover:text-danger">
                  처음부터 다시 쓰기
                </button>
              </div>
              {note && (
                <p role="alert" className="text-sm text-danger">
                  {note}
                </p>
              )}
              {outcomes && <Outcomes tests={problem.tests} outcomes={outcomes} />}
            </div>
            {aiOpen && (
              <div className="min-w-0 lg:col-span-2 xl:col-span-1">
                <AiHelper
                  key={`${problemId}:${unlocked}:${resetKey}`}
                  subject={TRIAL_SUBJECT}
                  problem={problemId}
                  recorder={recorder}
                  backend={helper}
                  onClose={() => setAiOpen(false)}
                />
              </div>
            )}
          </div>
        </section>

        {step === "replay" && (
          <section className="flex flex-col gap-3 rounded-xl border border-line bg-white p-5">
            <div className="flex flex-wrap gap-2">{problemButtons(replayProblem)}</div>
            <h2 className="text-lg font-bold">
              ▶ 내 작성 과정 — {problemName(problem)}
            </h2>
            {rec && hasWork(rec) ? (
              <Replayer
                key={`${problemId}:${(rec.log as unknown[]).length}`}
                init={rec.init}
                code={rec.code}
                log={rec.log}
                chats={(chats[problemId] ?? []).map(toHelp)}
                extra={(seek) => (
                  <ReviewPanel
                    key={`${problemId}:${unlocked}:${review ? "r" : "-"}`}
                    submissionId={0}
                    role="student"
                    ready
                    initial={review}
                    seek={seek}
                    backend={reviewBackend}
                  />
                )}
              />
            ) : (
              <p className="text-muted">
                이 문제는 아직 쓴 코드가 없어요.{" "}
                <button type="button" onClick={() => go("write")} className="font-bold text-brand underline">
                  ③ 코드 쓰기
                </button>
                에서 코드를 써 보세요. 예시는 ② 예시 학생의 기록에서 볼 수 있어요.
              </p>
            )}
            {!unlocked && rec && status?.enabled && (
              <p className="text-sm text-muted">AI 되돌아보기를 받으려면 ① 시작하기에서 체험 코드를 넣어 주세요. 재생은 코드 없이도 볼 수 있어요.</p>
            )}
          </section>
        )}

        {step === "practice" && (
          <TrialPracticeStep
            enabled={!!status.enabled}
            unlocked={unlocked}
            records={myRecords}
            practices={practices}
            onRemaining={remainingNote}
            onCreated={(p) => {
              const id = addPractice(p);
              pickProblem(id);
              go("write");
            }}
            onOpen={(id) => {
              pickProblem(id);
              go("write");
            }}
          />
        )}

        {step === "reflect" && <TrialReflection problemLabel={problemName(problem)} />}

        {/* 순서대로: 이전 / 다음 */}
        <div className="flex items-center gap-3 border-t border-line pt-4">
          {at > 0 && (
            <button
              type="button"
              onClick={() => go(STEPS[at - 1][0])}
              className="rounded-lg border border-line bg-white px-4 py-2 text-sm hover:bg-page"
            >
              ← {STEPS[at - 1][1]}
            </button>
          )}
          {at < STEPS.length - 1 && (
            <button
              type="button"
              onClick={() => go(STEPS[at + 1][0])}
              className="ml-auto rounded-lg bg-brand px-4 py-2 text-sm font-bold text-white hover:bg-brand-dark"
            >
              다음: {STEPS[at + 1][1]} →
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/** 체험 코드 칸 / 남은 횟수 */
function TrialGate({ status, onStatus }: { status: TrialStatus | null; onStatus: (s: TrialStatus) => void }) {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  if (!status) return null;

  // 심사위원·방문자가 보는 안내 (받으신 접속 안내문을 따라가는 말투)
  const notice = (tone: string, body: React.ReactNode) => (
    <div className={`flex flex-col gap-2 rounded-xl border px-4 py-3 text-sm leading-6 ${tone}`}>
      <p className="font-bold">📋 체험 안내</p>
      {body}
    </div>
  );
  // 관리자 미리 보기에서만 보이는 설정 안내 (심사위원에게는 안 보임)
  const adminNote = status.preview && (
    <div className="rounded-xl border border-dashed border-line bg-white px-4 py-3 text-xs leading-5 text-muted">
      🛠 <b>관리자에게만 보여요</b> · 체험 코드는 선생님이 정하는 값이에요. Vercel → Settings → Environment Variables에 <code>TRY_ACCESS_CODE</code>를
      넣고 다시 배포(Redeploy)하면 위에 코드 입력 칸이 생겨요. 그 코드를 심사위원 접속 안내문에 적어 주세요.
    </div>
  );

  if (!status.enabled) {
    return (
      <>
        {notice(
          "border-amber-200 bg-amber-50 text-amber-950",
          <p>
            현재 체험용 AI는 사용하지 않도록 설정되어 있습니다. <b>코드 쓰기와 과정 재생</b>은 그대로 체험하실 수 있으며, AI 도우미와 AI 되돌아보기는{" "}
            <b>② 예시 학생의 기록</b>에서 실제 화면과 같은 모습으로 보실 수 있습니다.
          </p>,
        )}
        {adminNote}
      </>
    );
  }
  if (status.unlocked) {
    return notice(
      "border-green-200 bg-green-50 text-green-950",
      <p>
        ✅ 체험 코드가 확인되었습니다. <b>③ 코드 쓰기</b>에서 AI 도우미에게 질문하시고, <b>④ 재생하며 되돌아보기</b>에서 AI 되돌아보기를 받아 보실 수
        있습니다. (오늘 남은 체험 AI 사용 횟수: {status.remaining}/{status.limit})
      </p>,
    );
  }
  return (
    <>
      {notice(
        "border-blue-200 bg-blue-50 text-blue-950",
        <>
          <p>
            보내 드린 <b>접속 안내문에 적힌 체험 코드</b>를 입력하시면, 학생들이 실제로 쓰는 <b>AI 도우미</b>와 <b>AI 되돌아보기</b>를 직접 써 보실 수
            있습니다. 체험 코드 없이도 코드 쓰기·과정 재생과 예시 학생의 기록은 모두 보실 수 있습니다.
          </p>
          <form
            className="flex flex-wrap items-center gap-2"
            onSubmit={async (e) => {
              e.preventDefault();
              setPending(true);
              const r = await unlockTrial(code);
              setPending(false);
              if (!r.ok) return setError(r.error);
              setError(null);
              onStatus(r.status);
            }}
          >
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              aria-label="체험 코드"
              placeholder="체험 코드 입력"
              className="w-44 rounded-lg border border-line bg-white px-3 py-1.5"
            />
            <button
              type="submit"
              disabled={pending || !code.trim()}
              className="rounded-lg bg-blue-600 px-3 py-1.5 font-bold text-white disabled:opacity-50"
            >
              {pending ? "확인 중…" : "확인"}
            </button>
            {error && <span className="text-danger">{error}</span>}
          </form>
        </>,
      )}
      {adminNote}
    </>
  );
}

/** 예시 학생의 기록: 실제로 남는 기록 그대로 재생 + AI 도움 + AI 되돌아보기(예시 답까지) */
function SampleRecord() {
  const chats = sampleChats();
  const review = sampleReview();
  const p = TRIAL_PROBLEMS.find((x) => x.id === SAMPLE_PROBLEM_ID)!;
  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-violet-200 bg-violet-50/40 p-5">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-lg font-bold">👀 예시 학생의 기록</h2>
        <span className="text-sm text-muted">
          체험 {p.view.number}. {p.view.title} — TypeError가 두 번 나고, 멈췄다가, AI에게 묻고, 스스로 고친 과정
        </span>
      </div>
      <p className="text-sm leading-6 text-muted">
        재생 막대 아래의 점(실행 성공·오류, ? 도움 요청)을 누르거나 ▶ 재생을 눌러 보세요. AI 답과 되돌아보기의 파란 순간 버튼(⏪)을 누르면 그 시점으로
        이동해요. 예시의 AI 답(&ldquo;{SAMPLE_CHAT.question}&rdquo;)과 되돌아보기는 실제 AI 화면과 같은 모양으로 <b>미리 써 둔 예시</b>예요. 진짜 AI는
        ① 시작하기에서 체험 코드를 넣은 뒤 ③ 코드 쓰기에서 써 볼 수 있어요.
      </p>
      <div className="rounded-xl border border-line bg-white p-4">
        <Replayer
          init={SAMPLE_RECORDING.init}
          code={SAMPLE_RECORDING.code}
          log={SAMPLE_RECORDING.log}
          chats={chats}
          startAt={sampleMoments().at(-1)?.at}
          extra={(seek) => (
            <ReviewPanel
              submissionId={0}
              role="teacher"
              ready
              initial={review}
              seek={seek}
              backend={{
                start: async () => ({ ok: true, review }),
                save: async () => ({ ok: true, review }),
                followUp: async () => ({ ok: true, review }),
              }}
            />
          )}
        />
      </div>
    </section>
  );
}

/** 오늘의 성찰 (실제 수업과 같은 칸, 체험에서는 저장하지 않음) */
function TrialReflection({ problemLabel }: { problemLabel: string }) {
  const [done, setDone] = useState(false);
  const field = "w-full rounded-lg border border-line bg-white px-3 py-2 outline-none focus:border-brand focus:ring-2 focus:ring-brand/15";
  return (
    <section className="flex flex-col gap-4 rounded-xl border border-line bg-white p-5">
      <h2 className="text-lg font-bold">💭 오늘의 성찰</h2>
      <label className="flex flex-col gap-1.5">
        <span className="font-bold">1. 오늘 가장 어려웠던 문제와 이유</span>
        <span className="text-sm text-muted">{problemLabel}</span>
        <textarea rows={2} className={field} placeholder="예: 나이에 1을 더하는 부분에서 TypeError가 계속 나서 헷갈렸어요." />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="font-bold">2. AI에게 질문한 내용</span>
        <textarea rows={2} className={field} placeholder="예: TypeError가 왜 나는지 물어봤어요. (질문하지 않았으면 비워 두세요)" />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="font-bold">3. 오늘 배운 핵심 개념</span>
        <textarea rows={2} className={field} placeholder="예: input()으로 받은 값은 문자열이라서, 계산하려면 int()로 바꿔야 한다." />
      </label>
      <button
        type="button"
        onClick={() => setDone(true)}
        className="self-start rounded-lg bg-brand px-4 py-2 font-bold text-white hover:bg-brand-dark"
      >
        성찰 남기기
      </button>
      {done && (
        <p role="status" className="rounded-lg bg-green-50 px-3 py-2 text-sm leading-6 text-green-800">
          ✅ 체험은 여기까지예요. 실제 수업에서는 성찰이 저장되어 학생의 <b>🧭 나의 학습 여정</b>(날짜별 기록, 스스로 고친 오류, 직접 작성 비율)과
          선생님의 <b>💭 성찰 모아보기</b>에 쌓이고, 과정에 따라 <b>🏅 업적</b>(칭찬만)이 생겨요.
        </p>
      )}
    </section>
  );
}

/** ⑤ 연습 문제: 체험 기록의 막힌 곳 또는 개념으로 AI가 만들고(서버에서 참고 답안 실행 확인), 만든 문제는 ③에서 푼다 */
function TrialPracticeStep({
  enabled,
  unlocked,
  records,
  practices,
  onRemaining,
  onCreated,
  onOpen,
}: {
  enabled: boolean;
  unlocked: boolean;
  records: () => TrialRecord[];
  practices: Practice[];
  onRemaining: (n: number) => void;
  onCreated: (p: TrialPractice) => void;
  onOpen: (id: string) => void;
}) {
  const [source, setSource] = useState<"mine" | "sample">("mine");
  const [points, setPoints] = useState<StuckPoint[] | null>(null);
  const [concepts, setConcepts] = useState<string[]>([]);
  const [level, setLevel] = useState(2);
  const [creating, setCreating] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  // 어느 기록에서 막힌 곳을 찾을지: 내 체험 기록 / 예시 학생의 기록
  const sourceRecords = (): TrialRecord[] =>
    source === "sample" ? [{ problemId: SAMPLE_PROBLEM_ID, title: "예시 학생의 기록", init: SAMPLE_RECORDING.init, log: SAMPLE_RECORDING.log }] : records();

  useEffect(() => {
    let alive = true;
    trialStuck(sourceRecords()).then((r) => alive && setPoints(r.ok ? r.points : []));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 기록 출처를 바꿀 때 다시 찾는다
  }, [source]);

  async function create(input: { mode: "stuck"; pointId: string } | { mode: "concept"; concepts: string[] }) {
    setCreating(true);
    setMessage(null);
    const r = await createTrialPractice({ ...input, level, records: sourceRecords() });
    setCreating(false);
    if (!r.ok) return setMessage(r.error);
    onRemaining(r.remaining);
    onCreated(r.practice);
  }

  const blocked = !unlocked;
  const levelPicker = (
    <label className="flex shrink-0 items-center gap-1.5 text-sm text-muted">
      난이도
      <select value={level} onChange={(e) => setLevel(Number(e.target.value))} className="rounded-lg border border-line bg-white px-2 py-1.5">
        {LEVELS.map((l) => (
          <option key={l.value} value={l.value}>
            {l.label}
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <div className="flex flex-col gap-4">
      {blocked && (
        <p className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {enabled
            ? "연습 문제는 AI가 만들어요. ① 시작하기에서 체험 코드를 입력하시면 만들어 보실 수 있습니다."
            : "현재 체험용 AI는 사용하지 않도록 설정되어 있어, 연습 문제 만들기는 보기만 하실 수 있습니다."}
        </p>
      )}
      {creating && (
        <p role="status" className="rounded-lg bg-blue-50 px-4 py-3 text-sm text-blue-900">
          🤖 AI가 기록을 보고 문제를 만들고, 참고 답안을 서버에서 직접 실행해 확인하는 중이에요… (20초 정도 걸려요)
        </p>
      )}
      {message && (
        <p role="alert" className="text-sm text-danger">
          {message}
        </p>
      )}

      <section className="flex flex-col gap-3 rounded-xl border border-violet-200 bg-white p-5">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="mr-auto font-bold">🧩 막혔던 곳에서 만들기</h3>
          <div className="flex rounded-lg border border-line p-0.5 text-sm" role="group" aria-label="기록 고르기">
            {(
              [
                ["mine", "내 체험 기록"],
                ["sample", "예시 학생의 기록"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                aria-pressed={source === id}
                onClick={() => setSource(id)}
                className={`rounded-md px-2.5 py-1 ${source === id ? "bg-violet-600 text-white" : "text-muted hover:text-ink"}`}
              >
                {label}
              </button>
            ))}
          </div>
          {levelPicker}
        </div>
        <p className="-mt-2 text-xs text-muted">작성 기록에서 두 번 넘게 난 오류와 오래 멈춘 곳을 찾아요. 실제 수업에서는 최근 제출 30개의 기록에서 찾아요.</p>
        {points === null ? (
          <p className="text-sm text-muted">기록을 살펴보는 중…</p>
        ) : points.length ? (
          <ul className="grid gap-2 sm:grid-cols-2">
            {points.map((pt) => (
              <li key={pt.id} className="flex flex-col gap-1.5 rounded-lg border border-line px-4 py-3">
                <p className="font-bold">
                  {pt.kind === "error" ? "⚠️" : "⏸"} {pt.label}
                </p>
                <p className="text-sm text-muted">{pt.evidence}</p>
                {pt.concept && <p className="text-sm">→ {pt.concept}</p>}
                <button
                  type="button"
                  disabled={blocked || creating}
                  onClick={() => create({ mode: "stuck", pointId: pt.id })}
                  className="mt-1 self-start rounded-lg bg-violet-600 px-3 py-1.5 text-sm font-bold text-white hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  이걸로 연습 문제 만들기
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">
            {source === "mine" ? (
              <>
                아직 체험 기록에서 여러 번 막힌 곳이 없어요.{" "}
                <button type="button" onClick={() => setSource("sample")} className="font-bold text-violet-700 underline">
                  예시 학생의 기록
                </button>
                으로 보거나, 아래에서 개념을 골라 보세요.
              </>
            ) : (
              "예시 기록에서 막힌 곳을 찾지 못했어요."
            )}
          </p>
        )}
      </section>

      <section className="flex flex-col gap-3 rounded-xl border border-line bg-white p-5">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="mr-auto font-bold">📚 개념 골라 만들기</h3>
          {levelPicker}
        </div>
        <p className="-mt-2 text-xs text-muted">{MAX_CONCEPTS_PER_PROBLEM}개까지 함께 고를 수 있어요. 실제 수업에서는 선생님이 고를 수 있는 개념을 정해요.</p>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="개념">
          {DEFAULT_CONCEPTS.map((c) => {
            const on = concepts.includes(c);
            return (
              <button
                key={c}
                type="button"
                aria-pressed={on}
                disabled={!on && concepts.length >= MAX_CONCEPTS_PER_PROBLEM}
                onClick={() => setConcepts(on ? concepts.filter((x) => x !== c) : [...concepts, c])}
                className={`rounded-full border px-2.5 py-1 text-sm disabled:opacity-40 ${
                  on ? "border-brand bg-brand-soft font-bold text-brand" : "border-line text-muted hover:border-brand"
                }`}
              >
                {on ? "✓ " : ""}
                {c}
              </button>
            );
          })}
        </div>
        <button
          type="button"
          disabled={blocked || creating || !concepts.length}
          onClick={() => create({ mode: "concept", concepts })}
          className="self-start rounded-lg bg-brand px-3 py-2 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          {concepts.length ? `${concepts.length}개 개념으로 연습 문제 만들기` : "개념을 골라 주세요"}
        </button>
      </section>

      {practices.length > 0 && (
        <section className="flex flex-col gap-2">
          <h3 className="font-bold">📝 만든 연습 문제 ({practices.length})</h3>
          <ul className="flex flex-col gap-2">
            {practices.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => onOpen(p.id)}
                  className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-line bg-white px-4 py-3 text-left hover:border-brand"
                >
                  <span className="font-bold">
                    🧪 연습 {p.n}. {p.title}
                  </span>
                  <span className="text-sm text-muted">
                    {p.basis ? `🧩 ${p.basis}` : `📚 ${p.concept}`} · {levelLabel(p.level)}
                  </span>
                  <span className="ml-auto text-sm font-bold text-brand">③ 코드 쓰기에서 풀기 →</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
