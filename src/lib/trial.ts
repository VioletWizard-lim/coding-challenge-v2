/**
 * 🧪 체험 페이지(/try, 로그인 없음, 저장 없음)에서 쓰는 데이터와 순수 함수.
 * - 체험 문제 3개 (실제 수업 문제와 섞이지 않음)
 * - 예시 학생 기록: 입력 → 실행 오류 → 멈춤 → AI 도움 요청 → 스스로 고침 → 성공 (재생기에서 그대로 재생됨)
 *   예시 AI 답·되돌아보기는 이 기록의 과정 요약 순간 번호([[M3]])를 가리킨다 (trial.test.ts가 번호를 확인)
 * - 진짜 AI는 체험 코드(TRY_ACCESS_CODE)를 넣은 사람만, 사이트 전체 하루 횟수(TRY_AI_DAILY_LIMIT) 안에서
 * 학생 이름·아이디는 다루지 않는다.
 */
import type { AiReview } from "./aiReview";
import type { HelpChat } from "./helpTrail";
import { asProblem, type PracticeTest } from "./practice";
import type { Problem } from "./problemBank";
import { summarizeProcess, type Moment } from "./process-summary";

export const TRIAL_SUBJECT = "체험";

export type TrialProblem = { id: string; view: Problem; tests: PracticeTest[] };

function trialProblem(id: string, p: { title: string; description: string; conditions: string[]; tests: PracticeTest[]; starterCode?: string }): TrialProblem {
  // 화면에는 "체험 1"처럼 (과목 "체험" + 번호)
  const view = { ...asProblem({ subject: TRIAL_SUBJECT, level: 1, starterCode: "", ...p }), number: id.replace(TRIAL_SUBJECT, "") };
  return { id, view, tests: p.tests };
}

export const TRIAL_PROBLEMS: TrialProblem[] = [
  trialProblem("체험1", {
    title: "내년 나이 알려 주기",
    description: "이름과 올해 나이를 차례로 입력받아, 내년 나이를 알려 주는 인사말을 출력하세요. 출력은 예시와 똑같이 씁니다.",
    conditions: ["input()을 두 번 쓸 것", "나이는 숫자로 바꿔서 1을 더할 것"],
    tests: [
      { inputs: ["길동", "17"], output: "안녕, 길동! 내년에는 18살이네." },
      { inputs: ["영희", "15"], output: "안녕, 영희! 내년에는 16살이네." },
    ],
  }),
  trialProblem("체험2", {
    title: "짝수일까 홀수일까",
    description: "정수 하나를 입력받아 짝수이면 \"짝수\", 홀수이면 \"홀수\"를 출력하세요.",
    conditions: ["if와 else를 쓸 것", "나머지 연산자(%)를 쓸 것"],
    tests: [
      { inputs: ["4"], output: "짝수" },
      { inputs: ["7"], output: "홀수" },
      { inputs: ["0"], output: "짝수" },
    ],
  }),
  trialProblem("체험3", {
    title: "1부터 n까지 더하기",
    description: "정수 n을 입력받아 1부터 n까지 모두 더한 값을 \"합: 55\"처럼 출력하세요.",
    conditions: ["for 반복문과 range()를 쓸 것", "sum() 함수는 쓰지 말 것"],
    tests: [
      { inputs: ["10"], output: "합: 55" },
      { inputs: ["1"], output: "합: 1" },
      { inputs: ["100"], output: "합: 5050" },
    ],
  }),
];

export const findTrialProblem = (id: string) => TRIAL_PROBLEMS.find((p) => p.id === id) ?? null;

/** 브라우저에 체험 기록을 둘 localStorage 키 (실제 학생 기록 키 code_rec:와 섞이지 않게) */
export const trialStorageKey = (problemId: string) => `try_rec:${problemId}`;

/* ───────── 예시 학생 기록 ───────── */

/** 작성 기록 만들기: 한 글자씩 입력, 지우기, 실행·도움 요청 표시 (edit_log 형식, 위치는 바뀌기 직전 문서 기준) */
class LogBuilder {
  doc = "";
  t: number;
  log: unknown[] = [];
  constructor(start: number) {
    this.t = start;
  }
  private pos(offset: number): [number, number] {
    const before = this.doc.slice(0, offset).split("\n");
    return [before.length - 1, before[before.length - 1].length];
  }
  /** offset 자리에 한 글자씩 입력 (기본: 끝) */
  type(text: string, offset = this.doc.length, gap = 220) {
    let at = offset;
    for (const ch of text) {
      const [l, c] = this.pos(at);
      this.t += ch === "\n" ? gap * 3 : gap;
      this.log.push([this.t, "i", l, c, l, c, ch]);
      this.doc = this.doc.slice(0, at) + ch + this.doc.slice(at);
      at += ch.length;
    }
    return this;
  }
  /** from~to 글자를 지운다 (Backspace 한 번) */
  remove(from: number, to: number) {
    const [fl, fc] = this.pos(from);
    const [tl, tc] = this.pos(to);
    this.t += 400;
    this.log.push([this.t, "d", fl, fc, tl, tc, ""]);
    this.doc = this.doc.slice(0, from) + this.doc.slice(to);
    return this;
  }
  mark(kind: string, gap = 1500) {
    this.t += gap;
    this.log.push([this.t, kind]);
    return this;
  }
  wait(ms: number) {
    this.t += ms;
    return this;
  }
}

function buildSample() {
  const b = new LogBuilder(Date.UTC(2026, 3, 14, 1, 5, 0));
  b.type('name = input()\nage = input()\nprint("안녕, " + name + "! 내년에는 " + str(age + 1) + "살이네.")');
  b.mark("r:TypeError", 2500);
  b.wait(9000);
  // 따옴표 쪽을 의심해 str을 지웠다 다시 써 봄
  const s = b.doc.indexOf("str(");
  b.remove(s, s + 4).type("str(", s);
  b.mark("r:TypeError", 2500);
  b.wait(75_000); // 오래 멈춤
  b.mark("q", 1000); // AI 도움 요청
  b.wait(40_000);
  // 스스로 고침: age = int(input())
  const a = b.doc.indexOf("input()", b.doc.indexOf("age"));
  b.type("int(", a);
  b.type(")", a + "int(".length + "input()".length);
  b.mark("r:ok", 3000);
  return { init: "", log: b.log, code: b.doc };
}

/** 예시 학생의 작성 기록 (체험1을 푼 과정) */
export const SAMPLE_RECORDING = buildSample();
export const SAMPLE_PROBLEM_ID = "체험1";

/** 예시 기록의 과정 요약 순간 (AI가 [[M번호]]로 가리키는 것) */
export const sampleMoments = (): Moment[] => summarizeProcess(SAMPLE_RECORDING.init, SAMPLE_RECORDING.log).moments;

const askAt = (SAMPLE_RECORDING.log as unknown[][]).find((e) => e[1] === "q")![0] as number;

/** 예시 학생이 AI 도우미에게 물은 것 (예시용으로 실제 도우미가 답하는 방식대로 쓴 답) */
export const SAMPLE_CHAT = {
  question: "TypeError가 계속 나요. 어디가 문제예요?",
  answer:
    "[[M1]]과 [[M2]]에서 같은 TypeError가 두 번 났어요. 두 번째에는 `str(` 부분을 지웠다 다시 썼는데, 오류는 그대로였죠. " +
    "그렇다면 문제는 `str()` 쪽이 아니라 그 안의 `age + 1`일 수 있어요. `input()`으로 받은 값은 어떤 자료형일까요? " +
    "`age`가 숫자인지 글자인지 먼저 확인해 보세요.",
};

export const sampleChats = (): HelpChat[] => [{ at: askAt, ...SAMPLE_CHAT, moments: sampleMoments() }];

/** 예시 되돌아보기 (제출 뒤 AI 질문 + 예시 학생 답 + 이어 묻기) */
export function sampleReview(): AiReview {
  const m = sampleMoments();
  const byId = (id: string) => m.find((x) => x.id === id) ?? null;
  return {
    id: 0,
    userId: "",
    submissionId: 0,
    subject: TRIAL_SUBJECT,
    problem: SAMPLE_PROBLEM_ID,
    intro: "같은 오류가 두 번 났지만, AI의 답을 붙여넣지 않고 직접 `int()`를 넣어 끝까지 성공했어요. 스스로 원인을 찾아낸 점이 좋아요.",
    questions: [
      {
        moment: byId("M3"),
        question: "여기서 1분 넘게 멈췄을 때 어떤 생각을 했나요? 무엇을 의심하고 있었나요?",
        answer: "따옴표나 + 기호가 잘못된 줄 알았어요. 그래서 str을 다시 써 봤는데 똑같아서 막혔어요.",
        followUp: {
          reply: "[[M2]]에서 str을 다시 써 본 것도 원인을 좁히는 좋은 실험이었어요. 그게 아니라는 걸 알게 됐으니까요.",
          question: "다음에 TypeError가 나면 오류 메시지의 어느 부분부터 읽어 볼 건가요?",
          moments: m.filter((x) => x.id === "M2"),
          answer: "어떤 자료형끼리 더하려고 했는지 나오는 부분을 먼저 볼 거예요.",
          createdAt: "",
          model: null,
          inputTokens: null,
          outputTokens: null,
        },
      },
      {
        moment: byId("M5"),
        question: "도움을 받은 뒤 직접 바꾼 부분은 어디인가요? 왜 그 부분을 바꿨나요?",
        answer: "age = input()을 age = int(input())으로 바꿨어요. input은 글자로 받으니까 숫자로 바꿔야 1을 더할 수 있어서요.",
        followUp: null,
      },
    ],
    flaggedBy: null,
    createdAt: "",
    updatedAt: "",
    model: null,
    inputTokens: null,
    outputTokens: null,
  };
}

/* ───────── 진짜 AI 쓰기: 체험 코드와 하루 횟수 ───────── */

/** 사이트 전체에서 하루에 체험 AI를 부를 수 있는 횟수 (도우미·되돌아보기·이어 묻기 모두) */
export function trialLimit(): number {
  const n = Number(process.env.TRY_AI_DAILY_LIMIT);
  return Number.isInteger(n) && n >= 0 ? n : 30;
}

/** 체험 코드가 맞는지 (앞뒤 공백·대소문자 무시). 코드를 정하지 않았으면 진짜 AI는 꺼짐 */
export function trialCodeMatches(input: string, expected = process.env.TRY_ACCESS_CODE ?? ""): boolean {
  const want = expected.trim().toLowerCase();
  return want.length > 0 && String(input ?? "").trim().toLowerCase() === want;
}

/** app_status에 하루 횟수를 남길 키 (한국 날짜) */
export const trialUsageKey = (kstDate: string) => `try_ai:${kstDate}`;
