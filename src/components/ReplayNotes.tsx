"use client";

import { useState, useTransition } from "react";
import { formatDuration } from "@/lib/replay";
import { MAX_NOTE_TEXT, type NoteAuthor, type TimelineNote } from "@/lib/timelineNotes";

export const NOTE_STYLE: Record<NoteAuthor, { glyph: string; label: string }> = {
  student: { glyph: "📌", label: "내 메모" },
  teacher: { glyph: "💬", label: "선생님 피드백" },
};

type SaveResult = { ok: true; note: TimelineNote } | { ok: false; error: string };

/** 메모를 쓰는 쪽: 학생(내 메모) 또는 교사(피드백). 없으면 읽기만 */
export type NoteActions = {
  role: NoteAuthor;
  save: (input: { at: number; text: string; id?: number }) => Promise<SaveResult>;
  remove: (id: number) => Promise<{ ok: boolean; error?: string }>;
};

export type NoteDraft = { id?: number; at: number; text: string };

/**
 * 재생기 아래 타임라인 메모 목록 + 쓰기 칸.
 * 학생 메모(📌)와 선생님 피드백(💬)을 기록 시각 순으로 보여 주고, 누르면 그 순간으로 간다.
 * 자기 메모만 고치고 지울 수 있다.
 */
export default function ReplayNotes({
  notes,
  startTime,
  actions,
  draft,
  setDraft,
  onSeek,
  onChange,
  selected,
}: {
  notes: TimelineNote[];
  startTime: number;
  actions?: NoteActions;
  draft: NoteDraft | null;
  setDraft: (d: NoteDraft | null) => void;
  onSeek: (at: number) => void;
  onChange: (notes: TimelineNote[]) => void;
  /** 지금 재생 위치에 있는 메모 (강조) */
  selected: Set<number>;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const when = (at: number) => formatDuration(Math.max(0, at - startTime));
  const sorted = [...notes].sort((a, b) => a.at - b.at || a.id - b.id);

  function save() {
    if (!actions || !draft) return;
    startTransition(async () => {
      const r = await actions.save(draft);
      if (!r.ok) return setError(r.error);
      setError(null);
      setDraft(null);
      onChange(draft.id === undefined ? [...notes, r.note] : notes.map((n) => (n.id === r.note.id ? r.note : n)));
    });
  }

  function remove(n: TimelineNote) {
    if (!actions || !confirm("이 메모를 지울까요?")) return;
    startTransition(async () => {
      const r = await actions.remove(n.id);
      if (!r.ok) return setError(r.error ?? "지우지 못했어요.");
      setError(null);
      onChange(notes.filter((x) => x.id !== n.id));
    });
  }

  const mineLabel = actions ? NOTE_STYLE[actions.role] : null;
  if (!sorted.length && !draft) return null;
  return (
    <div className="flex flex-col gap-2 text-sm">
      {draft && actions && (
        <div className="flex flex-col gap-2 rounded-lg border-2 border-brand/40 bg-brand-soft/30 p-3">
          <p className="font-bold">
            {mineLabel!.glyph} {when(draft.at)} 지점에 {actions.role === "teacher" ? "피드백" : "메모"}{" "}
            {draft.id === undefined ? "남기기" : "고치기"}
          </p>
          <textarea
            value={draft.text}
            onChange={(e) => setDraft({ ...draft, text: e.target.value })}
            maxLength={MAX_NOTE_TEXT}
            rows={3}
            autoFocus
            aria-label={actions.role === "teacher" ? "피드백 내용" : "메모 내용"}
            placeholder={
              actions.role === "teacher"
                ? "예: 여기서 오류 메시지를 읽고 스스로 고친 점이 좋아요. 다음엔 변수 이름을 더 알기 쉽게 지어 보세요."
                : "예: 여기서 range(1, 5)가 5까지 나오는 줄 알았다. 끝 숫자는 빠진다는 걸 알았다."
            }
            className="w-full rounded-lg border border-line bg-white px-3 py-2 outline-none focus:border-brand focus:ring-2 focus:ring-brand/15"
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={save}
              disabled={pending || !draft.text.trim()}
              className="rounded-lg bg-brand px-4 py-1.5 font-bold text-white disabled:opacity-50"
            >
              {pending ? "저장 중…" : "저장"}
            </button>
            <button type="button" onClick={() => setDraft(null)} className="rounded-lg border border-line bg-white px-4 py-1.5">
              취소
            </button>
          </div>
        </div>
      )}
      {error && <p role="alert" className="text-danger">{error}</p>}
      {sorted.length > 0 && (
        <>
          <p className="text-muted">타임라인 메모 {sorted.length}개 (누르면 그 순간으로 이동)</p>
          <ul className="flex flex-col gap-1">
            {sorted.map((n) => (
              <li
                key={n.id}
                className={`flex items-start gap-2 rounded-lg px-2 py-1.5 ${
                  selected.has(n.id) ? "bg-amber-50 ring-1 ring-amber-300" : n.author === "teacher" ? "bg-blue-50/60" : ""
                }`}
              >
                <button type="button" onClick={() => onSeek(n.at)} className="flex min-w-0 flex-1 gap-2 text-left">
                  <span className="w-16 shrink-0 tabular-nums text-muted">{when(n.at)}</span>
                  <span aria-hidden>{NOTE_STYLE[n.author].glyph}</span>
                  <span className="min-w-0">
                    <b className="mr-1.5 text-xs text-muted">{n.author === "teacher" ? "선생님" : actions?.role === "teacher" ? "학생" : "나"}</b>
                    <span className="whitespace-pre-wrap break-words">{n.text}</span>
                  </span>
                </button>
                {n.mine && actions && (
                  <span className="flex shrink-0 gap-2 text-xs">
                    <button type="button" onClick={() => setDraft({ id: n.id, at: n.at, text: n.text })} className="text-brand hover:underline">
                      고치기
                    </button>
                    <button type="button" onClick={() => remove(n)} disabled={pending} className="text-danger hover:underline">
                      지우기
                    </button>
                  </span>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
