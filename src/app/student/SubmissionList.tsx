"use client";

import { useEffect, useRef, useState } from "react";
import { problemLabel } from "@/lib/problems";
import type { MySubmission } from "@/lib/submissions";
import ReplaySection from "./ReplaySection";
import { useStudentNav } from "./StudentTabs";

const timeFormat = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

const isGraded = (s: MySubmission) => s.score_total !== null || Boolean(s.feedback);

/** 만점이 아닌 영역 (v1과 같이 기능·코드 설명만, 도전은 가산점이라 빼고) */
function deductedAreas(s: MySubmission) {
  if (!isGraded(s)) return [];
  const areas: string[] = [];
  if (s.score_function !== null && s.score_function < 40) areas.push("기능");
  if (s.score_understanding !== null && s.score_understanding < 40) areas.push("코드 설명");
  return areas;
}

const PAGE = 10;

type Group = { key: string; latest: MySubmission; older: MySubmission[] };

/** 같은 문제의 제출을 묶는다. 목록은 최근 제출 순이므로 처음 나온 것이 그 문제의 최근 제출 */
function groupByProblem(rows: MySubmission[]): Group[] {
  const groups = new Map<string, Group>();
  for (const s of rows) {
    const key = `${s.subject}_${s.problem}`;
    const g = groups.get(key);
    if (g) g.older.push(s);
    else groups.set(key, { key, latest: s, older: [] });
  }
  return [...groups.values()];
}

/** "2-10"이 "2-9" 뒤에 오도록 번호를 숫자로 비교 */
const problemOrder = (a: string, b: string) => {
  const [a1, a2] = a.split("-").map(Number);
  const [b1, b2] = b.split("-").map(Number);
  return a1 - b1 || a2 - b2 || a.localeCompare(b);
};

/** 내 제출 현황 목록: 문제 고르기(기본 전체), 문제별로 최근 제출만 보이고, 처음 10문제 + 더 보기 */
export default function SubmissionList({ rows }: { rows: MySubmission[] }) {
  const groups = groupByProblem(rows);
  const [shown, setShown] = useState(PAGE);
  const { selectedProblem: selected, setSelectedProblem: setSelected } = useStudentNav();

  const subjects = new Set(groups.map((g) => g.latest.subject));
  const options = [...groups].sort(
    (a, b) => a.latest.subject.localeCompare(b.latest.subject) || problemOrder(a.latest.problem, b.latest.problem),
  );
  const label = (g: Group) =>
    (subjects.size > 1 ? `[${g.latest.subject}] ` : "") + problemLabel(g.latest.subject, g.latest.problem);
  const picked = groups.find((g) => g.key === selected);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={picked ? selected : "all"}
          onChange={(e) => setSelected(e.target.value)}
          aria-label="문제 고르기"
          className="min-w-60 rounded-lg border border-line bg-white px-3 py-2 text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand/15"
        >
          <option value="all">전체 ({groups.length}문제)</option>
          {options.map((g) => (
            <option key={g.key} value={g.key}>
              {label(g)} ({1 + g.older.length}번)
            </option>
          ))}
        </select>
        <span className="text-sm text-muted">
          {picked ? `제출 ${1 + picked.older.length}번` : `${groups.length}문제 · 제출 ${rows.length}번`}
        </span>
      </div>
      {picked ? (
        // 한 문제를 고르면 그 문제의 제출을 모두 펼쳐서 보여 준다 (최근 제출부터)
        <ul className="flex flex-col gap-2">
          {[picked.latest, ...picked.older].map((s) => (
            <li key={s.id}>
              <SubmissionCard s={s} />
            </li>
          ))}
        </ul>
      ) : (
        <ul className="flex flex-col gap-2">
          {groups.slice(0, shown).map((g) => (
            <ProblemItem key={g.key} group={g} />
          ))}
        </ul>
      )}
      {!picked && groups.length > shown && (
        <button
          type="button"
          onClick={() => setShown(shown + PAGE)}
          className="self-center rounded-lg border border-line bg-white px-4 py-2 text-sm text-muted hover:bg-page"
        >
          더 보기 (남은 {groups.length - shown}문제)
        </button>
      )}
    </div>
  );
}

function ProblemItem({ group }: { group: Group }) {
  const [showOlder, setShowOlder] = useState(false);
  return (
    <li className="flex flex-col gap-1.5">
      <SubmissionCard s={group.latest} />
      {group.older.length > 0 && (
        <>
          <button
            type="button"
            onClick={() => setShowOlder(!showOlder)}
            className="self-start pl-5 text-sm text-muted hover:text-brand"
          >
            {showOlder ? "▴ 이전 제출 접기" : `▾ 이전 제출 ${group.older.length}개 보기`}
          </button>
          {showOlder && (
            <ul className="flex flex-col gap-1.5 border-l-2 border-line pl-4">
              {group.older.map((s) => (
                <li key={s.id}>
                  <SubmissionCard s={s} />
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </li>
  );
}

function SubmissionCard({ s }: { s: MySubmission }) {
  const { focusedSubmission } = useStudentNav();
  const focused = focusedSubmission === s.id;
  const ref = useRef<HTMLDetailsElement>(null);
  // 학습 여정에서 "과정 보기"로 왔으면 이 제출을 펼치고 화면에 보이게 한다
  useEffect(() => {
    if (!focused || !ref.current) return;
    ref.current.open = true;
    ref.current.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [focused]);
  return (
    <details ref={ref} className={`group rounded-xl border bg-white shadow-sm ${focused ? "border-brand" : "border-line"}`}>
      <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-1 px-5 py-3.5">
        <span className="font-bold text-brand">{problemLabel(s.subject, s.problem)}</span>
        {s.wrong_reason && (
          <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-bold text-danger">⚠️ 오답</span>
        )}
        {deductedAreas(s).length > 0 && (
          <span className="rounded-full bg-orange-50 px-2 py-0.5 text-xs font-bold text-orange-700">
            📉 감점: {deductedAreas(s).join(" · ")}
          </span>
        )}
        <span className="text-sm text-muted">{timeFormat.format(new Date(s.submitted_at))}</span>
        <span className="ml-auto">
          {isGraded(s) ? (
            <b className="text-lg text-brand">{s.score_total ?? 0}점</b>
          ) : (
            <span className="text-sm text-muted">채점 중</span>
          )}
        </span>
        <span className="text-muted transition group-open:rotate-180" aria-hidden>
          ▾
        </span>
      </summary>
      <div className="flex flex-col gap-3 border-t border-line px-5 py-4">
        {isGraded(s) && (
          <div className="flex flex-wrap gap-2">
            <Score label="기능" value={s.score_function} max={40} />
            <Score label="코드 설명" value={s.score_understanding} max={40} />
            <Score label="도전" value={s.score_challenge} max={20} />
            <Score label="합계" value={s.score_total} max={100} strong />
          </div>
        )}
        {s.feedback && <Note tone="amber">💬 선생님 피드백: {s.feedback}</Note>}
        {s.wrong_reason && <Note tone="red">⚠️ 오답 이유: {s.wrong_reason}</Note>}
        {s.description && <p className="text-sm text-muted">내 설명: {s.description}</p>}
        <pre className="max-h-80 overflow-auto rounded-lg bg-page p-3 font-[family-name:var(--font-code)] text-sm">
          {s.code}
        </pre>
        <ReplaySection key={focused ? "focused" : "normal"} submissionId={s.id} autoStart={focused} />
      </div>
    </details>
  );
}

function Score({ label, value, max, strong }: { label: string; value: number | null; max: number; strong?: boolean }) {
  return (
    <div className={`rounded-lg px-3.5 py-2 text-center ${strong ? "bg-brand text-white" : "bg-page"}`}>
      <div className={`text-xs ${strong ? "text-indigo-200" : "text-muted"}`}>{label}</div>
      <div className="font-bold">
        {value ?? 0}
        <span className={`text-xs ${strong ? "text-indigo-200" : "text-muted"}`}>/{max}</span>
      </div>
    </div>
  );
}

function Note({ tone, children }: { tone: "amber" | "red"; children: React.ReactNode }) {
  const color = tone === "amber" ? "bg-amber-50 text-amber-900" : "bg-red-50 text-danger";
  return <p className={`whitespace-pre-wrap rounded-lg px-3 py-2 text-sm ${color}`}>{children}</p>;
}
