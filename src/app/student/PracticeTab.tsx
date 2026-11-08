"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import ProblemView from "@/components/ProblemView";
import RecordingEditor, { type RecorderHandle } from "@/components/RecordingEditor";
import Replayer from "@/components/Replayer";
import { storageKeyFor, type Recording } from "@/lib/editLog";
import {
  asProblem,
  errorName,
  harnessCode,
  judge,
  LEVELS,
  levelLabel,
  parseRunResult,
  practiceKey,
  type PracticeProblem,
  type TestOutcome,
} from "@/lib/practice";
import { loadPython } from "@/lib/pyodide";
import {
  createPractice,
  flagMyPractice,
  loadMyPractice,
  loadPracticeHome,
  savePracticeCheck,
  type CreateInput,
  type PracticeHome,
} from "./practiceActions";

const selectClass =
  "rounded-lg border border-line bg-white px-3 py-2 text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand/15";

type Home = Extract<PracticeHome, { ok: true }>;

const statusOf = (p: PracticeProblem) =>
  p.solvedAt
    ? { text: "✅ 통과", tone: "bg-green-100 text-green-800" }
    : p.passed !== null
      ? { text: `${p.passed}/${p.tests.length} 통과`, tone: "bg-amber-100 text-amber-900" }
      : { text: "아직 안 풀어 봄", tone: "bg-page text-muted" };

/**
 * 🧪 연습 모드. 내 작성 기록에서 찾은 "막혔던 곳"(반복된 오류, 오래 멈춘 문제) 또는 개념을 골라 AI에게 연습 문제를 받고,
 * 같은 기록 편집기에서 풀며 테스트로 확인한다. 연습 과정도 기록되어 다시 볼 수 있다. 수업 제출과는 따로 저장된다.
 */
export default function PracticeTab({ userId }: { userId: string }) {
  const [home, setHome] = useState<Home | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [subject, setSubject] = useState("");
  const [level, setLevel] = useState(2);
  const [concept, setConcept] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [creating, startCreate] = useTransition();
  const [openId, setOpenId] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;
    loadPracticeHome().then((r) => {
      if (!alive) return;
      if (!r.ok) return setError(r.error);
      setHome(r);
      const first = r.settings.find((s) => s.enabled) ?? r.settings[0];
      setSubject(first?.subject ?? "");
      setConcept(first?.concepts[0] ?? "");
    });
    return () => {
      alive = false;
    };
  }, []);

  if (error) return <p className="rounded-lg bg-amber-50 px-4 py-3 text-amber-900">{error}</p>;
  if (!home) return <p className="text-muted">불러오는 중…</p>;
  if (!home.ready) return <p className="rounded-lg bg-amber-50 px-4 py-3 text-amber-900">선생님이 연습 모드를 준비하고 있어요.</p>;

  const settings = home.settings.find((s) => s.subject === subject);
  const open = home.problems.find((p) => p.id === openId);
  if (open) {
    return (
      <PracticeSolver
        key={open.id}
        userId={userId}
        problem={open}
        onBack={() => setOpenId(null)}
        onSaved={(patch) =>
          setHome((h) => h && { ...h, problems: h.problems.map((p) => (p.id === open.id ? { ...p, ...patch } : p)) })
        }
      />
    );
  }

  function create(input: CreateInput) {
    setMessage(null);
    startCreate(async () => {
      const r = await createPractice(input);
      if (r.remaining !== undefined) setHome((h) => h && { ...h, remaining: r.remaining! });
      if (!r.ok) return setMessage(r.error);
      setHome((h) => h && { ...h, problems: [r.problem, ...h.problems], remaining: r.remaining });
      setOpenId(r.problem.id);
    });
  }

  const stuck = home.stuck.filter((s) => s.subject === subject);
  const out = home.remaining === 0;
  const busy = creating || out;
  const mine = home.problems.filter((p) => p.subject === subject);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end gap-3">
        <div className="mr-auto">
          <h2 className="text-2xl font-black">🧪 연습 모드</h2>
          <p className="text-sm text-muted">
            내 작성 기록에서 막혔던 곳을 골라 AI가 나에게 맞는 연습 문제를 만들어 줘요. 수업 제출과는 따로 저장되고, 점수는 없어요.
          </p>
        </div>
        {home.settings.length > 1 && (
          <label className="flex flex-col gap-1 text-sm text-muted">
            과목
            <select
              value={subject}
              onChange={(e) => {
                setSubject(e.target.value);
                setConcept(home.settings.find((s) => s.subject === e.target.value)?.concepts[0] ?? "");
              }}
              className={selectClass}
            >
              {home.settings.map((s) => (
                <option key={s.subject}>{s.subject}</option>
              ))}
            </select>
          </label>
        )}
        <label className="flex flex-col gap-1 text-sm text-muted">
          난이도
          <select value={level} onChange={(e) => setLevel(Number(e.target.value))} className={selectClass}>
            {LEVELS.map((l) => (
              <option key={l.value} value={l.value}>
                {l.label}
              </option>
            ))}
          </select>
        </label>
        <span className="rounded-full bg-page px-3 py-1 text-sm text-muted" title="하루에 만들 수 있는 연습 문제 수">
          오늘 남은 만들기 {home.remaining}/{home.limit}
        </span>
      </div>

      {settings && !settings.enabled ? (
        <p className="rounded-lg bg-page px-4 py-3 text-muted">이 과목은 지금 선생님이 연습 모드를 꺼 두었어요.</p>
      ) : (
        <>
          {creating && (
            <p role="status" className="rounded-lg bg-blue-50 px-4 py-3 text-blue-900">
              🤖 AI가 내 기록을 보고 문제를 만들고, 답이 맞는지 직접 실행해 확인하는 중이에요… (20초 정도 걸려요)
            </p>
          )}
          {message && (
            <p role="alert" className="text-sm text-danger">
              {message}
            </p>
          )}

          <section className="flex flex-col gap-3 rounded-xl border border-violet-200 bg-white p-5">
            <h3 className="font-bold">🧩 내가 막혔던 곳에서 만들기</h3>
            <p className="-mt-2 text-xs text-muted">최근 제출의 작성 기록에서 여러 번 난 오류와 오래 멈춘 문제를 찾았어요.</p>
            {stuck.length ? (
              <ul className="grid gap-2 sm:grid-cols-2">
                {stuck.map((s) => (
                  <li key={s.id} className="flex flex-col gap-1.5 rounded-lg border border-line px-4 py-3">
                    <p className="font-bold">
                      {s.kind === "error" ? "⚠️" : "⏸"} {s.label}
                    </p>
                    <p className="text-sm text-muted">{s.evidence}</p>
                    {s.concept && <p className="text-sm">→ {s.concept}</p>}
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => create({ subject, mode: "stuck", pointId: s.id, level })}
                      className="mt-1 self-start rounded-lg bg-violet-600 px-3 py-1.5 text-sm font-bold text-white hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      이걸로 연습 문제 만들기
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted">
                아직 여러 번 막힌 곳이 없어요. 수업 문제를 풀면 작성 기록에서 찾아 줄게요. 아래에서 개념을 골라도 돼요.
              </p>
            )}
          </section>

          <section className="flex flex-col gap-3 rounded-xl border border-line bg-white p-5">
            <h3 className="font-bold">📚 개념 골라 만들기</h3>
            <div className="flex flex-wrap items-center gap-2">
              <select value={concept} onChange={(e) => setConcept(e.target.value)} aria-label="개념" className={selectClass}>
                {settings?.concepts.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
              <button
                type="button"
                disabled={busy || !concept}
                onClick={() => create({ subject, mode: "concept", concept, level })}
                className="rounded-lg bg-brand px-3 py-2 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                연습 문제 만들기
              </button>
            </div>
            {settings?.note && <p className="text-xs text-muted">📌 선생님 안내: {settings.note}</p>}
          </section>
        </>
      )}

      <section className="flex flex-col gap-3">
        <h3 className="font-bold">📝 내 연습 문제 ({mine.length})</h3>
        {mine.length ? (
          <ul className="flex flex-col gap-2">
            {mine.map((p) => {
              const st = statusOf(p);
              return (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => setOpenId(p.id)}
                    className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-line bg-white px-4 py-3 text-left hover:border-brand"
                  >
                    <span className="font-bold">{p.title}</span>
                    <span className="text-sm text-muted">
                      {p.source === "stuck" ? `🧩 ${p.basis}` : `📚 ${p.concept}`} · {levelLabel(p.level)}
                    </span>
                    <span className={`ml-auto rounded-full px-2 py-0.5 text-xs font-bold ${st.tone}`}>{st.text}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-sm text-muted">아직 만든 연습 문제가 없어요.</p>
        )}
      </section>
    </div>
  );
}

/** 연습 문제 풀기: 기록 편집기 + 테스트 확인 + 내 과정 다시 보기 */
function PracticeSolver({
  userId,
  problem,
  onBack,
  onSaved,
}: {
  userId: string;
  problem: PracticeProblem;
  onBack: () => void;
  onSaved: (patch: Partial<PracticeProblem>) => void;
}) {
  const recorder = useRef<RecorderHandle>(null);
  const [checking, setChecking] = useState(false);
  const [outcomes, setOutcomes] = useState<TestOutcome[] | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [replay, setReplay] = useState<Recording | null>(null);
  const [flagged, setFlagged] = useState(problem.flaggedBy !== null);
  const storageKey = storageKeyFor(userId, problem.subject, practiceKey(problem.id));
  // 다른 컴퓨터에서 풀던 문제면, 서버에 저장된 마지막 확인 때의 코드·기록으로 이어 쓴다
  const [editorReady, setEditorReady] = useState(false);
  useEffect(() => {
    let alive = true;
    let saved = false;
    try {
      saved = localStorage.getItem(storageKey) !== null;
    } catch {}
    if (saved || problem.checks === 0) {
      setEditorReady(true); // eslint-disable-line react-hooks/set-state-in-effect -- 브라우저 저장소를 처음 한 번 확인
      return;
    }
    loadMyPractice(problem.id).then((r) => {
      if (!alive) return;
      if (r.ok && r.problem.code !== null && Array.isArray(r.problem.log)) {
        try {
          localStorage.setItem(storageKey, JSON.stringify({ init: r.problem.initCode ?? "", log: r.problem.log, code: r.problem.code }));
        } catch {}
      }
      setEditorReady(true);
    });
    return () => {
      alive = false;
    };
  }, [storageKey, problem.id, problem.checks]);

  async function runChecks() {
    const rec = recorder.current?.getRecording();
    if (!rec) return;
    if (!rec.code.trim()) return setNote("코드를 먼저 써 주세요.");
    setChecking(true);
    setNote(null);
    try {
      const py = await loadPython();
      const results = problem.tests.map((t) => parseRunResult(py.runPython(harnessCode(rec.code, t.inputs))));
      const judged = judge(problem.tests, results);
      setOutcomes(judged);
      // 확인도 실행이다: 작성 기록에 실행 결과로 남긴다 (재생 타임라인·과정 요약에 보임)
      const firstError = judged.find((o) => o.error)?.error;
      recorder.current?.addMark(firstError ? `r:${errorName(firstError)}` : "r:ok");
      const after = recorder.current?.getRecording() ?? rec;
      const passed = judged.filter((o) => o.pass).length;
      const r = await savePracticeCheck(problem.id, { code: after.code, init: after.init, log: after.log, passed });
      if (!r.ok) setNote(r.error);
      else onSaved({ passed, solvedAt: r.solvedAt, checks: r.checks });
    } catch (err) {
      setNote(String((err as Error)?.message ?? err));
    } finally {
      setChecking(false);
    }
  }

  const passed = outcomes?.filter((o) => o.pass).length ?? 0;
  const allPass = outcomes !== null && passed === outcomes.length;

  return (
    <div className="flex flex-col gap-4">
      <button type="button" onClick={onBack} className="self-start text-sm font-bold text-brand hover:underline">
        ← 연습 문제 목록
      </button>
      <section className="grid gap-5 lg:grid-cols-[minmax(300px,2fr)_3fr]">
        <aside className="flex flex-col gap-3 rounded-xl border border-line bg-white p-5 lg:sticky lg:top-20 lg:self-start">
          <p className="text-xs font-bold text-blue-700">
            🤖 AI가 만든 문제입니다 <span className="font-normal text-muted">· 난이도 {levelLabel(problem.level)}</span>
          </p>
          {problem.source === "stuck" && (
            <p className="rounded-lg bg-violet-50 px-3 py-2 text-sm text-violet-900">🧩 내가 막혔던 곳: {problem.basis}</p>
          )}
          <ProblemView problem={asProblem(problem)} />
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
                  flagMyPractice(problem.id).then((r) => (r.ok ? setFlagged(true) : setNote(r.error ?? "알리지 못했어요.")));
                }}
                className="text-xs text-muted hover:text-danger"
              >
                🚩 이상한 문제 알리기
              </button>
            )}
          </div>
        </aside>

        <div className="flex min-w-0 flex-col gap-4">
          {editorReady ? (
            <RecordingEditor ref={recorder} storageKey={storageKey} initialCode={problem.starterCode} />
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
            <button
              type="button"
              onClick={() => setReplay(recorder.current?.getRecording() ?? null)}
              className="rounded-lg border border-line bg-white px-3 py-2 text-sm hover:bg-page"
            >
              ▶ 내 연습 과정 다시 보기
            </button>
            {problem.solvedAt && !outcomes && <span className="text-sm text-green-700">✅ 이미 통과한 문제예요 (다시 풀어 봐도 돼요)</span>}
          </div>
          {note && (
            <p role="alert" className="text-sm text-danger">
              {note}
            </p>
          )}
          {outcomes && (
            <section className="flex flex-col gap-2" aria-label="확인 결과">
              <p className={`font-bold ${allPass ? "text-green-700" : "text-amber-800"}`}>
                {allPass ? `🎉 모두 통과! (${passed}/${outcomes.length})` : `${passed}/${outcomes.length} 통과 — 다른 부분을 찾아보세요`}
              </p>
              {outcomes.map((o, i) => (
                <div
                  key={i}
                  className={`grid gap-1 rounded-lg border px-3 py-2 text-sm ${o.pass ? "border-green-200 bg-green-50/50" : "border-amber-300 bg-amber-50/50"}`}
                >
                  <p className="font-bold">
                    {o.pass ? "✅" : "✖"} 예시 {i + 1}
                    {problem.tests[i].inputs.length > 0 && (
                      <span className="font-normal text-muted"> · 입력 {problem.tests[i].inputs.join(" / ")}</span>
                    )}
                  </p>
                  {!o.pass && (
                    <div className="grid gap-2 sm:grid-cols-2">
                      <div>
                        <p className="text-xs text-muted">기대 출력</p>
                        <pre className="whitespace-pre-wrap rounded bg-white px-2 py-1 font-mono text-xs">{problem.tests[i].output}</pre>
                      </div>
                      <div>
                        <p className="text-xs text-muted">내 출력</p>
                        <pre className="whitespace-pre-wrap rounded bg-white px-2 py-1 font-mono text-xs">
                          {o.output || <span className="text-muted">(출력 없음)</span>}
                          {o.error && <span className="block text-danger">{o.error}</span>}
                        </pre>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </section>
          )}
        </div>
      </section>

      {replay && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/30 p-4"
          role="presentation"
          onClick={(e) => e.target === e.currentTarget && setReplay(null)}
        >
          <div role="dialog" aria-label="내 연습 과정" className="mt-10 flex w-full max-w-4xl flex-col gap-3 rounded-xl bg-white p-5 shadow-xl">
            <div className="flex items-center gap-2">
              <h3 className="font-bold">▶ 내 연습 과정 — {problem.title}</h3>
              <button type="button" onClick={() => setReplay(null)} className="ml-auto text-sm text-muted hover:text-ink">
                ✕ 닫기
              </button>
            </div>
            <Replayer init={replay.init} code={replay.code} log={replay.log} />
          </div>
        </div>
      )}
    </div>
  );
}
