import Anthropic from "@anthropic-ai/sdk";
import { AiNotConfiguredError, AiRefusedError, extractProblemsFromWorksheet, type WorksheetFile } from "@/lib/ai";
import { SUBJECTS } from "@/lib/problems";
import { getSession } from "@/lib/session";
import { MAX_WORKSHEET_BYTES, MAX_WORKSHEET_FILES, WORKSHEET_TYPES } from "@/lib/worksheet";

// 학습지가 길면 AI가 읽는 데 1~3분 걸릴 수 있다
export const maxDuration = 300;

const fail = (message: string, status = 400) => Response.json({ ok: false, message }, { status });

/** 교사가 올린 학습지(PDF·사진)를 AI가 읽어 문제 목록으로 돌려준다. 저장은 하지 않는다 (미리보기 후 교사가 반영) */
export async function POST(request: Request) {
  const session = await getSession();
  if (!session || session.role !== "teacher") return fail("교사 계정으로 다시 로그인하세요.", 401);

  const form = await request.formData();
  const subject = String(form.get("subject") ?? "");
  if (!(subject in SUBJECTS)) return fail("과목을 고르세요.");
  const files = form.getAll("files").filter((f): f is File => f instanceof File);
  if (!files.length) return fail("학습지 파일을 고르세요.");
  if (files.length > MAX_WORKSHEET_FILES) return fail(`한 번에 ${MAX_WORKSHEET_FILES}개 파일까지 올릴 수 있어요.`);
  if (files.reduce((n, f) => n + f.size, 0) > MAX_WORKSHEET_BYTES) {
    return fail("파일이 너무 커요(모두 합쳐 4MB까지). PDF를 나누거나 사진 수를 줄여 주세요.");
  }
  const bad = files.find((f) => !(WORKSHEET_TYPES as readonly string[]).includes(f.type));
  if (bad) return fail(`'${bad.name}'은(는) 올릴 수 없는 형식이에요. PDF나 사진(jpg, png)만 올려 주세요. 한글 파일은 'PDF로 저장'해서 올려 주세요.`);

  const worksheet: WorksheetFile[] = await Promise.all(
    files.map(async (f) => ({
      mediaType: f.type as WorksheetFile["mediaType"],
      base64: Buffer.from(await f.arrayBuffer()).toString("base64"),
    })),
  );

  try {
    const problems = await extractProblemsFromWorksheet(worksheet, subject);
    return Response.json({ ok: true, problems });
  } catch (err) {
    if (err instanceof AiNotConfiguredError) {
      return fail("AI 기능이 아직 설정되지 않았어요. Vercel 환경변수에 ANTHROPIC_API_KEY와 ANTHROPIC_MODEL을 넣어 주세요.", 503);
    }
    if (err instanceof AiRefusedError) return fail("AI가 이 파일을 읽지 않았어요. 학습지 파일이 맞는지 확인해 주세요.", 422);
    if (err instanceof Anthropic.RateLimitError) return fail("AI 사용량이 잠시 많아요. 1분 뒤 다시 시도해 주세요.", 429);
    if (err instanceof Anthropic.APIError) {
      console.error("학습지 AI 오류:", err.status, err.message);
      return fail("AI가 학습지를 읽지 못했어요. 잠시 후 다시 시도해 주세요.", 502);
    }
    console.error("학습지 읽기 오류:", err);
    return fail(err instanceof Error && err.message.includes("너무 길어요") ? err.message : "학습지를 읽지 못했어요. 잠시 후 다시 시도해 주세요.", 500);
  }
}
