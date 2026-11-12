"use client";

import { python } from "@codemirror/lang-python";
import { defaultHighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { EditorState, StateEffect, StateField, type Extension } from "@codemirror/state";
import { Decoration, EditorView, lineNumbers, type DecorationSet } from "@codemirror/view";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { editRange, type EditEvent } from "@/lib/editLog";
import { analyzeLog, formatDuration, timeAxis, validEntries, type Mark, type MarkKind, type ReplayStats } from "@/lib/replay";
import { helpTrail, type HelpChat, type HelpStep } from "@/lib/helpTrail";
import type { TimelineNote } from "@/lib/timelineNotes";
import AiAnswer from "./AiAnswer";
import ReplayNotes, { NOTE_STYLE, type NoteActions, type NoteDraft } from "./ReplayNotes";

type Props = {
  init: string;
  code: string;
  log: unknown;
  mode?: "code" | "text";
  /** 이 시각(기록 안의 ms)까지 진행된 화면으로 연다. 없으면 처음부터 */
  startAt?: number;
  /** 타임라인 메모(학생 📌)·피드백(교사 💬) */
  notes?: TimelineNote[];
  /** 메모를 쓸 수 있으면 (학생: 내 제출, 교사: 피드백). 없으면 읽기만 */
  noteActions?: NoteActions;
  /** 작성 중 AI 도우미와 나눈 대화: "AI 도움 요청" 순간에 질문·답과 그 뒤 행동을 보여 준다 */
  chats?: HelpChat[];
  /** 재생기 아래에 붙일 내용 (예: AI 되돌아보기). seek로 재생기를 그 시각으로 옮길 수 있다 */
  extra?: (seek: (t: number) => void) => ReactNode;
  /** ▶ 재생으로 끝까지 봤을 때 (학생: 업적 "나를 보는 눈") */
  onEnd?: () => void;
};

/** 메모를 남기기 좋은 순간: 오류, 오래 멈춤, 크게 지움 */
const NOTE_WORTHY: MarkKind[] = ["run-error", "pause", "bigdelete"];

/**
 * 타임라인 표시: 흑백 인쇄에서도 구분되도록 색과 함께 모양이 다른 기호를 쓴다.
 * 빨강은 실행 오류에만 쓴다. 붙여넣기·다른 창으로 이동은 잘못이 아니라 있었던 일이므로 경고처럼 보이지 않는 색으로 둔다.
 */
export const MARK_STYLE: Record<MarkKind, { glyph: string; label: string; color: string }> = {
  paste: { glyph: "▼", label: "붙여넣기", color: "text-teal-700" },
  away: { glyph: "◇", label: "다른 창으로 이동", color: "text-slate-600" },
  "run-ok": { glyph: "●", label: "실행 성공", color: "text-green-600" },
  "run-error": { glyph: "✕", label: "실행 오류", color: "text-red-600" },
  pause: { glyph: "⏸", label: "1분 넘게 멈춤", color: "text-slate-500" },
  bigdelete: { glyph: "✂", label: "크게 지움", color: "text-purple-600" },
  ask: { glyph: "?", label: "AI 도움 요청", color: "text-blue-600" },
};

const SPEEDS = [1, 4, 16, 64];
const SKIP_IDLE_MAX_MS = 600; // "멈춘 시간 줄이기": 이벤트 사이를 최대 0.6초로 (v1과 같음)

// 붙여넣은 부분을 배경색 + 밑줄(흑백에서도 보이게)로 표시
const addPaste = StateEffect.define<{ from: number; to: number }>();
const pasteMark = Decoration.mark({ class: "cm-pasted" });
const pasteField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(deco, tr) {
    deco = deco.map(tr.changes);
    for (const ef of tr.effects) {
      if (ef.is(addPaste) && ef.value.to > ef.value.from) {
        deco = deco.update({ add: [pasteMark.range(ef.value.from, ef.value.to)] });
      }
    }
    return deco;
  },
  provide: (f) => EditorView.decorations.from(f),
});

/** 편집 이벤트 하나를 적용하는 트랜잭션 내용 */
function editSpec(state: EditorState, e: EditEvent) {
  const doc = state.doc;
  const lines = Array.from({ length: doc.lines }, (_, i) => doc.line(i + 1).length);
  const { from, to } = editRange(lines, e);
  return {
    changes: { from, to, insert: e[6] },
    effects: e[1] === "p" ? [addPaste.of({ from, to: from + e[6].length })] : [],
  };
}

/** 작성 과정 재생기 (교사·학생 공용). v1 replay.html과 같은 기록을 읽는다. */
const NO_CHATS: HelpChat[] = [];

export default function Replayer({ init, code, log, mode = "code", startAt, notes = [], noteActions, chats = NO_CHATS, extra, onEnd }: Props) {
  const analysis = useMemo(() => analyzeLog(init, log), [init, log]);
  const { edits, stats, startTime } = analysis;
  // 도움도 과정의 일부: AI 도움 요청 ↔ 그때의 대화, AI 답 붙여넣기, 도움 뒤 첫 실행
  const trail = useMemo(() => helpTrail(log, chats), [log, chats]);
  const marks = useMemo(() => {
    const aiPastes = new Set(trail.flatMap((s) => s.aiPastes));
    return analysis.marks.map((m) => {
      if (m.kind === "paste" && aiPastes.has(m.time)) return { ...m, detail: `${m.detail} · AI 답에서` };
      const chat = m.kind === "ask" ? trail.find((s) => s.askAt === m.time)?.chat : null;
      if (chat) return { ...m, detail: `AI에게 도움 요청: “${chat.question.length > 40 ? `${chat.question.slice(0, 40)}…` : chat.question}”` };
      return m;
    });
  }, [analysis.marks, trail]);
  // 업적에서 왔으면 그 순간까지의 편집을 적용한 화면에서 시작한다
  const startIndex = useMemo(
    () => (startAt === undefined ? 0 : edits.filter((e) => e[0] <= startAt).length),
    [edits, startAt],
  );
  const parentRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const extensionsRef = useRef<Extension[]>([]);
  const indexRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [index, setIndex] = useState(startIndex);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(4);
  const [skipIdle, setSkipIdle] = useState(true);
  const settings = useRef({ speed, skipIdle });
  settings.current = { speed, skipIdle };
  const [noteList, setNoteList] = useState(notes);
  const [draft, setDraft] = useState<NoteDraft | null>(null);
  /** 타임라인 기준: 편집 순서(편집 하나가 한 칸) 또는 시간(멈춘 구간이 그만큼 길게) */
  const [scale, setScale] = useState<"edits" | "time">("edits");
  const axis = useMemo(() => timeAxis(validEntries(log).map((e) => e[0])), [log]);
  /** 기록 시각 → 그때까지 적용된 편집 수 (타임라인 위치) */
  const indexAt = (t: number) => edits.filter((e) => e[0] <= t).length;

  useEffect(() => {
    extensionsRef.current = [
      lineNumbers(),
      EditorState.readOnly.of(true),
      EditorView.editable.of(false),
      pasteField,
      EditorView.theme({
        "&": { height: "100%", fontSize: "15px" },
        ".cm-scroller": { fontFamily: "var(--font-code)" },
        ".cm-pasted": { backgroundColor: "#fde68a", textDecoration: "underline dotted #b45309" },
      }),
      ...(mode === "code" ? [python(), syntaxHighlighting(defaultHighlightStyle, { fallback: true })] : [EditorView.lineWrapping]),
    ];
    let state = EditorState.create({ doc: edits.length ? init : code, extensions: extensionsRef.current });
    for (let i = 0; i < startIndex; i++) state = state.update(editSpec(state, edits[i])).state;
    const view = new EditorView({ parent: parentRef.current!, state });
    viewRef.current = view;
    indexRef.current = startIndex;
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      view.destroy();
      viewRef.current = null;
    };
  }, [init, code, edits, mode, startIndex]);

  /** n번째 편집까지 적용한 화면으로 이동 */
  function goTo(n: number) {
    const view = viewRef.current;
    if (!view) return;
    if (n < indexRef.current) {
      let state = EditorState.create({ doc: init, extensions: extensionsRef.current });
      for (let i = 0; i < n; i++) state = state.update(editSpec(state, edits[i])).state;
      view.setState(state);
    } else {
      for (let i = indexRef.current; i < n; i++) view.dispatch(editSpec(view.state, edits[i]));
    }
    indexRef.current = n;
    setIndex(n);
  }

  function stop() {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    setPlaying(false);
  }

  function step() {
    const i = indexRef.current;
    if (i >= edits.length) return stop();
    const view = viewRef.current!;
    view.dispatch({ ...editSpec(view.state, edits[i]), scrollIntoView: true });
    indexRef.current = i + 1;
    setIndex(i + 1);
    if (i + 1 >= edits.length) {
      onEnd?.();
      return stop();
    }
    let gap = (edits[i + 1][0] - edits[i][0]) / settings.current.speed;
    if (settings.current.skipIdle) gap = Math.min(gap, SKIP_IDLE_MAX_MS);
    timerRef.current = setTimeout(step, Math.max(gap, 8));
  }

  function togglePlay() {
    if (playing) return stop();
    if (indexRef.current >= edits.length) goTo(0);
    setPlaying(true);
    timerRef.current = setTimeout(step, 0);
  }

  const elapsed = index > 0 ? edits[index - 1][0] - startTime : 0;
  const nowTime = index > 0 ? edits[index - 1][0] : startTime;
  const seekTime = (t: number) => {
    stop();
    goTo(indexAt(t));
  };
  const startNote = (at: number) => {
    seekTime(at);
    setDraft({ at, text: "" });
  };
  const here = new Set(noteList.filter((n) => indexAt(n.at) === index).map((n) => n.id));
  const kindsUsed = Object.keys(MARK_STYLE).filter((k) => marks.some((m) => m.kind === k)) as MarkKind[];

  return (
    <div className="flex flex-col gap-3">
      <Stats stats={stats} empty={!edits.length && !marks.length} />
      <div ref={parentRef} className="h-[340px] overflow-hidden rounded-xl border border-line bg-white" />
      {edits.length > 0 && (
        <>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <button
              type="button"
              onClick={togglePlay}
              className="rounded-lg bg-brand px-4 py-1.5 font-bold text-white"
            >
              {playing ? "❚❚ 일시정지" : "▶ 재생"}
            </button>
            <select
              value={speed}
              onChange={(e) => setSpeed(Number(e.target.value))}
              className="rounded-lg border border-line px-2 py-1"
              aria-label="재생 속도"
            >
              {SPEEDS.map((s) => (
                <option key={s} value={s}>
                  {s}배
                </option>
              ))}
            </select>
            <label className="flex items-center gap-1">
              <input type="checkbox" checked={skipIdle} onChange={(e) => setSkipIdle(e.target.checked)} />
              멈춘 시간 줄이기
            </label>
            {noteActions && (
              <button
                type="button"
                onClick={() => {
                  // 쓰는 칸이 열려 있으면 다시 눌러 닫는다 (적은 내용이 있으면 한 번 물어봄)
                  if (draft) {
                    if (draft.text.trim() && !confirm("적은 내용이 있어요. 지우고 닫을까요?")) return;
                    return setDraft(null);
                  }
                  startNote(nowTime);
                }}
                aria-expanded={!!draft}
                className={`rounded-lg border border-brand px-3 py-1 font-bold ${
                  draft ? "bg-brand text-white" : "text-brand hover:bg-brand-soft"
                }`}
              >
                {draft
                  ? `✕ ${noteActions.role === "teacher" ? "피드백" : "메모"} 닫기`
                  : `${NOTE_STYLE[noteActions.role].glyph} 이 순간에 ${noteActions.role === "teacher" ? "피드백" : "메모"}`}
              </button>
            )}
            <span className="ml-auto tabular-nums text-muted">
              {index} / {edits.length} · {formatDuration(elapsed)}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
            <span aria-hidden>타임라인 기준</span>
            <div role="group" aria-label="타임라인 기준" className="flex overflow-hidden rounded-lg border border-line">
              {(
                [
                  ["edits", "편집 순서"],
                  ["time", "시간"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={scale === value}
                  onClick={() => setScale(value)}
                  className={`px-3 py-1 ${scale === value ? "bg-brand-soft font-bold text-brand" : "bg-white hover:bg-page"}`}
                >
                  {label}
                </button>
              ))}
            </div>
            <span>{scale === "time" ? "멈춘 구간이 그만큼 길게 보여요 (5분 넘게 비면 5분 길이로 줄여요)" : "편집 한 번이 한 칸이에요"}</span>
          </div>
          <Timeline
            marks={marks}
            total={edits.length}
            index={index}
            time={scale === "time" && axis.total > 0 ? { total: axis.total, pos: axis.pos, editTimes: edits.map((e) => e[0]) } : undefined}
            pins={noteList.map((n) => ({
              id: n.id,
              at: indexAt(n.at),
              time: n.at,
              glyph: NOTE_STYLE[n.author].glyph,
              title: `${n.author === "teacher" ? "선생님" : "메모"}: ${n.text}`,
            }))}
            onSeek={(n) => {
              stop();
              goTo(n);
            }}
          />
          {(() => {
            // 지금 재생 위치까지 가장 최근의 AI 도움 요청
            const step = [...trail].reverse().find((s) => indexAt(s.askAt) <= index);
            return step ? <HelpBox step={step} startTime={startTime} total={trail.length} order={trail.indexOf(step) + 1} onSeek={seekTime} /> : null;
          })()}
          {extra?.((t) => {
            seekTime(t);
            parentRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
          })}
          <ReplayNotes
            notes={noteList}
            startTime={startTime}
            actions={noteActions}
            draft={draft}
            setDraft={setDraft}
            onSeek={seekTime}
            onChange={setNoteList}
            selected={here}
          />
          {kindsUsed.length > 0 && (
            <p className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
              {kindsUsed.map((k) => (
                <span key={k}>
                  <span className={MARK_STYLE[k].color}>{MARK_STYLE[k].glyph}</span> {MARK_STYLE[k].label}
                </span>
              ))}
              {stats.pasteCount > 0 && <span>코드의 노란 밑줄: 붙여넣은 부분</span>}
            </p>
          )}
          {marks.length > 0 && (
            <div className="text-sm">
              <p className="text-muted">주요 순간 {marks.length}개 (누르면 그 순간으로 이동)</p>
              <ul className="mt-1 flex max-h-56 flex-col gap-0.5 overflow-auto">
                {marks.map((m, i) => (
                  <li key={i} className="flex items-center gap-2 rounded hover:bg-page">
                    <button
                      type="button"
                      onClick={() => {
                        stop();
                        goTo(m.at);
                      }}
                      className="flex min-w-0 flex-1 gap-2 px-2 py-0.5 text-left"
                    >
                      <span className="w-16 shrink-0 tabular-nums text-muted">{formatDuration(m.time - startTime)}</span>
                      <span className={MARK_STYLE[m.kind].color}>{MARK_STYLE[m.kind].glyph}</span>
                      <span>{m.detail}</span>
                    </button>
                    {noteActions && NOTE_WORTHY.includes(m.kind) && (
                      <button
                        type="button"
                        onClick={() => startNote(m.time)}
                        className="shrink-0 px-2 text-xs font-bold text-brand hover:underline"
                      >
                        {NOTE_STYLE[noteActions.role].glyph} 여기에 {noteActions.role === "teacher" ? "피드백" : "메모"}
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Timeline({
  marks,
  total,
  index,
  time,
  pins,
  onSeek,
}: {
  marks: Mark[];
  total: number;
  index: number;
  /** 시간 기준으로 그릴 때: 시각 → 위치, 편집마다의 시각. 없으면 편집 순서 기준 */
  time?: { total: number; pos: (t: number) => number; editTimes: number[] };
  /** 타임라인 메모 표시 (막대 위쪽) */
  pins: { id: number; at: number; time: number; glyph: string; title: string }[];
  onSeek: (n: number) => void;
}) {
  // 누르거나 가리킨 표시의 설명 (마우스가 없는 태블릿·키보드에서도 보이게 막대 아래에 글로 보여 준다)
  const [picked, setPicked] = useState<string | null>(null);
  /** 막대 위의 위치(%) */
  const pct = (p: { at: number; time: number }) => (time ? time.pos(p.time) / time.total : total ? p.at / total : 0) * 100;
  // 시간 기준의 막대: 0~STEPS. 지금 위치 = 마지막으로 적용한 편집의 시각
  const STEPS = 1000;
  const sliderValue = time ? (index > 0 ? Math.round((time.pos(time.editTimes[index - 1]) / time.total) * STEPS) : 0) : index;
  const seekSlider = (v: number) => {
    if (!time) return onSeek(v);
    const target = (v / STEPS) * time.total;
    onSeek(time.editTimes.filter((t) => time.pos(t) <= target).length);
  };
  // 편집 순서 기준에서는 코드를 안 바꾸는 동안 일어난 일이 같은 자리에 모인다.
  // 같은 자리·같은 종류는 기호 하나에 횟수를 붙여 보여 준다 (예: ◇3)
  const groups: { kind: MarkKind; at: number; time: number; details: string[] }[] = [];
  for (const m of marks) {
    const same = groups.find((g) => g.kind === m.kind && (time ? Math.abs(pct(g) - pct(m)) < 0.2 : g.at === m.at));
    if (same) same.details.push(m.detail);
    else groups.push({ kind: m.kind, at: m.at, time: m.time, details: [m.detail] });
  }
  const titleOf = (g: (typeof groups)[number]) =>
    g.details.length === 1
      ? g.details[0]
      : `${MARK_STYLE[g.kind].label} ${g.details.length}번: ${g.details.map((d) => d.replace(/^.*\((.*)\)$/, "$1")).join(", ")}`;
  // 그래도 가까이 겹치는 표시는 아래 줄로 내려 모두 보이게 한다
  const ROW = 24; // 누르기 쉬운 크기 (24px)
  const rowEnds: number[] = [];
  const rows = groups.map((m) => {
    let row = rowEnds.findIndex((end) => pct(m) - end >= 2.5);
    if (row < 0) row = rowEnds.length;
    rowEnds[row] = pct(m);
    return row;
  });
  const rowCount = Math.max(1, rowEnds.length);
  return (
    <div className="flex flex-col gap-1">
      <div className="relative px-1" style={{ paddingBottom: rowCount * ROW + 4, paddingTop: pins.length ? ROW : 0 }}>
        {pins.map((p) => (
          <button
            key={p.id}
            type="button"
            title={p.title}
            aria-label={p.title}
            onClick={() => {
              setPicked(p.title);
              onSeek(p.at);
            }}
            onFocus={() => setPicked(p.title)}
            onMouseEnter={() => setPicked(p.title)}
            style={{ left: `${pct(p)}%` }}
            className="absolute top-0 flex h-6 min-w-6 -translate-x-1/2 items-center justify-center rounded text-sm hover:bg-page"
          >
            {p.glyph}
          </button>
        ))}
        <input
          type="range"
          min={0}
          max={time ? STEPS : total}
          value={sliderValue}
          onChange={(e) => seekSlider(Number(e.target.value))}
          className="w-full accent-brand"
          aria-label="재생 위치"
        />
        <div className="absolute inset-x-1 bottom-0" style={{ height: rowCount * ROW + 4 }}>
          {groups.map((g, i) => (
            <button
              key={i}
              type="button"
              title={titleOf(g)}
              aria-label={titleOf(g)}
              onClick={() => {
                setPicked(titleOf(g));
                onSeek(g.at);
              }}
              onFocus={() => setPicked(titleOf(g))}
              onMouseEnter={() => setPicked(titleOf(g))}
              style={{ left: `${pct(g)}%`, top: rows[i] * ROW }}
              className={`absolute flex h-6 min-w-6 -translate-x-1/2 items-center justify-center rounded text-sm whitespace-nowrap hover:bg-page ${MARK_STYLE[g.kind].color}`}
            >
              {MARK_STYLE[g.kind].glyph}
              {g.details.length > 1 && <sub className="font-bold">{g.details.length}</sub>}
            </button>
          ))}
        </div>
      </div>
      {(marks.length > 0 || pins.length > 0) && (
        <p className="min-h-5 text-xs text-muted" aria-live="polite">
          {picked ?? "표시를 누르거나 가리키면 무슨 일이 있었는지 여기에 보여요."}
        </p>
      )}
    </div>
  );
}

/** 작성 과정 통계 한 줄 (재생기 위, 학습 여정 날짜별 기록에서 함께 씀) */
export function Stats({ stats: s, empty }: { stats: ReplayStats; empty: boolean }) {
  if (empty) {
    return (
      <p className="text-sm text-muted">
        작성 기록이 없어요. 편집기 밖에서 작성했거나, 기록 기능이 생기기 전에 제출한 코드일 수 있어요.
      </p>
    );
  }
  const total = s.typedChars + s.pastedChars;
  const ratio = total ? Math.round((s.pastedChars / total) * 100) : 0;
  const items = [
    ["총 작성 시간", formatDuration(s.totalMs)],
    ["실제 작업", formatDuration(s.activeMs)],
    ["직접 입력", `${s.typedChars}자`],
    ["삭제·수정", `${s.editCount}회`],
    ["붙여넣기", `${s.pasteCount}회 (입력량의 ${ratio}%)`],
    ["실행", `${s.runCount}회${s.runErrorCount ? ` (오류 ${s.runErrorCount})` : ""}`],
    ["창 이탈", `${s.awayCount}회${s.awayCount ? ` (${formatDuration(s.awayMs)})` : ""}`],
  ];
  if (s.pauseCount) items.push(["1분 넘게 멈춤", `${s.pauseCount}회`]);
  if (s.askCount) items.push(["AI 도움 요청", `${s.askCount}회`]);
  return (
    <dl className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
      {items.map(([k, v]) => (
        <div key={k} className="flex gap-1">
          <dt className="text-muted">{k}</dt>
          <dd className="font-bold tabular-nums text-brand">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

/** 재생 위치의 가장 최근 AI 도움: 무엇을 물었고 AI가 뭐라고 했는지, 그 뒤 학생이 어떻게 했는지 (사실만) */
function HelpBox({
  step,
  startTime,
  total,
  order,
  onSeek,
}: {
  step: HelpStep;
  startTime: number;
  total: number;
  order: number;
  onSeek: (t: number) => void;
}) {
  const [open, setOpen] = useState(true);
  const after = (t: number) => formatDuration(t - step.askAt);
  return (
    <section aria-label="이 순간의 AI 도움" className="flex flex-col gap-2 rounded-xl border border-blue-200 bg-blue-50/40 p-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-bold text-blue-800">
          ? AI 도움 요청 {total > 1 ? `${order}/${total}` : ""}
        </span>
        <button type="button" onClick={() => onSeek(step.askAt)} className="tabular-nums text-muted hover:text-ink hover:underline">
          {formatDuration(step.askAt - startTime)} 때
        </button>
        <button type="button" onClick={() => setOpen(!open)} className="ml-auto text-xs text-muted hover:text-ink">
          {open ? "접기" : "펼치기"}
        </button>
      </div>
      {open && (
        <>
          {step.chat ? (
            <>
              <p className="whitespace-pre-wrap rounded-lg bg-brand-soft px-3 py-2">
                <b>질문</b> {step.chat.question}
              </p>
              <div className="rounded-lg border border-line bg-white px-3 py-2">
                <p className="text-xs font-bold text-blue-700">🤖 AI가 만든 답변입니다</p>
                <p className="whitespace-pre-wrap leading-7">
                  <AiAnswer chat={step.chat} onMoment={(m) => onSeek(m.at)} />
                </p>
              </div>
            </>
          ) : (
            <p className="text-muted">이때 나눈 대화 내용은 저장되어 있지 않아요.</p>
          )}
          <div className="flex flex-col gap-1">
            <p className="font-bold text-muted">도움 받은 뒤</p>
            <ul className="flex flex-col gap-0.5">
              {step.aiPastes.map((t) => (
                <li key={t}>
                  <button type="button" onClick={() => onSeek(t)} className="text-left hover:underline">
                    <span className="text-teal-700">▼</span> {after(t)} 뒤 AI 답에 있던 내용을 붙여넣음
                  </button>
                </li>
              ))}
              {step.nextRun ? (
                <li>
                  <button type="button" onClick={() => onSeek(step.nextRun!.at)} className="text-left hover:underline">
                    {step.nextRun.ok ? (
                      <>
                        <span className="text-green-600">●</span> {after(step.nextRun.at)} 뒤 실행 성공
                        {step.aiPastes.length === 0 && " (AI 답을 붙여넣지 않고 직접 고침)"}
                      </>
                    ) : (
                      <>
                        <span className="text-danger">✕</span> {after(step.nextRun.at)} 뒤 다음 실행: {step.nextRun.error}
                      </>
                    )}
                  </button>
                </li>
              ) : (
                <li className="text-muted">그 뒤로 실행한 기록이 없어요.</li>
              )}
            </ul>
          </div>
        </>
      )}
    </section>
  );
}
