import "server-only";
import { db } from "./db";

/** 학생 삭제 요청: 교사가 요청하고 관리자가 처리한다 (020) */
export type DeleteRequest = {
  id: number;
  studentId: string;
  studentName: string;
  reason: string;
  requestedBy: string;
  status: "pending" | "done" | "rejected" | "canceled";
  handledBy: string | null;
  handledNote: string;
  createdAt: string;
  handledAt: string | null;
};

type Row = {
  id: number;
  student_id: string;
  student_name: string;
  reason: string;
  requested_by: string;
  status: string;
  handled_by: string | null;
  handled_note: string;
  created_at: string;
  handled_at: string | null;
};

const fromRow = (r: Row): DeleteRequest => ({
  id: Number(r.id),
  studentId: r.student_id,
  studentName: r.student_name,
  reason: r.reason,
  requestedBy: r.requested_by,
  status: (["pending", "done", "rejected", "canceled"].includes(r.status) ? r.status : "pending") as DeleteRequest["status"],
  handledBy: r.handled_by,
  handledNote: r.handled_note ?? "",
  createdAt: r.created_at,
  handledAt: r.handled_at,
});

const tableMissing = (m: string) => /student_delete_requests/.test(m) && /(does not exist|schema cache|not find)/i.test(m);
export class DeleteRequestsNotReadyError extends Error {}
function check(error: { message: string } | null, what: string) {
  if (!error) return;
  if (tableMissing(error.message)) throw new DeleteRequestsNotReadyError(error.message);
  throw new Error(`${what}: ${error.message}`);
}

/** 요청 목록 (최근 것부터). 표가 없으면 ready=false */
export async function listDeleteRequests(limit = 100): Promise<{ ready: boolean; requests: DeleteRequest[] }> {
  const { data, error } = await db().from("student_delete_requests").select("*").order("id", { ascending: false }).limit(limit);
  if (error && tableMissing(error.message)) return { ready: false, requests: [] };
  check(error, "삭제 요청 조회 실패");
  return { ready: true, requests: ((data ?? []) as Row[]).map(fromRow) };
}

export async function getDeleteRequest(id: number): Promise<DeleteRequest | null> {
  const { data, error } = await db().from("student_delete_requests").select("*").eq("id", id).maybeSingle<Row>();
  check(error, "삭제 요청 조회 실패");
  return data ? fromRow(data) : null;
}

/** 요청 만들기 (같은 학생에 기다리는 요청이 있으면 그것을 돌려줌) */
export async function createDeleteRequest(studentId: string, studentName: string, reason: string, teacherId: string): Promise<DeleteRequest> {
  const { data: open, error: e1 } = await db()
    .from("student_delete_requests")
    .select("*")
    .eq("student_id", studentId)
    .eq("status", "pending")
    .maybeSingle<Row>();
  check(e1, "삭제 요청 확인 실패");
  if (open) return fromRow(open);
  const { data, error } = await db()
    .from("student_delete_requests")
    .insert({ student_id: studentId, student_name: studentName, reason, requested_by: teacherId })
    .select("*")
    .single<Row>();
  check(error, "삭제 요청 저장 실패");
  return fromRow(data!);
}

/** 상태 바꾸기: 취소(요청한 교사만), 처리 완료·거절(관리자) */
export async function setRequestStatus(
  id: number,
  status: "done" | "rejected" | "canceled",
  by: string,
  note = "",
  onlyRequester?: string,
): Promise<boolean> {
  let q = db()
    .from("student_delete_requests")
    .update({ status, handled_by: by, handled_note: note, handled_at: new Date().toISOString() })
    .eq("id", id)
    .eq("status", "pending");
  if (onlyRequester) q = q.eq("requested_by", onlyRequester);
  const { data, error } = await q.select("id");
  check(error, "삭제 요청 처리 실패");
  return (data ?? []).length > 0;
}
