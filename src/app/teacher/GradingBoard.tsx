"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import Pager from "@/components/Pager";
import { useStudentNav } from "@/components/SideTabs";
import {
  canMarkWrong,
  GRADING_PAGE_SIZE,
  isGraded,
  MAX_FEEDBACK,
  MAX_WRONG_REASON,
  rubricTotal,
  sameRubric,
  type GradingRow,
  type RubricPart,
} from "@/lib/grading";
import ReplaySection from "../student/ReplaySection";
import { loadGrading, loadStudentReplay, removeSubmission, saveGrade, setWrong } from "./actions";
import { RUBRIC_CHANGED_EVENT } from "./RubricSettings";

const inputClass = "rounded-lg border border-line bg-white px-3 py-2 outline-none focus:border-brand focus:ring-2 focus:ring-brand/15";

const timeFormat = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  month: "numeric",
  day: "numeric",
  weekday: "short",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

const rubricText = (parts: RubricPart[]) => `${parts.map((p) => `${p.name} ${p.max}`).join(" · ")} (합계 ${rubricTotal(parts)})`;

/** 처음 화면의 "과목별 채점 대기"를 누르면 그 과목으로 채점 화면을 연다 */
export const GRADE_SUBJECT_EVENT = "grade-subject";

type Filter = { subject: string; cls: string; problem: string; query: string; ungradedOnly: boolean };

/**
 * 채점 (v1 "채점 관리"를 옮김): 과목·반·문제·이름으로 고르고, 과목마다 선생님이 정한 채점 기준으로 점수를 준다.
 * 제출마다 "▶ 과정 보기"로 재생·AI 도움 과정·되돌아보기 답을 보며 채점할 수 있다.
 */
export default function GradingBoard({
  subjects: knownSubjects,
  problems,
  pending: initialPending,
}: {
  subjects: string[];
  problems: Record<string, string[]>;
  /** 과목별 채점 대기 수 */
  pending: Record<string, number>;
}) {
  // 채점할 것이 있는 과목은 목록에 없어도(예전 과목) 고를 수 있게
  const subjects = [...knownSubjects, ...Object.keys(initialPending).filter((s) => !knownSubjects.includes(s))];
  // 처음에는 채점 대기가 가장 많은 과목
  const busiest = Object.entries(initialPending).sort((a, b) => b[1] - a[1])[0]?.[0];
  const [filter, setFilter] = useState<Filter>({ subject: busiest ?? subjects[0], cls: "", problem: "", query: "", ungradedOnly: true });
  const [pendingCounts, setPendingCounts] = useState(initialPending);
  const [typed, setTyped] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Extract<Awaited<ReturnType<typeof loadGrading>>, { ok: true }> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [reload, setReload] = useState(0);
  const savers = useRef(new Map<number, () => Promise<boolean>>());
  const [dirty, setDirty] = useState<Set<number>>(new Set());
  const [savingAll, setSavingAll] = useState(false);
  const { showTab } = useStudentNav();

  // 처음 화면에서 과목을 골라 왔으면 그 과목으로
  useEffect(() => {
    const pick = (e: Event) => {
      const subject = (e as CustomEvent<string>).detail;
      setFilter((f) => ({ ...f, subject, cls: "", problem: "", ungradedOnly: true }));
      setPage(1);
    };
    window.addEventListener(GRADE_SUBJECT_EVENT, pick);
    return () => window.removeEventListener(GRADE_SUBJECT_EVENT, pick);
  }, []);

  // 설정에서 채점 기준을 바꾸면 다시 불러온다
  useEffect(() => {
    const again = () => setReload((n) => n + 1);
    window.addEventListener(RUBRIC_CHANGED_EVENT, again);
    return () => window.removeEventListener(RUBRIC_CHANGED_EVENT, again);
  }, []);

  useEffect(() => {
    startTransition(async () => {
      const r = await loadGrading(filter, page);
      if (!r.ok) return setError(r.message);
      setError(null);
      setData(r);
      setPendingCounts(r.pending);
      setDirty(new Set());
    });
  }, [filter, page, reload]);

  const change = (next: Partial<Filter>) => {
    if (dirty.size && !confirm(`저장하지 않은 채점이 ${dirty.size}개 있어요. 저장하지 않고 다른 목록을 볼까요?`)) return false;
    setFilter((f) => ({ ...f, ...next }));
    setPage(1);
    return true;
  };
  const goPage = (p: number) => {
    if (dirty.size && !confirm(`저장하지 않은 채점이 ${dirty.size}개 있어요. 저장하지 않고 넘어갈까요?`)) return;
    setPage(p);
  };

  const onDirty = useCallback((id: number, isDirty: boolean) => {
    setDirty((d) => {
      if (d.has(id) === isDirty) return d;
      const next = new Set(d);
      if (isDirty) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  async function saveAll() {
    setSavingAll(true);
    let failed = 0;
    for (const id of dirty) if (!(await savers.current.get(id)?.())) failed++;
    setSavingAll(false);
    if (failed) setError(`${failed}개는 저장하지 못했어요. 그 제출의 안내를 확인하세요.`);
  }

  const rubric = data?.rubric.parts;
  const pages = data ? Math.max(1, Math.ceil(data.total / GRADING_PAGE_SIZE)) : 1;

  return (
    <section className="flex flex-col gap-4 rounded-xl border border-line bg-white p-5">
      <div className="flex flex-wrap items-end gap-2">
        <h2 className="mr-auto text-lg font-bold">📝 채점</h2>
        <select value={filter.subject} onChange={(e) => change({ subject: e.target.value, cls: "", problem: "" })} aria-label="과목" className={inputClass}>
          {subjects.map((s) => (
            <option key={s} value={s}>
              {s}
              {pendingCounts[s] ? ` (미채점 ${pendingCounts[s]})` : ""}
            </option>
          ))}
        </select>
        <select value={filter.cls} onChange={(e) => change({ cls: e.target.value })} aria-label="반" className={inputClass}>
          <option value="">모든 반</option>
          {(data?.classes ?? []).map((c) => (
            <option key={c} value={c}>
              {c}반
            </option>
          ))}
        </select>
        <select value={filter.problem} onChange={(e) => change({ problem: e.target.value })} aria-label="문제" className={inputClass}>
          <option value="">모든 문제</option>
          {(problems[filter.subject] ?? []).map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!change({ query: typed })) setTyped(filter.query);
          }}
          className="flex gap-1"
        >
          <input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="이름·아이디 찾기" aria-label="이름·아이디 찾기" className={`${inputClass} w-36`} />
          <button type="submit" className="rounded-lg border border-line px-3 py-2 text-sm hover:bg-page">
            찾기
          </button>
        </form>
        <label className="flex items-center gap-1.5 text-sm">
          <input type="checkbox" checked={filter.ungradedOnly} onChange={(e) => change({ ungradedOnly: e.target.checked })} />
          미채점만
        </label>
      </div>

      {data && rubric && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg bg-page px-3 py-2 text-sm">
          <span className="font-bold">⚖️ {filter.subject} 채점 기준</span>
          <span>{rubricText(rubric)}</span>
          <button type="button" onClick={() => showTab("settings")} className="ml-auto font-bold text-brand hover:underline">
            ⚙️ 설정에서 바꾸기 →
          </button>
          {!data.rubric.ready && (
            <p className="w-full text-xs text-amber-800">
              지금은 기본 기준이에요. 과목마다 기준을 정하려면 Supabase에서 <code>012_grading_rubrics.sql</code>을 실행해 주세요.
            </p>
          )}
        </div>
      )}

      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      {data && (
        <div className="flex flex-wrap items-center gap-3 text-sm text-muted">
          <span>{pending ? "불러오는 중…" : `${data.total}개${filter.ungradedOnly ? " (미채점)" : ""}`}</span>
          <button
            type="button"
            onClick={saveAll}
            disabled={!dirty.size || savingAll}
            className="ml-auto rounded-lg bg-brand px-3 py-1.5 font-bold text-white disabled:opacity-40"
          >
            {savingAll ? "저장 중…" : `💾 바뀐 채점 모두 저장 (${dirty.size})`}
          </button>
          <button type="button" onClick={() => setReload((n) => n + 1)} className="rounded-lg border border-line px-3 py-1.5 hover:bg-page">
            ↻ 새로 불러오기
          </button>
        </div>
      )}

      <ul className={`flex flex-col gap-4 ${pending ? "opacity-50" : ""}`}>
        {data?.rows.map((row) => (
          <GradingCard
            key={row.id}
            row={row}
            rubric={data.rubric.parts}
            savers={savers}
            onDirty={onDirty}
            onRemoved={() => setReload((n) => n + 1)}
          />
        ))}
      </ul>
      {data && !pending && data.rows.length === 0 && (
        <p className="text-sm text-muted">{filter.ungradedOnly ? "채점할 제출이 없어요. 🎉" : "조건에 맞는 제출이 없어요."}</p>
      )}
      <Pager page={Math.min(page, pages)} pages={pages} onPage={goPage} />
    </section>
  );
}

/** 제출 하나 채점 */
function GradingCard({
  row: initial,
  rubric,
  savers,
  onDirty,
  onRemoved,
}: {
  row: GradingRow;
  rubric: RubricPart[];
  savers: React.RefObject<Map<number, () => Promise<boolean>>>;
  onDirty: (id: number, dirty: boolean) => void;
  onRemoved: () => void;
}) {
  const { problemLabel } = useStudentNav();
  const [row, setRow] = useState(initial);
  // 이미 채점한 제출은 그때 기준, 아니면 지금 과목 기준
  const [parts, setParts] = useState<RubricPart[]>(() => (initial.sheet ? initial.sheet.map(({ name, max }) => ({ name, max })) : rubric));
  const [scores, setScores] = useState<string[]>(() => (initial.sheet ? initial.sheet.map((p) => String(p.score)) : rubric.map(() => "")));
  const [feedback, setFeedback] = useState(initial.feedback);
  const [wrong, setWrongText] = useState(initial.wrongReason);
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);
  const [pending, startTransition] = useTransition();
  const [showReplay, setShowReplay] = useState(false);

  // 아직 채점하지 않은 제출이면 과목 기준이 바뀔 때 따라간다
  useEffect(() => {
    if (row.sheet) return;
    /* eslint-disable react-hooks/set-state-in-effect -- 위에서 바꾼 과목 기준을 받아 오는 것 */
    setParts(rubric);
    setScores(rubric.map(() => ""));
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [rubric, row.sheet]);

  const saved = row.sheet ? row.sheet.map((p) => String(p.score)) : parts.map(() => "");
  const dirty =
    scores.some((s, i) => s !== (saved[i] ?? "")) || feedback.trim() !== row.feedback.trim() || (!!row.sheet && !sameRubric(parts, row.sheet));
  const total = scores.reduce((a, s) => a + (Number(s) || 0), 0);

  async function save(): Promise<boolean> {
    if (scores.some((s) => s.trim() === "")) {
      setMessage({ text: "점수를 모두 적어 주세요. (0점도 적어 주세요)", ok: false });
      return false;
    }
    const r = await saveGrade(row.id, parts, scores.map(Number), feedback);
    if (!r.ok) {
      setMessage({ text: r.message, ok: false });
      return false;
    }
    setRow(r.row);
    setMessage({ text: `✅ 저장했어요 (${r.row.total}점)`, ok: true });
    return true;
  }

  useEffect(() => {
    onDirty(row.id, dirty);
    if (dirty) savers.current.set(row.id, save);
    else savers.current.delete(row.id);
  });
  useEffect(() => () => {
    savers.current.delete(initial.id);
    onDirty(initial.id, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 사라질 때 한 번
  }, []);

  const wrongAction = (reason: string | null) =>
    startTransition(async () => {
      const r = await setWrong(row.id, reason);
      if (!r.ok) return setMessage({ text: r.message, ok: false });
      setRow(r.row);
      setWrongText(r.row.wrongReason);
      setMessage({ text: reason ? "⚠️ 오답 처리했어요" : "오답을 풀었어요", ok: true });
    });

  function remove() {
    if (!confirm(`${row.name} 학생의 ${row.problem} 제출을 지울까요?\n작성 기록까지 모두 사라지고 되돌릴 수 없어요.`)) return;
    startTransition(async () => {
      const r = await removeSubmission(row.id);
      if (!r.ok) return setMessage({ text: r.message ?? "지우지 못했어요.", ok: false });
      onRemoved();
    });
  }

  const graded = isGraded(row);
  const oldRubric = row.sheet && !sameRubric(parts, rubric);
  return (
    <li className={`flex flex-col gap-3 rounded-xl border p-4 ${dirty ? "border-brand" : "border-line"}`}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="font-bold">
          {row.userId && row.userId !== row.name ? `${row.userId} ` : ""}
          {row.name}
        </span>
        {row.grade && row.cls && <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-bold text-blue-700">{row.grade}-{row.cls}반</span>}
        <span className="font-medium">{problemLabel(row.subject, row.problem)}</span>
        <span className="text-sm tabular-nums text-muted">{timeFormat.format(new Date(row.submittedAt))}</span>
        {row.wrongReason ? (
          <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-bold text-danger">⚠️ 오답: {row.wrongReason}</span>
        ) : graded ? (
          <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-bold text-green-700">채점됨 {row.total}점</span>
        ) : (
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-800">미채점</span>
        )}
        <button
          type="button"
          onClick={() => setShowReplay(!showReplay)}
          aria-expanded={showReplay}
          className="ml-auto rounded-lg border border-brand px-3 py-1 text-sm font-bold text-brand hover:bg-brand-soft"
        >
          {showReplay ? "과정 닫기" : "▶ 과정 보기"}
        </button>
      </div>
      <p className="text-sm text-muted">
        <b>코드 설명</b> {row.description || "(없음)"}
      </p>
      <pre className="max-h-80 overflow-auto rounded-lg bg-page p-3 text-sm font-[family-name:var(--font-code)]">{row.code || "(코드 없음)"}</pre>
      {showReplay && <ReplaySection submissionId={row.id} loader={loadStudentReplay} noteRole="teacher" autoStart />}

      <div className="flex flex-wrap items-end gap-3">
        {parts.map((p, i) => (
          <label key={`${p.name}-${i}`} title={p.desc} className="flex flex-col gap-1 text-sm text-muted">
            {p.name}({p.max})
            <input
              type="number"
              min={0}
              max={p.max}
              value={scores[i] ?? ""}
              onChange={(e) => setScores(scores.map((s, k) => (k === i ? e.target.value : s)))}
              className={`${inputClass} w-24 ${Number(scores[i]) > p.max || Number(scores[i]) < 0 ? "border-danger" : ""}`}
            />
          </label>
        ))}
        <span className="pb-2 font-bold">
          합계 <span className="text-brand">{total}</span> / {rubricTotal(parts)}
        </span>
        {parts.length > 0 &&
          scores.every((s) => s === "") && (
            <button
              type="button"
              onClick={() => setScores(parts.map((p) => String(p.max)))}
              className="pb-2 text-sm text-brand hover:underline"
            >
              모두 만점
            </button>
          )}
      </div>
      {parts.some((p) => p.desc) && (
        <dl className="grid gap-x-3 gap-y-0.5 rounded-lg bg-page px-3 py-2 text-xs text-muted sm:grid-cols-[auto_1fr]">
          {parts
            .filter((p) => p.desc)
            .map((p) => (
              <div key={p.name} className="contents">
                <dt className="font-bold">{p.name}</dt>
                <dd className="whitespace-pre-wrap">{p.desc}</dd>
              </div>
            ))}
        </dl>
      )}
      {oldRubric && (
        <p className="text-xs text-muted">
          채점할 때의 기준({parts.map((p) => `${p.name} ${p.max}`).join(" · ")})이에요.{" "}
          <button
            type="button"
            onClick={() => {
              setParts(rubric);
              setScores(rubric.map(() => ""));
            }}
            className="text-brand hover:underline"
          >
            지금 기준으로 다시 채점
          </button>
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <input
          value={feedback}
          onChange={(e) => setFeedback(e.target.value)}
          maxLength={MAX_FEEDBACK}
          placeholder="감점 이유 (학생에게 보여요)"
          aria-label="감점 이유"
          className={`${inputClass} min-w-60 flex-1`}
        />
        <button
          type="button"
          onClick={() => startTransition(async () => void (await save()))}
          disabled={pending || !dirty}
          className="rounded-lg bg-brand px-4 py-2 font-bold text-white disabled:opacity-40"
        >
          저장
        </button>
      </div>
      <div className="flex flex-wrap gap-2">
        <input
          value={wrong}
          onChange={(e) => setWrongText(e.target.value)}
          maxLength={MAX_WRONG_REASON}
          disabled={!canMarkWrong(row.total) || !!row.wrongReason}
          placeholder={canMarkWrong(row.total) ? "오답 이유 (학생에게 보여요)" : "점수가 있는 제출은 오답 처리할 수 없어요"}
          aria-label="오답 이유"
          className={`${inputClass} min-w-60 flex-1 disabled:bg-page`}
        />
        {row.wrongReason ? (
          <button type="button" onClick={() => wrongAction(null)} disabled={pending} className="rounded-lg border border-line px-3 py-2 text-sm hover:bg-page">
            오답 풀기
          </button>
        ) : (
          <button
            type="button"
            onClick={() => wrongAction(wrong)}
            disabled={pending || !canMarkWrong(row.total) || !wrong.trim()}
            className="rounded-lg border border-danger px-3 py-2 text-sm font-bold text-danger hover:bg-red-50 disabled:opacity-40"
          >
            ⚠️ 오답 처리
          </button>
        )}
        <button type="button" onClick={remove} disabled={pending} className="rounded-lg px-3 py-2 text-sm text-muted hover:bg-red-50 hover:text-danger">
          🗑 삭제
        </button>
      </div>
      {message && (
        <p role={message.ok ? "status" : "alert"} className={`text-sm ${message.ok ? "text-green-700" : "text-danger"}`}>
          {message.text}
        </p>
      )}
    </li>
  );
}
