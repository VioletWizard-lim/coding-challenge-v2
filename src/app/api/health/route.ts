import { db } from "@/lib/db";

/**
 * DB 연결 확인: 가벼운 조회 1건을 하고 그 시각을 남긴다 (교사 화면의 "DB 연결 정상" 카드).
 * 무료 Supabase였다면 일시정지도 막아 주지만, 지금 DB는 Pro 요금제라 연결 점검용이다.
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
