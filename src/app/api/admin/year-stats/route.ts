import { getSession } from "@/lib/session";
import { statsCsv } from "@/lib/yearEnd";
import { computeYearStats, listYearStats } from "@/lib/yearEndStore";

export const maxDuration = 300;

/**
 * 학년도별 이름 없는 통계 CSV (관리자·교사). 남겨 둔 통계가 있으면 그것을, 없으면 지금 기록으로 계산해서.
 * 이름·아이디는 담지 않는다 (월 × 과목 × 반의 숫자만).
 */
export async function GET(request: Request) {
  const session = await getSession();
  if (!session || (session.role !== "admin" && session.role !== "teacher")) return new Response("다시 로그인하세요.", { status: 401 });
  const year = Number(new URL(request.url).searchParams.get("year"));
  if (!Number.isInteger(year) || year < 2020 || year > 2100) return new Response("학년도를 고르세요.", { status: 400 });
  try {
    const saved = (await listYearStats()).years.find((y) => y.year === year);
    const rows = saved?.rows ?? (await computeYearStats(year));
    const name = `${year}학년도_이름없는통계.csv`;
    return new Response("﻿" + statsCsv(rows), {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="line-by-line-${year}-stats.csv"; filename*=UTF-8''${encodeURIComponent(name)}`,
        "cache-control": "no-store",
      },
    });
  } catch (err) {
    console.error("통계 내보내기 오류:", err);
    return new Response("통계를 만들지 못했어요. 잠시 후 다시 시도하세요.", { status: 500 });
  }
}
