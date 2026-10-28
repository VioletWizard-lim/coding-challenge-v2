"use server";

import { refresh } from "next/cache";
import { getUserProfile } from "@/lib/auth";
import { isValidLog } from "@/lib/editLog";
import { allowedSubjects, SUBJECTS } from "@/lib/problems";
import { getSession } from "@/lib/session";
import { insertSubmission } from "@/lib/submissions";

export type SubmitInput = {
  subject: string;
  problem: string;
  description: string;
  code: string;
  init: string;
  log: unknown;
};

export type SubmitResult = { ok: true } | { ok: false; error: string };

const MAX_CODE = 100_000;
const MAX_DESCRIPTION = 5_000;

/** 학생 제출. 브라우저에서 온 값은 모두 서버에서 다시 확인한다. */
export async function submitCode(input: SubmitInput): Promise<SubmitResult> {
  const session = await getSession();
  if (!session || session.role !== "student") return { ok: false, error: "다시 로그인한 뒤 제출하세요." };

  const code = String(input.code ?? "");
  const description = String(input.description ?? "").trim();
  if (!code.trim()) return { ok: false, error: "코드를 입력하세요." };
  if (!description) return { ok: false, error: "코드 설명을 입력하세요." };
  if (code.length > MAX_CODE || description.length > MAX_DESCRIPTION) {
    return { ok: false, error: "코드나 설명이 너무 길어요." };
  }
  if (!isValidLog(input.log)) return { ok: false, error: "작성 기록 형식이 맞지 않아요. 새로고침 후 다시 제출하세요." };

  try {
    const profile = await getUserProfile(session.id);
    if (!profile) return { ok: false, error: "다시 로그인한 뒤 제출하세요." };
    if (!allowedSubjects(profile.subjects).includes(input.subject) || !(input.problem in SUBJECTS[input.subject])) {
      return { ok: false, error: "과목이나 문제 번호가 맞지 않아요." };
    }
    await insertSubmission({
      profile,
      subject: input.subject,
      problem: input.problem,
      code,
      description,
      initCode: String(input.init ?? ""),
      editLog: input.log,
    });
  } catch (err) {
    console.error("제출 오류:", err);
    return { ok: false, error: "제출하지 못했어요. 잠시 후 다시 시도하세요." };
  }

  refresh(); // 아래 "내 제출 현황"을 새로 불러온다
  return { ok: true };
}
