import "server-only";
import path from "node:path";
import { Worker } from "node:worker_threads";
import { harnessCode, parseRunResult, type RunResult } from "./practice";

/**
 * 서버에서 파이썬 실행 (연습 문제의 참고 답안 확인용). 브라우저와 같은 Pyodide를 Node에서 돌린다.
 * - 따로 떨어진 작업 공간(worker)에서 돌리고, 서버의 환경변수(API 키 등)는 넘기지 않는다 (env: {})
 * - 시간이 넘으면 작업 공간을 통째로 끈다 (끝나지 않는 반복 대비)
 * AI가 만든 코드만 돌린다. 학생 코드는 브라우저에서 돌린다.
 */

const WORKER = `
const { workerData, parentPort } = require("node:worker_threads");
(async () => {
  try {
    const { loadPyodide } = await import(workerData.module);
    const py = await loadPyodide({ indexURL: workerData.dir });
    const results = workerData.scripts.map((s) => py.runPython(s));
    parentPort.postMessage({ ok: true, results });
  } catch (err) {
    parentPort.postMessage({ ok: false, error: String((err && err.message) || err) });
  }
})();
`;

const TIMEOUT_MS = 20_000;

/** codes × inputs를 모두 돌린다. 결과는 codes 순서대로, 그 안은 inputs 순서대로 */
export async function runPythonTests(codes: string[], inputs: string[][]): Promise<RunResult[][]> {
  const dir = path.join(process.cwd(), "node_modules", "pyodide") + path.sep;
  const scripts = codes.flatMap((code) => inputs.map((list) => harnessCode(code, list)));
  const raw = await new Promise<unknown[]>((resolve, reject) => {
    const worker = new Worker(WORKER, {
      eval: true,
      env: {},
      workerData: { module: path.join(dir, "pyodide.mjs"), dir, scripts },
      resourceLimits: { maxOldGenerationSizeMb: 256 },
    });
    const timer = setTimeout(() => {
      worker.terminate();
      reject(new Error("참고 답안 실행 시간이 너무 오래 걸렸어요."));
    }, TIMEOUT_MS);
    worker.once("message", (m: { ok: boolean; results?: unknown[]; error?: string }) => {
      clearTimeout(timer);
      worker.terminate();
      if (m.ok) resolve(m.results ?? []);
      else reject(new Error(`파이썬 실행 실패: ${m.error}`));
    });
    worker.once("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
  return codes.map((_, c) => inputs.map((__, i) => parseRunResult(raw[c * inputs.length + i])));
}
