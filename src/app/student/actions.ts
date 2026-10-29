"use server";

import { refresh } from "next/cache";
import { getUserProfile } from "@/lib/auth";
import { isValidLog } from "@/lib/editLog";
import { allowedSubjects } from "@/lib/problems";
import { findOpenProblem } from "@/lib/problemStore";
import { getSession } from "@/lib/session";
import { getReplayData, insertSubmission, type ReplayData } from "@/lib/submissions";

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
    if (!allowedSubjects(profile.subjects).includes(input.subject)) {
      return { ok: false, error: "과목이 맞지 않아요." };
    }
    // 공개된 문제만 제출할 수 있다 (공개 시각은 서버 시계로 확인)
    if (!(await findOpenProblem(input.subject, input.problem))) {
      return { ok: false, error: "아직 공개되지 않았거나 없는 문제예요." };
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

export type ReplayResult = { ok: true; data: ReplayData } | { ok: false; error: string };

/** 내 제출의 작성 과정 기록 (재생용). 다른 학생의 제출은 볼 수 없다. */
export async function loadMyReplay(submissionId: number): Promise<ReplayResult> {
  const session = await getSession();
  if (!session || session.role !== "student") return { ok: false, error: "다시 로그인하세요." };
  if (!Number.isInteger(submissionId)) return { ok: false, error: "제출을 찾지 못했어요." };
  try {
    const profile = await getUserProfile(session.id);
    const data = profile ? await getReplayData(submissionId, profile.name) : null;
    if (!data) return { ok: false, error: "제출을 찾지 못했어요." };
    return { ok: true, data };
  } catch (err) {
    console.error("재생 기록 오류:", err);
    return { ok: false, error: "기록을 불러오지 못했어요. 잠시 후 다시 시도하세요." };
  }
}
