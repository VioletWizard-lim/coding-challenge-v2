"use client";

import { useEffect, useState, useTransition } from "react";
import ProblemView from "@/components/ProblemView";
import Replayer from "@/components/Replayer";
import { judge, type TestOutcome } from "@/lib/practice";
import { STATUS_LABEL, studentAsProblem, type ProblemStatus, type StudentProblemForTeacher } from "@/lib/studentProblem";
import type { StudentRow } from "@/lib/teacher";
import { Outcomes, runTests } from "@/components/TestOutcomes";
import { flagStudentProblemAction, loadStudentProblemsForTeacher, reviewStudentProblemAction } from "./actions";

const timeFormat = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });

type Filter = ProblemStatus | "flagged" | "all";

/**
 * 📚 문제 관리 → ✏️ 학생이 만든 문제: "반 친구와 풀기"로 보낸 문제를 확인하고 승인하거나 고쳐 달라고 한다.
 * 학생 답은 선생님 브라우저에서 예시로 다시 돌려 볼 수 있다(서버에서는 학생 코드를 실행하지 않음). 나만 푸는 문제도 볼 수 있다.
 */
export default function StudentProblemReview({ students }: { students: StudentRow[] }) {
  const [data, setData] = useState<{ ready: boolean; problems: StudentProblemForTeacher[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("pending");
  const [open, setOpen] = useState<number | null>(null);

  useEffect(() => {
    loadStudentProblemsForTeacher().then((r) => (r.ok ? setData(r) : setError(r.message)));
  }, []);

  const names = new Map(students.map((s) => [String(s.id), s.name]));
  const all = data?.problems ?? [];
  const count = (f: Filter) => all.filter((p) => matches(p, f)).length;
  const list = all.filter((p) => matches(p, filter));
  const update = (id: number, patch: Partial<StudentProblemForTeacher>) =>
    setData((d) => d && { ...d, problems: d.problems.map((p) => (p.id === id ? { ...p, ...patch } : p)) });

  return (
    <section className="flex flex-col gap-4 rounded-xl border border-line bg-white p-5">
      <div>
        <h2 className="text-lg font-bold">✏️ 학생이 만든 문제</h2>
        <p className="mt-1 text-sm leading-6 text-muted">
          학생이 연습 모드에서 직접 만든 문제예요. 학생 답으로 예시를 모두 통과한 문제만 저장돼요. &lsquo;반 친구와 풀기&rsquo;로 보낸 문제는
          승인해야 같은 반 학생에게 보여요(만든 학생 이름과 답은 친구에게 안 보임).
        </p>
      </div>
      {error && <p className="text-sm text-danger">{error}</p>}
      {data && !data.ready && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
          ⚠️ 이 기능을 쓰려면 Supabase SQL Editor에서 <code>supabase/migrations/016_student_problems.sql</code>을 실행해 주세요.
        </p>
      )}
      {!data && !error && <p className="text-sm text-muted">불러오는 중…</p>}
      {data?.ready && (
        <>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="상태">
            {(
              [
                ["pending", `⏳ 승인 기다림 ${count("pending")}`],
                ["approved", `👥 공개됨 ${count("approved")}`],
                ["rejected", `✏️ 고쳐 달라고 함 ${count("rejected")}`],
                ["private", `🔒 나만 풀기 ${count("private")}`],
                ["flagged", `🚩 표시됨 ${count("flagged")}`],
                ["all", `전체 ${all.length}`],
              ] as const
            ).map(([f, label]) => (
              <button
                key={f}
                type="button"
                aria-pressed={filter === f}
                onClick={() => setFilter(f)}
                className={`rounded-full border px-3 py-1 text-sm ${filter === f ? "border-brand bg-brand-soft font-bold text-brand" : "border-line text-muted hover:border-brand"}`}
              >
                {label}
              </button>
            ))}
          </div>
          {list.length ? (
            <ul className="flex flex-col gap-2">
              {list.map((p) => (
                <ReviewCard
                  key={p.id}
                  p={p}
                  author={names.get(p.authorId)}
                  open={open === p.id}
                  onToggle={() => setOpen(open === p.id ? null : p.id)}
                  onChange={(patch) => update(p.id, patch)}
                />
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">이 조건의 문제가 없어요.</p>
          )}
        </>
      )}
    </section>
  );
}

const matches = (p: StudentProblemForTeacher, f: Filter) => (f === "all" ? true : f === "flagged" ? !!p.flaggedBy : p.status === f);

function ReviewCard({
  p,
  author,
  open,
  onToggle,
  onChange,
}: {
  p: StudentProblemForTeacher;
  author?: string;
  open: boolean;
  onToggle: () => void;
  onChange: (patch: Partial<StudentProblemForTeacher>) => void;
}) {
  const [note, setNote] = useState(p.reviewNote);
  const [outcomes, setOutcomes] = useState<TestOutcome[] | null>(null);
  const [replay, setReplay] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function review(approve: boolean) {
    setMessage(null);
    startTransition(async () => {
      const r = await reviewStudentProblemAction(p.id, approve, note);
      if (!r.ok) return setMessage(r.message ?? "저장하지 못했어요.");
      onChange({ status: approve ? "approved" : "rejected", reviewNote: approve ? "" : note.trim() });
    });
  }

  return (
    <li className={`flex flex-col gap-2 rounded-lg border px-4 py-3 ${p.flaggedBy ? "border-rose-300 bg-rose-50/40" : "border-line"}`}>
      <button type="button" onClick={onToggle} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-left">
        <span className="font-bold">{p.title}</span>
        <span className="text-sm text-muted">
          {p.authorId} {author && author !== p.authorId ? author : ""} · {p.subject} {p.classKey ? `${p.classKey}반` : ""}
        </span>
        <span className="rounded-full bg-page px-2 py-0.5 text-xs font-bold">{STATUS_LABEL[p.status]}</span>
        {p.flaggedBy && (
          <span className="rounded-full bg-rose-100 px-2 py-0.5 text-xs font-bold text-rose-700">
            🚩 {p.flaggedBy === "student" ? "학생이 알림" : "교사 표시"}
          </span>
        )}
        <span className="text-xs text-muted">통과한 학생 {p.solvers}명 · {timeFormat.format(new Date(p.updatedAt))}</span>
        <span className="ml-auto text-sm text-brand">{open ? "접기 ▲" : "자세히 ▼"}</span>
      </button>

      {open && (
        <div className="flex flex-col gap-3">
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-lg bg-page p-3">
              <ProblemView problem={studentAsProblem(p)} fit />
            </div>
            <div className="flex flex-col gap-2">
              <p className="text-sm font-bold">학생 답 (친구에게는 안 보임)</p>
              <pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded bg-page px-3 py-2 font-mono text-xs">{p.solution}</pre>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={async () => {
                    setMessage(null);
                    try {
                      setOutcomes(judge(p.tests, await runTests(p.solution, p.tests)));
                    } catch (err) {
                      setMessage(String((err as Error)?.message ?? err));
                    }
                  }}
                  className="rounded-lg border border-line px-3 py-1.5 text-sm hover:bg-page"
                >
                  ✅ 학생 답으로 예시 확인
                </button>
                {Array.isArray(p.solutionLog) && p.solutionLog.length > 0 && (
                  <button type="button" onClick={() => setReplay(!replay)} className="rounded-lg border border-line px-3 py-1.5 text-sm hover:bg-page">
                    ▶ 답을 쓴 과정 {replay ? "닫기" : "보기"}
                  </button>
                )}
              </div>
              {outcomes && <Outcomes tests={p.tests} outcomes={outcomes} />}
            </div>
          </div>
          {replay && <Replayer init={p.solutionInit} code={p.solution} log={p.solutionLog} />}

          <div className="flex flex-wrap items-end gap-2 border-t border-line pt-3">
            {p.share === "class" ? (
              <>
                <label className="flex min-w-60 flex-1 flex-col gap-1 text-xs text-muted">
                  고쳐 달라고 할 때 학생에게 보일 말
                  <input
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    maxLength={500}
                    placeholder="예: 예시 2의 출력 모양을 문제 설명과 맞춰 주세요."
                    className="rounded-lg border border-line px-3 py-2 text-sm text-ink"
                  />
                </label>
                <button
                  type="button"
                  disabled={pending || p.status === "approved"}
                  onClick={() => review(true)}
                  className="rounded-lg bg-green-600 px-3 py-2 text-sm font-bold text-white disabled:opacity-50"
                >
                  👥 승인 (반 친구에게 공개)
                </button>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => review(false)}
                  className="rounded-lg border border-line px-3 py-2 text-sm font-bold hover:bg-page disabled:opacity-50"
                >
                  {p.status === "approved" ? "공개 멈추고 고쳐 달라기" : "✏️ 고쳐 달라기"}
                </button>
              </>
            ) : (
              <p className="mr-auto text-sm text-muted">🔒 학생이 &lsquo;나만 풀기&rsquo;로 만든 문제예요. 승인할 것은 없어요.</p>
            )}
            <button
              type="button"
              onClick={() =>
                flagStudentProblemAction(p.id, !p.flaggedBy).then((r) =>
                  r.ok ? onChange({ flaggedBy: p.flaggedBy ? null : "teacher" }) : setMessage(r.message ?? "저장하지 못했어요."),
                )
              }
              className="rounded-lg border border-line px-3 py-2 text-xs hover:bg-page"
            >
              {p.flaggedBy ? "표시 풀기" : "🚩 부적절한 내용으로 표시"}
            </button>
          </div>
          {message && <p className="text-sm text-danger">{message}</p>}
        </div>
      )}
    </li>
  );
}
