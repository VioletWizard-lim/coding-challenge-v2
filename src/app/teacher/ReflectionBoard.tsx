"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import ReflectionView from "@/components/ReflectionView";
import { allowedSubjects, gradeClassFor } from "@/lib/problems";
import type { Reflection } from "@/lib/reflection";
import type { ReflectionDay } from "@/lib/reflectionStore";
import type { StudentRow } from "@/lib/teacher";
import { loadReflections } from "./actions";

const inputClass = "rounded-lg border border-line bg-white px-3 py-2 outline-none focus:border-brand focus:ring-2 focus:ring-brand/15";

const dayFormat = new Intl.DateTimeFormat("ko-KR", { timeZone: "UTC", month: "long", day: "numeric", weekday: "short" });
const formatDay = (date: string) => dayFormat.format(new Date(`${date}T00:00:00Z`));

const classKey = (s: StudentRow, subject: string) => {
  const { grade, class: cls } = gradeClassFor(s, subject);
  return grade || cls ? `${grade ?? "?"}-${cls ?? "?"}` : "반 없음";
};
const byNumber = (a: string, b: string) => a.localeCompare(b, "ko", { numeric: true });

/**
 * 교사용 성찰 모아보기: 과목·반을 고르면 그 반 학생들이 성찰을 쓴 날만 날짜 목록에 나온다.
 * 날짜를 고르면 쓴 학생의 성찰을 학번 순으로, 아직 안 쓴 학생은 아래에 이름만 보여 준다.
 * 반은 학생 계정의 지금 반(프로그래밍이면 프로그래밍 반)으로 나눈다.
 */
export default function ReflectionBoard({
  students,
  subjects,
  ready,
  days,
  titles,
}: {
  students: StudentRow[];
  subjects: string[];
  ready: boolean;
  /** 누가 어느 날·과목에 썼는지 (서버에서 한 번에 받음) */
  days: ReflectionDay[];
  /** "과목_번호" → 문제 제목 */
  titles: Record<string, string>;
}) {
  const router = useRouter();
  const [subject, setSubject] = useState(subjects[0]);
  const [pickedClass, setPickedClass] = useState("");
  const [pickedDate, setPickedDate] = useState("");
  const [result, setResult] = useState<{ key: string; reflections: Reflection[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const inSubject = useMemo(
    () => students.filter((s) => allowedSubjects(s.subjects).includes(subject)),
    [students, subject],
  );
  const classes = useMemo(() => [...new Set(inSubject.map((s) => classKey(s, subject)))].sort(byNumber), [inSubject, subject]);
  const cls = classes.includes(pickedClass) ? pickedClass : (classes[0] ?? "");
  const rows = useMemo(
    () => inSubject.filter((s) => classKey(s, subject) === cls).sort((a, b) => byNumber(String(a.id), String(b.id))),
    [inSubject, subject, cls],
  );

  // 이 반 학생이 이 과목 성찰을 쓴 날만 (최근 날짜부터, 쓴 학생 수와 함께)
  const dates = useMemo(() => {
    const ids = new Set(rows.map((s) => String(s.id)));
    const count = new Map<string, number>();
    for (const d of days) {
      if (d.subject === subject && ids.has(d.userId)) count.set(d.classDate, (count.get(d.classDate) ?? 0) + 1);
    }
    return [...count.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [days, rows, subject]);
  const date = dates.some(([d]) => d === pickedDate) ? pickedDate : (dates[0]?.[0] ?? "");

  const key = `${date}_${subject}`;
  useEffect(() => {
    if (!date) return;
    startTransition(async () => {
      const r = await loadReflections(date, subject);
      if (!r.ok) {
        setError(r.message);
        return;
      }
      setError(null);
      setResult({ key: `${date}_${subject}`, reflections: r.reflections });
    });
  }, [date, subject, days]);

  const byUser = new Map((result?.key === key ? result.reflections : []).map((r) => [r.userId, r]));
  const writers = rows.filter((s) => byUser.has(String(s.id)));
  const notYet = rows.filter((s) => !byUser.has(String(s.id)));
  const labelOf = (number: string) => {
    const title = titles[`${subject}_${number}`];
    return !title || title === number ? number : `${number}. ${title}`;
  };

  return (
    <section className="flex flex-col gap-4 rounded-xl border border-line bg-white p-5">
      <div className="flex flex-wrap items-end gap-3">
        <h2 className="mr-auto text-lg font-bold">💭 오늘의 성찰 모아보기</h2>
        <select value={subject} onChange={(e) => setSubject(e.target.value)} aria-label="과목" className={inputClass}>
          {subjects.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        <select value={cls} onChange={(e) => setPickedClass(e.target.value)} aria-label="반" className={inputClass}>
          {classes.length === 0 && <option value="">학생 없음</option>}
          {classes.map((c) => (
            <option key={c} value={c}>
              {c === "반 없음" ? c : `${c}반`}
            </option>
          ))}
        </select>
        <select
          value={date}
          onChange={(e) => setPickedDate(e.target.value)}
          aria-label="성찰을 쓴 날"
          disabled={!dates.length}
          className={inputClass}
        >
          {!dates.length && <option value="">쓴 날 없음</option>}
          {dates.map(([d, n]) => (
            <option key={d} value={d}>
              {formatDay(d)} · {n}명
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => router.refresh()}
          title="방금 학생들이 쓴 성찰까지 다시 불러와요"
          className="rounded-lg border border-line bg-white px-3 py-2 text-sm text-muted hover:bg-page"
        >
          ↻ 새로 불러오기
        </button>
      </div>

      {!ready && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
          ⚠️ 성찰을 저장하려면 Supabase SQL Editor에서 <code>supabase/migrations/006_reflections.sql</code>을 실행해 주세요.
          실행 전에는 학생 화면에 &lsquo;선생님이 준비하고 있어요&rsquo;라고 나와요.
        </p>
      )}
      {error && <p className="text-sm text-danger">{error}</p>}
      {ready && !dates.length && (
        <p className="text-sm text-muted">이 반에서 아직 {subject} 성찰을 쓴 학생이 없어요.</p>
      )}
      {ready && date && (
        <>
          <p className="text-sm text-muted">
            {pending ? "불러오는 중…" : `${rows.length}명 중 ${writers.length}명이 썼어요.`} 학생은 그날 안에만 고쳐 쓸 수
            있어요.
          </p>
          <ul className={`flex flex-col gap-2 ${pending ? "opacity-50" : ""}`}>
            {writers.map((s) => {
              const r = byUser.get(String(s.id))!;
              return (
                <li key={s.id} className="flex flex-col gap-2 rounded-lg border border-line px-4 py-3">
                  <span className="font-bold">
                    {s.id} {s.name}
                  </span>
                  <ReflectionView reflection={r} hardestLabel={labelOf(r.hardestProblem)} />
                </li>
              );
            })}
          </ul>
          {!pending && notYet.length > 0 && (
            <p className="text-sm text-muted">
              <b>아직 안 쓴 학생 {notYet.length}명:</b> {notYet.map((s) => `${s.id} ${s.name}`).join(", ")}
            </p>
          )}
        </>
      )}
    </section>
  );
}
