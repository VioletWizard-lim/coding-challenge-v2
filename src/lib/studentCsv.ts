/**
 * 학생 CSV 일괄 등록: 파일 읽기·검사. 미리보기와 실제 등록이 같은 함수를 써서 결과가 어긋나지 않게 한다.
 */
import { SUBJECTS } from "./problems";

export const MAX_ROWS = 300;

/** CSV 첫 줄(제목)의 이름 → 칸. 띄어쓰기는 무시하고 비교한다. */
const COLUMNS = {
  아이디: "id",
  학번: "id", // 예전 양식
  이름: "name",
  학년: "grade",
  반: "class",
  과목: "subjects",
  초기비밀번호: "password",
  비밀번호: "password",
  프로그래밍학년: "programmingGrade",
  프로그래밍반: "programmingClass",
} as const;

type Column = (typeof COLUMNS)[keyof typeof COLUMNS];

export type StudentInput = {
  id: string;
  name: string;
  grade: number | null;
  class: number | null;
  programmingGrade: number | null;
  programmingClass: number | null;
  /** "프로그래밍,정보"처럼 쉼표로 이은 값 (v1 형식). 비우면 null = 모든 과목 */
  subjects: string | null;
  /** 비우면 등록할 때 숫자 6자리를 만든다 */
  password: string;
};

export type ParsedRow = { line: number; student: StudentInput; error: string | null };
export type ParseResult = { rows: ParsedRow[]; error: string | null };

/** 권장 아이디 규칙: s + 만든 해 두 자리 + 학번 (예: 2026년 2학년 3반 1번 → s2620301). 한 학교 안에서는 해가 바뀌어도 겹치지 않는다 */
export const suggestedId = (year: number, studentNumber: string) => `s${String(year).slice(-2)}${studentNumber}`;

/** 내려받는 양식: 예시 아이디는 올해(한국 시간) 기준 */
export function templateCsv(now = new Date()): string {
  const year = Number(new Intl.DateTimeFormat("en", { timeZone: "Asia/Seoul", year: "numeric" }).format(now));
  return (
    "아이디,이름,학년,반,과목,초기 비밀번호,프로그래밍 학년,프로그래밍 반\n" +
    `${suggestedId(year, "20301")},홍길동,2,3,프로그래밍/정보,,2,5\n` +
    `${suggestedId(year, "20302")},김영희,2,3,정보,abcd1234,,\n`
  );
}

/** 따옴표("...")와 줄바꿈을 처리하는 간단한 CSV 읽기 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const src = text.replace(/^﻿/, "");
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (cell !== "" || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

const toNumber = (v: string): number | null | "bad" => {
  if (!v) return null;
  return /^\d{1,2}$/.test(v) ? Number(v) : "bad";
};

/** CSV 글을 학생 목록으로 바꾸고 줄마다 잘못된 점을 찾는다. */
export function parseStudentCsv(text: string): ParseResult {
  const table = parseCsv(text);
  if (!table.length) return { rows: [], error: "파일이 비어 있어요." };

  const header = table[0].map((h) => h.replace(/\s/g, ""));
  const columnAt = new Map<Column, number>();
  header.forEach((h, i) => {
    const col = COLUMNS[h as keyof typeof COLUMNS];
    if (col && !columnAt.has(col)) columnAt.set(col, i);
  });
  if (!columnAt.has("id") || !columnAt.has("name")) {
    return { rows: [], error: "첫 줄에 '아이디'(또는 '학번')와 '이름' 제목이 있어야 해요. 양식 파일을 내려받아 써 주세요." };
  }
  if (table.length - 1 > MAX_ROWS) {
    return { rows: [], error: `한 번에 ${MAX_ROWS}명까지 등록할 수 있어요. 파일을 나눠 주세요.` };
  }

  const seen = new Set<string>();
  const rows = table.slice(1).map((cells, i): ParsedRow => {
    const get = (col: Column) => (columnAt.has(col) ? (cells[columnAt.get(col)!] ?? "").trim() : "");
    const nums = {
      grade: toNumber(get("grade")),
      class: toNumber(get("class")),
      programmingGrade: toNumber(get("programmingGrade")),
      programmingClass: toNumber(get("programmingClass")),
    };
    const subjectList = get("subjects")
      .split(/[,/;·]/)
      .map((s) => s.trim())
      .filter(Boolean);
    const rawPassword = columnAt.has("password") ? (cells[columnAt.get("password")!] ?? "") : "";
    const student: StudentInput = {
      id: get("id"),
      name: get("name"),
      grade: nums.grade === "bad" ? null : nums.grade,
      class: nums.class === "bad" ? null : nums.class,
      programmingGrade: nums.programmingGrade === "bad" ? null : nums.programmingGrade,
      programmingClass: nums.programmingClass === "bad" ? null : nums.programmingClass,
      subjects: subjectList.length ? subjectList.join(",") : null,
      password: rawPassword.trim(),
    };

    let error: string | null = null;
    const unknownSubject = subjectList.find((s) => !(s in SUBJECTS));
    if (!student.id) error = "아이디가 비어 있어요.";
    else if (!/^[\w-]{1,30}$/.test(student.id)) error = "아이디는 영문·숫자로 30자 이내여야 해요.";
    else if (seen.has(student.id)) error = "파일 안에 같은 아이디가 또 있어요.";
    else if (!student.name) error = "이름이 비어 있어요.";
    else if (student.name.length > 30) error = "이름이 너무 길어요.";
    else if (Object.values(nums).includes("bad")) error = "학년·반은 숫자로 적어 주세요.";
    else if (unknownSubject) error = `'${unknownSubject}' 과목이 없어요. (${Object.keys(SUBJECTS).join(", ")} 중에서)`;
    else if (rawPassword && rawPassword !== student.password) error = "비밀번호 앞뒤에 공백이 있어요.";
    else if (student.password && (student.password.length < 4 || student.password.length > 72)) {
      error = "비밀번호는 4~72자여야 해요. (비우면 숫자 6자리를 만들어 줘요)";
    }
    if (student.id) seen.add(student.id);
    return { line: i + 2, student, error };
  });
  return { rows, error: rows.length ? null : "학생 줄이 없어요." };
}

/** 등록 결과(비밀번호 포함)를 엑셀에서 한글이 깨지지 않는 CSV로 만든다 */
export function resultCsv(rows: { id: string; name: string; password: string }[]) {
  const esc = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  return "﻿아이디,이름,비밀번호\n" + rows.map((r) => [r.id, r.name, r.password].map(esc).join(",")).join("\n") + "\n";
}

/** 엑셀이 저장한 CSV는 EUC-KR(CP949)인 경우가 많아, UTF-8로 안 읽히면 EUC-KR로 읽는다 */
export function decodeCsvFile(buffer: ArrayBuffer): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } catch {
    return new TextDecoder("euc-kr").decode(buffer);
  }
}

/** 이미 있는 계정 (CSV의 같은 아이디) */
export type ExistingAccount = { name: string; role: string; subjects: string | null };

/**
 * 이미 있는 아이디를 어떻게 할지.
 * - same: 바꿀 것 없음 / add: 같은 학생이라 과목만 더함(이름·비밀번호는 그대로) / conflict: 다른 사람일 수 있어 건드리지 않음
 */
export type ExistingPlan =
  | { kind: "same" }
  | { kind: "add"; add: string[]; next: string }
  | { kind: "conflict"; reason: string };

const subjectList = (v: string | null) =>
  (v ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

export function planForExisting(csv: StudentInput, acc: ExistingAccount): ExistingPlan {
  if (acc.role !== "student") return { kind: "conflict", reason: "교사 계정과 같은 아이디예요" };
  if (acc.name.trim() !== csv.name.trim()) return { kind: "conflict", reason: `이미 '${acc.name}' 학생이 쓰는 아이디예요` };
  const current = subjectList(acc.subjects);
  if (!current.length) return { kind: "same" }; // 과목이 비어 있으면 이미 모든 과목
  // CSV에서 과목을 비우면 모든 과목
  const wanted = csv.subjects ? subjectList(csv.subjects) : Object.keys(SUBJECTS);
  const add = wanted.filter((s) => !current.includes(s));
  return add.length ? { kind: "add", add, next: [...current, ...add].join(",") } : { kind: "same" };
}
