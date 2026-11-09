import "server-only";
import { createHash } from "node:crypto";
import { EncryptJWT, jwtDecrypt, jwtVerify, SignJWT } from "jose";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

/** admin: 관리자 계정(교사 계정 관리 등). v1은 로그인할 때 역할을 고르므로 admin 계정은 v1에 들어갈 수 없다 */
export type Role = "student" | "teacher" | "admin";
export type Session = { id: string; role: Role; name: string };

const COOKIE = "cc_session";
/**
 * 로그인 유지 시간. 교실 PC를 여러 학생이 같이 쓰므로 학생은 짧게(블록 수업 한 번 정도),
 * 교사는 채점하는 동안 끊기지 않게 길게 둔다.
 */
const SESSION_HOURS: Record<Role, number> = { student: 2, teacher: 8, admin: 8 };

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
    .setExpirationTime(`${SESSION_HOURS[session.role]}h`)
    .sign(secretKey());
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    // maxAge를 주지 않아 브라우저를 닫으면 쿠키도 사라진다. 시간 제한은 위 토큰 만료로 따로 건다.
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
    if (!payload.sub || (role !== "student" && role !== "teacher" && role !== "admin")) return null;
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

export const homeFor = (role: Role) => (role === "admin" ? "/admin" : role === "teacher" ? "/teacher" : "/student");

/* ───────── 체험 페이지(/try): 체험 코드를 넣은 브라우저만 진짜 AI를 쓴다 ───────── */

const TRIAL_COOKIE = "cc_try";

/** 체험 코드의 지문 (코드 자체는 쿠키에 넣지 않음). 코드를 바꾸면 지문이 달라져 예전 코드로 연 브라우저는 바로 막힌다 */
function trialKeyPrint(code = process.env.TRY_ACCESS_CODE ?? ""): string {
  return createHash("sha256").update(`try:${code.trim().toLowerCase()}`).digest("hex").slice(0, 24);
}

/** 체험 코드가 맞았을 때: 서명된 쿠키 (8시간 또는 브라우저를 닫을 때까지, 로그인과는 따로) */
export async function grantTrial() {
  const token = await new SignJWT({ try: true, k: trialKeyPrint() })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("8h")
    .sign(secretKey());
  (await cookies()).set(TRIAL_COOKIE, token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/" });
}

/** 이 브라우저가 지금의 체험 코드를 넣었는지 (코드를 바꾸면 false) */
export async function hasTrial(): Promise<boolean> {
  const token = (await cookies()).get(TRIAL_COOKIE)?.value;
  if (!token || !process.env.TRY_ACCESS_CODE?.trim()) return false;
  try {
    const { payload } = await jwtVerify(token, secretKey(), { algorithms: ["HS256"] });
    return payload.try === true && payload.k === trialKeyPrint();
  } catch {
    return false;
  }
}

/* ───────── 체험 연습 문제: 참고 답안을 체험자에게 보이지 않게 암호화해 브라우저에 맡긴다 ───────── */

const sealKey = () => createHash("sha256").update(`trial-seal:${process.env.SESSION_SECRET ?? ""}`).digest();

export type TrialSealed = { title: string; problemText: string; solution: string };

export async function sealTrialProblem(p: TrialSealed): Promise<string> {
  return new EncryptJWT({ ...p }).setProtectedHeader({ alg: "dir", enc: "A256GCM" }).setIssuedAt().setExpirationTime("8h").encrypt(sealKey());
}

export async function openTrialProblem(token: string): Promise<TrialSealed | null> {
  try {
    const { payload } = await jwtDecrypt(String(token ?? ""), sealKey());
    if (typeof payload.problemText !== "string" || typeof payload.solution !== "string") return null;
    return { title: String(payload.title ?? ""), problemText: payload.problemText, solution: payload.solution };
  } catch {
    return null;
  }
}
