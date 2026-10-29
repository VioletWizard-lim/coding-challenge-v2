/**
 * 업적: 과정에 대한 칭찬만 (감점 없음). 점수·레벨·랭킹과 연결하지 않는다.
 * 모두 기존 기록(작성 기록·실행 기록·제출·성찰)에서 계산하므로 DB에 따로 저장하지 않고, 지난 제출에도 저절로 소급된다.
 * 여기는 순수 함수만 (단위 테스트: achievements.test.ts).
 */
import { MIN_AWAY_MS, PAUSE_MS, validEntries } from "./replay";

/** 학생 화면의 업적 탭 id (새 업적 알림의 "보러 가기"가 이 탭으로 옮긴다) */
export const ACHIEVEMENTS_TAB = "achievements";

export type AchievementArea = "hand" | "debug" | "rewrite" | "reflect" | "steady" | "hidden";

export const AREAS: { id: AchievementArea; label: string }[] = [
  { id: "hand", label: "✍️ 내 손으로" },
  { id: "debug", label: "🔧 디버깅" },
  { id: "rewrite", label: "🔁 고쳐쓰기" },
  { id: "reflect", label: "🪞 돌아보기" },
  { id: "steady", label: "📅 꾸준함·몰입" },
  { id: "hidden", label: "❓ 숨은 업적" },
];

type Def = {
  code: string;
  area: AchievementArea;
  icon: string;
  name: string;
  /** 단계가 있으면 단계마다 목표 수 (예: 5 / 20 / 50) */
  tiers?: number[];
  /** 조건 설명. 단계가 있으면 단계마다 */
  desc: string | string[];
  /** 숨은 업적: 달성 전에는 조건을 보여 주지 않는다 (이름은 보임) */
  hidden?: boolean;
};

export const ACHIEVEMENTS: Def[] = [
  { code: "first_line", area: "hand", icon: "🌱", name: "첫 한 줄", desc: "붙여넣기 없이 직접 써서 첫 제출" },
  {
    code: "own_hands",
    area: "hand",
    icon: "✋",
    name: "내 손으로 완성",
    tiers: [5, 20, 50],
    desc: ["붙여넣기 없이 제출 5번", "붙여넣기 없이 제출 20번", "붙여넣기 없이 제출 50번"],
  },
  { code: "error_friend", area: "debug", icon: "🤝", name: "오류는 친구", desc: "오류가 난 뒤 스스로 고쳐 실행에 성공" },
  { code: "persistent", area: "debug", icon: "🧗", name: "끈기의 코더", desc: "한 문제에서 오류가 3번 넘게 난 뒤 끝내 성공" },
  { code: "polisher", area: "rewrite", icon: "🪚", name: "다듬는 사람", desc: "한 제출에서 지우고 고친 횟수 10번 이상" },
  { code: "retry", area: "rewrite", icon: "🔄", name: "다시 도전", desc: "오답 처리된 문제를 다시 내서 통과" },
  {
    code: "reflector",
    area: "reflect",
    icon: "💭",
    name: "하루를 돌아보는 사람",
    tiers: [1, 5],
    desc: ["오늘의 성찰 처음 쓰기", "서로 다른 날 5일 성찰 쓰기"],
  },
  { code: "found_stuck", area: "reflect", icon: "🔍", name: "막힌 곳 발견", desc: "내 재생을 보며 그 순간에 타임라인 메모 남기기" },
  { code: "focus10", area: "steady", icon: "🎧", name: "몰입 10분", desc: "창을 벗어나지 않고 10분 넘게 이어서 작업" },
  { code: "unit_master", area: "steady", icon: "🏔️", name: "단원 정복", desc: "한 단원의 공개된 문제를 모두 제출" },
  { code: "steady5", area: "steady", icon: "👣", name: "꾸준한 발걸음", tiers: [5], desc: ["서로 다른 날 5일 이상 제출"] },
  { code: "one_shot", area: "hidden", icon: "🎯", name: "한 번에 성공", desc: "첫 실행에서 오류 없이 성공하고 제출", hidden: true },
  {
    code: "error_collector",
    area: "hidden",
    icon: "🧪",
    name: "오류 수집가",
    desc: "서로 다른 종류의 오류 3가지를 만나고 모두 고쳐 냄",
    hidden: true,
  },
  { code: "commenter", area: "hidden", icon: "📝", name: "설명하는 코더", desc: "코드에 주석(#)을 3줄 이상 써서 제출", hidden: true },
  { code: "third_try", area: "hidden", icon: "🔁", name: "세 번째 도전", desc: "같은 문제를 3번 이상 다시 제출", hidden: true },
  { code: "own_function", area: "hidden", icon: "🧩", name: "나만의 함수", desc: "def로 함수를 직접 만들어 제출", hidden: true },
];

/** 업적 계산에 쓰는 제출 한 건 */
export type AchievementSubmission = {
  id: number;
  subject: string;
  problem: string;
  submittedAt: string;
  /** 한국 날짜 YYYY-MM-DD */
  date: string;
  log: unknown;
  code: string;
  wrongReason: string | null;
  scoreTotal: number | null;
  /** 작성 기록 요약 (재생기와 같은 계산) */
  hasLog: boolean;
  typedChars: number;
  pasteCount: number;
  editCount: number;
};

/** 달성 한 건: 언제, 어느 제출의 어느 순간에 */
export type Earned = {
  earnedAt: string;
  submissionId?: number;
  subject?: string;
  problem?: string;
  /** 작성 기록 안의 그 순간 (재생기를 이 시각부터 연다) */
  at?: number;
};

export type AchievementStatus = {
  code: string;
  area: AchievementArea;
  icon: string;
  name: string;
  hidden: boolean;
  /** 단계마다 [조건, 달성 기록 또는 null]. 단계가 없으면 하나 */
  steps: { desc: string; target: number | null; earned: Earned | null }[];
  /** 지금까지 쌓인 수 (단계·진행도가 있는 업적만) */
  current: number | null;
};

const at = (s: AchievementSubmission, time?: number): Earned => ({
  earnedAt: s.submittedAt,
  submissionId: s.id,
  subject: s.subject,
  problem: s.problem,
  at: time,
});

const isRun = (kind: string) => kind.startsWith("r:");
const isDirect = (s: AchievementSubmission) => s.hasLog && s.pasteCount === 0 && s.typedChars > 0;

/** 오류 뒤 처음 성공한 실행의 시각 (없으면 null) */
export function firstFixTime(log: unknown): number | null {
  let failing = false;
  for (const [t, kind] of validEntries(log)) {
    if (!isRun(kind)) continue;
    if (kind === "r:ok") {
      if (failing) return t;
    } else failing = true;
  }
  return null;
}

/** 오류가 n번 넘게 난 뒤 성공한 실행의 시각 */
export function persistTime(log: unknown, n = 3): number | null {
  let errors = 0;
  for (const [t, kind] of validEntries(log)) {
    if (!isRun(kind)) continue;
    if (kind === "r:ok") {
      if (errors >= n) return t;
    } else errors++;
  }
  return null;
}

/** 첫 실행이 오류 없이 성공했고, 끝까지 오류가 없었는지 → 그 첫 실행 시각 */
export function oneShotTime(log: unknown): number | null {
  const runs = validEntries(log).filter(([, kind]) => isRun(kind));
  if (!runs.length || runs.some(([, kind]) => kind !== "r:ok")) return null;
  return runs[0][0];
}

/** 고쳐 낸 오류 종류들과 그 고친 시각 ("r:NameError" → NameError) */
export function fixedErrorKinds(log: unknown): Map<string, number> {
  const fixed = new Map<string, number>();
  let pending: string[] = [];
  for (const [t, kind] of validEntries(log)) {
    if (!isRun(kind)) continue;
    if (kind === "r:ok") {
      for (const k of pending) if (!fixed.has(k)) fixed.set(k, t);
      pending = [];
    } else pending.push(kind.slice(2) || "오류");
  }
  return fixed;
}

const FOCUS_MS = 10 * 60_000;

/**
 * 창을 벗어나지 않고 이어서 작업한 시간이 10분에 이른 순간.
 * 1분 넘게 아무 기록이 없거나 창을 1초 넘게 벗어나면 다시 센다 (1초 미만 이탈은 input() 창이라 무시).
 */
export function focusTime(log: unknown, needMs = FOCUS_MS): number | null {
  const events = validEntries(log);
  let start: number | null = null;
  let prev: number | null = null;
  for (let i = 0; i < events.length; i++) {
    const [t, kind] = events[i];
    if (kind === "b") {
      const back = events.slice(i + 1).find(([, k]) => k === "f");
      if (!back || back[0] - t >= MIN_AWAY_MS) {
        start = null;
        prev = null;
        continue;
      }
    }
    if (kind === "b" || kind === "f") continue;
    if (prev !== null && t - prev >= PAUSE_MS) start = null;
    if (start === null) start = t;
    prev = t;
    if (t - start >= needMs) return t;
  }
  return null;
}

const commentLines = (code: string) => code.split("\n").filter((line) => line.trim().startsWith("#")).length;
const hasFunction = (code: string) => /^\s*def\s+\w+\s*\(/m.test(code);
const unitOf = (problem: string) => problem.split("-")[0];

/**
 * 모든 업적의 달성 상태를 계산한다.
 * @param subs 내 제출들 (순서는 상관없음)
 * @param reflectionDates 오늘의 성찰을 쓴 날들 [날짜, 저장 시각]
 * @param unitProblems "과목_단원" → 그 단원의 공개된 문제 번호들 (단원 정복 판정용)
 * @param notes 학생이 직접 남긴 타임라인 메모 (막힌 곳 발견)
 */
export function computeAchievements(
  subs: AchievementSubmission[],
  reflectionDates: { date: string; savedAt: string }[],
  unitProblems: Record<string, string[]>,
  notes: { submissionId: number; at: number; createdAt: string }[] = [],
): AchievementStatus[] {
  const list = [...subs].sort((a, b) => a.submittedAt.localeCompare(b.submittedAt) || a.id - b.id);
  const found = new Map<string, Earned[]>(); // code → 단계별 달성
  const counts = new Map<string, number>();
  const put = (code: string, step: number, earned: Earned) => {
    const steps = found.get(code) ?? [];
    if (!steps[step]) steps[step] = earned;
    found.set(code, steps);
  };
  const def = (code: string) => ACHIEVEMENTS.find((d) => d.code === code)!;

  let direct = 0;
  const days = new Set<string>();
  const perProblem = new Map<string, AchievementSubmission[]>();
  const errorKinds = new Map<string, Earned>();
  const unitDone = new Map<string, Set<string>>();
  let bestUnit = 0;

  for (const s of list) {
    const key = `${s.subject}_${s.problem}`;
    const before = perProblem.get(key) ?? [];

    if (isDirect(s)) {
      direct++;
      put("first_line", 0, at(s));
      def("own_hands").tiers!.forEach((n, i) => direct >= n && put("own_hands", i, at(s)));
    }

    const fix = firstFixTime(s.log);
    if (fix !== null) put("error_friend", 0, at(s, fix));
    const persist = persistTime(s.log);
    if (persist !== null) put("persistent", 0, at(s, persist));

    if (s.editCount >= 10) put("polisher", 0, at(s));
    const passed = (s.scoreTotal ?? 0) > 0 && !s.wrongReason;
    if (passed && before.some((b) => b.wrongReason)) put("retry", 0, at(s));

    const focus = focusTime(s.log);
    if (focus !== null) put("focus10", 0, at(s, focus));

    days.add(s.date);
    if (days.size >= 5) put("steady5", 0, at(s));

    const unitKey = `${s.subject}_${unitOf(s.problem)}`;
    const needed = unitProblems[unitKey];
    if (needed?.includes(s.problem)) {
      const done = unitDone.get(unitKey) ?? new Set<string>();
      done.add(s.problem);
      unitDone.set(unitKey, done);
      bestUnit = Math.max(bestUnit, done.size / needed.length);
      if (done.size === needed.length) put("unit_master", 0, at(s));
    }

    const oneShot = oneShotTime(s.log);
    if (oneShot !== null) put("one_shot", 0, at(s, oneShot));
    for (const [kind, t] of fixedErrorKinds(s.log)) {
      if (!errorKinds.has(kind)) errorKinds.set(kind, at(s, t));
      if (errorKinds.size >= 3) put("error_collector", 0, errorKinds.get(kind)!);
    }
    if (commentLines(s.code) >= 3) put("commenter", 0, at(s));
    if (before.length >= 2) put("third_try", 0, at(s));
    if (hasFunction(s.code)) put("own_function", 0, at(s));

    perProblem.set(key, [...before, s]);
  }

  const reflected = [...reflectionDates].sort((a, b) => a.date.localeCompare(b.date));
  const reflectDays = new Set<string>();
  for (const r of reflected) {
    reflectDays.add(r.date);
    def("reflector").tiers!.forEach((n, i) => reflectDays.size >= n && put("reflector", i, { earnedAt: r.savedAt }));
  }

  const firstNote = [...notes].sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0];
  if (firstNote) {
    const s = list.find((x) => x.id === firstNote.submissionId);
    put("found_stuck", 0, s ? { ...at(s, firstNote.at), earnedAt: firstNote.createdAt } : { earnedAt: firstNote.createdAt });
  }

  counts.set("own_hands", direct);
  counts.set("reflector", reflectDays.size);
  counts.set("steady5", days.size);

  return ACHIEVEMENTS.map((d) => {
    const steps = found.get(d.code) ?? [];
    const descs = Array.isArray(d.desc) ? d.desc : [d.desc];
    return {
      code: d.code,
      area: d.area,
      icon: d.icon,
      name: d.name,
      hidden: !!d.hidden,
      steps: descs.map((desc, i) => ({ desc, target: d.tiers?.[i] ?? null, earned: steps[i] ?? null })),
      // 단원 정복은 가장 많이 푼 단원의 진행률(%)을 보여 준다
      current: d.code === "unit_master" ? Math.round(bestUnit * 100) : (counts.get(d.code) ?? null),
    };
  });
}

/** 달성한 단계 키 목록 ("own_hands:1") — 새 업적 알림에 쓴다 */
export const earnedKeys = (list: AchievementStatus[]) =>
  list.flatMap((a) => a.steps.flatMap((s, i) => (s.earned ? [`${a.code}:${i}`] : [])));

/** 공개된 문제 목록 → "과목_단원" → 문제 번호들 (단원 정복 판정용) */
export function unitProblemsOf(problems: { subject: string; number: string }[]): Record<string, string[]> {
  const units: Record<string, string[]> = {};
  for (const p of problems) (units[`${p.subject}_${unitOf(p.number)}`] ??= []).push(p.number);
  return units;
}
