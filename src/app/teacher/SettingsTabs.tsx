"use client";

import { useEffect, useState } from "react";
import { SUBJECTS } from "@/lib/problems";
import AiSettingsPanel from "./AiSettingsPanel";
import PracticeSettingsPanel from "./PracticeSettings";
import RubricSettings from "./RubricSettings";

const PARTS = [
  { id: "ai", label: "🤖 AI 기능", hint: "AI 도우미·되돌아보기 켜고 끄기, 끌 단원, 선생님 지침" },
  { id: "rubric", label: "⚖️ 채점 기준", hint: "채점 영역·배점·설명" },
  { id: "practice", label: "🧪 연습 모드", hint: "켜고 끄기, 학생이 고를 개념" },
] as const;
type PartId = (typeof PARTS)[number]["id"];

/** 이 창에서 보던 설정 (화면이 새로 고쳐져도 같은 곳으로) */
const KEY = "teacher:settings";

/**
 * ⚙️ 설정: 무엇을(AI 기능·채점 기준·연습 모드) × 어느 과목을 골라 카드 하나만 보여 준다 (한 화면에 다 펼치면 너무 길어서).
 * 고르지 않은 것은 숨기기만 하므로, 저장하지 않은 내용도 다른 것을 보고 와도 그대로 남는다.
 */
export default function SettingsTabs() {
  const subjects = Object.keys(SUBJECTS);
  const [part, setPart] = useState<PartId>("ai");
  const [subject, setSubject] = useState(subjects[0]);

  // 처음 한 번: 이 창에서 보던 곳으로
  useEffect(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem(KEY) ?? "null") as { part?: string; subject?: string } | null;
      /* eslint-disable react-hooks/set-state-in-effect -- 브라우저에만 있는 값을 처음 한 번 읽어 옴 */
      if (saved?.part && PARTS.some((p) => p.id === saved.part)) setPart(saved.part as PartId);
      if (saved?.subject && subjects.includes(saved.subject)) setSubject(saved.subject);
      /* eslint-enable react-hooks/set-state-in-effect */
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 처음 한 번만
  }, []);
  useEffect(() => {
    try {
      sessionStorage.setItem(KEY, JSON.stringify({ part, subject }));
    } catch {}
  }, [part, subject]);

  const pill = (on: boolean) =>
    `rounded-lg border px-3 py-2 text-sm ${on ? "border-brand bg-brand-soft font-bold text-brand" : "border-line bg-white text-muted hover:bg-page hover:text-ink"}`;

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4">
      <div className="sticky top-14 z-10 flex flex-col gap-3 rounded-xl border border-line bg-white/95 p-4 backdrop-blur">
        <div role="group" aria-label="무엇을 설정할까요" className="flex flex-wrap gap-2">
          {PARTS.map((p) => (
            <button key={p.id} type="button" aria-pressed={part === p.id} title={p.hint} onClick={() => setPart(p.id)} className={pill(part === p.id)}>
              {p.label}
            </button>
          ))}
        </div>
        <div role="group" aria-label="과목" className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-muted">과목</span>
          {subjects.map((s) => (
            <button key={s} type="button" aria-pressed={subject === s} onClick={() => setSubject(s)} className={pill(subject === s)}>
              {s}
            </button>
          ))}
          <span className="text-xs text-muted">· {PARTS.find((p) => p.id === part)!.hint}</span>
        </div>
      </div>
      {/* 고르지 않은 설정도 그려 두고 숨긴다 (적던 내용이 사라지지 않게) */}
      <div hidden={part !== "ai"}>
        <AiSettingsPanel subject={subject} />
      </div>
      <div hidden={part !== "rubric"}>
        <RubricSettings subject={subject} />
      </div>
      <div hidden={part !== "practice"}>
        <PracticeSettingsPanel subject={subject} />
      </div>
    </div>
  );
}
