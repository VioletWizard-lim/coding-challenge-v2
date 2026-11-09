"use client";

import { useEffect, useRef, useState } from "react";
import ProblemView from "@/components/ProblemView";
import RecordingEditor, { type RecorderHandle } from "@/components/RecordingEditor";
import Replayer from "@/components/Replayer";
import { Outcomes, runTests } from "@/components/TestOutcomes";
import type { AiChat } from "@/lib/aiChat";
import type { AiReview } from "@/lib/aiReview";
import type { Recording } from "@/lib/editLog";
import type { HelpChat } from "@/lib/helpTrail";
import { errorName, judge, type TestOutcome } from "@/lib/practice";
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
} from "@/lib/trial";
import AiHelper, { type HelperBackend } from "../student/AiHelper";
import ReviewPanel, { type ReviewBackend } from "../student/ReviewPanel";
import { trialAsk, trialFollowUp, trialReview, trialStatus, unlockTrial, type TrialStatus } from "./actions";

type Step = "intro" | "sample" | "write" | "replay" | "reflect";
/** 체험 순서 (왼쪽 메뉴, 위에서 아래로 차례대로) */
const STEPS: [Step, string, string][] = [
  ["intro", "① 시작하기", "이 사이트가 무엇인지, 체험 AI를 쓰는 방법"],
  ["sample", "② 예시 학생의 기록", "실제 학생 기록처럼 만든 예시로 재생·AI 도움·되돌아보기를 먼저 봐요."],
  ["write", "③ 코드 쓰기", "편집기가 입력·붙여넣기·실행을 기록해요. 막히면 AI 도우미에게 물어봐요."],
  ["replay", "④ 재생하며 되돌아보기", "내가 쓴 과정을 다시 보고, AI가 그 과정의 순간을 짚어 질문해요."],
  ["reflect", "⑤ 오늘의 성찰", "수업을 마치며 오늘을 글로 정리해요."],
];

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
  const [aiOpen, setAiOpen] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const problem = TRIAL_PROBLEMS.find((p) => p.id === problemId)!;
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
      const r = await trialAsk({ problemId, ...x, history: (chats[problemId] ?? []).map((c) => ({ question: c.question, answer: c.answer })) });
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
      const r = await trialReview({ problemId, init: rec.init, log: rec.log, code: rec.code });
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
              ⑤ <b className="text-ink">오늘의 성찰</b>을 써요.
            </li>
          </ul>
            <TrialGate status={status} onStatus={setStatus} />
          </section>
        )}

        {step === "sample" && <SampleRecord />}

        {/* ① 코드 쓰기: 단계를 오가도 편집기가 사라지지 않게 숨기기만 한다 */}
        <section className={step === "write" ? "flex flex-col gap-4" : "hidden"}>
          <div className="flex flex-wrap gap-2">
            {TRIAL_PROBLEMS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => pickProblem(p.id)}
                className={`rounded-lg border px-3 py-1.5 text-sm ${p.id === problemId ? "border-brand bg-brand-soft font-bold text-brand" : "border-line bg-white"}`}
              >
                체험 {p.view.number}. {p.view.title}
              </button>
            ))}
          </div>
          <div
            className={`grid gap-5 lg:grid-cols-[minmax(280px,2fr)_3fr] ${aiOpen ? "xl:grid-cols-[minmax(240px,1.4fr)_2.4fr_minmax(300px,1.6fr)]" : ""}`}
          >
            <aside className="flex flex-col gap-3 rounded-xl border border-line bg-white p-5 lg:self-start">
              <ProblemView problem={problem.view} />
            </aside>
            <div className="flex min-w-0 flex-col gap-4">
              {!aiOpen && (
                <button
                  type="button"
                  onClick={() => setAiOpen(true)}
                  className="self-end rounded-lg border border-blue-300 bg-blue-50 px-3 py-1.5 text-sm font-medium text-blue-800 hover:bg-blue-100"
                >
                  🤖 AI 도우미에게 물어보기
                </button>
              )}
              <RecordingEditor key={`${problemId}:${resetKey}`} ref={recorder} storageKey={trialStorageKey(problemId)} />
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
            <h2 className="text-lg font-bold">
              ▶ 내 작성 과정 — 체험 {problem.view.number}. {problem.view.title}
            </h2>
            {rec && rec.log && (rec.log as unknown[]).length > 0 ? (
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
                아직 기록이 없어요.{" "}
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

        {step === "reflect" && <TrialReflection problemLabel={`체험 ${problem.view.number}. ${problem.view.title}`} />}

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
