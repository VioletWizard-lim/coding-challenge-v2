"use client";

import AiHelperButton from "@/components/AiHelperButton";
import { useEffect, useRef, useState, type ReactNode } from "react";
import ProblemView from "@/components/ProblemView";
import RecordingEditor, { type RecorderHandle } from "@/components/RecordingEditor";
import Replayer from "@/components/Replayer";
import { storageKeyFor, type Recording } from "@/lib/editLog";
import type { HelpChat } from "@/lib/helpTrail";
import { errorName, judge, type PracticeTest, type TestOutcome } from "@/lib/practice";
import { Outcomes, runTests } from "@/components/TestOutcomes";
import type { Problem } from "@/lib/problemBank";
import AiHelper from "./AiHelper";
import { loadMyAiChats } from "./actions";

type Work = { code: string; init: string; log: unknown };

/**
 * 연습 문제·학생이 만든 문제를 푸는 화면: 기록 편집기 + 예시로 확인 + 과정 기반 AI 도우미 + 내 과정 다시 보기.
 * 확인할 때마다 서버에 코드·작성 기록을 저장하고(다른 컴퓨터에서 이어 쓰기), 확인도 실행 기록(r:ok / r:오류)으로 남긴다.
 */
export default function ProblemSolver({
  userId,
  subject,
  problemKey,
  view,
  tests,
  starterCode,
  badge,
  extra,
  solvedAt,
  checks,
  flagged: initiallyFlagged,
  ai,
  backLabel,
  onBack,
  save,
  loadSaved,
  flag,
  onSaved,
}: {
  userId: string;
  subject: string;
  /** 작성 기록·AI 대화 키 ("P12" 연습 문제, "S7" 학생이 만든 문제) */
  problemKey: string;
  view: Problem;
  tests: PracticeTest[];
  starterCode: string;
  /** 문제 위의 한 줄 (예: "🤖 AI가 만든 문제입니다") */
  badge: ReactNode;
  /** 문제 위 상자 (예: 내가 막혔던 곳) */
  extra?: ReactNode;
  solvedAt: string | null;
  checks: number;
  flagged: boolean;
  ai: { practiceId?: number; studentProblemId?: number };
  backLabel: string;
  onBack: () => void;
  save: (work: Work & { passed: number }) => Promise<{ ok: true; solvedAt: string | null; checks: number } | { ok: false; error: string }>;
  loadSaved: () => Promise<Work | null>;
  flag: () => Promise<{ ok: boolean; error?: string }>;
  onSaved: (patch: { passed: number; solvedAt: string | null; checks: number }) => void;
}) {
  const recorder = useRef<RecorderHandle>(null);
  const [checking, setChecking] = useState(false);
  const [outcomes, setOutcomes] = useState<TestOutcome[] | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [replay, setReplay] = useState<(Recording & { chats: HelpChat[] }) | null>(null);
  const [flagged, setFlagged] = useState(initiallyFlagged);
  const [aiOpen, setAiOpen] = useState(false);
  const storageKey = storageKeyFor(userId, subject, problemKey);

  // 다른 컴퓨터에서 풀던 문제면, 서버에 저장된 마지막 확인 때의 코드·기록으로 이어 쓴다
  const [editorReady, setEditorReady] = useState(false);
  useEffect(() => {
    let alive = true;
    let saved = false;
    try {
      saved = localStorage.getItem(storageKey) !== null;
    } catch {}
    if (saved || checks === 0) {
      setEditorReady(true); // eslint-disable-line react-hooks/set-state-in-effect -- 브라우저 저장소를 처음 한 번 확인
      return;
    }
    loadSaved().then((w) => {
      if (!alive) return;
      if (w && Array.isArray(w.log)) {
        try {
          localStorage.setItem(storageKey, JSON.stringify({ init: w.init, log: w.log, code: w.code }));
        } catch {}
      }
      setEditorReady(true);
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 문제를 열 때 한 번
  }, [storageKey]);

  /** 다시 보기: 그동안 AI 도우미와 나눈 대화도 타임라인의 "AI 도움 요청"에 이어 보여 준다 */
  async function openReplay() {
    const rec = recorder.current?.getRecording();
    if (!rec) return;
    const r = await loadMyAiChats(subject, problemKey);
    const chats = r.ok
      ? r.chats.flatMap((c) => (c.at === null ? [] : [{ at: c.at, question: c.question, answer: c.answer, moments: c.moments }]))
      : [];
    setReplay({ ...rec, chats });
  }

  async function runChecks() {
    const rec = recorder.current?.getRecording();
    if (!rec) return;
    if (!rec.code.trim()) return setNote("코드를 먼저 써 주세요.");
    setChecking(true);
    setNote(null);
    try {
      const judged = judge(tests, await runTests(rec.code, tests));
      setOutcomes(judged);
      // 확인도 실행이다: 작성 기록에 실행 결과로 남긴다 (재생 타임라인·과정 요약에 보임)
      const firstError = judged.find((o) => o.error)?.error;
      recorder.current?.addMark(firstError ? `r:${errorName(firstError)}` : "r:ok");
      const after = recorder.current?.getRecording() ?? rec;
      const passed = judged.filter((o) => o.pass).length;
      const r = await save({ code: after.code, init: after.init, log: after.log, passed });
      if (!r.ok) setNote(r.error);
      else onSaved({ passed, solvedAt: r.solvedAt, checks: r.checks });
    } catch (err) {
      setNote(String((err as Error)?.message ?? err));
    } finally {
      setChecking(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <button type="button" onClick={onBack} className="self-start text-sm font-bold text-brand hover:underline">
        ← {backLabel}
      </button>
      <section
        className={`grid gap-5 lg:grid-cols-[minmax(300px,2fr)_3fr] ${
          aiOpen ? "xl:grid-cols-[minmax(260px,1.5fr)_2.5fr_minmax(300px,1.6fr)]" : ""
        }`}
      >
        <aside className="flex flex-col gap-3 rounded-xl border border-line bg-white p-5 lg:sticky lg:top-20 lg:self-start">
          <p className="text-xs font-bold text-blue-700">{badge}</p>
          {extra}
          <ProblemView problem={view} />
          <p className="text-xs leading-5 text-muted">
            예시의 입력을 차례로 넣어 출력이 같은지 확인해요. input()의 안내 글과 줄 끝 띄어쓰기는 보지 않아요.
          </p>
          <div className="flex justify-end">
            {flagged ? (
              <span className="text-xs text-muted">🚩 선생님께 알렸어요</span>
            ) : (
              <button
                type="button"
                onClick={() => {
                  if (!confirm("문제가 이상하거나 불편했나요? 선생님께 알릴게요.")) return;
                  flag().then((r) => (r.ok ? setFlagged(true) : setNote(r.error ?? "알리지 못했어요.")));
                }}
                className="text-xs text-muted hover:text-danger"
              >
                🚩 이상한 문제 알리기
              </button>
            )}
          </div>
        </aside>

        <div className="flex min-w-0 flex-col gap-4">
          {editorReady && !aiOpen && <AiHelperButton onOpen={() => setAiOpen(true)} />}
          {editorReady ? (
            <RecordingEditor ref={recorder} storageKey={storageKey} initialCode={starterCode} />
          ) : (
            <p className="text-muted">이어 쓸 코드를 불러오는 중…</p>
          )}
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={runChecks}
              disabled={checking}
              className="rounded-xl bg-gradient-to-br from-brand to-violet-600 px-6 py-2.5 font-bold text-white disabled:opacity-60"
            >
              {checking ? "확인하는 중…" : "✅ 확인하기"}
            </button>
            <button type="button" onClick={openReplay} className="rounded-lg border border-line bg-white px-3 py-2 text-sm hover:bg-page">
              ▶ 내 연습 과정 다시 보기
            </button>
            {solvedAt && !outcomes && <span className="text-sm text-green-700">✅ 이미 통과한 문제예요 (다시 풀어 봐도 돼요)</span>}
          </div>
          {note && (
            <p role="alert" className="text-sm text-danger">
              {note}
            </p>
          )}
          {outcomes && <Outcomes tests={tests} outcomes={outcomes} />}
        </div>

        {/* 맨 오른쪽: 과정 기반 AI 도우미 (수업 문제와 같은 창, 하루 질문 수도 함께 셈) */}
        {aiOpen && editorReady && (
          <div className="min-w-0 lg:col-span-2 xl:col-span-1">
            <AiHelper subject={subject} problem={problemKey} {...ai} recorder={recorder} onClose={() => setAiOpen(false)} />
          </div>
        )}
      </section>

      {replay && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/30 p-4"
          role="presentation"
          onClick={(e) => e.target === e.currentTarget && setReplay(null)}
        >
          <div role="dialog" aria-label="내 연습 과정" className="mt-10 flex w-full max-w-4xl flex-col gap-3 rounded-xl bg-white p-5 shadow-xl">
            <div className="flex items-center gap-2">
              <h3 className="font-bold">▶ 내 연습 과정 — {view.title}</h3>
              <button type="button" onClick={() => setReplay(null)} className="ml-auto text-sm text-muted hover:text-ink">
                ✕ 닫기
              </button>
            </div>
            <Replayer init={replay.init} code={replay.code} log={replay.log} chats={replay.chats} />
          </div>
        </div>
      )}
    </div>
  );
}
