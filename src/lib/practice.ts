/**
 * 연습 모드: 브라우저·서버가 함께 쓰는 순수 함수와 타입. (DB는 practiceStore.ts, AI 호출은 ai.ts, 서버 파이썬은 pyRunner.ts)
 *
 * 학생이 "내가 막혔던 곳" 또는 개념을 골라 AI에게 연습 문제를 받는다. AI는 문제 + 테스트(입력·기대 출력) + 참고 답안을 만들고,
 * 서버가 참고 답안을 실제로 돌려 테스트를 통과한 문제만 학생에게 준다. 참고 답안은 학생에게 보내지 않는다.
 * 학생 코드는 브라우저(Pyodide)에서 같은 방식(harnessCode)으로 돌려 확인한다. 단위 테스트: practice.test.ts
 */
import type { Problem } from "./problemBank";

/** 테스트 하나: input()에 차례로 들어갈 줄들과 기대 출력 */
export type PracticeTest = { inputs: string[]; output: string };

export type PracticeSource = "concept" | "stuck";

export type PracticeProblem = {
  id: number;
  userId: string;
  subject: string;
  source: PracticeSource;
  /** 고른 개념 (막힌 곳에서 만들었으면 그 개념) */
  concept: string;
  /** 1 쉬움 · 2 보통 · 3 어려움 */
  level: number;
  /** 막힌 곳에서 만들었으면 그 근거 (학생·교사 화면에 보여 줌) */
  basis: string;
  title: string;
  description: string;
  conditions: string[];
  starterCode: string;
  tests: PracticeTest[];
  /** 학생이 쓴 코드와 작성 기록 (확인할 때마다 저장) */
  code: string | null;
  initCode: string | null;
  log: unknown;
  passed: number | null;
  checks: number;
  solvedAt: string | null;
  flaggedBy: "student" | "teacher" | null;
  createdAt: string;
  model: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
};

/** 교사만 보는 참고 답안 포함 */
export type PracticeForTeacher = PracticeProblem & { solution: string };

export const LEVELS = [
  { value: 1, label: "쉬움" },
  { value: 2, label: "보통" },
  { value: 3, label: "어려움" },
] as const;

export const levelLabel = (n: number) => LEVELS.find((l) => l.value === n)?.label ?? "보통";

/** 교사가 과목마다 고를 수 있는 개념 (기본값: 모두 켬) */
export const DEFAULT_CONCEPTS = [
  "출력과 문자열(print)",
  "변수와 입력(input)",
  "자료형 바꾸기(int, float, str)",
  "연산자(산술·비교·논리)",
  "조건문(if·elif·else)",
  "반복문 for(range)",
  "반복문 while",
  "리스트",
  "문자열 다루기(인덱싱·슬라이싱)",
  "함수(def·return)",
  "딕셔너리",
];

export type PracticeSettings = {
  subject: string;
  enabled: boolean;
  /** 학생이 고를 수 있는 개념 = AI가 쓸 수 있는 문법 범위 */
  concepts: string[];
  /** 교사가 덧붙이는 범위 안내 (예: "f-string은 아직 안 배웠어요") */
  note: string;
};

export const MAX_NOTE = 500;
export const MAX_CONCEPT = 40;
export const MAX_CONCEPTS = 30;

export const defaultSettings = (subject: string): PracticeSettings => ({
  subject,
  enabled: true,
  concepts: [...DEFAULT_CONCEPTS],
  note: "",
});

/** 브라우저·DB에서 온 설정을 정리한다 (잘못된 값이면 null) */
export function normalizeSettings(value: unknown, subject: string): PracticeSettings | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Partial<PracticeSettings>;
  if (!Array.isArray(v.concepts)) return null;
  const concepts = [...new Set(v.concepts.map((c) => String(c ?? "").trim()).filter(Boolean))];
  if (concepts.length > MAX_CONCEPTS || concepts.some((c) => c.length > MAX_CONCEPT)) return null;
  const note = String(v.note ?? "").trim();
  if (note.length > MAX_NOTE) return null;
  return { subject, enabled: v.enabled !== false, concepts, note };
}

/** 학생 하루 연습 문제 만들기 횟수 (환경변수 PRACTICE_DAILY_LIMIT로 바꿈) */
export const DEFAULT_PRACTICE_LIMIT = 7;
export function practiceLimit(value = process.env.PRACTICE_DAILY_LIMIT): number {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : DEFAULT_PRACTICE_LIMIT;
}

/** 연습 문제의 작성 기록 저장 키에 쓰는 문제 번호 (수업 문제 "2-3"과 겹치지 않게) */
export const practiceKey = (id: number) => `P${id}`;

/** 화면에 쓰는 문제 모양 (수업 문제와 같은 ProblemView로 보여 준다) */
export function asProblem(p: Pick<PracticeProblem, "subject" | "title" | "level" | "description" | "conditions" | "tests" | "starterCode">): Problem {
  return {
    id: null,
    subject: p.subject,
    number: "연습",
    title: p.title,
    difficulty: null, // 연습 난이도(쉬움·보통·어려움)는 수업 문제의 별 5개와 달라서 따로 보여 준다
    description: p.description,
    conditions: p.conditions.join("\n"),
    examples: p.tests.map((t) => ({ input: t.inputs.join("\n"), output: t.output })),
    goal: "",
    challenge: "",
    starterCode: p.starterCode,
    openAt: null,
  };
}

/* ───────── 테스트 실행 (브라우저·서버 공통 파이썬 코드) ───────── */

/** 무한 반복을 멈추는 기준 (실행한 줄 수) */
export const MAX_STEPS = 2_000_000;
/** 출력이 이보다 길면 멈춘다 */
export const MAX_OUTPUT = 20_000;

export type RunResult = { output: string; error: string | null };

/**
 * 코드 하나를 테스트 입력으로 돌리는 파이썬 코드. 마지막 식의 값이 결과 JSON 글이다.
 * - input()은 안내 글을 출력하지 않고 준비된 줄을 차례로 돌려준다 (안내 글은 확인하지 않음)
 * - 매번 새 변수 공간에서 돌리고, 무한 반복·너무 긴 출력은 멈춘다
 * JSON 글은 파이썬 문자열로도 그대로 읽힌다.
 */
export function harnessCode(code: string, inputs: string[]): string {
  return `
import sys, json, builtins
def _p_run(_p_code, _p_inputs):
    _p_lines = iter(_p_inputs)
    _p_out = []
    _p_size = [0]
    class _p_Out:
        def write(self, s):
            _p_size[0] += len(s)
            if _p_size[0] > ${MAX_OUTPUT}:
                raise RuntimeError("출력이 너무 길어요 (끝나지 않는 반복일 수 있어요)")
            _p_out.append(s)
            return len(s)
        def flush(self):
            pass
    def _p_input(prompt=""):
        try:
            return next(_p_lines)
        except StopIteration:
            raise EOFError("입력이 더 없어요 (input()을 예시보다 많이 썼어요)")
    _p_steps = [0]
    def _p_trace(frame, event, arg):
        if frame.f_code.co_filename == "<practice>":
            _p_steps[0] += 1
            if _p_steps[0] > ${MAX_STEPS}:
                raise RuntimeError("실행이 너무 오래 걸려요 (끝나지 않는 반복일 수 있어요)")
        return _p_trace
    _p_old = (sys.stdout, builtins.input)
    sys.stdout = _p_Out()
    builtins.input = _p_input
    _p_error = None
    try:
        sys.settrace(_p_trace)
        exec(compile(_p_code, "<practice>", "exec"), {"__name__": "__main__"})
    except BaseException as e:
        _p_error = type(e).__name__ + ": " + str(e)
    finally:
        sys.settrace(None)
        sys.stdout, builtins.input = _p_old
    return json.dumps({"output": "".join(_p_out), "error": _p_error}, ensure_ascii=False)
_p_run(${JSON.stringify(code)}, ${JSON.stringify(inputs)})
`;
}

export function parseRunResult(value: unknown): RunResult {
  try {
    const r = JSON.parse(String(value));
    return { output: String(r.output ?? ""), error: r.error ? String(r.error) : null };
  } catch {
    return { output: "", error: "실행 결과를 읽지 못했어요." };
  }
}

/** 출력 비교용: 줄 끝 공백과 끝의 빈 줄은 무시한다 */
export const normalizeOutput = (s: string) =>
  s
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((l) => l.replace(/\s+$/, ""))
    .join("\n")
    .replace(/\n+$/, "");

export const sameOutput = (a: string, b: string) => normalizeOutput(a) === normalizeOutput(b);

/** 오류 글에서 오류 이름만 (작성 기록의 "r:NameError"용) */
export const errorName = (error: string) => error.split(":")[0].trim() || "Error";

export type TestOutcome = { pass: boolean; output: string; error: string | null };

export function judge(tests: PracticeTest[], results: RunResult[]): TestOutcome[] {
  return tests.map((t, i) => {
    const r = results[i] ?? { output: "", error: "실행하지 못했어요." };
    return { pass: !r.error && sameOutput(r.output, t.output), output: r.output, error: r.error };
  });
}

/* ───────── AI가 만든 문제 검사 ───────── */

export const MIN_TESTS = 2;
export const MAX_TESTS = 5;

/** AI 응답 형식 (structured output) */
export const PRACTICE_SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string" },
    description: { type: "string" },
    conditions: { type: "array", items: { type: "string" } },
    starter_code: { type: "string" },
    tests: {
      type: "array",
      items: {
        type: "object",
        properties: {
          inputs: { type: "array", items: { type: "string" } },
          output: { type: "string" },
        },
        required: ["inputs", "output"],
        additionalProperties: false,
      },
    },
    solution: { type: "string" },
  },
  required: ["title", "description", "conditions", "starter_code", "tests", "solution"],
  additionalProperties: false,
} as const;

export type PracticeDraft = {
  title: string;
  description: string;
  conditions: string[];
  starterCode: string;
  tests: PracticeTest[];
  solution: string;
};

const str = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max);

/** AI 응답을 정리한다. 모양이 맞지 않으면 이유를 돌려준다 */
export function toDraft(raw: unknown): PracticeDraft | string {
  if (!raw || typeof raw !== "object") return "응답 형식이 맞지 않음";
  const r = raw as Record<string, unknown>;
  const tests = (Array.isArray(r.tests) ? r.tests : [])
    .map((t) => {
      const x = (t ?? {}) as Record<string, unknown>;
      return {
        inputs: (Array.isArray(x.inputs) ? x.inputs : []).map((s) => String(s ?? "").replace(/\r?\n/g, " ").slice(0, 200)).slice(0, 20),
        output: String(x.output ?? "").slice(0, 2000),
      };
    })
    .slice(0, MAX_TESTS);
  const draft: PracticeDraft = {
    title: str(r.title, 60),
    description: str(r.description, 2000),
    conditions: (Array.isArray(r.conditions) ? r.conditions : []).map((c) => str(c, 200)).filter(Boolean).slice(0, 8),
    starterCode: String(r.starter_code ?? "").slice(0, 2000).replace(/\s+$/, ""),
    tests,
    solution: String(r.solution ?? "").slice(0, 5000),
  };
  if (!draft.title || !draft.description) return "제목이나 문제 설명이 비어 있음";
  if (tests.length < MIN_TESTS) return `테스트가 ${MIN_TESTS}개보다 적음`;
  if (tests.some((t) => !normalizeOutput(t.output))) return "기대 출력이 빈 테스트가 있음";
  if (new Set(tests.map((t) => JSON.stringify(t.inputs))).size < tests.length) return "같은 입력의 테스트가 있음";
  if (!draft.solution.trim()) return "참고 답안이 비어 있음";
  return draft;
}

/**
 * 참고 답안·시작 코드를 실제로 돌린 결과로 문제를 확인한다.
 * - 참고 답안이 모든 테스트를 통과해야 한다 (테스트의 기대 출력이 맞는지)
 * - 시작 코드만으로 모두 통과하면 안 된다 (풀 것이 없는 문제)
 * 문제가 없으면 null, 있으면 AI에 다시 알려 줄 설명
 */
export function verifyDraft(draft: PracticeDraft, solutionRuns: RunResult[], starterRuns: RunResult[]): string | null {
  const problems: string[] = [];
  draft.tests.forEach((t, i) => {
    const r = solutionRuns[i];
    if (!r) problems.push(`테스트 ${i + 1}: 실행하지 못함`);
    else if (r.error) problems.push(`테스트 ${i + 1}: 참고 답안에서 ${r.error}`);
    else if (!sameOutput(r.output, t.output)) {
      problems.push(`테스트 ${i + 1}: 기대 출력은 ${JSON.stringify(normalizeOutput(t.output))}인데 참고 답안의 출력은 ${JSON.stringify(normalizeOutput(r.output))}`);
    }
  });
  if (!problems.length && judge(draft.tests, starterRuns).every((o) => o.pass)) problems.push("시작 코드만으로 모든 테스트를 통과함 (학생이 풀 것이 없음)");
  return problems.length ? problems.join("\n") : null;
}
