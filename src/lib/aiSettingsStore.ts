import "server-only";
import { db } from "./db";
import { defaultAiSettings, type AiSettings } from "./aiSettings";

type Row = { subject: string; helper_enabled: boolean; review_enabled: boolean; helper_off_units: unknown; note: string };

const tableMissing = (message: string) => /ai_settings/.test(message) && /(does not exist|schema cache|not find)/i.test(message);

const fromRow = (r: Row): AiSettings => ({
  subject: r.subject,
  helper: r.helper_enabled !== false,
  review: r.review_enabled !== false,
  offUnits: Array.isArray(r.helper_off_units) ? r.helper_off_units.map(String) : [],
  note: r.note ?? "",
});

/** 과목들의 AI 설정 (저장된 것이 없으면 모두 켜짐). 표가 없으면(017 실행 전) ready=false, 모두 켜짐 */
export async function getAiSettings(subjects: string[]): Promise<{ ready: boolean; settings: AiSettings[] }> {
  const { data, error } = await db().from("ai_settings").select("*").in("subject", subjects);
  if (error && tableMissing(error.message)) return { ready: false, settings: subjects.map(defaultAiSettings) };
  if (error) throw new Error(`AI 설정 조회 실패: ${error.message}`);
  const saved = new Map(((data ?? []) as Row[]).map((r) => [r.subject, fromRow(r)]));
  return { ready: true, settings: subjects.map((s) => saved.get(s) ?? defaultAiSettings(s)) };
}

/** 한 과목의 AI 설정 (없거나 표가 없으면 모두 켜짐) */
export async function aiSettingsFor(subject: string): Promise<AiSettings> {
  return (await getAiSettings([subject])).settings[0];
}

export class AiSettingsNotReadyError extends Error {}

export async function saveAiSettings(s: AiSettings): Promise<void> {
  const { error } = await db().from("ai_settings").upsert({
    subject: s.subject,
    helper_enabled: s.helper,
    review_enabled: s.review,
    helper_off_units: s.offUnits,
    note: s.note,
    updated_at: new Date().toISOString(),
  });
  if (error && tableMissing(error.message)) throw new AiSettingsNotReadyError(error.message);
  if (error) throw new Error(`AI 설정 저장 실패: ${error.message}`);
}
