/**
 * 코드 작성 과정 기록(edit_log). v1(components/code_replay/recorder)과 같은 형식이라
 * v1 교사 화면의 재생기가 v2 제출도 그대로 읽을 수 있다. 형식을 바꾸지 말 것.
 *
 * 편집 이벤트: [시각ms, 종류, fromLine, fromCh, toLine, toCh, 입력텍스트]
 *   종류: i=입력 d=삭제 p=붙여넣기 x=잘라내기 u=되돌리기·다시실행 o=기타
 *   위치는 0부터 시작하는 줄/글자 위치, "변경 직전 문서" 기준
 * 짧은 이벤트(길이 2): [시각ms, "b"] 창 이탈 / [시각ms, "f"] 창 복귀 / [시각ms, "r:ok"] 실행 기록
 *   v1 재생기는 길이 3 이상을 편집 이벤트로 보므로, 새 이벤트는 길이 2로만 추가한다.
 */
import type { ChangeSet, Text } from "@codemirror/state";

export type EditKind = "i" | "d" | "p" | "x" | "u" | "o";
export type EditEvent = [number, EditKind, number, number, number, number, string];
export type MarkEvent = [number, string];
export type LogEvent = EditEvent | MarkEvent;

/** localStorage에 저장하는 작성 중 기록 (v1과 같은 모양) */
export type Recording = { init: string; log: LogEvent[]; code: string };

/** v1과 같은 localStorage 키: code_rec:{학번}_{과목}_{문제} */
export const storageKeyFor = (userId: string, subject: string, problem: string) =>
  `code_rec:${userId}_${subject}_${problem}`;

type UserEventSource = { isUserEvent(event: string): boolean };

/** CodeMirror 6 트랜잭션의 userEvent를 v1 종류 글자로 바꾼다. */
export function kindOf(tr: UserEventSource): EditKind {
  if (tr.isUserEvent("input.paste")) return "p";
  if (tr.isUserEvent("input.drop")) return "o"; // v1(CodeMirror 5)의 "drop"도 기타로 기록
  if (tr.isUserEvent("input")) return "i"; // 타이핑, 한글 조합, 엔터·들여쓰기
  if (tr.isUserEvent("delete.cut")) return "x";
  if (tr.isUserEvent("delete")) return "d";
  if (tr.isUserEvent("undo") || tr.isUserEvent("redo")) return "u";
  return "o";
}

/**
 * 한 트랜잭션의 변경들을 편집 이벤트로 만든다.
 * 위치는 모두 변경 직전 문서 기준이므로, 재생할 때 순서대로 적용해도 어긋나지 않도록
 * 뒤쪽 변경부터 기록한다.
 */
export function eventsFromChanges(
  changes: ChangeSet,
  startDoc: Text,
  kind: EditKind,
  time: number,
): EditEvent[] {
  const events: EditEvent[] = [];
  changes.iterChanges((fromA, toA, _fromB, _toB, inserted) => {
    const from = startDoc.lineAt(fromA);
    const to = startDoc.lineAt(toA);
    events.push([
      time,
      kind,
      from.number - 1,
      fromA - from.from,
      to.number - 1,
      toA - to.from,
      inserted.toString(),
    ]);
  });
  return events.reverse();
}

/** 실행 결과 기록: [시각ms, "r:ok"] 또는 [시각ms, "r:오류이름"] */
export const runEvent = (time: number, errorName: string | null): MarkEvent => [
  time,
  errorName ? `r:${errorName}` : "r:ok",
];

/**
 * 파이썬 오류에서 오류 이름(NameError 등)을 뽑는다.
 * Pyodide의 PythonError는 type 속성을 갖고, 없으면 메시지 마지막 줄("NameError: ...")에서 찾는다.
 */
export function pythonErrorName(err: unknown): string {
  const type = (err as { type?: unknown } | null)?.type;
  if (typeof type === "string" && /^[A-Za-z_][\w.]*$/.test(type)) return type.split(".").pop()!;
  const message = String((err as { message?: unknown } | null)?.message ?? err);
  const lines = message.trim().split("\n");
  const match = lines[lines.length - 1].match(/^([A-Za-z_][\w.]*)(?::|$)/);
  return match ? match[1].split(".").pop()! : "Error";
}

/** v1 재생기(CodeMirror 5 replaceRange)와 같은 방식으로 편집 이벤트 하나를 문자열에 적용한다. */
export function applyEditEvent(doc: string, e: EditEvent): string {
  const lines = doc.split("\n");
  const offset = (line: number, ch: number) => {
    let pos = 0;
    for (let i = 0; i < line; i++) pos += lines[i].length + 1;
    return pos + ch;
  };
  return doc.slice(0, offset(e[2], e[3])) + e[6] + doc.slice(offset(e[4], e[5]));
}

/** 시작 코드에 기록을 처음부터 적용해 최종 코드를 만든다 (재생과 같은 결과). */
export function replay(init: string, log: LogEvent[]): string {
  return log
    .filter((e): e is EditEvent => e.length > 2 && typeof e[6] === "string")
    .reduce(applyEditEvent, init);
}
