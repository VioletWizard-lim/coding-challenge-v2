"use client";

import { useEffect, useState, useTransition } from "react";
import { DEFAULT_CONCEPTS, MAX_CONCEPT, MAX_NOTE, type PracticeSettings } from "@/lib/practice";
import { loadPracticeSettings, saveSubjectPractice } from "./actions";

const inputClass = "rounded-lg border border-line bg-white px-3 py-2 outline-none focus:border-brand focus:ring-2 focus:ring-brand/15";

/** ⚙️ 설정 → 🧪 연습 모드: 과목마다 켜고 끄기, 학생이 고를 수 있는 개념(= AI가 쓸 수 있는 문법 범위), 범위 안내 */
export default function PracticeSettingsPanel() {
  const [data, setData] = useState<{ ready: boolean; settings: PracticeSettings[]; limit: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadPracticeSettings().then((r) => (r.ok ? setData(r) : setError(r.message)));
  }, []);

  return (
    <section className="flex flex-col gap-4 rounded-xl border border-line bg-white p-5">
      <div>
        <h2 className="text-lg font-bold">🧪 연습 모드</h2>
        <p className="mt-1 text-sm leading-6 text-muted">
          학생이 자기 작성 기록에서 막혔던 곳(여러 번 난 오류, 오래 멈춘 문제)이나 개념을 골라 AI에게 연습 문제를 받아요. 선생님이 문제를 넣을
          필요는 없어요. 여기서 고른 개념만 학생이 고를 수 있고, AI도 이 범위의 문법으로만 문제와 참고 답안을 만들어요. 참고 답안은 서버에서
          실제로 돌려 확인한 문제만 학생에게 가요. {data && <>학생 한 명이 하루에 {data.limit}개까지 만들 수 있어요. </>} 학생이 받은 문제는 &lsquo;🤖 AI
          대화&rsquo; 탭에서 볼 수 있어요.
        </p>
      </div>
      {error && <p className="text-sm text-danger">{error}</p>}
      {data && !data.ready && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
          ⚠️ 연습 모드를 쓰려면 Supabase SQL Editor에서 <code>supabase/migrations/015_practice.sql</code>을 실행해 주세요. 그전에는 학생 화면에
          &lsquo;선생님이 준비하고 있어요&rsquo;라고 나와요.
        </p>
      )}
      {!data && !error && <p className="text-sm text-muted">불러오는 중…</p>}
      {data?.ready &&
        data.settings.map((s) => (
          <SubjectPractice
            key={s.subject}
            settings={s}
            onSaved={(next) => setData((d) => d && { ...d, settings: d.settings.map((x) => (x.subject === s.subject ? next : x)) })}
          />
        ))}
    </section>
  );
}

function SubjectPractice({ settings, onSaved }: { settings: PracticeSettings; onSaved: (s: PracticeSettings) => void }) {
  const [draft, setDraft] = useState(settings);
  const [extra, setExtra] = useState("");
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);
  const [pending, startTransition] = useTransition();
  const changed = JSON.stringify(draft) !== JSON.stringify(settings);
  const options = [...new Set([...DEFAULT_CONCEPTS, ...settings.concepts, ...draft.concepts])];

  function toggle(c: string) {
    setDraft((d) => ({ ...d, concepts: d.concepts.includes(c) ? d.concepts.filter((x) => x !== c) : [...d.concepts, c] }));
  }

  function save() {
    setMessage(null);
    startTransition(async () => {
      const r = await saveSubjectPractice(draft);
      if (!r.ok) return setMessage({ text: r.message, ok: false });
      setDraft(r.settings);
      onSaved(r.settings);
      setMessage({ text: "저장했어요.", ok: true });
    });
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-line px-4 py-3">
      <div className="flex flex-wrap items-center gap-3">
        <h3 className="font-bold">{settings.subject}</h3>
        <label className="flex items-center gap-1.5 text-sm">
          <input type="checkbox" checked={draft.enabled} onChange={(e) => setDraft((d) => ({ ...d, enabled: e.target.checked }))} />
          학생이 연습 모드 쓰기
        </label>
      </div>
      <fieldset className="flex flex-col gap-2" disabled={!draft.enabled}>
        <legend className="text-sm text-muted">학생이 고를 수 있는 개념 (AI가 쓸 수 있는 문법 범위)</legend>
        <div className="flex flex-wrap gap-1.5">
          {options.map((c) => (
            <label
              key={c}
              className={`flex cursor-pointer items-center gap-1 rounded-full border px-2.5 py-1 text-sm ${
                draft.concepts.includes(c) ? "border-brand bg-brand-soft text-brand" : "border-line text-muted"
              }`}
            >
              <input type="checkbox" className="sr-only" checked={draft.concepts.includes(c)} onChange={() => toggle(c)} />
              {draft.concepts.includes(c) ? "✓ " : ""}
              {c}
            </label>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={extra}
            onChange={(e) => setExtra(e.target.value)}
            maxLength={MAX_CONCEPT}
            placeholder="개념 직접 더하기 (예: 2차원 리스트)"
            className={`${inputClass} w-64 text-sm`}
          />
          <button
            type="button"
            disabled={!extra.trim()}
            onClick={() => {
              const c = extra.trim();
              setDraft((d) => (d.concepts.includes(c) ? d : { ...d, concepts: [...d.concepts, c] }));
              setExtra("");
            }}
            className="rounded-lg border border-line px-3 py-2 text-sm hover:bg-page disabled:opacity-50"
          >
            더하기
          </button>
        </div>
        <label className="flex flex-col gap-1 text-sm text-muted">
          범위 안내 (선택, 학생 화면과 AI에 함께 감)
          <textarea
            value={draft.note}
            onChange={(e) => setDraft((d) => ({ ...d, note: e.target.value }))}
            maxLength={MAX_NOTE}
            rows={2}
            placeholder="예: f-string은 아직 안 배웠어요. 출력은 print()에 쉼표로 이어서 써 주세요."
            className={`${inputClass} text-ink`}
          />
        </label>
      </fieldset>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={pending || !changed}
          className="rounded-lg bg-brand px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
        >
          {pending ? "저장 중…" : "저장"}
        </button>
        {message && <p className={`text-sm ${message.ok ? "text-green-700" : "text-danger"}`}>{message.text}</p>}
      </div>
    </div>
  );
}
