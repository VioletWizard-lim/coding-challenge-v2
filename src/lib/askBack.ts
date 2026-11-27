/**
 * AI 도우미의 첫 응답: 학생이 물으면 사이트가 작성 기록에서 막힌 순간을 찾아 "정해진 문장"으로 바로 되묻는다 (AI 호출 없음).
 * 학생이 답하면 그때 AI가 그 답과 과정 기록을 근거로 힌트를 준다 (student/actions.ts askAiHelper).
 *
 * 상황 (2027 작업 지시서 P1):
 * - A. 이번 문제에 작성 기록이 있음 → 기록에서 막힌 순간을 잘라 보여 주며 되묻는다
 * - B. 코드가 비어 있거나 거의 없음 → 코드 대신 문제 이해를 되묻는다
 * - C. 코드는 거의 없지만 이전 문제 기록에 비슷한 막힘이 있음 → 그 기록을 보여 주며 되묻는다 (없으면 B)
 * 강제 관문이 아니다: 학생이 무엇을 답해도(모르겠어요 포함) AI 힌트로 이어진다.
 * 막힌 순간을 찾는 규칙은 process-summary.ts, 기준값은 stuckRules.ts. 순수 함수만 — 단위 테스트: askBack.test.ts
 */
import { replay as replayLog } from "./editLog";
import { currentStuck, meaningfulLines, strongestStuck, type Moment, type StuckMoment, type StuckRule } from "./process-summary";
import { validEntries } from "./replay";
import { STUCK_RULES } from "./stuckRules";

export type Situation = "A" | "B" | "C";

/** 되물음에 보여 준 기록 구간 (ai_chats.clip에 저장, 지표 6의 원자료) */
export type AskClip = {
  /** recent: 막힘은 없지만 최근 기록(마지막 실행)을 보여 줌 / understand: B 상황(기록 없이 문제 이해) */
  rule: StuckRule | "recent" | "understand";
  from: number | null;
  to: number | null;
  line: number | null;
  count: number;
  error: string | null;
  minutes: number;
  lineVersions: string[];
  /** 구간 끝의 코드 (길면 자름) */
  codeAt: string;
  /** recent: 마지막 실행 결과 ("ok", 오류 이름, 실행한 적 없으면 null) */
  lastRun?: string | null;
  /** C: 어느 이전 문제의 기록인지 (submissionId가 있으면 그 제출의 재생을 열 수 있음) */
  source?: { problem: string; title: string; submissionId?: number };
};

export type AskDecision = { situation: Situation; clip: AskClip; text: string; moments: Moment[] };

/** C 상황에서 찾아볼 이전 기록 (부르는 쪽이 같은 단원 → 최근 순서로 넘긴다) */
export type PrevRecord = { problem: string; title: string; submissionId?: number; init: string; log: unknown };

const MAX_CODE = 1500;
const cut = (code: string) => (code.length > MAX_CODE ? `${code.slice(0, MAX_CODE)}\n…` : code);
const mins = (m: number) => (m < 1 ? "1분이 안 되는 사이" : `${Math.round(m)}분 동안`);
const NO_GATE = "\n\n정답이 아니어도 괜찮아요. '모르겠어요'라고 적어도 그 답을 보고 힌트를 줄게요.";

const toClip = (m: StuckMoment): AskClip => ({
  rule: m.rule,
  from: m.from,
  to: m.to,
  line: m.line,
  count: m.count,
  error: m.error,
  minutes: m.minutes,
  lineVersions: m.lineVersions,
  codeAt: cut(m.codeAt),
});

/** 재생 버튼에 쓸 순간 이름 */
function momentLabel(c: AskClip): string {
  switch (c.rule) {
    case "error-repeat":
      return `${c.error} ${c.count}번 난 구간`;
    case "paste-error":
      return `붙여넣은 뒤 ${c.error}가 난 구간`;
    case "same-line":
      return `${c.line}번째 줄을 고친 구간`;
    case "long-pause":
      return `${Math.round(c.minutes)}분 멈춘 구간`;
    default:
      return "최근 기록";
  }
}

const MOMENT_KIND: Record<string, Moment["kind"]> = {
  "error-repeat": "run-error",
  "paste-error": "paste",
  "same-line": "edit",
  "long-pause": "pause",
  recent: "edit",
};

/** A 상황 되물음 문장 ([[M1]]은 화면에서 "이 구간 다시 보기" 단추가 된다) */
function textA(c: AskClip): string {
  const lineText = c.line ? `${c.line}번째 줄` : "코드";
  switch (c.rule) {
    case "error-repeat":
      return `방금 ${mins(c.minutes)} 같은 ${c.error}가 ${c.count}번 이어서 났어요 [[M1]]. 오류 메시지에서 몇 번째 줄, 어떤 말을 보고 고쳐 봤나요? 고칠 때 어떤 결과가 나오길 기대했는지도 알려 줄래요?`;
    case "paste-error":
      return `${lineText}에 붙여넣은 뒤 첫 실행에서 ${c.error}가 났어요 [[M1]]. 붙여넣은 코드가 어떤 일을 하는 코드라고 생각했나요?`;
    case "same-line":
      return `${mins(c.minutes)} ${lineText}을 ${c.count}번 고쳤어요 [[M1]]. 고칠 때마다 어떤 결과를 기대했나요? 그 줄이 무엇을 해야 하는 줄인지 내 말로 설명해 볼래요?`;
    case "long-pause":
      return `${lineText}을 쓴 뒤 ${Math.round(c.minutes)}분 동안 멈춰 있었어요 [[M1]]. 그때 무엇을 고민하고 있었나요? 다음에 쓰려던 줄이 무엇을 해야 하는지 말해 볼래요?`;
    default:
      if (c.lastRun === "ok")
        return `마지막 실행은 오류 없이 끝났어요 [[M1]]. 나온 결과가 문제의 예시 출력과 똑같았나요? 다르다면 어느 부분이 달랐나요?`;
      if (c.lastRun)
        return `마지막 실행에서 ${c.lastRun}가 났어요 [[M1]]. 오류 메시지가 몇 번째 줄을 가리키고, 무슨 뜻이라고 생각하나요?`;
      return `아직 한 번도 실행하지 않았어요. 지금 코드를 실행하면 어떤 결과가 나올 거라고 예상하나요? 예상과 실제 결과를 비교해 보면 어디를 볼지 알 수 있어요.`;
  }
}

const TEXT_B =
  "코드를 쓰기 전에 문제를 같이 정리해 볼까요? 입력으로 무엇이 들어오고, 결과로 무엇을 출력해야 하나요? 예시 하나를 손으로 먼저 풀어 보면 어떤 순서로 계산하게 되나요?";

function textC(c: AskClip): string {
  const where = c.source ? `지난번 ${c.source.problem}${c.source.title && c.source.title !== c.source.problem ? ` ${c.source.title}` : ""} 문제` : "지난 문제";
  const what =
    c.rule === "error-repeat"
      ? `${c.error}가 ${c.count}번 이어서 났던 것`
      : c.rule === "paste-error"
        ? `붙여넣은 뒤 ${c.error}가 났던 것`
        : c.rule === "same-line"
          ? `${c.line}번째 줄을 ${c.count}번 고쳤던 것`
          : `${Math.round(c.minutes)}분 동안 멈췄던 것`;
  return `${where}에서 ${what} 기억나요? 이번 문제에도 비슷한 부분이 나올 수 있어요. 시작하기 전에, 이번 문제는 입력으로 무엇이 들어오고 무엇을 출력해야 하는지 먼저 말해 볼래요?`;
}

/** 마지막 실행 결과: "ok", 오류 이름, 실행한 적 없으면 null */
function lastRunOf(log: unknown): { result: string | null; at: number | null } {
  const runs = validEntries(log).filter((e) => e.length === 2 && e[1].startsWith("r:"));
  const last = runs[runs.length - 1];
  return last ? { result: last[1] === "r:ok" ? "ok" : last[1].slice(2) || "오류", at: last[0] } : { result: null, at: null };
}

/**
 * 첫 되물음을 정한다.
 * @param starter 시작 코드 (의미 있는 줄을 셀 때 뺀다)
 * @param previous C 상황에서 찾아볼 이전 기록 (같은 단원 → 최근 순서). P4 성취기준 태그가 생기면 같은 태그를 앞에 둔다
 */
export function decideAsk(input: { init: string; log: unknown; now: number; starter?: string; previous?: PrevRecord[] }): AskDecision {
  const code = replayLog(input.init, validEntries(input.log));
  if (meaningfulLines(code, input.starter ?? input.init) >= STUCK_RULES.emptyCode.minMeaningfulLines) {
    const stuck = currentStuck(input.init, input.log, input.now);
    let clip: AskClip;
    if (stuck) clip = toClip(stuck);
    else {
      const run = lastRunOf(input.log);
      const events = validEntries(input.log);
      const lastAt = events.length ? events[events.length - 1][0] : input.now;
      clip = { rule: "recent", from: run.at, to: lastAt, line: null, count: 0, error: null, minutes: 0, lineVersions: [], codeAt: cut(code), lastRun: run.result };
    }
    const moments: Moment[] = clip.from !== null ? [{ id: "M1", at: clip.from, kind: MOMENT_KIND[clip.rule] ?? "edit", label: momentLabel(clip) }] : [];
    const text = textA(clip);
    return { situation: "A", clip, text: (moments.length ? text : text.replace(" [[M1]]", "")) + NO_GATE, moments };
  }
  for (const prev of input.previous ?? []) {
    const stuck = strongestStuck(prev.init, prev.log);
    if (!stuck) continue;
    const clip: AskClip = { ...toClip(stuck), source: { problem: prev.problem, title: prev.title, submissionId: prev.submissionId } };
    return { situation: "C", clip, text: textC(clip) + NO_GATE, moments: [] };
  }
  return {
    situation: "B",
    clip: { rule: "understand", from: null, to: null, line: null, count: 0, error: null, minutes: 0, lineVersions: [], codeAt: cut(code) },
    text: TEXT_B + NO_GATE,
    moments: [],
  };
}

/**
 * 되물음 뒤 학생의 다음 말이 같은 흐름인지 (그러면 다시 되묻지 않고 AI 힌트).
 * threadMs 안이고, 마지막 메시지 뒤로 실행 기록이 새로 생기지 않았으면 같은 흐름.
 */
export function continuesThread(lastAt: number, log: unknown, at: number): boolean {
  if (at - lastAt > STUCK_RULES.threadMs) return false;
  return !validEntries(log).some((e) => e.length === 2 && e[0] > lastAt && e[1].startsWith("r:"));
}

/** 되물음 글에서 화면용 표시([[M1]] 단추, "모르겠어요라고 적어도…" 안내)를 빼고 AI에 보낼 말만 */
export const plainAskText = (text: string) => text.replace(NO_GATE, "").replace(/ ?\[\[M\d+\]\]/g, "");

const RULE_NAME: Record<AskClip["rule"], string> = {
  "error-repeat": "같은 오류 반복",
  "paste-error": "붙여넣기 직후 오류",
  "same-line": "같은 줄 반복 수정",
  "long-pause": "긴 멈춤",
  recent: "최근 실행",
  understand: "코드가 거의 없음 (문제 이해 되묻기)",
};

/** AI에 함께 보낼 글: 사이트가 무엇을 보여 주며 되물었는지 (학생 답을 그 기록과 맞춰 볼 수 있게) */
export function askedBackText(ask: { situation: Situation; clip: AskClip | null; text: string }): string {
  const c = ask.clip;
  const lines = [
    `사이트가 학생의 작성 기록에서 아래 순간을 찾아 먼저 되물었고, 학생이 그 되물음에 답했습니다 (상황 ${ask.situation}).`,
    `- 되물은 말: ${plainAskText(ask.text)}`,
  ];
  if (c && c.rule !== "understand") {
    lines.push(`- 찾은 규칙: ${RULE_NAME[c.rule]}${c.line ? `, ${c.line}번째 줄` : ""}${c.error ? `, ${c.error}` : ""}${c.count > 1 ? `, ${c.count}번` : ""}`);
    if (c.source) lines.push(`- 이 기록은 이번 문제가 아니라 이전 문제(${c.source.problem})의 기록입니다.`);
    if (c.lineVersions.length) lines.push(`- 그 줄이 고칠 때마다 바뀐 모습:\n${c.lineVersions.map((v, i) => `  ${i + 1}. ${v || "(빈 줄)"}`).join("\n")}`);
    if (c.codeAt) lines.push(`- 그 순간의 코드:\n\`\`\`python\n${c.codeAt}\n\`\`\``);
  }
  return lines.join("\n");
}

/* ───────── 막힘 알림 (P2): 학생이 AI를 누르지 않아도 기록 일부를 먼저 띄운다 ───────── */

/** 알림이 뜬 표시 (작성 기록에 [시각, 이 값]으로 남긴다). 같은 막힘으로 두 번 알리지 않으려고 규칙과 시작 시각을 담는다 */
export const nudgeKind = (m: StuckMoment) => `n:${m.rule}@${Math.round(m.from)}`;

/**
 * 지금 막힘 알림을 띄울지: 지금 막힌 곳(currentStuck)이 있고, 같은 막힘으로 알린 적이 없고,
 * 마지막 알림에서 nudge.gapMs가 지났으면 그 막힘을, 아니면 null
 */
export function nudgeDue(init: string, log: unknown, now: number): StuckMoment | null {
  const shown = validEntries(log).filter((e) => e.length === 2 && /^n:[a-z-]+@\d+$/.test(e[1]));
  const last = shown[shown.length - 1];
  if (last && now - last[0] < STUCK_RULES.nudge.gapMs) return null;
  const m = currentStuck(init, log, now);
  if (!m || shown.some((e) => e[1] === nudgeKind(m))) return null;
  return m;
}

/** 알림 문장 (탓하지 않고, 다시 볼지 묻기만) */
export function nudgeText(m: StuckMoment): string {
  const lineText = m.line ? `${m.line}번째 줄` : "코드";
  switch (m.rule) {
    case "error-repeat":
      return `같은 ${m.error}가 ${m.count}번 이어서 났어요. 오류가 난 구간을 다시 볼까요?`;
    case "paste-error":
      return `붙여넣은 뒤 바로 ${m.error}가 났어요. 그 구간을 다시 볼까요?`;
    case "same-line":
      return `방금 ${lineText}을 ${m.count}번 고쳤어요. 고친 과정을 다시 볼까요?`;
    case "long-pause":
      return `${Math.round(m.minutes)}분째 멈춰 있어요. 지금까지 쓴 과정을 다시 볼까요?`;
  }
}

/** 알림의 "다시 보기"에서 재생할 구간: 멈춤이면 멈추기 전 2분, 나머지는 그 막힘 구간 */
export function nudgeRange(m: StuckMoment): { from: number; to: number } {
  return m.rule === "long-pause" ? { from: m.from - 2 * 60_000, to: m.from } : { from: m.from - 1, to: m.to };
}
