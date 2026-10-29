import { getHealthStatus, type HealthStatus } from "@/lib/teacher";

const timeFormat = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  month: "long",
  day: "numeric",
  weekday: "short",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

const STALE_HOURS = 36; // 하루 1회 확인이므로 이보다 오래되면 Cron이 멈춘 것

function ago(hours: number) {
  if (hours < 1) return "방금 전";
  if (hours < 24) return `${Math.floor(hours)}시간 전`;
  return `${Math.floor(hours / 24)}일 전`;
}

/** DB 연결 상태: /api/health가 매일 남기는 마지막 연결 확인 시각 (수업 전에 DB 문제를 미리 알아채기 위함) */
export default async function HealthCard() {
  let status: HealthStatus | null = null;
  try {
    status = await getHealthStatus();
  } catch (err) {
    console.error(err);
  }
  const hours = status?.ageHours ?? null;
  const healthy = status?.ok && hours !== null && hours < STALE_HOURS;

  return (
    <section className={`rounded-xl border bg-white p-5 ${healthy ? "border-line" : "border-amber-300"}`}>
      <h2 className="font-bold">{healthy ? "✅ DB 연결 정상" : "⚠️ DB 연결 확인 필요"}</h2>
      <p className="mt-1 text-sm text-muted">
        {status?.checkedAt && hours !== null
          ? `마지막 연결 확인: ${timeFormat.format(new Date(status.checkedAt))} (${ago(hours)})`
          : "아직 연결 확인 기록이 없어요."}
      </p>
      {!healthy && (
        <p className="mt-2 text-sm text-amber-800">
          매일 새벽 3시쯤 자동으로 DB 연결을 확인해요. 마지막 확인이 하루 넘게 지났으면 Vercel → Settings → Cron
          Jobs에서 /api/health의 Run을 눌러 보세요. 그래도 이 안내가 계속 보이면 Supabase 대시보드에서 프로젝트가
          켜져 있는지, Vercel 환경변수(SUPABASE_URL, SUPABASE_KEY)가 맞는지 확인해 주세요.
        </p>
      )}
    </section>
  );
}
