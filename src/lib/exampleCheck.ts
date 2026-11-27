/**
 * 수업 문제 "✔ 예시로 확인" (2027 작업 지시서 P5의 "통과"): 학생 코드를 문제의 예시 입력으로 돌려 예시 출력과 비교한다.
 * 브라우저(Pyodide)에서 돌리고, 결과는 작성 기록에 [시각, "t:통과/전체"]로 남긴다 (길이 2짜리 표시, edit_log 형식 그대로).
 * 학생이 단추를 누를 때와 제출할 때(자동) 남는다. 연구용 지표의 "통과"는 마지막 확인이 전체 통과(t:n/n)인 것.
 * 점수에 넣거나 감점하지 않는다. 교사 채점은 따로 그대로 한다.
 * 단위 테스트: exampleCheck.test.ts
 */
import type { Example } from "./problemBank";
import { sameOutput, type PracticeTest, type RunResult, type TestOutcome } from "./practice";

export const CHECK_PREFIX = "t:";

/** 기록에 남길 표시: "t:2/3" */
export const checkEvent = (pass: number, total: number) => `${CHECK_PREFIX}${pass}/${total}`;

/** "t:2/3" → { pass: 2, total: 3 } (아니면 null) */
export function parseCheck(kind: string): { pass: number; total: number } | null {
  const m = /^t:(\d+)\/(\d+)$/.exec(kind);
  if (!m) return null;
  const pass = Number(m[1]);
  const total = Number(m[2]);
  return total > 0 && pass <= total ? { pass, total } : null;
}

/**
 * 예시 입력 칸 → input()에 차례로 넣을 값들.
 * 여러 줄이면 줄마다 하나, 한 줄에 " / "로 나눠 적었으면(예: "길동 / 돈까스") 나눈 것마다 하나. 비어 있으면 입력 없음.
 */
export function splitExampleInput(text: string): string[] {
  const t = text.replace(/\r\n?/g, "\n").replace(/\s+$/, "");
  if (!t.trim()) return [];
  if (t.includes("\n")) return t.split("\n");
  if (/\s\/\s/.test(t)) return t.split(/\s+\/\s+/).map((x) => x.trim());
  return [t];
}

/** 확인할 수 있는 예시 (출력이 적힌 것만) */
export function exampleTests(examples: Example[]): PracticeTest[] {
  return examples
    .filter((e) => e.output.trim())
    .map((e) => ({ inputs: splitExampleInput(e.input), output: e.output }));
}

/**
 * 예시마다 통과 여부. 두 가지로 돌려 하나라도 맞으면 통과:
 * plain = input() 안내 글 없이 출력만, echoed = 실행 화면처럼 안내 글과 넣은 값까지 (교사가 예시 출력을 어떻게 적었든 맞게)
 */
export function judgeExamples(tests: PracticeTest[], plain: RunResult[], echoed: RunResult[]): TestOutcome[] {
  return tests.map((t, i) => {
    const a = plain[i] ?? { output: "", error: "실행하지 못했어요." };
    const b = echoed[i] ?? a;
    const pass = (!a.error && sameOutput(a.output, t.output)) || (!b.error && sameOutput(b.output, t.output));
    return { pass, output: a.output, error: a.error };
  });
}
