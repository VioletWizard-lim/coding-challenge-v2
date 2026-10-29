"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import ReflectionView from "@/components/ReflectionView";
import { allowedSubjects, gradeClassFor } from "@/lib/problems";
import type { Reflection } from "@/lib/reflection";
import type { StudentRow } from "@/lib/teacher";
import { loadReflections } from "./actions";

const inputClass = "rounded-lg border border-line bg-white px-3 py-2 outline-none focus:border-brand focus:ring-2 focus:ring-brand/15";

const classKey = (s: StudentRow, subject: string) => {
  const { grade, class: cls } = gradeClassFor(s, subject);
  return grade || cls ? `${grade ?? "?"}-${cls ?? "?"}` : "반 없음";
};
const compareClass = (a: string, b: string) => a.localeCompare(b, "ko", { numeric: true });

/**
 * 교사용 성찰 모아보기: 날짜·과목·반을 고르면 그 반 학생들이 쓴 오늘의 성찰을 학번 순으로 보여 준다.
 * 반은 학생 계정의 지금 반(프로그래밍이면 프로그래밍 반)으로 나눈다.
 */
export default function ReflectionBoard({
  students,
  subjects,
  today,
  titles,
}: {
  students: StudentRow[];
  subjects: string[];
  today: string;
  /** "과목_번호" → 문제 제목 */
  titles: Record<string, string>;
}) {
  const [date, setDate] = useState(today);
  const [subject, setSubject] = useState(subjects[0]);
  const [result, setResult] = useState<{ ready: boolean; reflections: Reflection[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const inSubject = useMemo(
    () => students.filter((s) => allowedSubjects(s.subjects).includes(subject)),
    [students, subject],
  );
  const classes = useMemo(() => [...new Set(inSubject.map((s) => classKey(s, subject)))].sort(compareClass), [inSubject, subject]);
  const [pickedClass, setPickedClass] = useState("");
  const cls = classes.includes(pickedClass) ? pickedClass : (classes[0] ?? "");

  useEffect(() => {
    startTransition(async () => {
      const r = await loadReflections(date, subject);
      if (!r.ok) {
        setError(r.message);
        setResult(null);
        return;
      }
      setError(null);
      setResult({ ready: r.ready, reflections: r.reflections });
    });
  }, [date, subject]);

  const byUser = new Map((result?.reflections ?? []).map((r) => [r.userId, r]));
  const rows = inSubject
    .filter((s) => classKey(s, subject) === cls)
    .sort((a, b) => String(a.id).localeCompare(String(b.id), "ko", { numeric: true }));
  const written = rows.filter((s) => byUser.has(String(s.id))).length;
  const labelOf = (number: string) => {
    const title = titles[`${subject}_${number}`];
    return !title || title === number ? number : `${number}. ${title}`;
  };

  return (
    <section className="flex flex-col gap-4 rounded-xl border border-line bg-white p-5">
      <div className="flex flex-wrap items-end gap-3">
        <h2 className="mr-auto text-lg font-bold">💭 오늘의 성찰 모아보기</h2>
        <input
          type="date"
          value={date}
          max={today}
          onChange={(e) => e.target.value && setDate(e.target.value)}
          aria-label="수업 날짜"
          className={inputClass}
        />
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
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}
      {result && !result.ready && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
          ⚠️ 성찰을 저장하려면 Supabase SQL Editor에서 <code>supabase/migrations/006_reflections.sql</code>을 실행해 주세요.
          실행 전에는 학생 화면에 &lsquo;선생님이 준비하고 있어요&rsquo;라고 나와요.
        </p>
      )}
      {result?.ready && (
        <>
          <p className="text-sm text-muted">
            {pending ? "불러오는 중…" : `${rows.length}명 중 ${written}명이 썼어요.`} 학생은 그날 안에만 고쳐 쓸 수 있어요.
          </p>
          <ul className={`flex flex-col gap-2 ${pending ? "opacity-50" : ""}`}>
            {rows.map((s) => {
              const r = byUser.get(String(s.id));
              return (
                <li key={s.id} className="flex flex-col gap-2 rounded-lg border border-line px-4 py-3">
                  <div className="flex flex-wrap items-baseline gap-x-3">
                    <span className="font-bold">
                      {s.id} {s.name}
                    </span>
                    {!r && <span className="text-sm text-muted">아직 쓰지 않았어요</span>}
                  </div>
                  {r && <ReflectionView reflection={r} hardestLabel={labelOf(r.hardestProblem)} />}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
}
