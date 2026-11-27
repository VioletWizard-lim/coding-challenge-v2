/**
 * 연구용 지표 (2027 작업 지시서 P5): 학생 × 문제마다 8가지 지표를 작성 기록·AI 대화·문제 태그(P4)에서 계산한다.
 * 이름·학번 대신 익명 ID(researchId.ts, 비밀 키로 만든 값이라 내보낼 때마다 같음)를 쓴다.
 * 계산식은 아래 RESEARCH_NOTES에 적고, 내보낸 파일 맨 위에도 같은 글을 넣는다. 순수 함수만 — 단위 테스트: researchStats.test.ts
 *
 * 기준
 * - 학생·문제마다 가장 최근 제출의 작성 기록을 쓴다. 같은 브라우저에서 다시 내면 기록이 이어서 쌓이므로(localStorage) 최근 것이 전체 과정이다.
 *   제출하지 않은 문제는 기록이 서버에 없어 빠진다.
 * - "통과" = 예시로 확인(exampleCheck.ts)에서 모든 예시가 맞은 것 ([시각, "t:n/n"]). 확인 기록이 없는 제출(이 기능 전 제출, 예시 없는 문제)은 빈칸.
 *   교사 채점 점수는 따로 함께 내보낸다.
 * - 이것은 연구용 집계다. 학생 화면·점수에는 쓰지 않는다 (감시가 아니라 성찰).
 */
import type { AiChat } from "./aiChat";
import type { AskClip } from "./askBack";
import type { EditEvent, LogEvent } from "./editLog";
import { parseCheck } from "./exampleCheck";
import { OPEN_EVENT, validEntries } from "./replay";

/** 전반부·후반부 (수업 계획: 8차시) */
export const FIRST_HALF_LESSONS = [1, 2, 3, 4];
export const SECOND_HALF_LESSONS = [5, 6, 7, 8];

export type ResearchProblem = {
  number: string;
  title: string;
  lesson: number | null;
  lessonOrder: number | null;
  level: "기본" | "심화" | null;
  anchor: boolean;
  standards: string[];
};

export type ResearchSubmission = { id: number; student: string; problem: string; submittedAt: string; score: number | null; log: unknown };

export type ResearchChat = Pick<AiChat, "id" | "problem" | "at" | "question" | "step" | "situation" | "clip" | "parentId" | "createdAt"> & {
  student: string;
};

/** 학생 × 문제 한 줄 */
export type ProblemMetrics = {
  student: string;
  problem: string;
  submissions: number;
  score: number | null;
  /** 예시로 확인을 한 번이라도 했는지 (아니면 통과 관련 칸은 빈칸) */
  checked: boolean;
  passed: boolean | null;
  lastCheck: string;
  /** 1. 첫 실행부터 처음 통과까지 실행·확인 횟수 (통과 못 했으면 전체 횟수, passed=false) */
  attempts: number;
  /** 2. 실행 오류가 있었는지, 그 뒤에 통과했는지 */
  hadError: boolean;
  passedAfterError: boolean | null;
  /** 3. 붙여넣기 */
  typedChars: number;
  pastedChars: number;
  pasteCount: number;
  /** 4. AI 도움 요청 (되물음 + 예전 방식 질문), 힌트 */
  aiRequests: number;
  aiHints: number;
  /** 5. 되물음, 그중 추가 힌트 없이 통과한 것 */
  asks: number;
  solvedWithoutHint: number;
  /** 7. 문제를 연 뒤 첫 의미 있는 입력까지 (초). 여는 기록이 없으면 null */
  firstInputSec: number | null;
  /** 8. 빈 화면(B 상황)에서 AI 도움 요청 */
  emptyAsks: number;
};

const isEdit = (e: LogEvent): e is EditEvent => e.length > 2 && typeof e[6] === "string";
const errorRun = (e: LogEvent) => e.length === 2 && e[1].startsWith("r:") && e[1] !== "r:ok";

/** 한 학생·한 문제의 지표 (subs: 그 학생의 그 문제 제출들, chats: 그 학생의 그 문제 AI 대화) */
export function problemMetrics(student: string, problem: string, subs: ResearchSubmission[], chats: ResearchChat[]): ProblemMetrics {
  const latest = [...subs].sort((a, b) => a.submittedAt.localeCompare(b.submittedAt) || a.id - b.id).pop();
  const log = validEntries(latest?.log).slice().sort((a, b) => a[0] - b[0]);

  // 1·2. 실행(r:)·확인(t:) 기록을 차례로 보며, 처음 모두 맞은 확인까지 센다
  let attempts = 0;
  let passAt: number | null = null;
  let firstErrorAt: number | null = null;
  let lastCheck = "";
  let checked = false;
  for (const e of log) {
    if (e.length !== 2) continue;
    const check = parseCheck(e[1]);
    if (check) {
      checked = true;
      lastCheck = `${check.pass}/${check.total}`;
    }
    if (!check && !e[1].startsWith("r:")) continue;
    if (passAt === null) attempts++;
    if (errorRun(e) && firstErrorAt === null) firstErrorAt = e[0];
    if (check && check.pass === check.total && passAt === null) passAt = e[0];
  }
  // 마지막 확인이 모두 맞았으면 통과 (처음 통과 뒤에 고쳐서 틀려진 경우는 통과 아님)
  const passed = checked ? lastCheck.split("/")[0] === lastCheck.split("/")[1] : null;
  const lastPassAt = passed ? Math.max(...log.filter((e) => e.length === 2 && parseCheck(e[1])).map((e) => e[0])) : null;
  const hadError = firstErrorAt !== null;

  // 3. 붙여넣기
  let typedChars = 0;
  let pastedChars = 0;
  let pasteCount = 0;
  for (const e of log) {
    if (!isEdit(e)) continue;
    if (e[1] === "i") typedChars += e[6].length;
    if (e[1] === "p") {
      pasteCount++;
      pastedChars += e[6].length;
    }
  }

  // 7. 첫 의미 있는 입력: 문제를 연 뒤 공백이 아닌 글자를 처음 넣은(입력·붙여넣기) 때
  const opened = log.find((e) => e.length === 2 && e[1] === OPEN_EVENT)?.[0] ?? null;
  const firstInput = log.find((e) => isEdit(e) && (e[1] === "i" || e[1] === "p") && e[6].trim() !== "" && (opened === null || e[0] >= opened));
  const firstInputSec = opened !== null && firstInput ? Math.round((firstInput[0] - opened) / 1000) : null;

  // 4·5·8. AI 대화
  const asks = chats.filter((c) => c.step === "ask");
  const hints = chats.filter((c) => c.step === "hint");
  const hinted = new Set(hints.map((c) => c.parentId));
  const askTime = (c: ResearchChat) => c.at ?? Date.parse(c.createdAt);
  const solvedWithoutHint = asks.filter((c) => !hinted.has(c.id) && lastPassAt !== null && lastPassAt > askTime(c)).length;

  return {
    student,
    problem,
    submissions: subs.length,
    score: latest?.score ?? null,
    checked,
    passed,
    lastCheck,
    attempts,
    hadError,
    passedAfterError: hadError && checked ? passed === true && lastPassAt! > firstErrorAt! : null,
    typedChars,
    pastedChars,
    pasteCount,
    aiRequests: chats.filter((c) => c.step !== "hint").length,
    aiHints: hints.length,
    asks: asks.length,
    solvedWithoutHint,
    firstInputSec,
    emptyAsks: asks.filter((c) => c.situation === "B").length,
  };
}

/** 모든 학생 × 문제 (제출이 있는 것만) */
export function allProblemMetrics(subs: ResearchSubmission[], chats: ResearchChat[]): ProblemMetrics[] {
  const key = (s: string, p: string) => `${s}\u0000${p}`;
  const bySub = new Map<string, ResearchSubmission[]>();
  for (const s of subs) bySub.set(key(s.student, s.problem), [...(bySub.get(key(s.student, s.problem)) ?? []), s]);
  const byChat = new Map<string, ResearchChat[]>();
  for (const c of chats) byChat.set(key(c.student, c.problem), [...(byChat.get(key(c.student, c.problem)) ?? []), c]);
  return [...bySub.entries()].map(([k, list]) => {
    const [student, problem] = k.split("\u0000");
    return problemMetrics(student, problem, list, byChat.get(k) ?? []);
  });
}

/* ── 묶음 요약 (학생별 누적, 전반부·후반부, 앵커, 기본/심화, 차시) ── */

export type GroupSummary = {
  student: string;
  group: string;
  problems: number;
  /** 확인 기록이 있는 문제 중 통과 비율(%) */
  passRate: number | null;
  /** 통과한 문제의 평균 시도 횟수 */
  avgAttempts: number | null;
  /** 오류가 있었던 문제 중 통과 비율(%) */
  passAfterErrorRate: number | null;
  /** 붙여넣은 글자 / (입력 + 붙여넣은 글자) (%) */
  pasteRate: number | null;
  aiRequests: number;
  asks: number;
  /** 되물음 중 추가 힌트 없이 통과한 비율(%) */
  solvedWithoutHintRate: number | null;
  avgFirstInputSec: number | null;
  emptyAsks: number;
};

const pct = (a: number, b: number) => (b ? Math.round((a / b) * 1000) / 10 : null);
const avg = (xs: number[]) => (xs.length ? Math.round((xs.reduce((s, x) => s + x, 0) / xs.length) * 10) / 10 : null);

export function summarize(student: string, group: string, rows: ProblemMetrics[]): GroupSummary {
  const checked = rows.filter((r) => r.checked);
  const passed = checked.filter((r) => r.passed);
  const errored = checked.filter((r) => r.hadError);
  const typed = rows.reduce((s, r) => s + r.typedChars, 0);
  const pasted = rows.reduce((s, r) => s + r.pastedChars, 0);
  const asks = rows.reduce((s, r) => s + r.asks, 0);
  return {
    student,
    group,
    problems: rows.length,
    passRate: pct(passed.length, checked.length),
    avgAttempts: avg(passed.map((r) => r.attempts)),
    passAfterErrorRate: pct(errored.filter((r) => r.passedAfterError).length, errored.length),
    pasteRate: pct(pasted, typed + pasted),
    aiRequests: rows.reduce((s, r) => s + r.aiRequests, 0),
    asks,
    solvedWithoutHintRate: pct(
      rows.reduce((s, r) => s + r.solvedWithoutHint, 0),
      asks,
    ),
    avgFirstInputSec: avg(rows.map((r) => r.firstInputSec).filter((x): x is number => x !== null)),
    emptyAsks: rows.reduce((s, r) => s + r.emptyAsks, 0),
  };
}

/** 묶음 이름과 그 묶음에 드는 문제인지 */
export function groupsOf(p: ResearchProblem | undefined): string[] {
  const groups = ["전체"];
  if (!p?.lesson) return groups;
  const half = FIRST_HALF_LESSONS.includes(p.lesson) ? "전반부(1~4차시)" : SECOND_HALF_LESSONS.includes(p.lesson) ? "후반부(5~8차시)" : null;
  if (half) groups.push(half);
  if (p.anchor) groups.push("앵커 전체", ...(half ? [`앵커 ${half}`] : []));
  if (p.level) groups.push(p.level, ...(half ? [`${p.level} ${half}`] : []));
  groups.push(`${p.lesson}차시`);
  return groups;
}

const GROUP_ORDER = (g: string) => {
  const fixed = ["전체", "전반부(1~4차시)", "후반부(5~8차시)", "앵커 전체", "앵커 전반부(1~4차시)", "앵커 후반부(5~8차시)", "기본", "기본 전반부(1~4차시)", "기본 후반부(5~8차시)", "심화", "심화 전반부(1~4차시)", "심화 후반부(5~8차시)"];
  const i = fixed.indexOf(g);
  return i >= 0 ? i : 100 + (parseInt(g, 10) || 0);
};

/** 학생 × 묶음 요약 (학생 순서, 묶음 순서대로) */
export function groupSummaries(metrics: ProblemMetrics[], problems: Map<string, ResearchProblem>): GroupSummary[] {
  const buckets = new Map<string, Map<string, ProblemMetrics[]>>();
  for (const m of metrics) {
    const mine = buckets.get(m.student) ?? new Map<string, ProblemMetrics[]>();
    for (const g of groupsOf(problems.get(m.problem))) mine.set(g, [...(mine.get(g) ?? []), m]);
    buckets.set(m.student, mine);
  }
  return [...buckets.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .flatMap(([student, groups]) =>
      [...groups.entries()].sort(([a], [b]) => GROUP_ORDER(a) - GROUP_ORDER(b)).map(([g, rows]) => summarize(student, g, rows)),
    );
}

/* ── 지표 6 원자료: 되물음마다 (보여 준 구간, 학생 답, 자동 판정, 교사 판정 빈칸) ── */

export type AskJudgeRow = {
  student: string;
  problem: string;
  askId: number;
  situation: string;
  clipText: string;
  answer: string;
  auto: "예" | "아니오" | "";
  autoReason: string;
};

/** 되물음 구간을 사람이 읽을 글로 */
export function clipText(clip: AskClip | null): string {
  if (!clip) return "";
  const parts = [
    { "same-line": "같은 줄 반복 수정", "error-repeat": "같은 오류 반복", "paste-error": "붙여넣기 직후 오류", "long-pause": "긴 멈춤", recent: "최근 기록", understand: "문제 이해(코드 없음)" }[clip.rule] ?? clip.rule,
    clip.line !== null ? `${clip.line}번째 줄` : "",
    clip.error ? `오류 ${clip.error}${clip.count > 1 ? ` ${clip.count}번` : ""}` : "",
    clip.source ? `이전 문제 ${clip.source.problem}` : "",
  ];
  return parts.filter(Boolean).join(" · ");
}

const IDENT = /[A-Za-z_가-힣][A-Za-z0-9_가-힣]{1,}/g;
const KEYWORDS = new Set(["print", "input", "int", "str", "if", "else", "elif", "for", "while", "in", "and", "or", "not", "def", "return", "range"]);

/**
 * 지표 6 자동 판정 (참고용, 교사 판정이 기준): 학생 답이 되물음 구간을 짚었는지.
 * - "모르겠" 같은 답, 빈 답 → 아니오
 * - 구간의 줄 번호("3번째 줄", "3줄", "3행", "line 3"), 오류 이름(NameError 등), 그 줄 코드의 이름(변수·함수, 흔한 낱말 제외) 중 하나를 말하면 → 예
 * - B 상황(문제 이해)처럼 짚을 구간이 없으면 빈칸 (교사만 판정)
 */
export function autoJudge(clip: AskClip | null, answer: string): { auto: AskJudgeRow["auto"]; reason: string } {
  const a = answer.trim();
  if (!clip || clip.rule === "understand") return { auto: "", reason: "짚을 구간 없음 (교사 판정)" };
  if (!a || /모르겠|몰라|잘 모름/.test(a)) return { auto: "아니오", reason: "모르겠다는 답" };
  if (clip.line !== null && new RegExp(`(^|\\D)${clip.line}\\s*(번째\\s*)?(줄|행|번\\s*줄)|line\\s*${clip.line}(\\D|$)`, "i").test(a)) {
    return { auto: "예", reason: "줄 번호를 말함" };
  }
  if (clip.error && a.toLowerCase().includes(clip.error.toLowerCase())) return { auto: "예", reason: "오류 이름을 말함" };
  const lineCode = clip.lineVersions.at(-1) ?? "";
  const names = [...new Set(lineCode.match(IDENT) ?? [])].filter((n) => !KEYWORDS.has(n));
  const hit = names.find((n) => a.includes(n));
  if (hit) return { auto: "예", reason: `구간의 코드 이름(${hit})을 말함` };
  return { auto: "아니오", reason: "구간을 가리키는 말이 없음" };
}

export function askJudgeRows(chats: ResearchChat[]): AskJudgeRow[] {
  const answers = new Map(chats.filter((c) => c.step === "hint" && c.parentId !== null).map((c) => [c.parentId!, c.question]));
  return chats
    .filter((c) => c.step === "ask")
    .sort((a, b) => a.student.localeCompare(b.student) || a.createdAt.localeCompare(b.createdAt))
    .map((c) => {
      const answer = answers.get(c.id) ?? "";
      const { auto, reason } = answers.has(c.id) ? autoJudge(c.clip, answer) : { auto: "" as const, reason: "답하지 않음" };
      return { student: c.student, problem: c.problem, askId: c.id, situation: c.situation ?? "", clipText: clipText(c.clip), answer, auto, autoReason: reason };
    });
}

/** 내보낸 파일 맨 위에 넣는 계산식 설명 (# 로 시작하는 줄) */
export const RESEARCH_NOTES = [
  "Line by Line 연구용 지표. 이름·학번 대신 익명 ID(비밀 키로 만든 값, 내보낼 때마다 같음). 학생·문제마다 가장 최근 제출의 작성 기록을 씀(같은 브라우저에서 다시 내면 기록이 이어짐). 제출하지 않은 문제는 빠짐.",
  "통과 = '예시로 확인'(학생이 누르거나 제출할 때 자동)의 마지막 결과가 모든 예시 일치. 확인 기록이 없으면(예시 없는 문제·이 기능 전 제출) 통과 관련 칸은 빈칸. 교사 점수는 따로.",
  "지표1 시도 횟수 = 첫 실행부터 처음 모두 맞은 확인까지 실행(▶)·확인(✔) 횟수(그 확인 포함). 통과 못 했으면 전체 횟수.",
  "지표2 오류 후 통과 = 실행 오류가 한 번이라도 난 문제 중, 그 뒤 마지막 확인이 통과한 비율.",
  "지표3 붙여넣기 비율 = 붙여넣은 글자 수 / (직접 입력 + 붙여넣은 글자 수).",
  "지표4 AI 도움 요청 = AI 도우미를 부른 횟수(되물음 + 예전 방식 질문). 힌트 수는 되물음에 답해 받은 AI 힌트.",
  "지표5 힌트 없이 해결 = 되물음 중, 그 되물음에 답하지 않고(추가 힌트 없이) 되물음 뒤에 통과한 비율.",
  "지표6 막힌 지점 짚기 = 별도 파일(되물음별 원자료). 자동 판정은 참고용(줄 번호·오류 이름·그 줄의 변수 이름을 말했는지), '교사 판정' 칸에 직접 적기.",
  "지표7 첫 입력까지 = 문제를 연 순간부터 공백이 아닌 글자를 처음 입력(붙여넣기 포함)할 때까지 초. 여는 기록이 없는 제출은 빈칸.",
  "지표8 빈 화면 AI 요청 = 코드가 거의 없을 때(B 상황) 받은 되물음 횟수.",
  `묶음: 전반부 ${FIRST_HALF_LESSONS[0]}~${FIRST_HALF_LESSONS.at(-1)}차시, 후반부 ${SECOND_HALF_LESSONS[0]}~${SECOND_HALF_LESSONS.at(-1)}차시, 앵커(차시의 기준 문제)끼리, 기본/심화별, 차시별.`,
];

/** CSV 앞에 설명 줄을 붙인다 (BOM은 맨 앞에 한 번) */
export function withNotes(csv: string, notes = RESEARCH_NOTES): string {
  const body = csv.replace(/^﻿/, "");
  // 설명 한 줄이 엑셀 한 칸에 들어가게 따옴표로 묶는다
  const line = (n: string) => `"# ${n.replace(/[\r\n]+/g, " ").replace(/"/g, '""')}"`;
  return `﻿${notes.map(line).join("\r\n")}\r\n${body}`;
}

/* ── CSV 행 (칸 이름은 한국어) ── */

const ox = (v: boolean | null) => (v === null ? "" : v ? "O" : "X");

function tags(p: ResearchProblem | undefined) {
  return {
    차시: p?.lesson ?? "",
    차시안순서: p?.lessonOrder ?? "",
    기본심화: p?.level ?? "",
    앵커: p?.anchor ? "O" : "",
    성취기준: (p?.standards ?? []).join(" "),
  };
}

const byLesson = (a: ResearchProblem | undefined, b: ResearchProblem | undefined) =>
  (a?.lesson ?? 99) - (b?.lesson ?? 99) || (a?.lessonOrder ?? 99) - (b?.lessonOrder ?? 99);

/** 학생 × 문제 */
export function metricsCsvRows(metrics: ProblemMetrics[], problems: Map<string, ResearchProblem>, anon: (key: string) => string) {
  return metrics
    .map((m) => ({ m, id: anon(m.student), p: problems.get(m.problem) }))
    .sort((a, b) => a.id.localeCompare(b.id) || byLesson(a.p, b.p) || a.m.problem.localeCompare(b.m.problem, "ko", { numeric: true }))
    .map(({ m, id, p }) => ({
      익명ID: id,
      문제: m.problem,
      제목: p?.title ?? "",
      ...tags(p),
      제출수: m.submissions,
      교사점수: m.score ?? "",
      "통과(예시)": ox(m.passed),
      마지막확인: m.lastCheck,
      "1_시도횟수": m.attempts,
      "2_오류있었음": ox(m.hadError),
      "2_오류후통과": ox(m.passedAfterError),
      "3_입력글자": m.typedChars,
      "3_붙여넣은글자": m.pastedChars,
      "3_붙여넣기비율(%)": pct(m.pastedChars, m.typedChars + m.pastedChars) ?? "",
      "3_붙여넣기횟수": m.pasteCount,
      "4_AI도움요청": m.aiRequests,
      "4_AI힌트": m.aiHints,
      "5_되물음": m.asks,
      "5_힌트없이통과": m.solvedWithoutHint,
      "7_첫입력까지(초)": m.firstInputSec ?? "",
      "8_빈화면AI요청": m.emptyAsks,
    }));
}

/** 학생 × 묶음 (groupSummaries 순서 그대로, 학생은 익명 ID 순) */
export function summaryCsvRows(summaries: GroupSummary[], anon: (key: string) => string) {
  return summaries
    .map((s, i) => ({ s, i, id: anon(s.student) }))
    .sort((a, b) => a.id.localeCompare(b.id) || a.i - b.i)
    .map(({ s, id }) => ({
      익명ID: id,
      묶음: s.group,
      문제수: s.problems,
      "통과율(%)": s.passRate ?? "",
      "1_평균시도횟수(통과한문제)": s.avgAttempts ?? "",
      "2_오류후통과율(%)": s.passAfterErrorRate ?? "",
      "3_붙여넣기비율(%)": s.pasteRate ?? "",
      "4_AI도움요청": s.aiRequests,
      "5_되물음": s.asks,
      "5_힌트없이해결비율(%)": s.solvedWithoutHintRate ?? "",
      "7_평균첫입력(초)": s.avgFirstInputSec ?? "",
      "8_빈화면AI요청": s.emptyAsks,
    }));
}

/** 지표 6 원자료 */
export function askCsvRows(rows: AskJudgeRow[], problems: Map<string, ResearchProblem>, anon: (key: string) => string) {
  return rows
    .map((r, i) => ({ r, i, id: anon(r.student) }))
    .sort((a, b) => a.id.localeCompare(b.id) || a.i - b.i)
    .map(({ r, id }) => ({
      익명ID: id,
      문제: r.problem,
      ...tags(problems.get(r.problem)),
      되물음번호: r.askId,
      상황: r.situation,
      "보여 준 구간": r.clipText,
      "학생 답": r.answer,
      자동판정: r.auto,
      "자동판정 근거": r.autoReason,
      "교사 판정(예/아니오)": "",
      "교사 메모": "",
    }));
}
