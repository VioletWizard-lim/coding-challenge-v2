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

/** 사이트·DB 상태: /api/health가 매일 남기는 마지막 확인 시각 (Supabase 일시정지 방지 확인용) */
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
      <h2 className="font-bold">{healthy ? "✅ 사이트 상태 정상" : "⚠️ 사이트 상태 확인 필요"}</h2>
      <p className="mt-1 text-sm text-muted">
        {status?.checkedAt && hours !== null
          ? `마지막 상태 확인: ${timeFormat.format(new Date(status.checkedAt))} (${ago(hours)})`
          : "아직 상태 확인 기록이 없어요."}
      </p>
      {!healthy && (
        <p className="mt-2 text-sm text-amber-800">
          매일 새벽 3시에 자동으로 DB를 확인해요. 하루 넘게 기록이 없으면 Vercel → Settings → Cron Jobs에서
          /api/health가 켜져 있는지 확인하고 Run을 눌러 보세요. (오래 비워 두면 Supabase가 일시정지될 수 있어요)
        </p>
      )}
    </section>
  );
}
