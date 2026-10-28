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
