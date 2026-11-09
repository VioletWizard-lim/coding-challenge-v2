/**
 * 백업 CSV: 엑셀로 열어 볼 수 있고, 다시 올려 그대로 되살릴 수 있는 CSV. 서버·브라우저 공용. 단위 테스트: backupCsv.test.ts
 *
 * - 값이 없음(null)은 빈 칸, 빈 글("")은 따옴표 두 개("")로 구분한다
 * - 엑셀에서 수식으로 실행되지 않게 =, +, -, @, 탭, 줄바꿈, ' 로 시작하는 글 앞에 ' 를 붙이고, 되살릴 때 뗀다
 * - 숫자·참거짓·JSON(작성 기록 등)은 schema.json에 칸 종류를 적어 두고 되살릴 때 원래 모양으로 바꾼다
 */

export type ColumnKind = "string" | "number" | "boolean" | "json";
/** 표 이름 → 칸 이름 → 종류 */
export type BackupSchema = Record<string, Record<string, ColumnKind>>;

const needsGuard = /^[=+\-@\t\r\n']/;

export function kindOf(v: unknown): ColumnKind | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return "number";
  if (typeof v === "boolean") return "boolean";
  if (typeof v === "string") return "string";
  return "json";
}

/** 칸 하나 → CSV 글 */
export function encodeCell(v: unknown): string {
  if (v === null || v === undefined) return "";
  let s: string;
  if (typeof v === "string") s = needsGuard.test(v) ? `'${v}` : v;
  else if (typeof v === "number" || typeof v === "boolean") return String(v);
  else s = JSON.stringify(v);
  return s === "" || /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export const csvLine = (cells: unknown[]) => cells.map(encodeCell).join(",") + "\r\n";

/** CSV 읽기. 빈 칸은 null, 따옴표로 감싼 빈 글은 "" */
export function parseCsv(text: string): (string | null)[][] {
  const rows: (string | null)[][] = [];
  let row: (string | null)[] = [];
  let i = text.charCodeAt(0) === 0xfeff ? 1 : 0;
  const n = text.length;
  while (i < n) {
    let cell: string | null;
    if (text[i] === '"') {
      let s = "";
      i++;
      for (;;) {
        const q = text.indexOf('"', i);
        if (q < 0) throw new Error("CSV 따옴표가 맞지 않아요.");
        s += text.slice(i, q);
        if (text[q + 1] === '"') {
          s += '"';
          i = q + 2;
        } else {
          i = q + 1;
          break;
        }
      }
      cell = s;
    } else {
      let j = i;
      while (j < n && text[j] !== "," && text[j] !== "\r" && text[j] !== "\n") j++;
      const raw = text.slice(i, j);
      cell = raw === "" ? null : raw;
      i = j;
    }
    row.push(cell);
    if (text[i] === ",") {
      i++;
      if (i >= n) row.push(null);
    } else {
      if (text[i] === "\r") i++;
      if (text[i] === "\n") i++;
      rows.push(row);
      row = [];
    }
  }
  if (row.length) rows.push(row);
  return rows;
}

/** CSV 글 칸 → 원래 값 */
export function decodeCell(cell: string | null, kind: ColumnKind | undefined): unknown {
  if (cell === null) return null;
  const s = cell.startsWith("'") ? cell.slice(1) : cell;
  switch (kind) {
    case "number":
      return Number(s);
    case "boolean":
      return s === "true";
    case "json":
      return JSON.parse(s);
    default:
      return s;
  }
}

/** 표 CSV → 행들 (머리줄이 칸 이름) */
export function rowsFromCsv(text: string, kinds: Record<string, ColumnKind> = {}): Record<string, unknown>[] {
  const [head, ...rest] = parseCsv(text);
  if (!head) return [];
  const names = head.map((h) => h ?? "");
  return rest
    .filter((r) => r.some((c) => c !== null))
    .map((r) => Object.fromEntries(names.map((name, k) => [name, decodeCell(r[k] ?? null, kinds[name])])));
}
