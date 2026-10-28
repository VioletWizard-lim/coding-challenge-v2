import "server-only";
import { db, fetchAll, type SubmissionRow, type UserRow } from "./db";
import type { LogEvent } from "./editLog";

type Profile = Pick<UserRow, "name" | "grade" | "class" | "programming_grade" | "programming_class">;

/** 과목이 "프로그래밍"이면 프로그래밍 수업 반(없으면 원래 반)을 넣는다 (v1과 같음). */
export function gradeClassFor(profile: Profile, subject: string) {
  if (subject === "프로그래밍") {
    return {
      grade: profile.programming_grade ?? profile.grade,
      class: profile.programming_class ?? profile.class,
    };
  }
  return { grade: profile.grade, class: profile.class };
}

/** 한국 시간 기준 올해 */
const koreanYear = () => Number(new Intl.DateTimeFormat("en", { timeZone: "Asia/Seoul", year: "numeric" }).format(new Date()));

/** v1과 같은 모양으로 submissions에 한 줄 저장한다. v1 교사 화면에서 그대로 채점·재생할 수 있다. */
export async function insertSubmission(input: {
  profile: Profile;
  subject: string;
  problem: string;
  code: string;
  description: string;
  initCode: string;
  editLog: LogEvent[];
}) {
  const { error } = await db()
    .from("submissions")
    .insert({
      name: input.profile.name,
      subject: input.subject,
      problem: input.problem,
      code: input.code,
      description: input.description,
      ...gradeClassFor(input.profile, input.subject),
      year: koreanYear(),
      init_code: input.initCode,
      edit_log: input.editLog,
    });
  if (error) throw new Error(`제출 저장 실패: ${error.message}`);
}

export type MySubmission = Omit<SubmissionRow, "edit_log" | "init_code" | "name" | "grade" | "class" | "year">;

/** 내 제출 목록 (v1처럼 이름으로 찾는다). 작성 기록(edit_log)은 무거워서 빼고 가져온다. */
export function listMySubmissions(name: string): Promise<MySubmission[]> {
  return fetchAll<MySubmission>(() =>
    db()
      .from("submissions")
      .select(
        "id, submitted_at, subject, problem, code, description, score_function, score_understanding, score_challenge, score_total, feedback, wrong_reason",
      )
      .eq("name", name)
      .order("submitted_at", { ascending: false })
      .order("id", { ascending: false }),
  );
}

export type ReplayData = { init: string; code: string; log: unknown };

/** 재생용 기록. 이름이 같은 제출만 돌려준다(학생은 자기 제출만). 없거나 남의 것이면 null. */
export async function getReplayData(submissionId: number, name: string): Promise<ReplayData | null> {
  const { data, error } = await db()
    .from("submissions")
    .select("name, code, init_code, edit_log")
    .eq("id", submissionId)
    .eq("name", name)
    .maybeSingle<Pick<SubmissionRow, "name" | "code" | "init_code" | "edit_log">>();
  if (error) throw new Error(`기록 조회 실패: ${error.message}`);
  if (!data) return null;
  return { init: data.init_code ?? "", code: data.code ?? "", log: data.edit_log ?? [] };
}
