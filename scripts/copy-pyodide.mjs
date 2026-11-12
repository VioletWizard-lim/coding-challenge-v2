// 브라우저용 파이썬(Pyodide) 파일을 public/pyodide/<버전>/ 에 복사한다 (npm run dev·build 전에 저절로 실행).
// 학교망에서 외부 CDN(cdn.jsdelivr.net)이 막혀도 이 사이트 주소에서 받을 수 있게 한다.
// 복사본은 저장소에 넣지 않는다 (.gitignore). 버전은 node_modules/pyodide 것을 따른다 (src/lib/pyodide.ts와 같음).
import { copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";

const from = path.join("node_modules", "pyodide");
const { version } = JSON.parse(readFileSync(path.join(from, "package.json"), "utf8"));
const to = path.join("public", "pyodide", version);
const FILES = ["pyodide.js", "pyodide.asm.js", "pyodide.asm.wasm", "python_stdlib.zip", "pyodide-lock.json"];

mkdirSync(to, { recursive: true });
for (const f of FILES) {
  if (!existsSync(path.join(from, f))) throw new Error(`pyodide 파일이 없어요: ${f} (npm install을 먼저 하세요)`);
  copyFileSync(path.join(from, f), path.join(to, f));
}
console.log(`pyodide ${version} → ${to}`);
