"use client";

import { useEffect, useState } from "react";
import { useStudentNav } from "@/components/SideTabs";
import { byNumber } from "@/lib/classes";
import { latestPerStudent, liveFlags, type LiveRow } from "@/lib/liveStatus";
import { STUCK_RULE_NAMES, STUCK_RULES } from "@/lib/stuckRules";
import { loadLiveStatus, type LiveResult } from "./actions";

const REFRESH_MS = 30_000;

/**
 * 교사 첫 화면 "지금 수업 중" (P3): 지금 문제를 쓰고 있는 학생 중
 * ⏳ 시작 지연(문제를 연 지 5분 넘게 첫 입력 없음), 🔁 막힘 반복(막힘 알림 2번 이상)을 보여 준다. 30초마다 새로 고친다.
 * 코드 내용은 보이지 않는다 (학생 화면에도 "선생님이 시작 여부와 막힘 알림 횟수를 볼 수 있어요"라고 알린다).
 */
export default function LiveStatusCard() {
  const { problemLabel } = useStudentNav();
  const [data, setData] = useState<LiveResult | null>(null);
  const [cls, setCls] = useState("");

  useEffect(() => {
    let alive = true;
    const load = () => {
      if (document.hidden) return;
      loadLiveStatus().then((r) => alive && setData(r));
    };
    load();
    const timer = setInterval(load, REFRESH_MS);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);

  if (!data) return null;
  const R = STUCK_RULES.live;
  if (!data.ok) return <p className="text-sm text-danger">{data.message}</p>;
  if (!data.ready) {
    return (
      <section className="rounded-xl border border-line bg-white p-4 text-sm text-muted">
        🟢 <b className="text-ink">지금 수업 중</b> · 학생이 문제를 시작했는지와 막힘을 보려면 Supabase SQL Editor에서{" "}
        <code>supabase/migrations/024_live_status.sql</code>을 실행해 주세요.
      </section>
    );
  }
  // 학생마다 지금 쓰고 있는 문제 하나만 (문제를 바꾸면 앞 문제는 숨김)
  const rows = latestPerStudent(data.rows)
    .map((r) => ({ ...r, flags: liveFlags(r, data.now) }))
    .filter((r) => r.flags.present);
  const classes = [...new Set(rows.map((r) => r.cls).filter(Boolean))].sort(byNumber);
  const shown = rows.filter((r) => !cls || r.cls === cls);
  const late = shown.filter((r) => r.flags.lateStart).sort((a, b) => a.openedAt - b.openedAt);
  const stuck = shown.filter((r) => r.flags.repeatedStuck).sort((a, b) => b.nudgeCount - a.nudgeCount);
  const students = new Set(shown.map((r) => r.userId)).size;
  const who = (r: LiveRow) => (
    <>
      <b>{r.name}</b>
      {r.cls && <span className="text-muted"> ({r.cls})</span>} · {problemLabel(r.subject, r.problem)}
    </>
  );

  return (
    <section className="flex flex-col gap-3 rounded-xl border border-line bg-white p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-bold">🟢 지금 수업 중</h3>
        <span className="text-sm text-muted">문제를 쓰고 있는 학생 {students}명 · 30초마다 새로 고침</span>
        {classes.length > 1 && (
          <select value={cls} onChange={(e) => setCls(e.target.value)} aria-label="반" className="ml-auto rounded-lg border border-line bg-white px-2 py-1 text-sm">
            <option value="">모든 반</option>
            {classes.map((c) => (
              <option key={c} value={c}>
                {c}반
              </option>
            ))}
          </select>
        )}
      </div>
      {students === 0 ? (
        <p className="text-sm text-muted">지금 문제를 쓰고 있는 학생이 없어요.</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5 rounded-lg bg-amber-50/70 p-3">
            <p className="text-sm font-bold text-amber-900">
              ⏳ 시작 지연 {late.length}명 <span className="font-normal text-amber-800">(문제를 연 지 {R.lateStartMs / 60_000}분 넘게 첫 입력 없음)</span>
            </p>
            {late.length === 0 ? (
              <p className="text-sm text-muted">없어요.</p>
            ) : (
              <ul className="flex flex-col gap-1 text-sm">
                {late.map((r) => (
                  <li key={`${r.userId}_${r.subject}_${r.problem}`}>
                    {who(r)} · <span className="text-amber-900">연 지 {r.flags.openMinutes}분</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="flex flex-col gap-1.5 rounded-lg bg-rose-50/60 p-3">
            <p className="text-sm font-bold text-rose-900">
              🔁 막힘 반복 {stuck.length}명 <span className="font-normal text-rose-800">(막힘 알림 {R.repeatedNudges}번 이상)</span>
            </p>
            {stuck.length === 0 ? (
              <p className="text-sm text-muted">없어요.</p>
            ) : (
              <ul className="flex flex-col gap-1 text-sm">
                {stuck.map((r) => (
                  <li key={`${r.userId}_${r.subject}_${r.problem}`}>
                    {who(r)} · <span className="text-rose-900">알림 {r.nudgeCount}번</span>
                    {r.lastNudgeRule && (
                      <span className="text-muted"> · 최근: {STUCK_RULE_NAMES[r.lastNudgeRule as keyof typeof STUCK_RULE_NAMES] ?? r.lastNudgeRule}</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
      <p className="text-xs text-muted">코드 내용은 보이지 않아요. 학생 화면에도 선생님이 시작 여부와 막힘 알림 횟수를 볼 수 있다고 안내돼 있어요.</p>
    </section>
  );
}
