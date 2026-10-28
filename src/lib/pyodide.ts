/** 브라우저에서 파이썬 실행 (Pyodide, CDN에서 불러옴). 클라이언트 전용. */

const PYODIDE_URL = "https://cdn.jsdelivr.net/pyodide/v0.26.4/full/";

export type Pyodide = {
  runPython(code: string): unknown;
  runPythonAsync(code: string): Promise<unknown>;
  setStdout(options: { batched: (text: string) => void }): void;
  setStderr(options: { batched: (text: string) => void }): void;
};

declare global {
  interface Window {
    loadPyodide?: (options: { indexURL: string }) => Promise<Pyodide>;
  }
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
      return py;
    })();
    loading.catch(() => {
      loading = null;
    });
  }
  return loading;
}
