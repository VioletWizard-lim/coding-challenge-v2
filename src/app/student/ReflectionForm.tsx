"use client";

import { useState, useTransition } from "react";
import { useStudentNav } from "@/components/SideTabs";
import { MAX_REFLECTION_TEXT, type Reflection } from "@/lib/reflection";
import { saveMyReflection } from "./actions";

const fieldClass =
  "w-full rounded-lg border border-line bg-white px-3 py-2 text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand/15";

const dayFormat = new Intl.DateTimeFormat("ko-KR", { timeZone: "UTC", month: "long", day: "numeric", weekday: "short" });
const timeFormat = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", hour: "numeric", minute: "2-digit" });

type Draft = { hardestProblem: string; hardestReason: string; aiQuestions: string; keyConcepts: string };
const EMPTY: Draft = { hardestProblem: "", hardestReason: "", aiQuestions: "", keyConcepts: "" };

/**
 * 오늘의 성찰 쓰기 (수업을 마치고 하루에 한 번, 과목마다). 학습지의 "오늘의 성찰" 칸과 같다.
 * 오늘 안에는 몇 번이든 고쳐 쓸 수 있다. 지난 성찰은 학습 여정의 날짜별 기록에서 본다.
 */
export default function ReflectionForm({
  ready,
  today,
  subjects,
  todayProblems,
  openProblems,
  todayReflections,
}: {
  ready: boolean;
  today: string;
  subjects: string[];
  /** 과목별 오늘 제출한 문제 번호 */
  todayProblems: Record<string, string[]>;
  /** 과목별 공개된 문제 번호 (오늘 제출하지 않은 문제도 고를 수 있게) */
  openProblems: Record<string, string[]>;
  todayReflections: Reflection[];
}) {
  const { problemLabel } = useStudentNav();
  // 오늘 제출한 과목을 먼저 연다
  const [subject, setSubject] = useState(subjects.find((s) => todayProblems[s]?.length) ?? subjects[0]);
  const [saved, setSaved] = useState<Record<string, Reflection>>(() =>
    Object.fromEntries(todayReflections.map((r) => [r.subject, r])),
  );
  const draftOf = (s: string): Draft => {
    const r = saved[s];
    return r ? { hardestProblem: r.hardestProblem, hardestReason: r.hardestReason, aiQuestions: r.aiQuestions, keyConcepts: r.keyConcepts } : EMPTY;
  };
  const [draft, setDraft] = useState<Draft>(() => draftOf(subject));
  const [message, setMessage] = useState<{ text: string; kind: "ok" | "error" } | null>(null);
  const [pending, startTransition] = useTransition();

  const done = todayProblems[subject] ?? [];
  const others = (openProblems[subject] ?? []).filter((n) => !done.includes(n));
  const current = saved[subject];
  const changed = JSON.stringify(draft) !== JSON.stringify(draftOf(subject));
  const set = (key: keyof Draft) => (value: string) => {
    setDraft({ ...draft, [key]: value });
    setMessage(null);
  };

  function changeSubject(next: string) {
    if (changed && !confirm("저장하지 않은 내용이 있어요. 다른 과목으로 바꿀까요?")) return;
    setSubject(next);
    setDraft(draftOf(next));
    setMessage(null);
  }

  function save() {
    startTransition(async () => {
      const r = await saveMyReflection({ subject, ...draft });
      if (!r.ok) return setMessage({ text: r.error, kind: "error" });
      setSaved({ ...saved, [subject]: r.reflection });
      setMessage({ text: "✅ 저장했어요. 오늘 안에는 다시 고칠 수 있어요.", kind: "ok" });
    });
  }

  if (!ready) {
    return (
      <p className="rounded-xl border border-line bg-white p-5 text-muted">
        선생님이 오늘의 성찰을 준비하고 있어요. 조금만 기다려 주세요.
      </p>
    );
  }

  return (
    <section className="flex flex-col gap-5 rounded-xl border border-line bg-white p-5">
      <div className="flex flex-wrap items-end gap-3">
        <div className="mr-auto">
          <h2 className="text-lg font-bold">💭 오늘의 성찰</h2>
          <p className="text-sm text-muted">
            {dayFormat.format(new Date(`${today}T00:00:00Z`))} · 수업을 마치고 오늘을 돌아보며 써요.
          </p>
        </div>
        {subjects.length > 1 && (
          <select
            value={subject}
            onChange={(e) => changeSubject(e.target.value)}
            aria-label="과목"
            className="rounded-lg border border-line bg-white px-3 py-2"
          >
            {subjects.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        )}
      </div>

      <div className="rounded-lg bg-page px-4 py-3 text-sm">
        <p className="mb-1 font-bold text-muted">오늘 제출한 문제</p>
        {done.length ? (
          <p className="flex flex-wrap gap-x-3 gap-y-1">
            {done.map((n) => (
              <span key={n}>{problemLabel(subject, n)}</span>
            ))}
          </p>
        ) : (
          <p className="text-muted">오늘은 아직 제출한 문제가 없어요.</p>
        )}
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 font-bold">1. 가장 어려웠던 문제</legend>
        <select
          value={draft.hardestProblem}
          onChange={(e) => set("hardestProblem")(e.target.value)}
          aria-label="가장 어려웠던 문제"
          className={fieldClass}
        >
          <option value="">고르지 않음</option>
          {done.length > 0 && (
            <optgroup label="오늘 제출한 문제">
              {done.map((n) => (
                <option key={n} value={n}>
                  {problemLabel(subject, n)}
                </option>
              ))}
            </optgroup>
          )}
          {others.length > 0 && (
            <optgroup label="다른 문제">
              {others.map((n) => (
                <option key={n} value={n}>
                  {problemLabel(subject, n)}
                </option>
              ))}
            </optgroup>
          )}
        </select>
        <TextField
          label="어려웠던 이유"
          value={draft.hardestReason}
          onChange={set("hardestReason")}
          placeholder="예: 반찬과 밥을 합쳐서 출력하는 부분에서 + 기호를 어디에 써야 할지 헷갈렸어요."
        />
      </fieldset>

      <TextField
        label="2. AI에게 질문한 내용"
        value={draft.aiQuestions}
        onChange={set("aiQuestions")}
        placeholder="예: input()으로 받은 숫자끼리 더했더니 붙어서 나와서, 왜 그런지 물어봤어요. (질문하지 않았으면 비워 두세요)"
        big
      />
      <TextField
        label="3. 오늘 배운 핵심 개념"
        value={draft.keyConcepts}
        onChange={set("keyConcepts")}
        placeholder="예: input()으로 받은 값은 문자열이라서, 계산하려면 int()로 바꿔야 한다."
        big
      />

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={pending || (!changed && !!current)}
          className="rounded-lg bg-brand px-5 py-2 font-bold text-white disabled:opacity-50"
        >
          {pending ? "저장 중…" : current ? "고친 내용 저장" : "저장하기"}
        </button>
        {current && !message && (
          <span className="text-sm text-muted">
            {timeFormat.format(new Date(current.updatedAt))}에 저장했어요{changed ? " · 고친 내용은 아직 저장 전이에요" : ""}
          </span>
        )}
        {message && (
          <span role={message.kind === "ok" ? "status" : "alert"} className={`text-sm ${message.kind === "ok" ? "text-green-700" : "text-danger"}`}>
            {message.text}
          </span>
        )}
      </div>
      <p className="text-xs text-muted">지난 성찰은 🧭 나의 학습 여정 → 날짜별 기록에서 다시 볼 수 있어요.</p>
    </section>
  );
}

function TextField({
  label,
  value,
  onChange,
  placeholder,
  big = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  big?: boolean;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className={big ? "font-bold" : "text-sm text-muted"}>{label}</span>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        maxLength={MAX_REFLECTION_TEXT}
        rows={big ? 4 : 3}
        placeholder={placeholder}
        className={fieldClass}
      />
    </label>
  );
}
