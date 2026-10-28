import { deleteSession } from "@/lib/session";

/**
 * 로그아웃. 서버 액션 대신 일반 폼 전송 + 새 페이지 이동으로 처리해서
 * 브라우저에 남아 있던 이전 사용자의 화면(클라이언트 캐시)까지 모두 비운다. (교실 공용 PC 대비)
 */
export async function POST(request: Request) {
  await deleteSession();
  return Response.redirect(new URL("/", request.url), 303);
}
