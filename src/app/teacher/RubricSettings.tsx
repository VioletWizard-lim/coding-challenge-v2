"use client";

import { useEffect, useState, useTransition } from "react";
import { MAX_PART_DESC, MAX_PARTS, rubricTotal, type RubricPart } from "@/lib/grading";
import { loadRubrics, saveSubjectRubric } from "./actions";

const inputClass = "rounded-lg border border-line bg-white px-3 py-2 outline-none focus:border-brand focus:ring-2 focus:ring-brand/15";

/** 채점 기준이 바뀌면 채점 화면이 다시 불러오도록 알리는 이벤트 */
export const RUBRIC_CHANGED_EVENT = "rubric-changed";

/** ⚙️ 설정 → 과목별 채점 기준: 영역 이름·배점·설명 */
export default function RubricSettings() {
  const [data, setData] = useState<{ ready: boolean; rubrics: { subject: string; parts: RubricPart[] }[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadRubrics().then((r) => (r.ok ? setData(r) : setError(r.message)));
  }, []);

  return (
    <section className="flex flex-col gap-4 rounded-xl border border-line bg-white p-5">
      <div>
        <h2 className="text-lg font-bold">⚖️ 과목별 채점 기준</h2>
        <p className="mt-1 text-sm leading-6 text-muted">
          과목마다 채점 영역과 배점, <b>설명</b>을 정해요. 설명은 채점 화면의 점수 칸 옆, 학생 점수표(눌러서 보기), AI 채점 초안에 쓰여요.
          바꾼 기준은 <b>앞으로 채점하는 제출</b>에 쓰이고, 이미 채점한 제출은 그때 기준 그대로 보여요.
        </p>
      </div>
      {error && <p className="text-sm text-danger">{error}</p>}
      {data && !data.ready && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
          ⚠️ 채점 기준을 저장하려면 Supabase SQL Editor에서 <code>supabase/migrations/012_grading_rubrics.sql</code>을 실행해 주세요. 그전에는 모든
          과목이 기본 기준(기능 40 · 코드 설명 40 · 도전 20)이에요.
        </p>
      )}
      {!data && !error && <p className="text-sm text-muted">불러오는 중…</p>}
      {data?.rubrics.map((r) => (
        <SubjectRubric
          key={r.subject}
          subject={r.subject}
          parts={r.parts}
          onSaved={(parts) => setData((d) => d && { ...d, rubrics: d.rubrics.map((x) => (x.subject === r.subject ? { ...x, parts } : x)) })}
        />
      ))}
    </section>
  );
}

function SubjectRubric({ subject, parts, onSaved }: { subject: string; parts: RubricPart[]; onSaved: (parts: RubricPart[]) => void }) {
  const [editing, setEditing] = useState<{ name: string; max: string; desc: string }[] | null>(null);
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);
  const [pending, startTransition] = useTransition();

  function save() {
    if (!editing) return;
    startTransition(async () => {
      const r = await saveSubjectRubric(
        subject,
        editing.map((p) => ({ name: p.name, max: Number(p.max), desc: p.desc })),
      );
      if (!r.ok) return setMessage({ text: r.message, ok: false });
      setMessage({ text: "✅ 저장했어요. 앞으로 채점하는 제출에 쓰여요.", ok: true });
      setEditing(null);
      onSaved(r.parts);
      window.dispatchEvent(new Event(RUBRIC_CHANGED_EVENT));
    });
  }

  if (!editing) {
    return (
      <div className="flex flex-col gap-2 rounded-xl border border-line p-4">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-bold">{subject}</h3>
          <span className="text-sm text-muted">합계 {rubricTotal(parts)}점</span>
          <button
            type="button"
            onClick={() => {
              setMessage(null);
              setEditing(parts.map((p) => ({ name: p.name, max: String(p.max), desc: p.desc ?? "" })));
            }}
            className="ml-auto rounded-lg border border-line px-3 py-1 text-sm hover:bg-page"
          >
            바꾸기
          </button>
        </div>
        <table className="w-full text-left text-sm">
          <thead className="text-muted">
            <tr className="border-b border-line">
              <th className="w-28 py-1.5 font-normal">영역</th>
              <th className="w-16 py-1.5 font-normal">배점</th>
              <th className="py-1.5 font-normal">설명</th>
            </tr>
          </thead>
          <tbody>
            {parts.map((p) => (
              <tr key={p.name} className="border-b border-line/60 align-top">
                <td className="py-1.5 font-bold">{p.name}</td>
                <td className="py-1.5">{p.max}</td>
                <td className="whitespace-pre-wrap py-1.5 text-muted">{p.desc || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {message && <p className={`text-sm ${message.ok ? "text-green-700" : "text-danger"}`}>{message.text}</p>}
      </div>
    );
  }

  const total = editing.reduce((a, p) => a + (Number(p.max) || 0), 0);
  const set = (i: number, patch: Partial<{ name: string; max: string; desc: string }>) =>
    setEditing(editing.map((x, k) => (k === i ? { ...x, ...patch } : x)));
  return (
    <div className="flex flex-col gap-3 rounded-xl border-2 border-brand/40 bg-brand-soft/30 p-4 text-sm">
      <h3 className="font-bold">{subject} 채점 기준 바꾸기</h3>
      <ul className="flex flex-col gap-3">
        {editing.map((p, i) => (
          <li key={i} className="flex flex-col gap-1.5 rounded-lg border border-line bg-white p-3">
            <div className="flex flex-wrap items-center gap-2">
              <input
                value={p.name}
                onChange={(e) => set(i, { name: e.target.value })}
                placeholder="영역 이름 (예: 기능)"
                aria-label={`${subject} 영역 ${i + 1} 이름`}
                maxLength={20}
                className={`${inputClass} w-44 py-1`}
              />
              <input
                type="number"
                min={1}
                max={100}
                value={p.max}
                onChange={(e) => set(i, { max: e.target.value })}
                aria-label={`${subject} 영역 ${i + 1} 배점`}
                className={`${inputClass} w-20 py-1`}
              />
              <span className="text-muted">점</span>
              <button
                type="button"
                onClick={() => setEditing(editing.filter((_, k) => k !== i))}
                disabled={editing.length <= 1}
                className="ml-auto text-xs text-danger hover:underline disabled:invisible"
              >
                영역 빼기
              </button>
            </div>
            <textarea
              value={p.desc}
              onChange={(e) => set(i, { desc: e.target.value })}
              rows={2}
              maxLength={MAX_PART_DESC}
              placeholder="무엇을 보면 만점인지, 어떻게 감점하는지 (예: 조건을 모두 지키고 예시와 같은 결과가 나오면 만점. 조건 하나 빠지면 -10)"
              aria-label={`${subject} 영역 ${i + 1} 설명`}
              className={`${inputClass} leading-6`}
            />
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setEditing([...editing, { name: "", max: "10", desc: "" }])}
          disabled={editing.length >= MAX_PARTS}
          className="rounded-lg border border-line bg-white px-3 py-1 disabled:opacity-40"
        >
          + 영역 더하기
        </button>
        <span className="text-muted">
          합계 {total}점 · 영역은 {MAX_PARTS}개까지
        </span>
        <button type="button" onClick={save} disabled={pending} className="ml-auto rounded-lg bg-brand px-4 py-1.5 font-bold text-white disabled:opacity-60">
          {pending ? "저장 중…" : "기준 저장"}
        </button>
        <button type="button" onClick={() => setEditing(null)} className="rounded-lg border border-line bg-white px-3 py-1.5">
          취소
        </button>
      </div>
      {message && !message.ok && (
        <p role="alert" className="text-danger">
          {message.text}
        </p>
      )}
    </div>
  );
}
