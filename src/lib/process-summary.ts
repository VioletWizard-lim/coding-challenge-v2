/**
 * 과정 기록 요약: 학생이 코드를 "어떻게 써 왔는지"를 AI에 보낼 수 있게 줄인다.
 * AI 도우미·되돌아보기·연습 문제 생성이 모두 이 함수 하나를 쓴다 (CLAUDE.md "차별화 점검 규칙" 1).
 *
 * 담는 것: 마지막으로 실행에 성공한 코드, 그 뒤 바뀐 부분, 반복된 오류와 횟수, 오래 멈춘 구간, 막혔던 개념,
 * 이전 도움 요청. 각 순간에는 번호(M1, M2…)를 붙여, AI가 "[[M3]]"처럼 가리키면 화면에서 그 시점의 재생으로 갈 수 있다.
 * 학생 이름·아이디는 담지 않는다 (코드와 기록만). 순수 함수만 — 단위 테스트: process-summary.test.ts
 */
import { applyEditEvent, type EditEvent } from "./editLog";
import { PAUSE_MS, formatDuration, validEntries } from "./replay";

/** AI가 가리킬 수 있는 과정의 한 순간 */
export type Moment = {
  /** "M1", "M2"… (AI 응답 속 [[M1]]을 이 순간으로 바꾼다) */
  id: string;
  /** 작성 기록 안의 시각 (ms) — 재생기를 이 시각으로 연다 */
  at: number;
  kind: "run-ok" | "run-error" | "pause" | "ask" | "paste";
  /** 사람이 읽는 설명 (예: "NameError (3번째)") */
  label: string;
};

export type ErrorStat = {
  /** 오류 종류 (예: "NameError") */
  kind: string;
  count: number;
  /** 이 오류가 가장 길게 이어진 횟수 (고치지 못하고 같은 오류가 연달아 난 횟수) */
  longestStreak: number;
  /** 이 오류 뒤에 실행에 성공한 적이 있는지 (스스로 고쳤는지) */
  fixed: boolean;
  firstAt: string;
  lastAt: string;
};

export type ProcessSummary = {
  /** 처음 기록부터 마지막 기록까지 (ms) */
  totalMs: number;
  runCount: number;
  /** 마지막으로 실행에 성공한 순간과 그때의 코드 (없으면 null) */
  lastSuccess: { moment: string; code: string; minutesAgo: number } | null;
  /** 마지막 성공(없으면 시작 코드) 이후 바뀐 줄 */
  changesSinceSuccess: { added: string[]; removed: string[] };
  /** 지금 코드 */
  currentCode: string;
  errors: ErrorStat[];
  /** 지금 오류가 이어지고 있는지 (마지막 실행이 오류) */
  currentStreak: { kind: string; count: number } | null;
  /** 1분 넘게 멈춘 구간 */
  pauses: { moment: string; minutes: number }[];
  /** 이전에 AI 도움을 요청한 순간들 */
  asks: string[];
  pasteCount: number;
  /** 오류 종류로 짐작한 막힌 개념 (예: "변수 이름과 정의") */
  concepts: string[];
  moments: Moment[];
};

/** 오류 종류 → 막혔을 수 있는 개념 (고등학교 파이썬 수업 범위) */
const CONCEPTS: Record<string, string> = {
  NameError: "변수·함수 이름(철자, 만들기 전에 쓰기)",
  TypeError: "자료형(문자열과 숫자 섞기, int()/str() 바꾸기)",
  ValueError: "값 바꾸기(int()에 숫자가 아닌 글자 넣기)",
  SyntaxError: "문법(괄호·따옴표·콜론 짝 맞추기)",
  IndentationError: "들여쓰기(if·for 아래 줄 맞추기)",
  TabError: "들여쓰기(탭과 띄어쓰기 섞기)",
  IndexError: "리스트 인덱스(0부터 시작, 범위)",
  KeyError: "딕셔너리 키",
  ZeroDivisionError: "0으로 나누기",
  AttributeError: "메서드·속성 이름",
  ModuleNotFoundError: "모듈 불러오기",
  EOFError: "input() 입력 개수",
  // 실행 시간 한도를 넘어 멈춤 (src/lib/pyodide.ts)
  TimeLimitError: "반복문(끝나는 조건, 끝나지 않는 반복)",
};

const MAX_CODE_CHARS = 3000;
const MAX_DIFF_LINES = 40;

/** 두 코드의 줄 차이 (LCS). 너무 길면 앞부분만 */
export function lineDiff(before: string, after: string): { added: string[]; removed: string[] } {
  const a = before.split("\n");
  const b = after.split("\n");
  if (a.length * b.length > 250_000) return { added: b.filter((l) => !a.includes(l)), removed: a.filter((l) => !b.includes(l)) };
  const dp = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  }
  const added: string[] = [];
  const removed: string[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) removed.push(a[i++]);
    else added.push(b[j++]);
  }
  removed.push(...a.slice(i));
  added.push(...b.slice(j));
  const meaningful = (l: string) => l.trim() !== "";
  return { added: added.filter(meaningful), removed: removed.filter(meaningful) };
}

/**
 * 작성 기록을 요약한다.
 * @param init 시작 코드
 * @param log 작성 기록 (edit_log 형식)
 * @param now 지금 시각(ms). "몇 분 전"을 셀 때 쓴다 (기본: 마지막 기록 시각)
 */
export function summarizeProcess(init: string, log: unknown, now?: number): ProcessSummary {
  const events = validEntries(log);
  const moments: Moment[] = [];
  const addMoment = (at: number, kind: Moment["kind"], label: string) => {
    const id = `M${moments.length + 1}`;
    moments.push({ id, at, kind, label });
    return id;
  };

  let doc = init;
  let lastSuccess: { at: number; code: string; moment: string } | null = null;
  const errors = new Map<string, ErrorStat & { streak: number }>();
  let streak: { kind: string; count: number } | null = null;
  const pauses: { moment: string; minutes: number }[] = [];
  const asks: string[] = [];
  let runCount = 0;
  let pasteCount = 0;
  let awayStart: number | null = null;
  const errorOrder: string[] = [];

  for (let i = 0; i < events.length; i++) {
    const e = events[i];
    const [t, kind] = e;
    if (i > 0 && awayStart === null) {
      const gap = t - events[i - 1][0];
      if (gap >= PAUSE_MS) {
        const minutes = Math.round(gap / 6000) / 10;
        pauses.push({ moment: addMoment(events[i - 1][0], "pause", `${formatDuration(gap)} 멈춤`), minutes });
      }
    }
    if (e.length > 2) {
      const edit = e as EditEvent;
      if (edit[1] === "p") {
        pasteCount++;
      }
      doc = applyEditEvent(doc, edit);
      continue;
    }
    // 다른 창에 가 있던 시간은 "멈춤"으로 세지 않는다 (재생기와 같음)
    if (kind === "b") awayStart = t;
    else if (kind === "f") awayStart = null;
    else if (kind === "q") {
      asks.push(addMoment(t, "ask", "AI 도움 요청"));
    } else if (kind === "r:ok") {
      runCount++;
      lastSuccess = { at: t, code: doc, moment: addMoment(t, "run-ok", "실행 성공") };
      for (const s of errors.values()) s.fixed = true;
      streak = null;
    } else if (kind.startsWith("r:")) {
      runCount++;
      const name = kind.slice(2) || "오류";
      const s = errors.get(name) ?? {
        kind: name,
        count: 0,
        longestStreak: 0,
        fixed: false,
        firstAt: "",
        lastAt: "",
        streak: 0,
      };
      s.count++;
      streak = streak && streak.kind === name ? { kind: name, count: streak.count + 1 } : { kind: name, count: 1 };
      s.longestStreak = Math.max(s.longestStreak, streak.count);
      const id = addMoment(t, "run-error", `${name} (${s.count}번째)`);
      if (!s.firstAt) s.firstAt = id;
      s.lastAt = id;
      if (!errors.has(name)) errorOrder.push(name);
      errors.set(name, s);
    }
  }

  const lastTime = events.length ? events[events.length - 1][0] : 0;
  const reference = now ?? lastTime;
  const errorList: ErrorStat[] = errorOrder.map((k) => {
    const e = errors.get(k)!;
    return { kind: e.kind, count: e.count, longestStreak: e.longestStreak, fixed: e.fixed, firstAt: e.firstAt, lastAt: e.lastAt };
  });
  const cut = (code: string) => (code.length > MAX_CODE_CHARS ? `${code.slice(0, MAX_CODE_CHARS)}\n…(뒷부분 생략)` : code);
  const diff = lineDiff(lastSuccess?.code ?? init, doc);

  return {
    totalMs: events.length ? lastTime - events[0][0] : 0,
    runCount,
    lastSuccess: lastSuccess
      ? { moment: lastSuccess.moment, code: cut(lastSuccess.code), minutesAgo: Math.max(0, Math.round((reference - lastSuccess.at) / 60_000)) }
      : null,
    changesSinceSuccess: { added: diff.added.slice(0, MAX_DIFF_LINES), removed: diff.removed.slice(0, MAX_DIFF_LINES) },
    currentCode: cut(doc),
    errors: errorList,
    currentStreak: streak,
    pauses,
    asks,
    pasteCount,
    concepts: [...new Set(errorList.filter((e) => !e.fixed || e.count >= 2).map((e) => CONCEPTS[e.kind]).filter(Boolean))],
    moments,
  };
}

/** AI에 보낼 글: 과정 요약을 읽기 쉬운 한국어로. 순간은 [[M번호]]로 적어 AI도 같은 표기로 가리키게 한다 */
export function processSummaryText(s: ProcessSummary): string {
  const label = (id: string) => {
    const m = s.moments.find((x) => x.id === id);
    return m ? `[[${id}]] ${m.label}` : `[[${id}]]`;
  };
  const lines: string[] = [];
  lines.push(`## 작성 과정 요약`);
  lines.push(`- 작성한 시간: 약 ${formatDuration(s.totalMs)}, 실행 ${s.runCount}번, 붙여넣기 ${s.pasteCount}번`);
  if (s.lastSuccess) {
    lines.push(`- 마지막으로 실행에 성공한 순간: ${label(s.lastSuccess.moment)} (약 ${s.lastSuccess.minutesAgo}분 전)`);
  } else {
    lines.push(`- 아직 실행에 성공한 적이 없음`);
  }
  if (s.errors.length) {
    lines.push(`- 오류 기록:`);
    for (const e of s.errors) {
      lines.push(
        `  - ${e.kind}: ${e.count}번 (연달아 최대 ${e.longestStreak}번), ${e.fixed ? "뒤에 스스로 고쳐 성공함" : "아직 못 고침"}, 처음 ${label(e.firstAt)}, 마지막 ${label(e.lastAt)}`,
      );
    }
  }
  if (s.currentStreak) lines.push(`- 지금 ${s.currentStreak.kind}가 ${s.currentStreak.count}번 연달아 나고 있음`);
  if (s.pauses.length) lines.push(`- 1분 넘게 멈춘 구간: ${s.pauses.map((p) => label(p.moment)).join(", ")}`);
  if (s.asks.length) lines.push(`- 이전 AI 도움 요청: ${s.asks.map(label).join(", ")}`);
  if (s.concepts.length) lines.push(`- 오류로 짐작한 막힌 개념: ${s.concepts.join(" / ")}`);

  const block = (title: string, code: string) => `### ${title}\n\`\`\`python\n${code}\n\`\`\``;
  if (s.lastSuccess) lines.push("", block(`마지막으로 성공했을 때의 코드 ${label(s.lastSuccess.moment)}`, s.lastSuccess.code));
  const { added, removed } = s.changesSinceSuccess;
  if (added.length || removed.length) {
    lines.push("", `### ${s.lastSuccess ? "마지막 성공 이후" : "시작 코드 이후"} 바뀐 줄`);
    for (const l of removed) lines.push(`- 지움: ${l}`);
    for (const l of added) lines.push(`+ 더함: ${l}`);
  }
  lines.push("", block("지금 코드", s.currentCode));
  return lines.join("\n");
}

/** AI 응답 속 [[M3]] 표시를 찾아 순간과 이어 준다 (화면에서 누르면 재생기의 그 시점으로) */
export function splitMomentRefs(text: string, moments: Moment[]): ({ text: string } | { moment: Moment })[] {
  const parts: ({ text: string } | { moment: Moment })[] = [];
  let last = 0;
  for (const m of text.matchAll(/\[\[(M\d+)\]\]/g)) {
    const moment = moments.find((x) => x.id === m[1]);
    if (!moment) continue;
    if (m.index! > last) parts.push({ text: text.slice(last, m.index) });
    parts.push({ moment });
    last = m.index! + m[0].length;
  }
  if (last < text.length) parts.push({ text: text.slice(last) });
  return parts;
}

/* ───────── 여러 제출에서 "내가 막혔던 곳" (연습 문제 만들기의 근거) ───────── */

/** 막힌 곳을 찾을 제출 (최근 것부터) */
export type StuckSource = { id: number; subject: string; problem: string; title: string; init: string; log: unknown };

/** 막힌 곳 하나: 자주 난 오류 종류, 또는 오래 멈춘 문제 */
export type StuckPoint = {
  /** "err:프로그래밍:TypeError" 또는 "pause:123" (학생이 고를 때 쓰는 값) */
  id: string;
  kind: "error" | "pause";
  subject: string;
  /** 막혔을 수 있는 개념 (멈춤은 문제에서 AI가 짐작) */
  concept: string;
  /** 학생 화면에 보이는 한 줄 (예: "TypeError 7번") */
  label: string;
  /** 학생 화면에 보이는 근거 (예: "2-3 성적 계산 외 2문제 · 2문제는 스스로 고쳤어요") */
  evidence: string;
  /** AI에 보낼 근거 글 (그때의 코드 포함) */
  text: string;
};

/** 막힌 곳을 볼 최근 제출 수 (과목마다) */
export const STUCK_WINDOW = 30;
const SNIPPET_LINES = 20;
const snippet = (code: string) => {
  const lines = code.split("\n");
  return lines.length > SNIPPET_LINES ? `${lines.slice(0, SNIPPET_LINES).join("\n")}\n…(뒷부분 생략)` : code;
};

/** 기록을 따라가며 오류 종류마다 마지막으로 그 오류가 난 때의 코드, 가장 오래 멈추기 직전의 코드 */
function snapshots(init: string, log: unknown) {
  const events = validEntries(log);
  const atError = new Map<string, string>();
  let longest = { ms: 0, code: "" };
  let doc = init;
  let away = false;
  for (let i = 0; i < events.length; i++) {
    const e = events[i];
    if (i > 0 && !away) {
      const gap = e[0] - events[i - 1][0];
      if (gap >= PAUSE_MS && gap > longest.ms) longest = { ms: gap, code: doc };
    }
    if (e.length > 2) {
      doc = applyEditEvent(doc, e as EditEvent);
      continue;
    }
    if (e[1] === "b") away = true;
    else if (e[1] === "f") away = false;
    else if (e[1].startsWith("r:") && e[1] !== "r:ok") atError.set(e[1].slice(2) || "오류", doc);
  }
  return { atError, longest };
}

/**
 * 최근 제출들의 작성 기록에서 "막혔던 곳"을 찾는다 (과목마다 최근 STUCK_WINDOW개).
 * - 오류: 오류 종류마다 몇 번, 몇 문제에서, 스스로 고쳤는지. 2번 이상 난 오류만
 * - 멈춤: 3분 넘게 멈춘 문제 (가장 길게 멈춘 2개)
 * 못 고친 오류가 많은 것부터. 학생 이름·아이디는 담지 않는다.
 */
export function stuckPoints(subs: StuckSource[]): StuckPoint[] {
  const bySubject = new Map<string, StuckSource[]>();
  for (const s of subs) {
    if (validEntries(s.log).length < 2) continue;
    const list = bySubject.get(s.subject) ?? [];
    if (list.length < STUCK_WINDOW) bySubject.set(s.subject, [...list, s]);
  }
  const points: (StuckPoint & { weight: number })[] = [];
  for (const [subject, list] of bySubject) {
    type Agg = { count: number; streak: number; problems: { sub: StuckSource; count: number; fixed: boolean; code: string }[] };
    const errors = new Map<string, Agg>();
    const pauses: { sub: StuckSource; ms: number; code: string }[] = [];
    for (const sub of list) {
      const summary = summarizeProcess(sub.init, sub.log);
      const snap = snapshots(sub.init, sub.log);
      for (const e of summary.errors) {
        const agg = errors.get(e.kind) ?? { count: 0, streak: 0, problems: [] };
        agg.count += e.count;
        agg.streak = Math.max(agg.streak, e.longestStreak);
        agg.problems.push({ sub, count: e.count, fixed: e.fixed, code: snap.atError.get(e.kind) ?? "" });
        errors.set(e.kind, agg);
      }
      if (snap.longest.ms >= 3 * 60_000) pauses.push({ sub, ms: snap.longest.ms, code: snap.longest.code });
    }
    const name = (s: StuckSource) => (s.title && s.title !== s.problem ? `${s.problem} ${s.title}` : `${s.problem}번`);
    for (const [kind, agg] of errors) {
      if (agg.count < 2) continue;
      const fixed = agg.problems.filter((p) => p.fixed).length;
      const unfixed = agg.problems.length - fixed;
      const concept = CONCEPTS[kind] ?? `${kind} 오류`;
      const top = [...agg.problems].sort((a, b) => b.count - a.count);
      const others = agg.problems.length - 1;
      const text = [
        `## 학생이 막혔던 곳 (최근 제출의 작성 기록에서 찾음)`,
        `- ${kind}가 최근 ${agg.problems.length}문제에서 모두 ${agg.count}번 났음 (연달아 최대 ${agg.streak}번)`,
        `- 그중 ${fixed}문제는 뒤에 스스로 고쳐 실행에 성공했고, ${unfixed}문제는 못 고친 채 끝남`,
        `- 오류로 짐작한 막힌 개념: ${concept}`,
        ...top
          .filter((p) => p.code.trim())
          .slice(0, 2)
          .map((p) => `\n### 그때의 코드 (문제 ${name(p.sub)}, ${kind}가 났을 때)\n\`\`\`python\n${snippet(p.code)}\n\`\`\``),
      ].join("\n");
      points.push({
        id: `err:${subject}:${kind}`,
        kind: "error",
        subject,
        concept,
        label: `${kind} ${agg.count}번`,
        evidence: [
          others ? `${name(top[0].sub)} 외 ${others}문제` : name(top[0].sub),
          fixed ? `${fixed}문제는 스스로 고쳤어요` : "",
        ]
          .filter(Boolean)
          .join(" · "),
        text,
        weight: unfixed * 10 + agg.count,
      });
    }
    for (const p of pauses.sort((a, b) => b.ms - a.ms).slice(0, 2)) {
      points.push({
        id: `pause:${p.sub.id}`,
        kind: "pause",
        subject,
        concept: "",
        label: `${formatDuration(p.ms)} 멈춤`,
        evidence: name(p.sub),
        text: [
          `## 학생이 막혔던 곳 (작성 기록에서 찾음)`,
          `- 문제 ${name(p.sub)}를 풀다가 ${formatDuration(p.ms)} 동안 아무것도 쓰지 않고 멈춰 있었음`,
          `- 아래는 멈추기 직전의 코드. 이 코드와 문제를 보고 다음에 쓸 부분에서 어떤 개념이 막혔을지 짐작하세요.`,
          `\n### 멈추기 직전의 코드\n\`\`\`python\n${snippet(p.code) || "(아직 아무것도 안 씀)"}\n\`\`\``,
        ].join("\n"),
        weight: Math.min(9, p.ms / 60_000),
      });
    }
  }
  return points
    .sort((a, b) => b.weight - a.weight)
    .map((p) => ({ id: p.id, kind: p.kind, subject: p.subject, concept: p.concept, label: p.label, evidence: p.evidence, text: p.text }));
}

/** 개념을 골라 만들 때 함께 보내는 짧은 참고: 그 과목에서 자주 막힌 오류들 */
export function stuckBrief(points: StuckPoint[], subject: string): string {
  const errors = points.filter((p) => p.subject === subject && p.kind === "error").slice(0, 3);
  if (!errors.length) return "- 최근 작성 기록에서 두 번 넘게 반복된 오류는 없음";
  return errors.map((p) => `- ${p.label} (${p.evidence}) → ${p.concept}`).join("\n");
}
