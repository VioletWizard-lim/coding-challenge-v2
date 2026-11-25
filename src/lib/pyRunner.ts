import "server-only";
import path from "node:path";
import { Worker } from "node:worker_threads";
import { harnessCode, parseRunResult, serverSafetyCheckCode, unsafeCodeReason, type RunResult } from "./practice";

/**
 * 서버에서 파이썬 실행 (연습 문제의 참고 답안 확인용). 브라우저와 같은 Pyodide를 Node에서 돌린다.
 * AI가 만든 코드만 돌린다. 학생 코드는 브라우저에서 돌린다.
 * 학생이 쓴 코드·글이 AI 요청에 섞여 들어가므로(막힌 곳 → 연습 문제), AI가 위험한 코드를 내놓을 수 있다고 보고 여러 겹으로 막는다.
 * 1. 글자 확인(unsafeCodeReason): import·__·eval( 같은 것. 걸리면 AI에게 이유를 알려 주고 다시 만들게 한다
 * 2. 문법 구조 확인(serverSafetyCheckCode, 작업 공간 안의 파이썬 ast): `f = eval`, 전각 글자, gi_frame.f_builtins 같은 우회도 막는다
 * 3. 실행 공간 줄이기(harnessCode restricted): eval·open·__import__ 등을 뺀 내장 함수로만 돌린다
 * 4. 작업 공간(worker) 줄이기: 서버의 환경변수(API 키 등)는 넘기지 않고(env: {}), 파이썬이 JS로 넘어가는 길(js 모듈)과
 *    인터넷 요청(fetch 등)을 없앤 뒤 돌린다. 시간이 넘으면 작업 공간을 통째로 끈다 (끝나지 않는 반복 대비)
 */

const WORKER = `
const { workerData, parentPort } = require("node:worker_threads");
(async () => {
  try {
    const { loadPyodide } = await import(workerData.module);
    const py = await loadPyodide({ indexURL: workerData.dir });
    // 파이썬에서 JS로 넘어가는 모듈을 없앤다 (import js, pyodide.code.run_js 등이 모두 이것을 쓴다)
    for (const name of ["js", "pyodide_js"]) {
      try { py.unregisterJsModule(name); } catch {}
    }
    // 혹시 JS에 닿더라도 밖으로 요청을 보내지 못하게
    for (const name of ["fetch", "WebSocket", "XMLHttpRequest", "EventSource", "Request", "Response", "Headers"]) {
      try { delete globalThis[name]; globalThis[name] = undefined; } catch {}
    }
    const reasons = JSON.parse(py.runPython(workerData.check));
    const unsafe = reasons.find((r) => r);
    if (unsafe) {
      parentPort.postMessage({ ok: false, unsafe });
      return;
    }
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
  for (const code of codes) {
    const unsafe = unsafeCodeReason(code);
    if (unsafe) throw new Error(unsafe);
  }
  const dir = path.join(process.cwd(), "node_modules", "pyodide") + path.sep;
  const scripts = codes.flatMap((code) => inputs.map((list) => harnessCode(code, list, { restricted: true })));
  const raw = await new Promise<unknown[]>((resolve, reject) => {
    const worker = new Worker(WORKER, {
      eval: true,
      env: {},
      workerData: { module: path.join(dir, "pyodide.mjs"), dir, check: serverSafetyCheckCode(codes), scripts },
      resourceLimits: { maxOldGenerationSizeMb: 256 },
    });
    const timer = setTimeout(() => {
      worker.terminate();
      reject(new Error("참고 답안 실행 시간이 너무 오래 걸렸어요."));
    }, TIMEOUT_MS);
    worker.once("message", (m: { ok: boolean; results?: unknown[]; error?: string; unsafe?: string }) => {
      clearTimeout(timer);
      worker.terminate();
      if (m.ok) resolve(m.results ?? []);
      else if (m.unsafe) reject(new Error(m.unsafe));
      else reject(new Error(`파이썬 실행 실패: ${m.error}`));
    });
    worker.once("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
  return codes.map((_, c) => inputs.map((__, i) => parseRunResult(raw[c * inputs.length + i])));
}
