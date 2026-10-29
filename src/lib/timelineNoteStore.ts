import "server-only";
import { cache } from "react";
import { db, fetchAll } from "./db";
import type { NoteAuthor, NotesBundle, TimelineNote } from "./timelineNotes";

type NoteRow = {
  id: number;
  user_id: string;
  author_role: NoteAuthor;
  submission_id: number;
  at_ms: number;
  note: string;
  created_at: string;
};

/** viewerId: 지금 보는 사람 (자기 메모인지 표시) */
const fromRow = (r: NoteRow, viewerId?: string): TimelineNote => ({
  id: Number(r.id),
  author: r.author_role === "teacher" ? "teacher" : "student",
  mine: viewerId !== undefined && r.user_id === viewerId,
  submissionId: Number(r.submission_id),
  at: Number(r.at_ms),
  text: r.note,
  createdAt: r.created_at,
});

/** timeline_notes 표가 없어서(008 실행 전) 생긴 오류인지 */
const tableMissing = (message: string) => /timeline_notes/.test(message) && /(does not exist|schema cache|not find)/i.test(message);

async function list(makeQuery: Parameters<typeof fetchAll<NoteRow>>[0], viewerId?: string): Promise<NotesBundle> {
  try {
    return { ready: true, notes: (await fetchAll<NoteRow>(makeQuery)).map((r) => fromRow(r, viewerId)) };
  } catch (err) {
    if (!tableMissing(String((err as Error).message))) throw err;
    return { ready: false, notes: [] };
  }
}

/** 제출 하나의 메모·피드백 (기록 시각 순). viewerId: 지금 보는 사람 */
export function listNotesForSubmission(submissionId: number, viewerId: string): Promise<NotesBundle> {
  return list(
    () => db().from("timeline_notes").select("*").eq("submission_id", submissionId).order("at_ms").order("id"),
    viewerId,
  );
}

/** 학생이 직접 남긴 메모 전부 (업적 계산용). 한 번의 화면 요청 안에서는 탭끼리 나눠 쓴다 */
export const listMyNotes = cache(
  (userId: string): Promise<NotesBundle> =>
    list(
      () => db().from("timeline_notes").select("*").eq("user_id", userId).eq("author_role", "student").order("id"),
      userId,
    ),
);

export async function countNotes(submissionId: number): Promise<number> {
  const { count, error } = await db()
    .from("timeline_notes")
    .select("id", { count: "exact", head: true })
    .eq("submission_id", submissionId);
  if (error) throw new Error(`메모 수 조회 실패: ${error.message}`);
  return count ?? 0;
}

export async function insertNote(
  userId: string,
  author: NoteAuthor,
  submissionId: number,
  at: number,
  text: string,
): Promise<TimelineNote> {
  const { data, error } = await db()
    .from("timeline_notes")
    .insert({ user_id: userId, author_role: author, submission_id: submissionId, at_ms: Math.round(at), note: text })
    .select("*")
    .single<NoteRow>();
  if (error) throw new Error(`메모 저장 실패: ${error.message}`);
  return fromRow(data, userId);
}

/** 내 메모만 고친다. 고쳐졌으면 그 메모를, 없거나 남의 것이면 null */
export async function updateNote(userId: string, id: number, text: string): Promise<TimelineNote | null> {
  const { data, error } = await db()
    .from("timeline_notes")
    .update({ note: text, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", userId)
    .select("*");
  if (error) throw new Error(`메모 고치기 실패: ${error.message}`);
  const row = (data as NoteRow[] | null)?.[0];
  return row ? fromRow(row, userId) : null;
}

/** 내 메모만 지운다 */
export async function deleteNote(userId: string, id: number): Promise<boolean> {
  const { data, error } = await db().from("timeline_notes").delete().eq("id", id).eq("user_id", userId).select("id");
  if (error) throw new Error(`메모 지우기 실패: ${error.message}`);
  return (data ?? []).length > 0;
}
