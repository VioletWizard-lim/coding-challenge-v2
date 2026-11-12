/** 브라우저에서 파이썬 실행 (Pyodide, CDN에서 불러옴). 클라이언트 전용. */

const PYODIDE_URL = "https://cdn.jsdelivr.net/pyodide/v0.26.4/full/";

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

/**
 * 학생 코드를 돌리는 파이썬 함수 _lbl_run(code, 한도초).
 * - 실행할 때마다 새 이름 공간에서 돌린다 (앞 실행에서 만든 변수가 남아 오류가 가려지지 않게)
 * - 줄이 실행될 때마다 시간을 확인해 한도를 넘으면 TimeLimitError로 멈춘다
 * 학생 코드는 "<exec>"라는 파일 이름으로 돌려서, 오류 줄 번호가 학생 코드 기준으로 나온다.
 */
const RUNNER = `
def _lbl_setup():
    import sys, time, builtins, js
    class ${TIME_LIMIT_ERROR}(BaseException):
        pass
    ${TIME_LIMIT_ERROR}.__qualname__ = "${TIME_LIMIT_ERROR}"
    ${TIME_LIMIT_ERROR}.__module__ = "builtins"
    def run(code, limit):
        state = [time.monotonic() + limit, 0]
        def ask(prompt=""):
            start = time.monotonic()
            try:
                return js.prompt(str(prompt)) or ""
            finally:
                state[0] += time.monotonic() - start
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

/** 학생 코드를 한 번 실행한다. 오류(시간 초과 포함)는 던진다 */
export function runStudentCode(py: Pyodide, code: string): void {
  (py.globals.get("_lbl_run") as (code: string, limit: number) => void)(code, RUN_LIMIT_SECONDS);
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

/** 한 번만 불러오고 이후에는 같은 것을 돌려준다. 실패하면 다음 호출 때 다시 시도한다. */
export function loadPython(): Promise<Pyodide> {
  if (!loading) {
    loading = (async () => {
      if (!window.loadPyodide) await loadScript(`${PYODIDE_URL}pyodide.js`);
      const py = await window.loadPyodide!({ indexURL: PYODIDE_URL });
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
