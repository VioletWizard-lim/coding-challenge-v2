"use client";

import { defaultKeymap, history, historyKeymap, indentLess, indentMore } from "@codemirror/commands";
import { python } from "@codemirror/lang-python";
import {
  bracketMatching,
  defaultHighlightStyle,
  indentOnInput,
  indentUnit,
  syntaxHighlighting,
} from "@codemirror/language";
import { Compartment, EditorState, type Extension } from "@codemirror/state";
import {
  drawSelection,
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
  type Command,
} from "@codemirror/view";
import { useEffect, useImperativeHandle, useRef, useState, type Ref } from "react";
import { eventsFromChanges, freeOldRecordings, kindOf, pythonErrorName, runEvent, type Recording } from "@/lib/editLog";
import { isQuiet } from "@/lib/quietDialog";
import { nudgeDue, nudgeKind, nudgeRange, nudgeText } from "@/lib/askBack";
import type { StuckMoment } from "@/lib/process-summary";
import { STUCK_RULES } from "@/lib/stuckRules";
import ReplayModal from "./ReplayModal";
import { livePayload, type LivePayload } from "@/lib/liveStatus";
import { OPEN_EVENT } from "@/lib/replay";
import { INPUT_CANCELLED, loadPython, RUN_LIMIT_SECONDS, runStudentCode, TIME_LIMIT_ERROR } from "@/lib/pyodide";

type Props = {
  /** localStorage 키 (code_rec:{학번}_{과목}_{문제}) */
  storageKey: string;
  /** 시작 코드. 기록에는 남지 않고 init으로 따로 저장된다. */
  initialCode?: string;
  /** code: 파이썬 편집기 + 실행 / text: 글쓰기 모드(4단계). 기록 형식은 같다. */
  mode?: "code" | "text";
  /** 제출할 때 지금까지의 기록을 꺼내는 손잡이 */
  ref?: Ref<RecorderHandle>;
  /**
   * 막힘 알림 (P2): 주면 켜진다. 막힘을 감지하면 편집기 위에 "다시 볼까요?" 알림을 띄운다.
   * onAskAi: 알림의 "AI에게 물어보기" (없으면 단추를 숨김) / suppressed: true면 띄우지 않음 (예: AI 도우미 창이 열려 있을 때)
   */
  nudge?: { onAskAi?: () => void; suppressed?: boolean };
  /**
   * 작성 중 상태 보내기 (P3, 교사 화면 "지금 수업 중"): 주면 문제를 열 때·첫 입력·막힘 알림 때 바로, 그 사이에는 이 화면을 보고 있을 때만
   * heartbeatMs마다 report를 부른다. 코드 내용은 담지 않는다 (liveStatus.ts livePayload)
   */
  live?: { report: (p: LivePayload) => void };
};

export type RecorderHandle = {
  /** 지금 코드와 작성 기록을 저장한 뒤 복사본을 돌려준다 */
  getRecording(): Recording | null;
  /** 길이 2짜리 표시 이벤트를 기록에 남긴다 (예: AI 도움 요청 "q"). 남긴 시각을 돌려준다 */
  addMark(kind: string): number | null;
  /** addMark로 남긴 표시를 지운다 (예: AI 질문이 실패했을 때 "AI 도움 요청"을 남기지 않게) */
  removeMark(time: number, kind: string): void;
};

type PyStatus = "loading" | "ready" | "error";

const INDENT = "    ";
/** 실행 결과로 보여 주는 글자 수 한도 */
const MAX_OUTPUT_CHARS = 100_000;

/** 선택 영역이 없으면 공백 4칸을 입력, 있으면 여러 줄 들여쓰기 */
const tabKey: Command = (view) => {
  if (!view.state.selection.ranges.every((r) => r.empty)) return indentMore(view);
  view.dispatch({ ...view.state.replaceSelection(INDENT), userEvent: "input.type", scrollIntoView: true });
  return true;
};

function loadRecording(key: string, initialCode: string): Recording {
  try {
    const saved = JSON.parse(localStorage.getItem(key) ?? "null");
    if (saved && Array.isArray(saved.log) && typeof saved.code === "string") {
      return { init: typeof saved.init === "string" ? saved.init : initialCode, log: saved.log, code: saved.code };
    }
  } catch {}
  return { init: initialCode, log: [], code: initialCode };
}

/** Pyodide 내부 줄은 빼고 학생 코드(<exec>) 부분부터 오류를 보여 준다. */
function friendlyTraceback(err: unknown) {
  const lines = String((err as Error)?.message ?? err).trim().split("\n");
  const start = lines.findIndex((line) => line.includes('File "<exec>"'));
  return (start >= 0 ? lines.slice(start) : lines.slice(-4)).join("\n");
}

/**
 * 작성 과정을 기록하는 편집기. 모든 편집·창 이탈·실행을 v1과 같은 edit_log 형식으로
 * localStorage에 바로 저장하므로 새로고침해도 이어서 쓸 수 있다.
 */
export default function RecordingEditor({ storageKey, initialCode = "", mode = "code", ref, nudge, live }: Props) {
  const parentRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const recRef = useRef<Recording | null>(null);
  /** 파이썬 실행 중이면 true: input() 입력창이 보내는 창 이탈·복귀 신호를 기록하지 않는다 */
  const runningRef = useRef(false);
  const saveRef = useRef<() => void>(() => {});
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [saveFailed, setSaveFailed] = useState(false);
  const [pyStatus, setPyStatus] = useState<PyStatus>("loading");
  const [running, setRunning] = useState(false);
  const [output, setOutput] = useState<{ text: string; error: boolean } | null>(null);
  /**
   * 같은 문제가 다른 창(탭)에서도 열려 있을 때: 다른 창이 기록을 저장하면 이 창의 기록은 낡은 것이 된다.
   * 낡은 기록으로 덮어쓰지 않게 이 창은 잠시 멈추고(stale), 이 창으로 돌아오면 다른 창이 저장한 기록을 불러와 이어 쓴다.
   */
  const [stale, setStale] = useState(false);
  const [tookOver, setTookOver] = useState(false);
  const [reloadN, setReloadN] = useState(0);
  const staleRef = useRef(false);
  /** 막힘 알림 (P2): 지금 떠 있는 알림, 다시 보기 창 */
  const [nudged, setNudged] = useState<StuckMoment | null>(null);
  const [nudgeReplay, setNudgeReplay] = useState<{ rec: Recording; at: number; end: number; label: string } | null>(null);
  const nudgeRef = useRef(nudge);
  const nudgedRef = useRef<StuckMoment | null>(null);
  /** 작성 중 상태 (P3): 이번에 문제를 연 시각, 첫 입력을 보냈는지 */
  const liveRef = useRef(live);
  const openedAtRef = useRef<number | null>(null);
  const firstInputSentRef = useRef(false);
  const reportLiveRef = useRef(() => {});
  useEffect(() => {
    nudgeRef.current = nudge;
    nudgedRef.current = nudged;
    liveRef.current = live;
    reportLiveRef.current = () => {
      const rec = recRef.current;
      if (!rec || openedAtRef.current === null || staleRef.current || !liveRef.current) return;
      const p = livePayload(rec.log, openedAtRef.current);
      if (p.firstInputAt !== null) firstInputSentRef.current = true;
      try {
        liveRef.current.report(p);
      } catch {}
    };
  });
  /** 다른 창의 기록을 불러와 다시 연 것인지 (다시 열 때 "창 복귀"를 맞춰 남긴다) */
  const takeOverRef = useRef(false);

  useImperativeHandle(ref, () => ({
    getRecording() {
      const rec = recRef.current;
      if (!rec || staleRef.current) return null;
      saveRef.current();
      return { init: rec.init, code: rec.code, log: [...rec.log] };
    },
    addMark(kind) {
      const rec = recRef.current;
      if (!rec || staleRef.current) return null;
      const time = Date.now();
      rec.log.push([time, kind]);
      saveRef.current();
      return time;
    },
    removeMark(time, kind) {
      const rec = recRef.current;
      if (!rec || staleRef.current) return;
      for (let i = rec.log.length - 1; i >= 0; i--) {
        const e = rec.log[i];
        if (e.length === 2 && e[0] === time && e[1] === kind) {
          rec.log.splice(i, 1);
          saveRef.current();
          return;
        }
      }
    },
  }));

  // 편집기 만들기 + 기록
  useEffect(() => {
    const rec = loadRecording(storageKey, initialCode);
    recRef.current = rec;
    let stale = false;
    staleRef.current = false;
    // 다른 창이 남긴 기록을 불러와 다시 열었으면: 그 창을 떠나며 남긴 "창 이탈"을 이 창에 온 순간의 "창 복귀"로 닫는다
    let closedAway = false;
    if (takeOverRef.current) {
      takeOverRef.current = false;
      const lastAway = rec.log.filter((e) => e.length === 2 && (e[1] === "b" || e[1] === "f")).at(-1);
      if (lastAway?.[1] === "b") {
        rec.log.push([Date.now(), "f"]);
        closedAway = true;
      }
    }

    const save = () => {
      if (stale) return; // 낡은 기록으로 다른 창의 기록을 덮어쓰지 않는다
      rec.code = viewRef.current?.state.doc.toString() ?? rec.code;
      const text = JSON.stringify(rec);
      let ok = false;
      try {
        localStorage.setItem(storageKey, text);
        ok = true;
      } catch {
        // 저장 공간이 모자라면 오래된 작성 중 기록을 지우고 한 번 더 해 본다
        try {
          if (freeOldRecordings(localStorage, storageKey, Date.now())) {
            localStorage.setItem(storageKey, text);
            ok = true;
          }
        } catch {}
      }
      // 저장하지 못했으면 "자동 저장됨"이라고 하지 않는다
      if (ok) setSavedAt(new Date());
      setSaveFailed(!ok);
    };
    saveRef.current = save;

    /** 다른 창에서 쓰는 동안 이 창을 읽기 전용으로 */
    const lock = new Compartment();
    const extensions: Extension[] = [
      lineNumbers(),
      highlightActiveLineGutter(),
      history(),
      drawSelection(),
      highlightActiveLine(),
      EditorState.allowMultipleSelections.of(true),
      lock.of([]),
      keymap.of([{ key: "Tab", run: tabKey, shift: indentLess }, ...defaultKeymap, ...historyKeymap]),
      EditorView.updateListener.of((update) => {
        let changed = false;
        for (const tr of update.transactions) {
          if (!tr.docChanged) continue;
          rec.log.push(...eventsFromChanges(tr.changes, tr.startState.doc, kindOf(tr), Date.now()));
          changed = true;
        }
        if (changed) {
          save();
          // 문제를 연 뒤 첫 입력이면 바로 알린다 (교사 화면 "시작 지연"이 바로 풀리게)
          if (!firstInputSentRef.current) reportLiveRef.current();
        }
      }),
      EditorView.theme({
        "&": { height: "100%", fontSize: "15px" },
        ".cm-scroller": { fontFamily: "var(--font-code)" },
      }),
      // 키보드만 쓰는 사람: Tab은 들여쓰기라서, 편집기에서 나가는 방법을 알려 준다 (CodeMirror 기본 기능)
      EditorView.contentAttributes.of({
        "aria-label": `${mode === "code" ? "코드" : "글"} 편집기. Tab은 들여쓰기예요. 편집기에서 나가려면 Esc를 누른 다음 Tab을 누르세요.`,
      }),
    ];
    if (mode === "code") {
      extensions.push(
        python(),
        indentUnit.of(INDENT),
        EditorState.tabSize.of(4),
        indentOnInput(),
        bracketMatching(),
        syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
      );
    } else {
      extensions.push(EditorView.lineWrapping);
    }

    // 문서 초기값은 기록하지 않는다 (EditorState.create는 트랜잭션이 아님)
    const view = new EditorView({
      parent: parentRef.current!,
      state: EditorState.create({ doc: rec.code, extensions }),
    });
    viewRef.current = view;

    // 다른 창의 기록에 "창 복귀"를 더했으면 저장한다 (그 밖에는 열기만 해서는 저장하지 않는다: 두 창이 서로 다시 불러오며 맴돌지 않게)
    if (closedAway) save();

    // 문제를 연 순간 (P3·지표 7). 방금(10분 안) 연 표시가 마지막이면 다시 남기지 않는다 (새로고침·창 오가기)
    const lastEvent = rec.log[rec.log.length - 1];
    const now0 = Date.now();
    if (lastEvent && lastEvent.length === 2 && lastEvent[1] === OPEN_EVENT && now0 - lastEvent[0] < 10 * 60_000) {
      openedAtRef.current = lastEvent[0];
    } else {
      rec.log.push([now0, OPEN_EVENT]);
      openedAtRef.current = now0;
      save();
    }
    firstInputSentRef.current = false;
    reportLiveRef.current();

    // 같은 문제를 다른 창에서 저장했을 때
    const takeOver = () => {
      takeOverRef.current = true;
      setTookOver(true);
      setReloadN((n) => n + 1); // 편집기를 다시 만들며 최신 기록을 불러온다
    };
    const onStorage = (e: StorageEvent) => {
      if (e.storageArea !== localStorage || e.key !== storageKey || e.newValue === null || stale) return;
      stale = true;
      staleRef.current = true;
      // 지금 이 창을 보고 있으면 바로 최신 기록으로 바꾸고, 아니면 멈춰 두었다가 돌아올 때 바꾼다
      if (document.hasFocus() && !document.hidden) return takeOver();
      view.dispatch({ effects: lock.reconfigure([EditorState.readOnly.of(true), EditorView.editable.of(false)]) });
      setStale(true);
    };

    // 창 이탈·복귀. blur/focus와 visibilitychange가 한 번에 겹쳐 오므로
    // 상태가 바뀔 때만 한 번씩 기록한다 (이탈 → 복귀 → 이탈 … 순서).
    // 실행 중 input() 입력창, 사이트가 띄운 확인 창(quietConfirm) 때문에 생긴 이탈은 기록하지 않는다
    let away = false;
    const mark = (kind: "b" | "f") => {
      if (stale || runningRef.current || isQuiet() || (kind === "b") === away) return;
      away = kind === "b";
      rec.log.push([Date.now(), kind]);
      save();
    };
    const onBlur = () => mark("b");
    const onFocus = () => (stale ? takeOver() : mark("f"));
    const onVisibility = () => (stale && !document.hidden ? takeOver() : mark(document.hidden ? "b" : "f"));
    window.addEventListener("blur", onBlur);
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("storage", onStorage);

    return () => {
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("storage", onStorage);
      setStale(false);
      view.destroy();
      viewRef.current = null;
    };
  }, [storageKey, initialCode, mode, reloadN]);

  // 막힘 알림 (P2): 이 화면을 보고 있는 동안 checkMs마다 지금 막힌 곳이 있는지 본다 (규칙·간격은 stuckRules.ts)
  const nudgeOn = !!nudge;
  useEffect(() => {
    if (!nudgeOn) return;
    const timer = setInterval(() => {
      const rec = recRef.current;
      if (!rec || staleRef.current || runningRef.current || nudgedRef.current || nudgeRef.current?.suppressed) return;
      if (document.hidden || !document.hasFocus()) return;
      const now = Date.now();
      const m = nudgeDue(rec.init, rec.log, now);
      if (!m) return;
      rec.log.push([now, nudgeKind(m)]); // 알림이 뜬 시점 (학생 반응은 n:open / n:ask / n:close)
      saveRef.current();
      reportLiveRef.current(); // 교사 화면 "막힘 반복"
      setNudged(m);
    }, STUCK_RULES.nudge.checkMs);
    return () => clearInterval(timer);
  }, [nudgeOn, storageKey, reloadN]);

  // 작성 중 상태 (P3): 이 화면을 보고 있는 동안 heartbeatMs마다 "아직 쓰는 중"을 보낸다
  const liveOn = !!live;
  useEffect(() => {
    if (!liveOn) return;
    const timer = setInterval(() => {
      // 브라우저 탭을 보고 있고, 편집기가 실제로 보일 때만 (사이트의 다른 메뉴에 가 있으면 숨겨져 있음)
      if (!document.hidden && parentRef.current?.offsetParent) reportLiveRef.current();
    }, STUCK_RULES.live.heartbeatMs);
    return () => clearInterval(timer);
  }, [liveOn, storageKey, reloadN]);

  /** 알림에 대한 학생 반응을 기록에 남기고 알림을 닫는다 */
  function reactNudge(kind: "n:open" | "n:ask" | "n:close") {
    const rec = recRef.current;
    const m = nudged;
    setNudged(null);
    if (!rec || !m || staleRef.current) return;
    rec.log.push([Date.now(), kind]);
    saveRef.current();
    if (kind === "n:open") {
      const range = nudgeRange(m);
      setNudgeReplay({ rec: { init: rec.init, code: rec.code, log: [...rec.log] }, at: range.from, end: range.to, label: "막혔던 구간" });
    }
    if (kind === "n:ask") nudgeRef.current?.onAskAi?.();
  }

  // 편집기가 열리면 파이썬을 미리 불러온다 (첫 실행 때 기다리지 않도록)
  useEffect(() => {
    if (mode !== "code") return;
    let alive = true;
    loadPython().then(
      () => alive && setPyStatus("ready"),
      () => alive && setPyStatus("error"),
    );
    return () => {
      alive = false;
    };
  }, [mode]);

  async function run() {
    const view = viewRef.current;
    const rec = recRef.current;
    if (!view || !rec || staleRef.current) return;
    setRunning(true);
    setOutput(pyStatus === "ready" ? null : { text: "파이썬을 불러오는 중이에요 (처음 한 번만 몇 초 걸려요)…", error: false });
    let py;
    try {
      py = await loadPython();
      setPyStatus("ready");
    } catch (err) {
      setPyStatus("error");
      setOutput({ text: String((err as Error).message ?? err), error: true });
      setRunning(false);
      return;
    }
    let buffer = "";
    let cut = false;
    // 출력이 끝없이 쌓이지 않게 (끝나지 않는 반복문 안의 print)
    const write = (s: string) => {
      if (buffer.length < MAX_OUTPUT_CHARS) buffer += s + "\n";
      else cut = true;
    };
    const shown = () => buffer + (cut ? "… (출력이 너무 길어서 여기까지만 보여 줘요)\n" : "");
    runningRef.current = true;
    py.setStdout({ batched: write });
    py.setStderr({ batched: write });
    // "실행 중…"이 화면에 먼저 보이게 한 박자 쉰 뒤 돌린다 (돌리는 동안에는 화면이 멈춘다)
    await new Promise((resolve) => setTimeout(resolve, 30));
    // input(): 입력창에 지금까지 나온 출력을 함께 보여 주고(무엇을 묻는지 알 수 있게), 넣은 값은 실행 결과에도 적는다
    const askUser = (prompt: string) => {
      const recent = buffer.trimEnd().split("\n").slice(-6).join("\n");
      const answer = window.prompt(
        [recent && `[지금까지 나온 출력]\n${recent}`, prompt.trim() || "input()에 넣을 값을 적어 주세요."].filter(Boolean).join("\n\n"),
      );
      if (answer !== null) write(prompt + answer);
      return answer;
    };
    try {
      runStudentCode(py, view.state.doc.toString(), askUser);
      rec.log.push(runEvent(Date.now(), null));
      setOutput({ text: shown() || "(출력 없음)", error: false });
    } catch (err) {
      const name = pythonErrorName(err);
      if (name === INPUT_CANCELLED) {
        // 입력을 취소한 것은 오류가 아니다: 실행 기록에 남기지 않고 멈췄다고만 알려 준다
        setOutput({ text: (buffer ? shown() + "\n" : "") + "⏹ 입력을 취소해서 실행을 멈췄어요. 다시 하려면 ▶ 실행을 눌러 주세요.", error: false });
        setTimeout(() => (runningRef.current = false), 500);
        setRunning(false);
        return;
      }
      rec.log.push(runEvent(Date.now(), name));
      const text =
        name === TIME_LIMIT_ERROR
          ? `⏱ 실행이 ${RUN_LIMIT_SECONDS}초를 넘어서 멈췄어요.\n끝나지 않는 반복문(while)이 있는지, 반복이 끝나는 조건을 확인해 보세요.`
          : friendlyTraceback(err);
      setOutput({ text: (buffer ? shown() + "\n" : "") + text, error: true });
    }
    // 입력창이 닫힌 뒤 늦게 도착하는 신호까지 무시하도록 조금 기다렸다가 푼다
    setTimeout(() => (runningRef.current = false), 500);
    saveRef.current();
    setRunning(false);
  }

  return (
    <div className="flex flex-col gap-3">
      {stale && (
        <p role="status" className="rounded-lg bg-amber-50 px-3 py-2 text-sm leading-6 text-amber-900">
          🪟 이 문제를 다른 창(탭)에서 쓰고 있어요. 기록이 섞이지 않게 이 창은 잠시 멈췄어요. 이 창을 누르면 다른 창에서 쓴 내용을
          불러와 이어서 쓸 수 있어요.
        </p>
      )}
      {nudged && !stale && (
        <div role="status" className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm">
          <span className="min-w-0 flex-1">📼 {nudgeText(nudged)}</span>
          <button
            type="button"
            onClick={() => reactNudge("n:open")}
            className="rounded-full border border-blue-300 bg-white px-2.5 py-0.5 font-medium text-blue-800 hover:bg-blue-50"
          >
            ⏪ 다시 보기
          </button>
          {nudge?.onAskAi && (
            <button
              type="button"
              onClick={() => reactNudge("n:ask")}
              className="rounded-full border border-line bg-white px-2.5 py-0.5 text-muted hover:text-ink"
            >
              🤖 AI에게 물어보기
            </button>
          )}
          <button type="button" onClick={() => reactNudge("n:close")} aria-label="알림 닫기" className="px-1 text-muted hover:text-ink">
            ✕
          </button>
        </div>
      )}
      {nudgeReplay && (
        <ReplayModal rec={nudgeReplay.rec} at={nudgeReplay.at} end={nudgeReplay.end} label={nudgeReplay.label} onClose={() => setNudgeReplay(null)} />
      )}
      {tookOver && !stale && (
        <p role="status" className="flex items-center gap-2 rounded-lg bg-page px-3 py-2 text-sm text-muted">
          🪟 다른 창(탭)에서 쓴 내용을 불러왔어요. 같은 문제는 한 창에서만 쓰면 헷갈리지 않아요.
          <button type="button" onClick={() => setTookOver(false)} aria-label="안내 닫기" className="ml-auto px-1 hover:text-ink">
            ✕
          </button>
        </p>
      )}
      <div
        ref={parentRef}
        className={`h-[clamp(320px,55vh,620px)] overflow-hidden rounded-xl border border-line bg-white focus-within:border-brand ${stale ? "opacity-60" : ""}`}
      />
      <div className="flex flex-wrap items-center gap-3">
        {mode === "code" && (
          <button
            type="button"
            onClick={run}
            disabled={running || stale}
            className="rounded-lg border border-brand bg-white px-5 py-2 font-bold text-brand hover:bg-brand-soft disabled:cursor-wait disabled:opacity-50"
          >
            {running ? "실행 중…" : "▶ 실행"}
          </button>
        )}
        {mode === "code" && (
          <span className="text-sm text-muted" aria-live="polite">
            {pyStatus === "loading" && "⏳ 파이썬 준비 중… (처음 한 번만 몇 초 걸려요)"}
            {pyStatus === "ready" && "✅ 파이썬 준비 완료"}
            {pyStatus === "error" && "⚠️ 파이썬을 불러오지 못했어요. 실행을 누르면 다시 시도해요."}
          </span>
        )}
        {!saveFailed && (
          <span className="ml-auto text-xs text-muted" title="이 컴퓨터의 이 브라우저에만 임시로 저장돼요. 다른 컴퓨터에서는 보이지 않아요">
            {savedAt ? `💾 이 컴퓨터에 임시 저장됨 (${savedAt.toLocaleTimeString("ko-KR")})` : "💾 쓰는 내용은 이 컴퓨터에 임시 저장돼요"}
          </span>
        )}
      </div>
      {saveFailed && (
        <p role="alert" className="rounded-lg bg-amber-50 px-3 py-2 text-sm leading-6 text-amber-900">
          ⚠️ 지금 쓰는 내용을 이 브라우저에 저장하지 못했어요. 새로고침하거나 창을 닫으면 사라질 수 있어요. 창을 닫지 말고 그대로
          제출하거나, 코드를 복사해 둔 뒤 선생님께 알려 주세요.
        </p>
      )}
      {mode === "code" && (
        <pre
          className={`max-h-56 min-h-16 overflow-auto whitespace-pre-wrap rounded-xl border border-line bg-white p-3 text-sm ${
            output?.error ? "text-danger" : "text-ink"
          }`}
          aria-live="polite"
        >
          {output?.text ?? "실행 결과가 여기에 나와요."}
        </pre>
      )}
    </div>
  );
}
