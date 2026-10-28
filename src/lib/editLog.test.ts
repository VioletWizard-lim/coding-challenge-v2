import { EditorSelection, EditorState, type TransactionSpec } from "@codemirror/state";
import { describe, expect, it } from "vitest";
import {
  applyEditEvent,
  eventsFromChanges,
  kindOf,
  pythonErrorName,
  replay,
  runEvent,
  type LogEvent,
} from "./editLog";

/** 편집기에 트랜잭션을 적용하면서 RecordingEditor와 같은 방식으로 기록을 남긴다. */
function record(init: string, specs: TransactionSpec[]) {
  let state = EditorState.create({ doc: init });
  const log: LogEvent[] = [];
  specs.forEach((spec, i) => {
    const tr = state.update(spec);
    if (tr.docChanged) log.push(...eventsFromChanges(tr.changes, tr.startState.doc, kindOf(tr), 1000 + i));
    state = tr.state;
  });
  return { log, code: state.doc.toString() };
}

describe("edit_log 기록", () => {
  it("입력을 v1 형식([시각, 종류, 줄, 글자, 줄, 글자, 텍스트])으로 기록한다", () => {
    const { log } = record("", [{ changes: { from: 0, insert: "print(1)" }, userEvent: "input.type" }]);
    expect(log).toEqual([[1000, "i", 0, 0, 0, 0, "print(1)"]]);
  });

  it("여러 줄 문서에서 줄·글자 위치를 0부터 센다", () => {
    const { log } = record("a = 1\nb = 2\n", [
      { changes: { from: 6, to: 11, insert: "c = 3\nd = 4" }, userEvent: "input.paste" },
    ]);
    expect(log).toEqual([[1000, "p", 1, 0, 1, 5, "c = 3\nd = 4"]]);
  });

  it("한 트랜잭션의 여러 변경은 뒤쪽부터 기록해 순서대로 재생해도 맞는다", () => {
    const init = "x = 1\ny = 2\nz = 3";
    const { log, code } = record(init, [
      {
        changes: [
          { from: 0, insert: "# " },
          { from: 6, insert: "# " },
          { from: 12, insert: "# " },
        ],
        userEvent: "input.type",
      },
    ]);
    expect(log.map((e) => e[2])).toEqual([2, 1, 0]);
    expect(replay(init, log)).toBe(code);
  });

  it("여러 커서 입력·삭제·잘라내기·되돌리기를 섞어도 재생 결과가 최종 코드와 같다", () => {
    const init = "for i in range(3):\n    print(i)\n";
    const first: TransactionSpec = { changes: { from: 15, to: 16, insert: "10" }, userEvent: "input.type" };
    // 커서 두 개에 동시에 "k" 입력
    const afterFirst = EditorState.create({
      doc: init,
      extensions: EditorState.allowMultipleSelections.of(true),
    }).update(first).state;
    const multi = afterFirst.update({
      selection: EditorSelection.create([EditorSelection.cursor(4), EditorSelection.cursor(30)]),
    }).state;
    const specs: TransactionSpec[] = [
      first,
      { changes: multi.replaceSelection("k").changes, userEvent: "input.type" },
      { changes: { from: 0, to: 3 }, userEvent: "delete.cut" },
      { changes: { from: 0, to: 1 }, userEvent: "delete.backward" },
      { changes: { from: 0, insert: "한글 주석\n" }, userEvent: "input.type.compose" },
      { changes: { from: 0, insert: "x" }, userEvent: "undo" },
    ];
    const { log, code } = record(init, specs);
    expect(log.map((e) => e[1])).toEqual(["i", "i", "i", "x", "d", "i", "u"]);
    expect(replay(init, log)).toBe(code);
  });

  it("문서를 바꾸지 않는 트랜잭션(커서 이동)은 기록하지 않는다", () => {
    const { log } = record("abc", [{ selection: { anchor: 2 } }]);
    expect(log).toEqual([]);
  });

  it("재생기는 길이 2짜리 이벤트(창 이탈·실행 기록)를 건너뛴다", () => {
    const log: LogEvent[] = [
      [1, "i", 0, 0, 0, 0, "ab"],
      [2, "b"],
      [3, "f"],
      runEvent(4, null),
      runEvent(5, "NameError"),
      [6, "d", 0, 1, 0, 2, ""],
    ];
    expect(replay("", log)).toBe("a");
    expect(log[3]).toEqual([4, "r:ok"]);
    expect(log[4]).toEqual([5, "r:NameError"]);
  });

  it("applyEditEvent는 v1 재생기처럼 줄 끝 너머 위치도 처리한다", () => {
    expect(applyEditEvent("ab\ncd", [0, "i", 1, 2, 1, 2, "!"])).toBe("ab\ncd!");
  });
});

describe("userEvent → 종류", () => {
  const tr = (ev: string) => ({ isUserEvent: (e: string) => ev === e || ev.startsWith(e + ".") });
  it.each([
    ["input.type", "i"],
    ["input.type.compose", "i"],
    ["input", "i"],
    ["input.paste", "p"],
    ["input.drop", "o"],
    ["delete.backward", "d"],
    ["delete.selection", "d"],
    ["delete.cut", "x"],
    ["undo", "u"],
    ["redo", "u"],
    ["move.drop", "o"],
    ["", "o"],
  ])("%s → %s", (ev, kind) => expect(kindOf(tr(ev))).toBe(kind));
});

describe("파이썬 오류 이름", () => {
  it("Pyodide PythonError의 type을 쓴다", () => {
    expect(pythonErrorName({ type: "ZeroDivisionError", message: "..." })).toBe("ZeroDivisionError");
  });
  it("type이 없으면 메시지 마지막 줄에서 찾는다", () => {
    const message = 'Traceback (most recent call last):\n  File "<exec>", line 1\nNameError: name \'x\' is not defined\n';
    expect(pythonErrorName(new Error(message))).toBe("NameError");
  });
  it("알 수 없으면 Error", () => {
    expect(pythonErrorName(new Error("뭔가 잘못됨"))).toBe("Error");
  });
});
