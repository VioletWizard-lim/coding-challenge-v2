import { db } from "@/lib/db";

/**
 * 상태 확인: DB에 가벼운 조회 1건을 해서 Supabase 무료 프로젝트가 일시정지되지 않게 한다.
 * Vercel Cron이 하루 한 번 호출한다(vercel.json). CRON_SECRET을 설정하면 Vercel이
 * "Authorization: Bearer <CRON_SECRET>" 헤더를 붙여 보낸다.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const { error } = await db().from("users").select("id").limit(1);
  if (error) {
    console.error("health: DB 조회 실패", error.message);
    return Response.json({ ok: false, db: false }, { status: 503 });
  }

  const checkedAt = new Date().toISOString();
  // 마지막 확인 시각 기록 (002_app_status.sql 실행 전이면 건너뜀)
  const { error: statusError } = await db()
    .from("app_status")
    .upsert({ key: "health", value: { ok: true, db: true }, updated_at: checkedAt });
  if (statusError) console.warn("health: app_status 기록 건너뜀", statusError.message);

  return Response.json({ ok: true, db: true, checkedAt });
}
