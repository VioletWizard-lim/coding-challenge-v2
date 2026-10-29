"use client";

import { useRef, useState, useTransition } from "react";
import RecordingEditor, { type RecorderHandle } from "@/components/RecordingEditor";
import { storageKeyFor } from "@/lib/editLog";
import { problemLabel, SUBJECTS } from "@/lib/problems";
import { submitCode } from "./actions";

const selectClass =
  "rounded-lg border border-line bg-white px-3 py-2 text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand/15";

const COOLDOWN_MS = 5000; // 같은 제출이 여러 번 들어가지 않게 (v1과 같음)

type Message = { text: string; kind: "ok" | "error" };

/** 과목·문제를 고르고, 기록 편집기에서 코드를 쓰고, 코드 설명과 함께 제출한다. */
export default function Workspace({ userId, subjects }: { userId: string; subjects: string[] }) {
  const [subject, setSubject] = useState(subjects[0]);
  const problems = Object.keys(SUBJECTS[subject]);
  const [problem, setProblem] = useState(problems[0]);
  const [description, setDescription] = useState("");
  const [message, setMessage] = useState<Message | null>(null);
  const [pending, startTransition] = useTransition();
  const [coolingDown, setCoolingDown] = useState(false);
  const recorder = useRef<RecorderHandle>(null);

  function changeSubject(next: string) {
    setSubject(next);
    setProblem(Object.keys(SUBJECTS[next])[0]);
    setMessage(null);
  }

  function submit() {
    const rec = recorder.current?.getRecording();
    if (!rec) return;
    if (!rec.code.trim()) return setMessage({ text: "코드를 입력하세요.", kind: "error" });
    if (!description.trim()) return setMessage({ text: "코드 설명을 입력하세요.", kind: "error" });
    setMessage(null);
    startTransition(async () => {
      const result = await submitCode({ subject, problem, description, code: rec.code, init: rec.init, log: rec.log });
      if (!result.ok) return setMessage({ text: result.error, kind: "error" });
      setMessage({ text: `✅ 제출 완료! (${problem}) '내 제출 현황' 탭에서 확인할 수 있어요.`, kind: "ok" });
      setCoolingDown(true);
      setTimeout(() => setCoolingDown(false), COOLDOWN_MS);
    });
  }

  return (
    <section className="flex flex-col gap-4">
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
          <select
            value={problem}
            onChange={(e) => {
              setProblem(e.target.value);
              setMessage(null);
            }}
            className={selectClass}
          >
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
      <RecordingEditor
        key={`${subject}_${problem}`}
        ref={recorder}
        storageKey={storageKeyFor(userId, subject, problem)}
      />
      <label className="flex flex-col gap-1 text-sm text-muted">
        코드 설명 (필수)
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={4}
          maxLength={5000}
          placeholder="내 코드가 어떻게 동작하는지, 어디를 고민했는지 적어 주세요."
          className="rounded-lg border border-line bg-white px-3 py-2 text-base text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand/15"
        />
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={submit}
          disabled={pending || coolingDown}
          className="rounded-xl bg-gradient-to-br from-brand to-violet-600 px-6 py-2.5 font-bold text-white disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? "제출 중…" : "제출하기"}
        </button>
        {message && (
          <p
            role={message.kind === "error" ? "alert" : "status"}
            className={`text-sm ${message.kind === "error" ? "text-danger" : "text-green-700"}`}
          >
            {message.text}
          </p>
        )}
      </div>
    </section>
  );
}
