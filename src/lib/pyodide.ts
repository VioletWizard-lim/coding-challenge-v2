/**
 * 브라우저에서 파이썬 실행 (Pyodide). 클라이언트 전용.
 * 이 사이트에서 먼저 받고(scripts/copy-pyodide.mjs가 build 때 public/pyodide/<버전>/에 복사), 안 되면 CDN에서 받는다.
 * 학교망에서 외부 CDN이 막혀도 실행되게 하려는 것이다.
 */
import { version as PYODIDE_VERSION } from "pyodide/package.json";

const PYODIDE_URLS = [`/pyodide/${PYODIDE_VERSION}/`, `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`];

export type Pyodide = {
  runPython(code: string): unknown;
  runPythonAsync(code: string): Promise<unknown>;
  setStdout(options: { batched: (text: string) => void }): void;
  setStderr(options: { batched: (text: string) => void }): void;
  globals: { get(name: string): unknown };
};

declare global {
  interface Window {
    loadPyodide?: (options: { indexURL: string }) => Promise<Pyodide>;
  }
}

/** 학생 코드 실행 시간 한도. 넘으면 멈춘다 (끝나지 않는 반복문으로 탭이 멈추지 않게). input() 입력창에서 기다린 시간은 빼고 잰다 */
export const RUN_LIMIT_SECONDS = 5;
/** 시간 한도를 넘어 멈췄을 때의 오류 이름 (기록에는 [시각, "r:TimeLimitError"]로 남는다) */
export const TIME_LIMIT_ERROR = "TimeLimitError";
/** input() 입력창에서 "취소"를 눌러 멈췄을 때의 오류 이름 (오류가 아니므로 실행 기록에는 남기지 않는다) */
export const INPUT_CANCELLED = "InputCancelled";

/**
 * 학생 코드를 돌리는 파이썬 함수 _lbl_run(code, 한도초).
 * - 실행할 때마다 새 이름 공간에서 돌린다 (앞 실행에서 만든 변수가 남아 오류가 가려지지 않게)
 * - 줄이 실행될 때마다 시간을 확인해 한도를 넘으면 TimeLimitError로 멈춘다
 * - input()은 화면 쪽 함수(ask_user)에 묻는다. 학생이 취소하면 빈 값을 넣지 않고 InputCancelled로 멈춘다
 * 학생 코드는 "<exec>"라는 파일 이름으로 돌려서, 오류 줄 번호가 학생 코드 기준으로 나온다.
 */
const RUNNER = `
def _lbl_setup():
    import sys, time, builtins, js
    class ${TIME_LIMIT_ERROR}(BaseException):
        pass
    ${TIME_LIMIT_ERROR}.__qualname__ = "${TIME_LIMIT_ERROR}"
    ${TIME_LIMIT_ERROR}.__module__ = "builtins"
    class ${INPUT_CANCELLED}(BaseException):
        pass
    ${INPUT_CANCELLED}.__qualname__ = "${INPUT_CANCELLED}"
    ${INPUT_CANCELLED}.__module__ = "builtins"
    def run(code, limit, ask_user):
        state = [time.monotonic() + limit, 0]
        def ask(prompt=""):
            sys.stdout.flush()
            start = time.monotonic()
            try:
                answer = ask_user(str(prompt))
            finally:
                state[0] += time.monotonic() - start
            if answer is None:
                raise ${INPUT_CANCELLED}("input cancelled")
            return str(answer)
        def trace(frame, event, arg):
            state[1] += 1
            if state[1] % 200 == 0 and time.monotonic() > state[0]:
                raise ${TIME_LIMIT_ERROR}("time limit")
            return trace
        old_input = builtins.input
        builtins.input = ask
        try:
            compiled = compile(code, "<exec>", "exec")
            sys.settrace(trace)
            try:
                exec(compiled, {"__name__": "__main__", "__builtins__": builtins})
            finally:
                sys.settrace(None)
        finally:
            builtins.input = old_input
    return run
_lbl_run = _lbl_setup()
del _lbl_setup
`;

/**
 * 학생 코드를 한 번 실행한다. 오류(시간 초과, 입력 취소 포함)는 던진다.
 * askUser: input()이 불릴 때마다 안내 글을 받아 학생이 넣은 값을 돌려준다 (취소하면 null → 실행을 멈춘다)
 */
export function runStudentCode(py: Pyodide, code: string, askUser: (prompt: string) => string | null): void {
  (py.globals.get("_lbl_run") as (code: string, limit: number, ask: (prompt: string) => string | null) => void)(
    code,
    RUN_LIMIT_SECONDS,
    askUser,
  );
}

let loading: Promise<Pyodide> | null = null;

function loadScript(src: string) {
  return new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("파이썬을 불러오지 못했어요. 인터넷 연결을 확인하세요."));
    document.head.appendChild(script);
  });
}

/** 이 사이트 → CDN 순서로 불러 본다 */
async function boot(): Promise<Pyodide> {
  let lastError: unknown = null;
  for (const base of PYODIDE_URLS) {
    try {
      if (!window.loadPyodide) await loadScript(`${base}pyodide.js`);
      return await window.loadPyodide!({ indexURL: base });
    } catch (err) {
      lastError = err;
      console.warn(`파이썬 불러오기 실패 (${base}):`, err);
    }
  }
  throw lastError instanceof Error ? lastError : new Error("파이썬을 불러오지 못했어요. 인터넷 연결을 확인하세요.");
}

/** 한 번만 불러오고 이후에는 같은 것을 돌려준다. 실패하면 다음 호출 때 다시 시도한다. */
export function loadPython(): Promise<Pyodide> {
  if (!loading) {
    loading = (async () => {
      const py = await boot();
      // input()은 브라우저 입력창으로 받는다 (v1과 같음)
      py.runPython("import builtins, js\nbuiltins.input = lambda p='': (js.prompt(str(p)) or '')");
      // 파일 이름을 "<runner>"로 두어, 오류 글에서 학생 코드("<exec>") 줄만 골라 보여 줄 수 있게 한다
      py.runPython(`exec(compile(${JSON.stringify(RUNNER)}, "<runner>", "exec"))`);
      return py;
    })();
    loading.catch(() => {
      loading = null;
    });
  }
  return loading;
}
