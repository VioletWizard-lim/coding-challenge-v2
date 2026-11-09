"use client";

import { harnessCode, parseRunResult, type PracticeTest, type RunResult, type TestOutcome } from "@/lib/practice";
import { loadPython } from "@/lib/pyodide";

/** 브라우저(Pyodide)에서 코드를 예시 입력으로 돌린다 (서버의 참고 답안 확인과 같은 실행 코드) */
export async function runTests(code: string, tests: PracticeTest[]): Promise<RunResult[]> {
  const py = await loadPython();
  return tests.map((t) => parseRunResult(py.runPython(harnessCode(code, t.inputs))));
}

/** 확인 결과: 예시마다 통과 여부, 틀리면 기대 출력과 내 출력을 나란히 */
export function Outcomes({ tests, outcomes }: { tests: PracticeTest[]; outcomes: TestOutcome[] }) {
  const passed = outcomes.filter((o) => o.pass).length;
  const allPass = passed === outcomes.length;
  return (
    <section className="flex flex-col gap-2" aria-label="확인 결과">
      <p className={`font-bold ${allPass ? "text-green-700" : "text-amber-800"}`}>
        {allPass ? `🎉 모두 통과! (${passed}/${outcomes.length})` : `${passed}/${outcomes.length} 통과 — 다른 부분을 찾아보세요`}
      </p>
      {outcomes.map((o, i) => (
        <div
          key={i}
          className={`grid gap-1 rounded-lg border px-3 py-2 text-sm ${o.pass ? "border-green-200 bg-green-50/50" : "border-amber-300 bg-amber-50/50"}`}
        >
          <p className="font-bold">
            {o.pass ? "✅" : "✖"} 예시 {i + 1}
            {tests[i].inputs.length > 0 && <span className="font-normal text-muted"> · 입력 {tests[i].inputs.join(" / ")}</span>}
          </p>
          {!o.pass && (
            <div className="grid gap-2 sm:grid-cols-2">
              <div>
                <p className="text-xs text-muted">기대 출력</p>
                <pre className="whitespace-pre-wrap rounded bg-white px-2 py-1 font-mono text-xs">{tests[i].output}</pre>
              </div>
              <div>
                <p className="text-xs text-muted">내 출력</p>
                <pre className="whitespace-pre-wrap rounded bg-white px-2 py-1 font-mono text-xs">
                  {o.output || <span className="text-muted">(출력 없음)</span>}
                  {o.error && <span className="block text-danger">{o.error}</span>}
                </pre>
              </div>
            </div>
          )}
        </div>
      ))}
    </section>
  );
}

