import { toCsv } from "@/lib/classStats";
import { SUBJECTS } from "@/lib/problems";
import {
  allProblemMetrics,
  askCsvRows,
  askJudgeRows,
  groupSummaries,
  metricsCsvRows,
  summaryCsvRows,
  withNotes,
} from "@/lib/researchStats";
import { loadResearchData, researchId } from "@/lib/researchStore";
import { getSession } from "@/lib/session";

export const maxDuration = 120;

const KINDS = {
  problems: { name: "학생x문제", en: "problems" },
  summary: { name: "학생x묶음요약", en: "summary" },
  asks: { name: "지표6_되물음원자료", en: "asks" },
} as const;

/**
 * 연구용 지표 CSV (교사만, 2027 작업 지시서 P5). 이름·학번 대신 익명 ID(researchId).
 * kind=problems: 학생 × 문제 지표 / summary: 학생 × 묶음(전체·전반부·후반부·앵커·기본/심화·차시) / asks: 지표 6 원자료(교사 판정 칸)
 */
export async function GET(request: Request) {
  const session = await getSession();
  if (!session || session.role !== "teacher") return new Response("교사 계정으로 다시 로그인하세요.", { status: 401 });
  const url = new URL(request.url);
  const subject = url.searchParams.get("subject") ?? "";
  const year = Number(url.searchParams.get("year"));
  const cls = url.searchParams.get("cls") ?? "";
  const kind = (url.searchParams.get("kind") ?? "") as keyof typeof KINDS;
  if (!(subject in SUBJECTS) || !Number.isInteger(year) || !(kind in KINDS)) return new Response("과목·연도·종류를 고르세요.", { status: 400 });

  try {
    const { submissions, chats, problems } = await loadResearchData(subject, year, cls);
    const ids = new Map<string, string>();
    const anon = (key: string) => {
      if (!ids.has(key)) ids.set(key, researchId(key));
      return ids.get(key)!;
    };
    const metrics = allProblemMetrics(submissions, chats);
    const rows =
      kind === "problems"
        ? metricsCsvRows(metrics, problems, anon)
        : kind === "summary"
          ? summaryCsvRows(groupSummaries(metrics, problems), anon)
          : askCsvRows(askJudgeRows(chats), problems, anon);
    const csv = withNotes(toCsv(rows));
    const name = `연구지표_${year}_${subject}_${cls ? `${cls}반` : "전체"}_${KINDS[kind].name}.csv`;
    return new Response(csv, {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="line-by-line-research-${year}-${KINDS[kind].en}.csv"; filename*=UTF-8''${encodeURIComponent(name)}`,
        "cache-control": "no-store",
      },
    });
  } catch (err) {
    console.error("연구 지표 내보내기 오류:", err);
    return new Response("내보내지 못했어요. 잠시 후 다시 시도하세요.", { status: 500 });
  }
}
