import { toCsv } from "@/lib/classStats";
import { REFLECTION_CSV_HEAD, reflectionCsvRows } from "@/lib/reflection";
import { listMyReflections } from "@/lib/reflectionStore";
import { getSession } from "@/lib/session";

/**
 * 내 오늘의 성찰 모두 CSV로 내려받기 (학생 본인만).
 * 성찰은 학년도가 끝나는 다음 해 2월 말 뒤에 지우므로, 학생이 자기 글을 간직할 수 있게 한다.
 */
export async function GET() {
  const session = await getSession();
  if (!session || session.role !== "student") return new Response("다시 로그인하세요.", { status: 401 });
  try {
    const { reflections } = await listMyReflections(session.id);
    const rows = reflectionCsvRows(reflections);
    const csv = rows.length ? toCsv(rows) : `﻿${REFLECTION_CSV_HEAD.join(",")}\r\n`;
    const name = "나의_오늘의_성찰.csv";
    return new Response(csv, {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="my-reflections.csv"; filename*=UTF-8''${encodeURIComponent(name)}`,
        "cache-control": "no-store",
      },
    });
  } catch (err) {
    console.error("성찰 내려받기 오류:", err);
    return new Response("내려받지 못했어요. 잠시 후 다시 시도하세요.", { status: 500 });
  }
}
