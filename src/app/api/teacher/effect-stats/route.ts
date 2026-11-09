import { getSession } from "@/lib/session";
import { mergeStatRows, schoolYearOf } from "@/lib/yearEnd";
import { computeYearStats, listYearStats } from "@/lib/yearEndStore";

export const maxDuration = 300;

/**
 * 📈 수업 효과 화면의 이름 없는 통계 (교사·관리자). 이름·아이디는 담지 않는다 (월 × 과목 × 반의 숫자만).
 * - year 없이: 고를 수 있는 학년도 (올해·지난해 + 학년도 말 정리 때 남겨 둔 해)
 * - ?year=2026: 지금 남은 기록으로 계산하고, 학년도 말 정리 때 남겨 둔 통계(지운 반의 숫자)와 합쳐서.
 *   작성 기록을 모두 읽으므로 시간이 걸릴 수 있다
 */
export async function GET(request: Request) {
  const session = await getSession();
  if (!session || (session.role !== "admin" && session.role !== "teacher")) return Response.json({ error: "다시 로그인하세요." }, { status: 401 });
  const raw = new URL(request.url).searchParams.get("year");
  try {
    const saved = await listYearStats();
    if (raw === null) {
      const current = schoolYearOf(new Date());
      const years = [...new Set([current, current - 1, ...saved.years.map((y) => y.year)])].sort((a, b) => b - a);
      return Response.json({ current, years, saved: saved.years.map((y) => y.year) }, { headers: { "cache-control": "no-store" } });
    }
    const year = Number(raw);
    if (!Number.isInteger(year) || year < 2020 || year > 2100) return Response.json({ error: "학년도를 고르세요." }, { status: 400 });
    const kept = saved.years.find((y) => y.year === year);
    const rows = mergeStatRows(kept?.rows ?? [], await computeYearStats(year));
    return Response.json({ year, kept: !!kept, rows }, { headers: { "cache-control": "no-store" } });
  } catch (err) {
    console.error("수업 효과 통계 오류:", err);
    return Response.json({ error: "통계를 만들지 못했어요. 잠시 후 다시 시도하세요." }, { status: 500 });
  }
}
