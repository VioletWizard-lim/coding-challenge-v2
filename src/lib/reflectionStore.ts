import "server-only";
import { cache } from "react";
import { db, fetchAll, type UserRow } from "./db";
import { kstDate } from "./journey";
import type { Reflection, ReflectionInput } from "./reflection";
import { gradeClassFor } from "./problems";

type ReflectionRow = {
  user_id: string;
  subject: string;
  class_date: string;
  grade: string | null;
  class: string | null;
  hardest_problem: string;
  hardest_reason: string;
  ai_questions: string;
  key_concepts: string;
  updated_at: string;
};

const fromRow = (r: ReflectionRow): Reflection => ({
  userId: r.user_id,
  subject: r.subject,
  classDate: r.class_date,
  grade: r.grade,
  class: r.class,
  hardestProblem: r.hardest_problem ?? "",
  hardestReason: r.hardest_reason ?? "",
  aiQuestions: r.ai_questions ?? "",
  keyConcepts: r.key_concepts ?? "",
  updatedAt: r.updated_at,
});

/** reflections 표가 없어서(006_reflections.sql 실행 전) 생긴 오류인지 */
const tableMissing = (message: string) => /reflections/.test(message) && /(does not exist|schema cache|not find)/i.test(message);

export type ReflectionList = { ready: boolean; reflections: Reflection[] };

async function list(makeQuery: Parameters<typeof fetchAll<ReflectionRow>>[0]): Promise<ReflectionList> {
  try {
    return { ready: true, reflections: (await fetchAll<ReflectionRow>(makeQuery)).map(fromRow) };
  } catch (err) {
    if (!tableMissing(String((err as Error).message))) throw err;
    return { ready: false, reflections: [] };
  }
}

/** 내가 쓴 성찰 전부 (최근 날짜부터). 한 번의 화면 요청 안에서는 탭끼리 같은 결과를 나눠 쓴다(cache) */
export const listMyReflections = cache(
  (userId: string): Promise<ReflectionList> =>
    list(() =>
      db()
        .from("reflections")
        .select("*")
        .eq("user_id", userId)
        .order("class_date", { ascending: false })
        .order("id", { ascending: false }),
    ),
);

/** 교사용: 한 날짜·과목의 성찰 전부 */
export function listReflectionsByDate(classDate: string, subject: string): Promise<ReflectionList> {
  return list(() =>
    db().from("reflections").select("*").eq("class_date", classDate).eq("subject", subject).order("id"),
  );
}

type Profile = Pick<UserRow, "id" | "name" | "grade" | "class" | "programming_grade" | "programming_class">;

/** 오늘(한국 시간) 성찰을 저장한다. 같은 날·과목에 이미 썼으면 고쳐 쓴다 */
export async function saveTodayReflection(profile: Profile, input: ReflectionInput): Promise<Reflection> {
  const { grade, class: cls } = gradeClassFor(profile, input.subject);
  const { data, error } = await db()
    .from("reflections")
    .upsert(
      {
        user_id: profile.id,
        subject: input.subject,
        class_date: kstDate(new Date()),
        grade: grade === null ? null : String(grade),
        class: cls === null ? null : String(cls),
        hardest_problem: input.hardestProblem,
        hardest_reason: input.hardestReason,
        ai_questions: input.aiQuestions,
        key_concepts: input.keyConcepts,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,subject,class_date" },
    )
    .select("*")
    .single<ReflectionRow>();
  if (error) throw new Error(`성찰 저장 실패: ${error.message}`);
  return fromRow(data);
}

export type ReflectionDay = { userId: string; subject: string; classDate: string; grade: string | null; class: string | null };

/** 교사용: 누가 어느 날·과목에 성찰을 썼는지만 (날짜 고르기 목록을 '쓴 날'로만 채우려고) */
export async function listReflectionDays(): Promise<{ ready: boolean; days: ReflectionDay[] }> {
  try {
    const rows = await fetchAll<{ user_id: string; subject: string; class_date: string; grade: string | null; class: string | null }>(
      () => db().from("reflections").select("user_id, subject, class_date, grade, class").order("id"),
    );
    return {
      ready: true,
      days: rows.map((r) => ({ userId: r.user_id, subject: r.subject, classDate: r.class_date, grade: r.grade, class: r.class })),
    };
  } catch (err) {
    if (!tableMissing(String((err as Error).message))) throw err;
    return { ready: false, days: [] };
  }
}
