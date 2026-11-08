/**
 * 반별 현황 (v1 "반별 현황"·"작성 통계"·CSV 내보내기를 옮김). 브라우저·서버 공용 순수 함수. 단위 테스트: classStats.test.ts
 * - 점수 표: 학생 × 문제, 문제마다 채점된(또는 오답 처리된) 가장 최근 제출의 점수. 0점 수 = 표의 문제 칸 중 0이거나 빈 칸
 * - 작성 통계: 문제마다 가장 최근 제출(작성 기록 있는 것)의 기록을 단원(대번호)별로 합산
 * 감시가 아니라 성찰: 숫자는 사실만 보여 주고, 벌주는 표시는 하지 않는다.
 */
import { compareNumber } from "./problemBank";

export type WritingSummary = {
  totalMs: number;
  activeMs: number;
  typed: number;
  pasted: number;
  pasteCount: number;
  editCount: number;
  awayCount: number;
  awayMs: number;
};

export type StatRow = {
  id: number;
  /** 학생을 가리키는 값: 아이디(알면) 또는 이름 */
  key: string;
  studentId: string;
  name: string;
  /** 제출할 때의 학년-반 ("2-3"), 없으면 "" */
  cls: string;
  problem: string;
  submittedAt: string;
  score: number | null;
  wrong: boolean;
  /** 작성 기록 요약 (기록이 없으면 null) */
  writing: WritingSummary | null;
};

export type StudentCell = { key: string; studentId: string; name: string; cls: string };

const byStudent = (a: StudentCell, b: StudentCell) =>
  (a.studentId || "~").localeCompare(b.studentId || "~", "ko", { numeric: true }) || a.name.localeCompare(b.name, "ko");

function students(rows: StatRow[]): StudentCell[] {
  const map = new Map<string, StudentCell>();
  for (const r of [...rows].sort((a, b) => a.submittedAt.localeCompare(b.submittedAt))) {
    map.set(r.key, { key: r.key, studentId: r.studentId, name: r.name, cls: r.cls || map.get(r.key)?.cls || "" });
  }
  return [...map.values()].sort(byStudent);
}

/** (학생, 문제)마다 가장 최근 것 */
function latestBy(rows: StatRow[]): Map<string, StatRow> {
  const latest = new Map<string, StatRow>();
  for (const r of rows) {
    const k = `${r.key}\u0000${r.problem}`;
    const prev = latest.get(k);
    if (!prev || r.submittedAt > prev.submittedAt || (r.submittedAt === prev.submittedAt && r.id > prev.id)) latest.set(k, r);
  }
  return latest;
}

export type ScoreTable = {
  problems: string[];
  rows: (StudentCell & { scores: Record<string, number | null>; total: number; zeros: number })[];
};

/** 점수 표: 채점됐거나 오답 처리된 제출 중 문제마다 가장 최근 것 (오답은 0점) */
export function scoreTable(rows: StatRow[], problemOrder: string[]): ScoreTable {
  const graded = rows.filter((r) => r.score !== null || r.wrong);
  const latest = latestBy(graded);
  const seen = new Set(graded.map((r) => r.problem));
  const problems = [...problemOrder.filter((p) => seen.has(p)), ...[...seen].filter((p) => !problemOrder.includes(p)).sort(compareNumber)];
  return {
    problems,
    rows: students(graded).map((s) => {
      const scores: Record<string, number | null> = {};
      for (const p of problems) {
        const r = latest.get(`${s.key}\u0000${p}`);
        scores[p] = r ? (r.wrong ? 0 : (r.score ?? 0)) : null;
      }
      const values = problems.map((p) => scores[p]);
      return {
        ...s,
        scores,
        total: values.reduce<number>((a, v) => a + (v ?? 0), 0),
        zeros: values.filter((v) => !v).length,
      };
    }),
  };
}

export type WritingMetric = "paste" | "active";
export type WritingTable = {
  units: string[];
  rows: (StudentCell & { values: Record<string, number | null> })[];
  /** 집계한 제출 수 */
  count: number;
};

/** 작성 통계: 문제마다 가장 최근 제출(기록 있는 것)을 단원별·전체로 합산. paste=붙여넣기 비율(%), active=실제 작업 시간(분) */
export function writingTable(rows: StatRow[], metric: WritingMetric): WritingTable {
  const withLog = rows.filter((r) => r.writing);
  const latest = [...latestBy(withLog).values()];
  const agg = new Map<string, { typed: number; pasted: number; activeMs: number }>();
  for (const r of latest) {
    const unit = r.problem.split("-")[0];
    for (const u of [unit, "전체"]) {
      const k = `${r.key}\u0000${u}`;
      const a = agg.get(k) ?? { typed: 0, pasted: 0, activeMs: 0 };
      a.typed += r.writing!.typed;
      a.pasted += r.writing!.pasted;
      a.activeMs += r.writing!.activeMs;
      agg.set(k, a);
    }
  }
  const units = [...new Set(latest.map((r) => r.problem.split("-")[0]))].sort((a, b) => (Number(a) || 999) - (Number(b) || 999));
  const value = (a: { typed: number; pasted: number; activeMs: number } | undefined) => {
    if (!a) return null;
    if (metric === "active") return Math.round(a.activeMs / 6000) / 10;
    const all = a.typed + a.pasted;
    return all ? Math.round((a.pasted / all) * 100) : null;
  };
  return {
    units: ["전체", ...units],
    rows: students(latest).map((s) => ({
      ...s,
      values: Object.fromEntries(["전체", ...units].map((u) => [u, value(agg.get(`${s.key}\u0000${u}`))])),
    })),
    count: latest.length,
  };
}

/* ── CSV ── */

/** 엑셀에서 수식으로 실행되지 않게 =, +, -, @로 시작하는 글 앞에 ' (v1과 같음) */
export const csvSafe = (v: unknown) => {
  if (v === null || v === undefined) return "";
  const s = String(v);
  return typeof v === "string" && /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
};

const quote = (s: string) => (/[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);

/** 표 → CSV 글 (엑셀 한글이 깨지지 않게 BOM을 붙인다) */
export function toCsv(rows: Record<string, unknown>[]): string {
  if (!rows.length) return "﻿";
  const headers = Object.keys(rows[0]);
  const lines = [headers.map(quote).join(","), ...rows.map((r) => headers.map((h) => quote(csvSafe(r[h]))).join(","))];
  return `﻿${lines.join("\r\n")}\r\n`;
}

/** 익명 ID: 학생 순서대로 S001, S002 … */
export function anonIds(rows: StatRow[]): Map<string, string> {
  return new Map(students(rows).map((s, i) => [s.key, `S${String(i + 1).padStart(3, "0")}`]));
}

const kstText = (iso: string) => {
  const d = new Date(new Date(iso).getTime() + 9 * 3_600_000);
  return d.toISOString().slice(0, 19).replace("T", " ");
};

/** 제출물별 요약 CSV 행 (v1과 같은 칸) */
export function summaryCsvRows(rows: StatRow[], subject: string, year: number, anon: boolean): Record<string, unknown>[] {
  const ids = anonIds(rows);
  const latestIds = new Set([...latestBy(rows).values()].map((r) => r.id));
  const sorted = [...rows].sort(
    (a, b) => byStudent(a, b) || a.submittedAt.localeCompare(b.submittedAt),
  );
  return sorted.map((r) => {
    const w = r.writing;
    const typedPaste = w ? w.typed + w.pasted : 0;
    return {
      제출ID: r.id,
      ...(anon ? { 익명ID: ids.get(r.key) } : { 아이디: r.studentId, 이름: r.name, 반: r.cls }),
      과목: subject,
      연도: year,
      문제: r.problem,
      대번호: r.problem.split("-")[0],
      제출시각: kstText(r.submittedAt),
      최신제출: latestIds.has(r.id) ? "Y" : "N",
      "총작성시간(초)": w ? Math.round(w.totalMs / 1000) : "",
      "실제작업시간(초)": w ? Math.round(w.activeMs / 1000) : "",
      "직접입력(자)": w ? w.typed : "",
      "붙여넣기(자)": w ? w.pasted : "",
      붙여넣기횟수: w ? w.pasteCount : "",
      "붙여넣기비율(%)": typedPaste ? Math.round(((w?.pasted ?? 0) / typedPaste) * 100) : "",
      삭제수정횟수: w ? w.editCount : "",
      창이탈횟수: w ? w.awayCount : "",
      "창이탈시간(초)": w ? Math.round(w.awayMs / 1000) : "",
      점수: r.wrong ? "오답" : (r.score ?? ""),
    };
  });
}

const KIND_NAME: Record<string, string> = {
  i: "입력",
  d: "삭제",
  p: "붙여넣기",
  x: "잘라내기",
  u: "되돌리기",
  o: "기타",
  b: "창이탈",
  f: "창복귀",
  q: "AI도움요청",
};

/** 이벤트 원본 로그 CSV 행 (v1과 같은 칸 + 실행·AI 도움 이벤트 이름) */
export function rawLogCsvRows(rows: StatRow[], logs: Map<number, unknown[]>, anon: boolean): Record<string, unknown>[] {
  const ids = anonIds(rows);
  const out: Record<string, unknown>[] = [];
  for (const r of [...rows].sort((a, b) => byStudent(a, b) || a.submittedAt.localeCompare(b.submittedAt))) {
    const log = (logs.get(r.id) ?? []).filter(
      (e): e is unknown[] => Array.isArray(e) && e.length >= 2 && typeof e[0] === "number" && typeof e[1] === "string",
    );
    const t0 = log.length ? (log[0][0] as number) : 0;
    log.forEach((e, i) => {
      const kind = e[1] as string;
      const pos = e.length > 6;
      out.push({
        제출ID: r.id,
        ...(anon ? { 익명ID: ids.get(r.key) } : { 아이디: r.studentId, 이름: r.name }),
        문제: r.problem,
        순번: i + 1,
        "시각(ms)": e[0],
        "경과(초)": Math.round(((e[0] as number) - t0)) / 1000,
        종류: kind,
        종류명: KIND_NAME[kind] ?? (kind === "r:ok" ? "실행성공" : kind.startsWith("r:") ? `실행오류(${kind.slice(2)})` : kind),
        시작줄: pos ? e[2] : "",
        시작칸: pos ? e[3] : "",
        끝줄: pos ? e[4] : "",
        끝칸: pos ? e[5] : "",
        텍스트: pos && typeof e[6] === "string" ? e[6] : "",
      });
    });
  }
  return out;
}
