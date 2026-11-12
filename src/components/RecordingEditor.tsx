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
import { EditorState, type Extension } from "@codemirror/state";
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
import { loadPython, RUN_LIMIT_SECONDS, runStudentCode, TIME_LIMIT_ERROR } from "@/lib/pyodide";

type Props = {
  /** localStorage 키 (code_rec:{학번}_{과목}_{문제}) */
  storageKey: string;
  /** 시작 코드. 기록에는 남지 않고 init으로 따로 저장된다. */
  initialCode?: string;
  /** code: 파이썬 편집기 + 실행 / text: 글쓰기 모드(4단계). 기록 형식은 같다. */
  mode?: "code" | "text";
  /** 제출할 때 지금까지의 기록을 꺼내는 손잡이 */
  ref?: Ref<RecorderHandle>;
};

export type RecorderHandle = {
  /** 지금 코드와 작성 기록을 저장한 뒤 복사본을 돌려준다 */
  getRecording(): Recording | null;
  /** 길이 2짜리 표시 이벤트를 기록에 남긴다 (예: AI 도움 요청 "q"). 남긴 시각을 돌려준다 */
  addMark(kind: string): number | null;
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
export default function RecordingEditor({ storageKey, initialCode = "", mode = "code", ref }: Props) {
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

  useImperativeHandle(ref, () => ({
    getRecording() {
      const rec = recRef.current;
      if (!rec) return null;
      saveRef.current();
      return { init: rec.init, code: rec.code, log: [...rec.log] };
    },
    addMark(kind) {
      const rec = recRef.current;
      if (!rec) return null;
      const time = Date.now();
      rec.log.push([time, kind]);
      saveRef.current();
      return time;
    },
  }));

  // 편집기 만들기 + 기록
  useEffect(() => {
    const rec = loadRecording(storageKey, initialCode);
    recRef.current = rec;

    const save = () => {
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

    const extensions: Extension[] = [
      lineNumbers(),
      highlightActiveLineGutter(),
      history(),
      drawSelection(),
      highlightActiveLine(),
      EditorState.allowMultipleSelections.of(true),
      keymap.of([{ key: "Tab", run: tabKey, shift: indentLess }, ...defaultKeymap, ...historyKeymap]),
      EditorView.updateListener.of((update) => {
        let changed = false;
        for (const tr of update.transactions) {
          if (!tr.docChanged) continue;
          rec.log.push(...eventsFromChanges(tr.changes, tr.startState.doc, kindOf(tr), Date.now()));
          changed = true;
        }
        if (changed) save();
      }),
      EditorView.theme({
        "&": { height: "100%", fontSize: "15px" },
        ".cm-scroller": { fontFamily: "var(--font-code)" },
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

    // 창 이탈·복귀. blur/focus와 visibilitychange가 한 번에 겹쳐 오므로
    // 상태가 바뀔 때만 한 번씩 기록한다 (이탈 → 복귀 → 이탈 … 순서).
    let away = false;
    const mark = (kind: "b" | "f") => {
      if (runningRef.current || (kind === "b") === away) return;
      away = kind === "b";
      rec.log.push([Date.now(), kind]);
      save();
    };
    const onBlur = () => mark("b");
    const onFocus = () => mark("f");
    const onVisibility = () => mark(document.hidden ? "b" : "f");
    window.addEventListener("blur", onBlur);
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
      view.destroy();
      viewRef.current = null;
    };
  }, [storageKey, initialCode, mode]);

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
    if (!view || !rec) return;
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
    try {
      runStudentCode(py, view.state.doc.toString());
      rec.log.push(runEvent(Date.now(), null));
      setOutput({ text: shown() || "(출력 없음)", error: false });
    } catch (err) {
      const name = pythonErrorName(err);
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
      <div
        ref={parentRef}
        className="h-[clamp(320px,55vh,620px)] overflow-hidden rounded-xl border border-line bg-white focus-within:border-brand"
      />
      <div className="flex flex-wrap items-center gap-3">
        {mode === "code" && (
          <button
            type="button"
            onClick={run}
            disabled={running}
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
          <span className="ml-auto text-xs text-muted" title="작성 중인 코드와 과정이 이 브라우저에 자동 저장돼요">
            {savedAt ? `💾 자동 저장됨 (${savedAt.toLocaleTimeString("ko-KR")})` : "💾 쓰는 내용은 자동 저장돼요"}
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
