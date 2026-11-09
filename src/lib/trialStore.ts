import "server-only";
import type { Usage } from "./aiChat";
import { db } from "./db";
import { kstDate } from "./journey";
import { trialLimit, trialUsageKey } from "./trial";

/**
 * 체험 페이지 AI 하루 횟수 (사이트 전체). 새 표 없이 app_status(002)에 날짜별 한 줄로 남긴다:
 * key "try_ai:2026-11-09", value { count, usages: [{ model, inputTokens, outputTokens }] }.
 * 체험 대화 내용은 남기지 않는다 (숫자만, 비용 확인용).
 */
type Value = { count: number; usages: Usage[] };

async function read(day: string): Promise<Value> {
  const { data, error } = await db().from("app_status").select("value").eq("key", trialUsageKey(day)).maybeSingle();
  if (error) throw new Error(`체험 사용량 조회 실패: ${error.message}`);
  const v = (data?.value ?? {}) as Partial<Value>;
  return { count: Number(v.count) || 0, usages: Array.isArray(v.usages) ? v.usages : [] };
}

/** 오늘 남은 체험 AI 횟수 */
export async function trialRemaining(): Promise<number> {
  return Math.max(0, trialLimit() - (await read(kstDate(new Date()))).count);
}

/**
 * 한 번 쓰기로 하고 센다(AI를 부르기 전에). 한도를 넘으면 false.
 * 동시에 여러 명이 누르면 한두 번 더 갈 수 있지만, 체험 코드를 아는 심사위원만 쓰므로 괜찮다.
 */
export async function takeTrialTurn(): Promise<boolean> {
  const day = kstDate(new Date());
  const v = await read(day);
  if (v.count >= trialLimit()) return false;
  await write(day, { ...v, count: v.count + 1 });
  return true;
}

/** AI를 부른 뒤 토큰 수를 남긴다 (사용량·비용 카드) */
export async function recordTrialUsage(usage: Usage): Promise<void> {
  const day = kstDate(new Date());
  const v = await read(day);
  await write(day, { ...v, usages: [...v.usages, usage].slice(-500) });
}

async function write(day: string, value: Value) {
  const { error } = await db()
    .from("app_status")
    .upsert({ key: trialUsageKey(day), value, updated_at: new Date().toISOString() }, { onConflict: "key" });
  if (error) throw new Error(`체험 사용량 저장 실패: ${error.message}`);
}

/** 이 날짜 이후 체험 AI 사용량 (사용량 카드용) */
export async function trialUsageSince(sinceIso: string): Promise<(Usage & { createdAt: string })[]> {
  const { data, error } = await db().from("app_status").select("key, value").like("key", "try_ai:%");
  if (error) return [];
  const since = kstDate(sinceIso);
  return (data ?? []).flatMap((r) => {
    const day = String(r.key).slice("try_ai:".length);
    if (day < since) return [];
    const v = (r.value ?? {}) as Partial<Value>;
    return (Array.isArray(v.usages) ? v.usages : []).map((u) => ({ ...u, createdAt: `${day}T12:00:00+09:00` }));
  });
}

/* ───────── 체험 페이지 보이기/숨기기 (관리자) ───────── */

const VISIBLE_KEY = "try_page";

/**
 * 체험 페이지 설정 (app_status의 try_page 한 줄, 관리자가 🛠 관리자 → 🧪 체험 페이지에서 바꿈)
 * - visible: 체험 페이지를 열어 두었는지 (기본 숨김 — 심사 기간에만). 숨기면 첫 화면 버튼이 사라지고 /try는 "열려 있지 않아요"(관리자는 미리 보기)
 * - aiOn: 체험 AI를 쓰게 할지 (기본 켬). 끄면 다시 배포하지 않아도 체험 AI가 바로 막힘
 * - epoch: 체험 AI를 끌 때마다 1씩 늘림 → 체험 코드 쿠키에 함께 묶여, 끈 뒤에는 예전에 코드를 넣은 브라우저도 다시 넣어야 함
 */
export type TrialSettings = { visible: boolean; aiOn: boolean; epoch: number };

export async function getTrialSettings(): Promise<TrialSettings> {
  const { data, error } = await db().from("app_status").select("value").eq("key", VISIBLE_KEY).maybeSingle();
  const v = (error ? null : data?.value) as Partial<TrialSettings> | null;
  return { visible: v?.visible === true, aiOn: v?.aiOn !== false, epoch: Number(v?.epoch) || 0 };
}

export async function isTrialVisible(): Promise<boolean> {
  return (await getTrialSettings()).visible;
}

async function saveSettings(next: TrialSettings, by: string) {
  const { error } = await db()
    .from("app_status")
    .upsert({ key: VISIBLE_KEY, value: { ...next, by, at: new Date().toISOString() }, updated_at: new Date().toISOString() }, { onConflict: "key" });
  if (error) throw new Error(`체험 페이지 설정 저장 실패: ${error.message}`);
}

export async function setTrialVisible(visible: boolean, by: string): Promise<void> {
  await saveSettings({ ...(await getTrialSettings()), visible }, by);
}

/** 체험 AI 켜기/끄기. 끌 때는 epoch를 늘려 이미 코드를 넣은 브라우저도 막는다 */
export async function setTrialAi(aiOn: boolean, by: string): Promise<void> {
  const cur = await getTrialSettings();
  await saveSettings({ ...cur, aiOn, epoch: aiOn ? cur.epoch : cur.epoch + 1 }, by);
}
