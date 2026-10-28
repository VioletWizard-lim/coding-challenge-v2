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
import { eventsFromChanges, kindOf, pythonErrorName, runEvent, type Recording } from "@/lib/editLog";
import { loadPython } from "@/lib/pyodide";

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
};

type PyStatus = "loading" | "ready" | "error";

const INDENT = "    ";

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
  const saveRef = useRef<() => void>(() => {});
  const [savedAt, setSavedAt] = useState<Date | null>(null);
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
  }));

  // 편집기 만들기 + 기록
  useEffect(() => {
    const rec = loadRecording(storageKey, initialCode);
    recRef.current = rec;

    const save = () => {
      rec.code = viewRef.current?.state.doc.toString() ?? rec.code;
      try {
        localStorage.setItem(storageKey, JSON.stringify(rec));
      } catch {}
      setSavedAt(new Date());
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
      if ((kind === "b") === away) return;
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
    py.setStdout({ batched: (s) => (buffer += s + "\n") });
    py.setStderr({ batched: (s) => (buffer += s + "\n") });
    try {
      await py.runPythonAsync(view.state.doc.toString());
      rec.log.push(runEvent(Date.now(), null));
      setOutput({ text: buffer || "(출력 없음)", error: false });
    } catch (err) {
      rec.log.push(runEvent(Date.now(), pythonErrorName(err)));
      setOutput({ text: (buffer ? buffer + "\n" : "") + friendlyTraceback(err), error: true });
    }
    saveRef.current();
    setRunning(false);
  }

  return (
    <div className="flex flex-col gap-3">
      <div
        ref={parentRef}
        className="h-[380px] overflow-hidden rounded-xl border border-line bg-white focus-within:border-brand"
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
        <span className="ml-auto text-xs text-muted" title="작성 중인 코드와 과정이 이 브라우저에 자동 저장돼요">
          {savedAt ? `💾 자동 저장됨 (${savedAt.toLocaleTimeString("ko-KR")})` : "💾 쓰는 내용은 자동 저장돼요"}
        </span>
      </div>
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
