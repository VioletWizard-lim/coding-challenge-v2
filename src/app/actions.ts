"use server";

import { redirect } from "next/navigation";
import { checkNewPassword, setOwnPassword, verifyLogin } from "@/lib/auth";
import { clearLoginTries, LOGIN_WINDOW_MINUTES, LoginLockedError } from "@/lib/loginGuard";
import { createSession, getSession, homeFor } from "@/lib/session";

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

  const { credential, ...who } = session;
  await createSession(who, credential);
  redirect(homeFor(session.role));
}


export type PasswordState = { ok?: boolean; error?: string };

/**
 * 내 비밀번호 바꾸기 (학생·교사·관리자). 지금 비밀번호를 먼저 확인한다(로그인과 같은 시도 횟수 제한).
 * 바꾸면 이 브라우저는 로그인을 유지하고, 다른 곳에서 로그인해 둔 세션은 끊긴다.
 */
export async function changeMyPassword(_prev: PasswordState, formData: FormData): Promise<PasswordState> {
  const session = await getSession();
  if (!session) return { error: "다시 로그인한 뒤 바꿔 주세요." };
  const current = String(formData.get("current") ?? "");
  const next = String(formData.get("next") ?? "");
  const again = String(formData.get("again") ?? "");
  if (!current) return { error: "지금 비밀번호를 입력하세요." };
  const invalid = checkNewPassword(session.id, current, next, again);
  if (invalid) return { error: invalid };
  try {
    const ok = await verifyLogin(session.id, current);
    if (!ok) return { error: "지금 비밀번호가 맞지 않아요." };
    const hash = await setOwnPassword(session.id, session.role, next);
    await clearLoginTries(session.id);
    await createSession(session, hash);
  } catch (err) {
    if (err instanceof LoginLockedError) {
      return { error: `비밀번호를 여러 번 틀려서 잠시 쉬어 가요. ${LOGIN_WINDOW_MINUTES}분쯤 뒤에 다시 해 보세요.` };
    }
    console.error("비밀번호 바꾸기 오류:", err);
    return { error: "바꾸지 못했어요. 잠시 후 다시 시도하세요." };
  }
  return { ok: true };
}
