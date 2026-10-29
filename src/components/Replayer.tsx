"use client";

import { python } from "@codemirror/lang-python";
import { defaultHighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { EditorState, StateEffect, StateField, type Extension } from "@codemirror/state";
import { Decoration, EditorView, lineNumbers, type DecorationSet } from "@codemirror/view";
import { useEffect, useMemo, useRef, useState } from "react";
import { editRange, type EditEvent } from "@/lib/editLog";
import { analyzeLog, formatDuration, type Mark, type MarkKind, type ReplayStats } from "@/lib/replay";

type Props = {
  init: string;
  code: string;
  log: unknown;
  mode?: "code" | "text";
};

/** 타임라인 표시: 흑백 인쇄에서도 구분되도록 색과 함께 모양이 다른 기호를 쓴다 */
export const MARK_STYLE: Record<MarkKind, { glyph: string; label: string; color: string }> = {
  paste: { glyph: "▼", label: "붙여넣기", color: "text-amber-600" },
  away: { glyph: "◇", label: "다른 창으로 이동", color: "text-rose-600" },
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
export default function Replayer({ init, code, log, mode = "code" }: Props) {
  const analysis = useMemo(() => analyzeLog(init, log), [init, log]);
  const { edits, marks, stats, startTime } = analysis;
  const parentRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const extensionsRef = useRef<Extension[]>([]);
  const indexRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(4);
  const [skipIdle, setSkipIdle] = useState(true);
  const settings = useRef({ speed, skipIdle });
  settings.current = { speed, skipIdle };

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
    const view = new EditorView({
      parent: parentRef.current!,
      state: EditorState.create({ doc: edits.length ? init : code, extensions: extensionsRef.current }),
    });
    viewRef.current = view;
    indexRef.current = 0;
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      view.destroy();
      viewRef.current = null;
    };
  }, [init, code, edits, mode]);

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
    if (i + 1 >= edits.length) return stop();
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
            <span className="ml-auto tabular-nums text-muted">
              {index} / {edits.length} · {formatDuration(elapsed)}
            </span>
          </div>
          <Timeline
            marks={marks}
            total={edits.length}
            index={index}
            onSeek={(n) => {
              stop();
              goTo(n);
            }}
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
                  <li key={i}>
                    <button
                      type="button"
                      onClick={() => {
                        stop();
                        goTo(m.at);
                      }}
                      className="flex w-full gap-2 rounded px-2 py-0.5 text-left hover:bg-page"
                    >
                      <span className="w-16 shrink-0 tabular-nums text-muted">{formatDuration(m.time - startTime)}</span>
                      <span className={MARK_STYLE[m.kind].color}>{MARK_STYLE[m.kind].glyph}</span>
                      <span>{m.detail}</span>
                    </button>
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
  onSeek,
}: {
  marks: Mark[];
  total: number;
  index: number;
  onSeek: (n: number) => void;
}) {
  const pct = (at: number) => (total ? at / total : 0) * 100;
  // 타임라인은 편집 순서로 나아가서, 코드를 안 바꾸는 동안 일어난 일은 같은 자리에 모인다.
  // 같은 자리·같은 종류는 기호 하나에 횟수를 붙여 보여 준다 (예: ◇3)
  const groups: { kind: MarkKind; at: number; details: string[] }[] = [];
  for (const m of marks) {
    const same = groups.find((g) => g.at === m.at && g.kind === m.kind);
    if (same) same.details.push(m.detail);
    else groups.push({ kind: m.kind, at: m.at, details: [m.detail] });
  }
  const titleOf = (g: (typeof groups)[number]) =>
    g.details.length === 1
      ? g.details[0]
      : `${MARK_STYLE[g.kind].label} ${g.details.length}번: ${g.details.map((d) => d.replace(/^.*\((.*)\)$/, "$1")).join(", ")}`;
  // 그래도 가까이 겹치는 표시는 아래 줄로 내려 모두 보이게 한다
  const rowEnds: number[] = [];
  const rows = groups.map((m) => {
    let row = rowEnds.findIndex((end) => pct(m.at) - end >= 1.5);
    if (row < 0) row = rowEnds.length;
    rowEnds[row] = pct(m.at);
    return row;
  });
  const rowCount = Math.max(1, rowEnds.length);
  return (
    <div className="relative px-1" style={{ paddingBottom: rowCount * 16 + 4 }}>
      <input
        type="range"
        min={0}
        max={total}
        value={index}
        onChange={(e) => onSeek(Number(e.target.value))}
        className="w-full accent-brand"
        aria-label="재생 위치"
      />
      <div className="absolute inset-x-1 bottom-0" style={{ height: rowCount * 16 + 4 }}>
        {groups.map((g, i) => (
          <button
            key={i}
            type="button"
            title={titleOf(g)}
            aria-label={titleOf(g)}
            onClick={() => onSeek(g.at)}
            style={{ left: `${pct(g.at)}%`, top: rows[i] * 16 }}
            className={`absolute -translate-x-1/2 text-xs leading-4 whitespace-nowrap ${MARK_STYLE[g.kind].color}`}
          >
            {MARK_STYLE[g.kind].glyph}
            {g.details.length > 1 && <sub className="font-bold">{g.details.length}</sub>}
          </button>
        ))}
      </div>
    </div>
  );
}

function Stats({ stats: s, empty }: { stats: ReplayStats; empty: boolean }) {
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
