import { rawLogCsvRows, summaryCsvRows, toCsv } from "@/lib/classStats";
import { loadStatRows } from "@/lib/classStatsStore";
import { SUBJECTS } from "@/lib/problems";
import { getSession } from "@/lib/session";

export const maxDuration = 120;

/**
 * 반별 현황 CSV 내보내기 (교사만). kind=summary: 제출물별 요약, kind=raw: 이벤트 원본 로그.
 * anon=1이면 이름·아이디·반 대신 익명 ID(S001…)로 (연구용).
 */
export async function GET(request: Request) {
  const session = await getSession();
  if (!session || session.role !== "teacher") return new Response("교사 계정으로 다시 로그인하세요.", { status: 401 });
  const url = new URL(request.url);
  const subject = url.searchParams.get("subject") ?? "";
  const year = Number(url.searchParams.get("year"));
  const cls = url.searchParams.get("cls") ?? "";
  const anon = url.searchParams.get("anon") === "1";
  const kind = url.searchParams.get("kind") === "raw" ? "raw" : "summary";
  if (!(subject in SUBJECTS) || !Number.isInteger(year)) return new Response("과목·연도를 고르세요.", { status: 400 });

  try {
    const { rows: all, logs } = await loadStatRows(subject, year, kind === "raw");
    const rows = cls ? all.filter((r) => r.cls === cls) : all;
    const csv = toCsv(kind === "raw" ? rawLogCsvRows(rows, logs, anon) : summaryCsvRows(rows, subject, year, anon));
    const name = `작성기록_${year}_${subject}_${cls ? `${cls}반` : "전체"}${anon ? "_익명" : ""}_${kind === "raw" ? "원본로그" : "요약"}.csv`;
    return new Response(csv, {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        // 한글 파일 이름(filename*)과, 그것을 못 읽는 브라우저를 위한 영문 이름
        "content-disposition": `attachment; filename="line-by-line-${year}-${kind}${anon ? "-anon" : ""}.csv"; filename*=UTF-8''${encodeURIComponent(name)}`,
        "cache-control": "no-store",
      },
    });
  } catch (err) {
    console.error("CSV 내보내기 오류:", err);
    return new Response("내보내지 못했어요. 잠시 후 다시 시도하세요.", { status: 500 });
  }
}
