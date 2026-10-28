"use client";

import { useState } from "react";
import RecordingEditor from "@/components/RecordingEditor";
import { storageKeyFor } from "@/lib/editLog";
import { problemLabel, SUBJECTS } from "@/lib/problems";

const selectClass =
  "rounded-lg border border-line bg-white px-3 py-2 text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand/15";

/** 과목·문제를 고르고 기록 편집기에서 코드를 쓴다. 문제마다 기록이 따로 저장된다. */
export default function Workspace({ userId, subjects }: { userId: string; subjects: string[] }) {
  const [subject, setSubject] = useState(subjects[0]);
  const problems = Object.keys(SUBJECTS[subject]);
  const [problem, setProblem] = useState(problems[0]);

  function changeSubject(next: string) {
    setSubject(next);
    setProblem(Object.keys(SUBJECTS[next])[0]);
  }

  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-xl font-bold">📝 코드 작성</h2>
      <div className="flex flex-wrap gap-3">
        {subjects.length > 1 && (
          <label className="flex flex-col gap-1 text-sm text-muted">
            과목
            <select value={subject} onChange={(e) => changeSubject(e.target.value)} className={selectClass}>
              {subjects.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
        )}
        <label className="flex min-w-60 flex-1 flex-col gap-1 text-sm text-muted">
          문제 번호
          <select value={problem} onChange={(e) => setProblem(e.target.value)} className={selectClass}>
            {problems.map((p) => (
              <option key={p} value={p}>
                {problemLabel(subject, p)}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="text-sm text-muted">
        아래 편집기에서 코드를 작성하고 &lsquo;실행&rsquo;으로 확인하세요. 작성 중인 코드와 과정은 이 브라우저에 자동
        저장돼서 새로고침해도 그대로 있어요.
      </p>
      <RecordingEditor key={`${subject}_${problem}`} storageKey={storageKeyFor(userId, subject, problem)} />
    </section>
  );
}
