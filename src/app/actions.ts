"use server";

import { redirect } from "next/navigation";
import { verifyLogin } from "@/lib/auth";
import { LOGIN_WINDOW_MINUTES, LoginLockedError } from "@/lib/loginGuard";
import { createSession, homeFor } from "@/lib/session";

export type LoginState = { error?: string; id?: string };

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const id = String(formData.get("id") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!id || !password) return { error: "아이디와 비밀번호를 입력하세요.", id };

  let session;
  try {
    session = await verifyLogin(id, password);
  } catch (err) {
    if (err instanceof LoginLockedError) {
      return {
        error: `비밀번호를 여러 번 틀려서 잠시 쉬어 가요. ${LOGIN_WINDOW_MINUTES}분쯤 뒤에 다시 해 보세요. 비밀번호를 잊었으면 선생님께 말씀하세요.`,
        id,
      };
    }
    console.error("로그인 오류:", err);
    return { error: "서버에 연결하지 못했어요. 잠시 후 다시 시도하세요.", id };
  }
  if (!session) return { error: "아이디 또는 비밀번호가 틀렸습니다.", id };

  await createSession(session);
  redirect(homeFor(session.role));
}

