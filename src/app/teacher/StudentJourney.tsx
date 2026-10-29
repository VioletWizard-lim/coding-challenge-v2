"use client";

import { useMemo, useState, useTransition } from "react";
import { byNumber, classOf, classOptions, inClass } from "@/lib/classes";
import type { StudentRow } from "@/lib/teacher";
import Journey from "../student/Journey";
import { loadStudentJourney, loadStudentReplay, type StudentJourneyResult } from "./actions";

const inputClass = "rounded-lg border border-line bg-white px-3 py-2 outline-none focus:border-brand focus:ring-2 focus:ring-brand/15";

/**
 * 교사용 학생별 학습 여정: 반과 학생을 고르면 그 학생이 보는 학습 여정을 그대로 보여 준다.
 * '과정 보기'는 그 자리에서 재생한다. 이전/다음 학생으로 넘기며 볼 수 있다.
 */
export default function StudentJourney({ students }: { students: StudentRow[] }) {
  const classes = useMemo(() => classOptions(students), [students]);
  const [picked, setPicked] = useState(classes.prog.length ? `prog:${classes.prog[0]}` : classes.plain.length ? `class:${classes.plain[0]}` : "");
  const [studentId, setStudentId] = useState("");
  const [result, setResult] = useState<(StudentJourneyResult & { id: string }) | null>(null);
  const [pending, startTransition] = useTransition();

  const list = useMemo(
    () => students.filter((s) => inClass(s, picked)).sort((a, b) => byNumber(String(a.id), String(b.id))),
    [students, picked],
  );
  const index = list.findIndex((s) => String(s.id) === studentId);
  const current = index >= 0 ? list[index] : null;

  function open(id: string) {
    setStudentId(id);
    if (!id) return setResult(null);
    startTransition(async () => setResult({ ...(await loadStudentJourney(id)), id }));
  }

  return (
    <div className="flex flex-col gap-5">
      <section className="flex flex-col gap-3 rounded-xl border border-line bg-white p-5">
        <h2 className="text-lg font-bold">🧭 학생별 학습 여정</h2>
        <p className="text-sm text-muted">학생이 자기 화면에서 보는 학습 여정과 같아요. 반과 학생을 고르세요.</p>
        <div className="flex flex-wrap gap-2">
          <select
            value={picked}
            onChange={(e) => {
              setPicked(e.target.value);
              open("");
            }}
            aria-label="반"
            className={inputClass}
          >
            <option value="">전체 반</option>
            {classes.prog.length > 0 && (
              <optgroup label="프로그래밍 반">
                {classes.prog.map((c) => (
                  <option key={c} value={`prog:${c}`}>
                    프로그래밍 {c}반
                  </option>
                ))}
              </optgroup>
            )}
            {classes.plain.length > 0 && (
              <optgroup label="학년-반">
                {classes.plain.map((c) => (
                  <option key={c} value={`class:${c}`}>
                    {c}반
                  </option>
                ))}
              </optgroup>
            )}
          </select>
          <select value={studentId} onChange={(e) => open(e.target.value)} aria-label="학생" className={`${inputClass} min-w-48`}>
            <option value="">학생 고르기 ({list.length}명)</option>
            {list.map((s) => (
              <option key={s.id} value={String(s.id)}>
                {s.id} {s.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={pending || index <= 0}
            onClick={() => open(String(list[index - 1].id))}
            className="rounded-lg border border-line bg-white px-3 py-2 text-sm disabled:opacity-40"
          >
            ← 이전 학생
          </button>
          <button
            type="button"
            disabled={pending || index < 0 || index >= list.length - 1}
            onClick={() => open(String(list[index + 1].id))}
            className="rounded-lg border border-line bg-white px-3 py-2 text-sm disabled:opacity-40"
          >
            다음 학생 →
          </button>
        </div>
      </section>

      {pending && <p className="text-muted">불러오는 중…</p>}
      {!pending && current && result?.id === studentId && (
        <div className="flex flex-col gap-3">
          <h3 className="text-lg font-bold">
            {current.id} {current.name}
            <span className="ml-2 text-sm font-normal text-muted">
              {[
                classOf(current.grade, current.class) && `${classOf(current.grade, current.class)}반`,
                classOf(current.programming_grade, current.programming_class) &&
                  `프로그래밍 ${classOf(current.programming_grade, current.programming_class)}반`,
              ]
                .filter(Boolean)
                .join(" · ")}
            </span>
          </h3>
          {result.ok ? (
            <Journey key={studentId} journey={result.journey} reflections={result.reflections} loadReplay={loadStudentReplay} />
          ) : (
            <p className="text-danger">{result.message}</p>
          )}
        </div>
      )}
    </div>
  );
}
