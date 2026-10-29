import "server-only";
import { cache } from "react";
import type { AchievementSubmission } from "./achievements";
import { db, fetchAll, type RangeQuery, type SubmissionRow, type UserRow } from "./db";
import type { LogEvent } from "./editLog";
import { kstDate, summarizeSubmission, type SubmissionSummary } from "./journey";
import { gradeClassFor } from "./problems";

type Profile = Pick<UserRow, "name" | "grade" | "class" | "programming_grade" | "programming_class">;

/** 제출의 주인을 가리는 데 쓰는 학생 정보 */
export type Owner = Pick<UserRow, "id" | "name" | "grade" | "class" | "programming_grade" | "programming_class">;

// ── 내 제출 찾기 ──────────────────────────────────────────────
// v2는 제출에 user_id를 남기고 그것으로 찾는다(009 SQL). user_id가 비어 있는 제출(지난 제출, v1 제출)은
// v1처럼 이름으로 찾되, 같은 이름의 학생(동명이인)이 있으면 제출할 때의 반까지 맞아야 내 것으로 본다.

let userIdColumn: { ok: boolean; checkedAt: number } | null = null;

/** submissions.user_id 칸이 있는지 (009 실행 여부). 없으면 5분마다 다시 확인 */
async function hasUserIdColumn(): Promise<boolean> {
  if (userIdColumn && (userIdColumn.ok || Date.now() - userIdColumn.checkedAt < 5 * 60_000)) return userIdColumn.ok;
  const { error } = await db().from("submissions").select("user_id").limit(1);
  if (error && !/user_id/.test(error.message)) throw new Error(`제출 조회 실패: ${error.message}`);
  userIdColumn = { ok: !error, checkedAt: Date.now() };
  return userIdColumn.ok;
}

/** 나 말고 같은 이름의 학생이 있는지 (한 번의 화면 요청 안에서는 한 번만 조회) */
const hasNamesake = cache(async (id: string, name: string): Promise<boolean> => {
  const { count, error } = await db()
    .from("users")
    .select("id", { count: "exact", head: true })
    .eq("role", "student")
    .eq("name", name)
    .neq("id", id);
  if (error) throw new Error(`동명이인 확인 실패: ${error.message}`);
  return (count ?? 0) > 0;
});

const same = (a: unknown, b: unknown) => a !== null && a !== undefined && String(a) === String(b);

type OwnedRow = { user_id?: string | null; name: string; grade: number | string | null; class: number | string | null };

/** 이 제출이 이 학생 것인지 */
function isMine(row: OwnedRow, owner: Owner, namesake: boolean): boolean {
  if (row.user_id) return row.user_id === owner.id;
  if (row.name !== owner.name) return false;
  if (!namesake) return true;
  return (
    (same(row.grade, owner.grade) && same(row.class, owner.class)) ||
    (same(row.grade, owner.programming_grade) && same(row.class, owner.programming_class))
  );
}

/** PostgREST or 필터 안에 넣을 값 (쉼표·괄호가 있어도 되게 따옴표로) */
const quoted = (v: string) => `"${v.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;

type Filterable = { eq(column: string, value: string): unknown; or(filters: string): unknown };

/** 내 제출만 고르는 조회 조건 + 주인 확인 (조회 뒤 isMine으로 한 번 더 거른다) */
async function ownerFilter(owner: Owner) {
  const [withUserId, namesake] = await Promise.all([hasUserIdColumn(), hasNamesake(owner.id, owner.name)]);
  return {
    /** select에 더할 칸 (string으로 넘겨 supabase-js의 칸 이름 타입 추론을 끈다) */
    columns: (withUserId ? "user_id, name, grade, class" : "name, grade, class") as string,
    apply<Q>(q: Q): Q {
      const b = q as unknown as Filterable;
      return (
        withUserId ? b.or(`user_id.eq.${quoted(owner.id)},and(user_id.is.null,name.eq.${quoted(owner.name)})`) : b.eq("name", owner.name)
      ) as Q;
    },
    mine: (row: OwnedRow) => isMine(row, owner, namesake),
  };
}

/** 한국 시간 기준 올해 */
const koreanYear = () => Number(new Intl.DateTimeFormat("en", { timeZone: "Asia/Seoul", year: "numeric" }).format(new Date()));

/** v1과 같은 모양으로 submissions에 한 줄 저장한다. v1 교사 화면에서 그대로 채점·재생할 수 있다. */
export async function insertSubmission(input: {
  profile: Profile & { id: string };
  subject: string;
  problem: string;
  code: string;
  description: string;
  initCode: string;
  editLog: LogEvent[];
}) {
  const row = {
    name: input.profile.name,
    subject: input.subject,
    problem: input.problem,
    code: input.code,
    description: input.description,
    ...gradeClassFor(input.profile, input.subject),
    year: koreanYear(),
    init_code: input.initCode,
    edit_log: input.editLog,
  };
  let { error } = await db()
    .from("submissions")
    .insert((await hasUserIdColumn()) ? ({ ...row, user_id: input.profile.id } as typeof row) : row);
  if (error && /user_id/.test(error.message)) {
    // user_id 칸이 없다고 하면(기억이 틀렸을 때) 다시 확인하고 아이디 없이 저장한다
    userIdColumn = null;
    ({ error } = await db().from("submissions").insert(row));
  }
  if (error) throw new Error(`제출 저장 실패: ${error.message}`);
}

export type MySubmission = Omit<SubmissionRow, "edit_log" | "init_code" | "name" | "grade" | "class" | "year">;

/** 내 제출 목록. 작성 기록(edit_log)은 무거워서 빼고 가져온다. */
export async function listMySubmissions(owner: Owner): Promise<MySubmission[]> {
  const f = await ownerFilter(owner);
  const rows = await fetchAll<MySubmission & OwnedRow>(() =>
    f
      .apply(
        db()
          .from("submissions")
          .select(
            ["id, submitted_at, subject, problem, code, description, score_function, score_understanding, score_challenge, score_total, feedback, wrong_reason", f.columns].join(", "),
          ),
      )
      .order("submitted_at", { ascending: false })
      .order("id", { ascending: false }) as unknown as RangeQuery<MySubmission & OwnedRow>,
  );
  // 주인 확인용 칸(user_id·name·반)은 화면으로 보내지 않는다
  return rows.filter(f.mine).map((r) => {
    const rest: Partial<MySubmission & OwnedRow> = { ...r };
    delete rest.user_id;
    delete rest.name;
    delete rest.grade;
    delete rest.class;
    return rest as MySubmission;
  });
}

export type ReplayData = { init: string; code: string; log: unknown };

/** 재생용 기록. 내 제출만 돌려준다(학생은 자기 제출만). 없거나 남의 것이면 null. */
export async function getReplayData(submissionId: number, owner: Owner): Promise<ReplayData | null> {
  const f = await ownerFilter(owner);
  const { data, error } = await db()
    .from("submissions")
    .select(["code, init_code, edit_log", f.columns].join(", "))
    .eq("id", submissionId)
    .maybeSingle<Pick<SubmissionRow, "code" | "init_code" | "edit_log"> & OwnedRow>();
  if (error) throw new Error(`기록 조회 실패: ${error.message}`);
  if (!data || !f.mine(data)) return null;
  return { init: data.init_code ?? "", code: data.code ?? "", log: data.edit_log ?? [] };
}

/** 이 제출이 이 학생 것인지 (메모를 남길 때 확인용) */
export async function isMySubmission(submissionId: number, owner: Owner): Promise<boolean> {
  const f = await ownerFilter(owner);
  const { data, error } = await db().from("submissions").select(f.columns).eq("id", submissionId).maybeSingle<OwnedRow>();
  if (error) throw new Error(`제출 조회 실패: ${error.message}`);
  return !!data && f.mine(data);
}

/** 제출이 있는지 (교사 피드백을 남길 때 확인용) */
export async function submissionExists(submissionId: number): Promise<boolean> {
  const { data, error } = await db().from("submissions").select("id").eq("id", submissionId).maybeSingle();
  if (error) throw new Error(`제출 조회 실패: ${error.message}`);
  return !!data;
}

/** 교사용 재생 기록: 어느 학생의 제출이든 id로 연다 (교사 확인은 부르는 쪽에서) */
export async function getReplayDataById(submissionId: number): Promise<ReplayData | null> {
  const { data, error } = await db()
    .from("submissions")
    .select("code, init_code, edit_log")
    .eq("id", submissionId)
    .maybeSingle<Pick<SubmissionRow, "code" | "init_code" | "edit_log">>();
  if (error) throw new Error(`기록 조회 실패: ${error.message}`);
  if (!data) return null;
  return { init: data.init_code ?? "", code: data.code ?? "", log: data.edit_log ?? [] };
}

type JourneyRow = Pick<
  SubmissionRow,
  "id" | "subject" | "problem" | "submitted_at" | "init_code" | "edit_log" | "code" | "wrong_reason" | "score_total"
>;

/**
 * 학습 여정·업적용: 내 제출을 작성 기록까지 읽어 서버에서 요약만 만든다(무거운 기록은 브라우저로 보내지 않음).
 * 기록이 커서 100건씩 나눠 받는다. 한 번의 화면 요청 안에서는 학습 여정·업적·첫 화면 탭이 같은 결과를 나눠 쓴다(cache).
 */
export function getMyJourneyData(owner: Owner) {
  return journeyData(owner.id, owner.name, owner.grade, owner.class, owner.programming_grade, owner.programming_class);
}

// cache는 인자 값이 같아야 결과를 나눠 쓰므로 학생 정보를 낱낱의 값으로 넘긴다
const journeyData = cache(
  async (
    id: string,
    name: string,
    grade: Owner["grade"],
    cls: Owner["class"],
    programmingGrade: Owner["programming_grade"],
    programmingClass: Owner["programming_class"],
  ): Promise<{ summaries: SubmissionSummary[]; records: AchievementSubmission[]; today: string }> => {
    const owner: Owner = { id, name, grade, class: cls, programming_grade: programmingGrade, programming_class: programmingClass };
    const f = await ownerFilter(owner);
    const all = await fetchAll<JourneyRow & OwnedRow>(
      () =>
        f
          .apply(
            db()
              .from("submissions")
              .select(["id, subject, problem, submitted_at, init_code, edit_log, code, wrong_reason, score_total", f.columns].join(", ")),
          )
          .order("submitted_at", { ascending: false })
          .order("id", { ascending: false }) as unknown as RangeQuery<JourneyRow & OwnedRow>,
      100,
    );
    const rows = all.filter(f.mine);
    const summaries = rows.map(summarizeSubmission);
    const records = rows.map((r, i): AchievementSubmission => {
      const s = summaries[i];
      return {
        id: r.id,
        subject: r.subject,
        problem: r.problem,
        submittedAt: r.submitted_at,
        date: s.date,
        log: r.edit_log,
        code: r.code ?? "",
        wrongReason: r.wrong_reason,
        scoreTotal: r.score_total,
        hasLog: s.hasLog,
        typedChars: s.typedChars,
        pasteCount: s.stats.pasteCount,
        editCount: s.editCount,
      };
    });
    return { summaries, records, today: kstDate(new Date()) };
  },
);

/** 오늘(한국 시간) 내가 제출한 문제 번호들 (과목별, 처음 제출한 순서) */
export async function todaysSubmittedProblems(owner: Owner): Promise<Record<string, string[]>> {
  const today = kstDate(new Date());
  const f = await ownerFilter(owner);
  const rows = await fetchAll<{ id: number; subject: string; problem: string } & OwnedRow>(
    () =>
      f
        .apply(db().from("submissions").select(["id, subject, problem", f.columns].join(", ")))
        .gte("submitted_at", `${today}T00:00:00+09:00`)
        .order("id") as unknown as RangeQuery<{ id: number; subject: string; problem: string } & OwnedRow>,
  );
  const bySubject: Record<string, string[]> = {};
  for (const r of rows.filter(f.mine)) {
    const list = (bySubject[r.subject] ??= []);
    if (!list.includes(r.problem)) list.push(r.problem);
  }
  return bySubject;
}
