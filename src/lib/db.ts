import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/** v1과 같은 Supabase 프로젝트. 키는 서버에서만 쓴다(NEXT_PUBLIC_ 금지). */
let client: SupabaseClient | null = null;

export function db(): SupabaseClient {
  if (!client) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_KEY;
    if (!url || !key) throw new Error("SUPABASE_URL, SUPABASE_KEY 환경변수를 설정하세요.");
    client = createClient(url, key, { auth: { persistSession: false } });
  }
  return client;
}

/** v1 users 테이블 한 행 (password_hash는 v2에서 추가하는 컬럼) */
export type UserRow = {
  id: string;
  password: string | null;
  password_hash?: string | null;
  role: string;
  name: string;
  grade: number | string | null;
  class: number | string | null;
  programming_grade: number | string | null;
  programming_class: number | string | null;
  subjects: string | null;
};

/** v1 submissions 테이블 한 행 */
export type SubmissionRow = {
  id: number;
  submitted_at: string;
  name: string;
  subject: string;
  problem: string;
  code: string | null;
  description: string | null;
  grade: number | string | null;
  class: number | string | null;
  year: number | null;
  init_code: string | null;
  edit_log: unknown;
  score_function: number | null;
  score_understanding: number | null;
  score_challenge: number | null;
  score_total: number | null;
  feedback: string | null;
  wrong_reason: string | null;
};

type RangeQuery<T> = { range(from: number, to: number): PromiseLike<{ data: T[] | null; error: { message: string } | null }> };

/**
 * 조건에 맞는 행을 모두 가져온다 (v1 db_utils.fetch_all과 같음).
 * Supabase API는 한 번에 최대 1000행만 돌려줘서, 그냥 조회하면 1000건 넘는 데이터가 조용히 잘린다.
 * makeQuery는 호출할 때마다 새 조회를 만들어야 하고, 페이지가 어긋나지 않게 정렬(마지막에 id)을 넣어 둔다.
 */
export async function fetchAll<T>(makeQuery: () => RangeQuery<T>, pageSize = 1000): Promise<T[]> {
  const rows: T[] = [];
  for (;;) {
    const { data, error } = await makeQuery().range(rows.length, rows.length + pageSize - 1);
    if (error) throw new Error(`조회 실패: ${error.message}`);
    if (!data?.length) return rows;
    rows.push(...data); // 서버 최대 행 수가 pageSize보다 작아도 빠짐없이 이어서 받는다
  }
}
