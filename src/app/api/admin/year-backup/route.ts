import { getSession } from "@/lib/session";
import { backupStream } from "@/lib/yearEndStore";

export const maxDuration = 300;

/** 학년도 말 정리 전 백업 (관리자만): 지울 표들의 그 학년도 기록 전체를 JSON 파일로 */
export async function GET(request: Request) {
  const session = await getSession();
  if (!session || session.role !== "admin") return new Response("관리자 계정으로 다시 로그인하세요.", { status: 401 });
  const year = Number(new URL(request.url).searchParams.get("year"));
  if (!Number.isInteger(year) || year < 2020 || year > 2100) return new Response("학년도를 고르세요.", { status: 400 });
  const name = `line-by-line-${year}학년도-백업.json`;
  return new Response(backupStream(year), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="line-by-line-${year}-backup.json"; filename*=UTF-8''${encodeURIComponent(name)}`,
      "cache-control": "no-store",
    },
  });
}
