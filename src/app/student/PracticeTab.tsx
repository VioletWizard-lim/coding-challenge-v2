"use client";

import { useEffect, useState, useTransition } from "react";
import { asProblem, LEVELS, levelLabel, practiceKey, type PracticeProblem } from "@/lib/practice";
import MyProblems from "./MyProblems";
import ProblemSolver from "./ProblemSolver";
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

/** 개념은 이만큼까지 함께 고른다 */
const MAX_PICK = 3;
/** 이 창에서 고른 과목 (다시 들어와도 같은 과목) */
const SUBJECT_KEY = "practice:subject";
/** "만들기"를 누른 시각 (만드는 중에 화면을 떠나도 돌아와서 이어 받게) */
const CREATING_KEY = "practice:creating";
const PART_KEY = "practice:part";

const readSession = <T,>(key: string): T | null => {
  try {
    return JSON.parse(sessionStorage.getItem(key) ?? "null") as T | null;
  } catch {
    return null;
  }
};
const writeSession = (key: string, value: unknown) => {
  try {
    if (value === null) sessionStorage.removeItem(key);
    else sessionStorage.setItem(key, JSON.stringify(value));
  } catch {}
};
const markCreating = () => writeSession(CREATING_KEY, Date.now());
const readCreating = () => {
  const at = readSession<number>(CREATING_KEY);
  return typeof at === "number" && Date.now() - at < 120_000 ? at : null;
};

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
type Part = "ai" | "list" | "mine";

export default function PracticeTab({ userId }: { userId: string }) {
  const [home, setHome] = useState<Home | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [subject, setSubject] = useState("");
  const [level, setLevel] = useState(2);
  const [concepts, setConcepts] = useState<string[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [creating, startCreate] = useTransition();
  const [openId, setOpenId] = useState<number | null>(null);
  /** 위쪽 칸: AI에게 만들기 / 직접 만든 문제 / 내 연습 문제 목록 (이 창에서 기억) */
  const [part, setPart] = useState<Part>(() => {
    const saved = readSession<string>(PART_KEY);
    return saved === "mine" || saved === "list" ? saved : "ai";
  });
  const choosePart = (next: Part) => {
    setPart(next);
    writeSession(PART_KEY, next);
  };
  /** 만드는 중에 화면을 떠났다 돌아온 경우: 서버에서 다 만들어질 때까지 목록을 다시 불러온다 */
  const [waiting, setWaiting] = useState(false);

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const pending = readCreating();
    const load = (tries: number) =>
      loadPracticeHome().then((r) => {
        if (!alive) return;
        if (!r.ok) return setError(r.error);
        setHome(r);
        if (tries === 0) {
          const saved = readSession<string>(SUBJECT_KEY);
          const first = r.settings.find((s) => s.subject === saved && s.enabled) ?? r.settings.find((s) => s.enabled) ?? r.settings[0];
          setSubject(first?.subject ?? "");
        }
        // 떠나기 전에 누른 "만들기"가 끝났는지: 그 뒤에 만들어진 문제가 보이면 그 문제를 연다
        if (!pending) return;
        const made = r.problems.find((p) => new Date(p.createdAt).getTime() >= pending - 60_000);
        if (made) {
          writeSession(CREATING_KEY, null);
          setWaiting(false);
          setOpenId(made.id);
        } else if (tries < 12 && Date.now() - pending < 120_000) {
          setWaiting(true);
          timer = setTimeout(() => load(tries + 1), 5000);
        } else {
          writeSession(CREATING_KEY, null);
          setWaiting(false);
        }
      });
    load(0);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    if (subject) writeSession(SUBJECT_KEY, subject);
  }, [subject]);

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
    markCreating();
    startCreate(async () => {
      const r = await createPractice(input);
      writeSession(CREATING_KEY, null);
      if (r.remaining !== undefined) setHome((h) => h && { ...h, remaining: r.remaining! });
      if (!r.ok) return setMessage(r.error);
      setHome((h) => h && { ...h, problems: [r.problem, ...h.problems], remaining: r.remaining });
      setOpenId(r.problem.id);
    });
  }

  const stuck = home.stuck.filter((s) => s.subject === subject);
  const out = home.remaining === 0;
  const busy = creating || waiting || out;
  const mine = home.problems;
  const allowed = settings?.concepts ?? [];
  const levelPicker = (
    <label className="flex shrink-0 items-center gap-1.5 text-sm text-muted">
      난이도
      <select value={level} onChange={(e) => setLevel(Number(e.target.value))} className={`${selectClass} py-1.5`}>
        {LEVELS.map((l) => (
          <option key={l.value} value={l.value}>
            {l.label}
          </option>
        ))}
      </select>
    </label>
  );
  const picked = concepts.filter((c) => allowed.includes(c));

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="text-2xl font-black">🧪 연습 모드</h2>
        <p className="text-sm text-muted">수업 제출과는 따로 저장되고, 점수는 없어요. 연습하는 과정도 기록돼서 다시 볼 수 있어요.</p>
      </div>
      <div role="tablist" aria-label="연습 종류" className="flex gap-2 border-b border-line">
        {(
          [
            ["ai", "🤖 내 기록으로 AI가 만든 문제"],
            ["list", `📝 내 연습 문제 (${home.problems.length})`],
            ["mine", "✏️ 직접 만든 문제"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={part === id}
            onClick={() => choosePart(id)}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-bold ${part === id ? "border-brand text-brand" : "border-transparent text-muted hover:text-ink"}`}
          >
            {label}
          </button>
        ))}
      </div>

      {part === "mine" ? (
        <MyProblems userId={userId} subjects={home.settings.map((s) => s.subject)} />
      ) : part === "list" ? (
      <section className="flex flex-col gap-3">
        <p className="text-sm text-muted">
          AI가 내 기록으로 만들어 준 연습 문제예요{home.settings.length > 1 && " (모든 과목)"}. 눌러서 이어 풀거나 다시 풀어 볼 수 있어요.
        </p>
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
                      {home.settings.length > 1 && `${p.subject} · `}
                      {p.source === "stuck" ? `🧩 ${p.basis}` : `📚 ${p.concept}`} · {levelLabel(p.level)}
                    </span>
                    <span className={`ml-auto rounded-full px-2 py-0.5 text-xs font-bold ${st.tone}`}>{st.text}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-sm text-muted">
            아직 만든 연습 문제가 없어요.{" "}
            <button type="button" onClick={() => choosePart("ai")} className="font-bold text-brand underline">
              🤖 내 기록으로 AI가 만든 문제
            </button>
            에서 만들어 보세요.
          </p>
        )}
      </section>
      ) : (
        <>
      <div className="flex flex-wrap items-end gap-3">
        <p className="mr-auto text-sm text-muted">
          내 작성 기록에서 막혔던 곳을 골라 AI가 나에게 맞는 연습 문제를 만들어 줘요.
        </p>
        {home.settings.length > 1 && (
          <label className="flex flex-col gap-1 text-sm text-muted">
            과목
            <select
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className={selectClass}
            >
              {home.settings.map((s) => (
                <option key={s.subject}>{s.subject}</option>
              ))}
            </select>
          </label>
        )}
        <span className="rounded-full bg-page px-3 py-1 text-sm text-muted" title="하루에 만들 수 있는 연습 문제 수">
          오늘 남은 만들기 {home.remaining}/{home.limit}
        </span>
      </div>

      {settings && !settings.enabled ? (
        <p className="rounded-lg bg-page px-4 py-3 text-muted">이 과목은 지금 선생님이 연습 모드를 꺼 두었어요.</p>
      ) : (
        <>
          {waiting && !creating && (
            <p role="status" className="rounded-lg bg-blue-50 px-4 py-3 text-blue-900">
              🤖 아까 만들기 시작한 연습 문제를 마무리하는 중이에요… 다 되면 바로 열어 줄게요.
            </p>
          )}
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
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="mr-auto font-bold">🧩 내가 막혔던 곳에서 만들기</h3>
              {levelPicker}
            </div>
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
            <p className="-mt-2 text-xs text-muted">
              {MAX_PICK}개까지 함께 고를 수 있어요. 여러 개를 고르면 그 개념을 함께 쓰는 문제가 나와요 (예: 반복문 + 리스트).
            </p>
            <div className="flex flex-wrap items-start gap-3">
            <div className="flex flex-1 flex-wrap gap-1.5" role="group" aria-label="개념">
              {allowed.map((c) => {
                const on = picked.includes(c);
                return (
                  <button
                    key={c}
                    type="button"
                    aria-pressed={on}
                    disabled={!on && picked.length >= MAX_PICK}
                    onClick={() => setConcepts(on ? picked.filter((x) => x !== c) : [...picked, c])}
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
            {levelPicker}
            </div>
            <button
              type="button"
              disabled={busy || !picked.length}
              onClick={() => create({ subject, mode: "concept", concepts: picked, level })}
              className="self-start rounded-lg bg-brand px-3 py-2 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              {picked.length ? `${picked.length}개 개념으로 연습 문제 만들기` : "개념을 골라 주세요"}
            </button>
            {settings?.note && <p className="text-xs text-muted">📌 선생님 안내: {settings.note}</p>}
          </section>
        </>
      )}

      {mine.length > 0 && (
        <p className="text-sm text-muted">
          만든 문제는{" "}
          <button type="button" onClick={() => choosePart("list")} className="font-bold text-brand underline">
            📝 내 연습 문제 ({mine.length})
          </button>{" "}
          탭에 모여요.
        </p>
      )}
        </>
      )}
    </div>
  );
}

/** 연습 문제 풀기 (AI가 만든 문제) */
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
  return (
    <ProblemSolver
      userId={userId}
      subject={problem.subject}
      problemKey={practiceKey(problem.id)}
      view={asProblem(problem)}
      tests={problem.tests}
      starterCode={problem.starterCode}
      badge={
        <>
          🤖 AI가 만든 문제입니다 <span className="font-normal text-muted">· 난이도 {levelLabel(problem.level)}</span>
        </>
      }
      extra={
        problem.source === "stuck" && (
          <p className="rounded-lg bg-violet-50 px-3 py-2 text-sm text-violet-900">🧩 내가 막혔던 곳: {problem.basis}</p>
        )
      }
      solvedAt={problem.solvedAt}
      checks={problem.checks}
      flagged={problem.flaggedBy !== null}
      ai={{ practiceId: problem.id }}
      backLabel="연습 문제 목록"
      onBack={onBack}
      save={(work) => savePracticeCheck(problem.id, work)}
      loadSaved={async () => {
        const r = await loadMyPractice(problem.id);
        return r.ok && r.problem.code !== null ? { code: r.problem.code, init: r.problem.initCode ?? "", log: r.problem.log } : null;
      }}
      flag={() => flagMyPractice(problem.id)}
      onSaved={onSaved}
    />
  );
}
