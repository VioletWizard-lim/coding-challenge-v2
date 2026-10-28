"use server";

import { refresh } from "next/cache";
import { randomInt } from "node:crypto";
import { getSession } from "@/lib/session";
import { parseStudentCsv, type ParsedRow } from "@/lib/studentCsv";
import { createStudents, findExistingIds, resetStudentPassword } from "@/lib/teacher";

export type ResetResult = { ok: true; password: string } | { ok: false; message: string };

/** 임의의 숫자 6자리 (000000~999999) */
const newPassword = () => String(randomInt(0, 1_000_000)).padStart(6, "0");

/** 모든 교사용 서버 액션은 이것으로 로그인·역할을 다시 확인한다 */
const isTeacher = async () => (await getSession())?.role === "teacher";

/** 교사가 학생 비밀번호를 임의의 숫자 6자리로 새로 만든다. 만든 비밀번호는 이때 한 번만 보여 준다. */
export async function resetPassword(studentId: string): Promise<ResetResult> {
  if (!(await isTeacher())) return { ok: false, message: "교사 계정으로 다시 로그인하세요." };

  const id = String(studentId ?? "").trim();
  if (!id) return { ok: false, message: "학생을 고르세요." };

  const password = newPassword();
  try {
    const changed = await resetStudentPassword(id, password);
    if (!changed) return { ok: false, message: "그 학번의 학생 계정을 찾지 못했어요." };
  } catch (err) {
    console.error("비밀번호 초기화 오류:", err);
    return { ok: false, message: "저장하지 못했어요. 잠시 후 다시 시도하세요." };
  }
  return { ok: true, password };
}

export type PreviewRow = ParsedRow & { exists: boolean };
export type PreviewResult = { ok: true; rows: PreviewRow[] } | { ok: false; message: string };

/** CSV 미리보기: 줄마다 오류와, 이미 있는 학번인지 알려 준다. 아직 아무것도 저장하지 않는다. */
export async function previewStudents(csvText: string): Promise<PreviewResult> {
  if (!(await isTeacher())) return { ok: false, message: "교사 계정으로 다시 로그인하세요." };
  const parsed = parseStudentCsv(String(csvText ?? ""));
  if (parsed.error) return { ok: false, message: parsed.error };
  try {
    const existing = await findExistingIds(parsed.rows.map((r) => r.student.id).filter(Boolean));
    return { ok: true, rows: parsed.rows.map((r) => ({ ...r, exists: existing.has(r.student.id) })) };
  } catch (err) {
    console.error("CSV 미리보기 오류:", err);
    return { ok: false, message: "학번을 확인하지 못했어요. 잠시 후 다시 시도하세요." };
  }
}

export type ImportResult =
  | {
      ok: true;
      created: { id: string; name: string; password: string; generated: boolean }[];
      skipped: { line: number; id: string; reason: string }[];
    }
  | { ok: false; message: string };

/**
 * CSV로 학생 계정을 만든다. 미리보기와 같은 검사를 서버에서 다시 하고,
 * 오류 줄과 이미 있는 학번은 건너뛴다(기존 계정은 절대 바꾸지 않음).
 * 비밀번호를 비운 학생은 숫자 6자리를 만들어 준다.
 */
export async function importStudents(csvText: string): Promise<ImportResult> {
  if (!(await isTeacher())) return { ok: false, message: "교사 계정으로 다시 로그인하세요." };
  const parsed = parseStudentCsv(String(csvText ?? ""));
  if (parsed.error) return { ok: false, message: parsed.error };

  const skipped: { line: number; id: string; reason: string }[] = [];
  let created: { id: string; name: string; password: string; generated: boolean }[] = [];
  try {
    const existing = await findExistingIds(parsed.rows.map((r) => r.student.id).filter(Boolean));
    const toCreate = parsed.rows.filter((r) => {
      const reason = r.error ?? (existing.has(r.student.id) ? "이미 있는 학번" : null);
      if (reason) skipped.push({ line: r.line, id: r.student.id, reason });
      return !reason;
    });
    const withPasswords = toCreate.map(({ student: s }) => ({
      ...s,
      generated: !s.password,
      password: s.password || newPassword(),
    }));
    const done = withPasswords.length
      ? await createStudents(
          withPasswords.map((s) => ({
            id: s.id,
            name: s.name,
            grade: s.grade,
            class: s.class,
            programming_grade: s.programmingGrade,
            programming_class: s.programmingClass,
            subjects: s.subjects,
            password: s.password,
          })),
        )
      : new Set<string>();
    // 확인과 등록 사이에 누가 같은 학번을 만들었으면 건너뛴 것으로 알려 준다
    for (const [i, s] of withPasswords.entries()) {
      if (!done.has(s.id)) skipped.push({ line: toCreate[i].line, id: s.id, reason: "이미 있는 학번" });
    }
    created = withPasswords
      .filter((s) => done.has(s.id))
      .map((s) => ({ id: s.id, name: s.name, password: s.password, generated: s.generated }));
  } catch (err) {
    console.error("CSV 등록 오류:", err);
    return { ok: false, message: "등록하지 못했어요. 잠시 후 다시 시도하세요." };
  }

  skipped.sort((a, b) => a.line - b.line);
  if (created.length) refresh(); // 아래 학생 목록을 새로 불러온다
  return { ok: true, created, skipped };
}
