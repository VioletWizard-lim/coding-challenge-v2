import "server-only";
import { jwtVerify, SignJWT } from "jose";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export type Role = "student" | "teacher";
export type Session = { id: string; role: Role; name: string };

const COOKIE = "cc_session";
const MAX_AGE_SECONDS = 8 * 60 * 60; // 하루 수업 시간 정도

function secretKey() {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) throw new Error("SESSION_SECRET(32자 이상)을 설정하세요.");
  return new TextEncoder().encode(secret);
}

/** 서명된 세션 쿠키를 만든다 (jose, HS256). */
export async function createSession(session: Session) {
  const token = await new SignJWT({ role: session.role, name: session.name })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(session.id)
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE_SECONDS}s`)
    .sign(secretKey());
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
}

export async function deleteSession() {
  (await cookies()).delete(COOKIE);
}

/** 쿠키의 서명·만료를 확인해 세션을 돌려준다. 없거나 잘못됐으면 null. */
export async function getSession(): Promise<Session | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey(), { algorithms: ["HS256"] });
    const role = payload.role;
    if (!payload.sub || (role !== "student" && role !== "teacher")) return null;
    return { id: payload.sub, role, name: String(payload.name ?? "") };
  } catch {
    return null;
  }
}

/** 로그인과 역할을 확인한다. 아니면 첫 화면으로 보낸다. 모든 서버 화면·액션에서 쓴다. */
export async function requireRole(role: Role): Promise<Session> {
  const session = await getSession();
  if (!session) redirect("/");
  if (session.role !== role) redirect(homeFor(session.role));
  return session;
}

export const homeFor = (role: Role) => (role === "teacher" ? "/teacher" : "/student");
