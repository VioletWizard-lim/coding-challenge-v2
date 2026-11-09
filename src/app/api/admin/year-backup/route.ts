import { getSession } from "@/lib/session";
import { classLabel } from "@/lib/yearEnd";
import { backupZip } from "@/lib/yearEndStore";

export const maxDuration = 300;

/** 학년도 말 정리 전 백업 (관리자만): 그 학년도 학생 기록 전체를 ZIP(표마다 CSV)으로 */
export async function GET(request: Request) {
  const session = await getSession();
  if (!session || session.role !== "admin") return new Response("관리자 계정으로 다시 로그인하세요.", { status: 401 });
  const url = new URL(request.url);
  const year = Number(url.searchParams.get("year"));
  const cls = url.searchParams.get("cls") ?? "";
  if (cls && !/^(class|prog):[^:]{1,20}$/.test(cls)) return new Response("반을 다시 골라 주세요.", { status: 400 });
  if (!Number.isInteger(year) || year < 2020 || year > 2100) return new Response("학년도를 고르세요.", { status: 400 });
  const name = `line-by-line-${year}학년도${cls ? `-${classLabel(cls).replace(/\s/g, "")}` : ""}-백업.zip`;
  return new Response(backupZip(year, cls), {
    headers: {
      "content-type": "application/zip",
      "content-disposition": `attachment; filename="line-by-line-${year}-backup.zip"; filename*=UTF-8''${encodeURIComponent(name)}`,
      "cache-control": "no-store",
    },
  });
}
