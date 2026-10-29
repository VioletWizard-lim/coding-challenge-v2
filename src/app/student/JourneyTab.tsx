import { buildJourney, type Journey as JourneyData } from "@/lib/journey";
import type { Reflection } from "@/lib/reflection";
import { listMyReflections } from "@/lib/reflectionStore";
import { getMyJourneyData } from "@/lib/submissions";
import Journey from "./Journey";

/** 서버에서 내 제출 기록을 요약해 학습 여정을 만든다. 날짜별 기록에는 그날 쓴 성찰도 함께 보인다 */
export default async function JourneyTab({ userId, name }: { userId: string; name: string }) {
  let journey: JourneyData, reflections: Reflection[];
  try {
    const [{ summaries, today }, mine] = await Promise.all([getMyJourneyData(name), listMyReflections(userId)]);
    journey = buildJourney(summaries, today);
    reflections = mine.reflections;
  } catch (err) {
    console.error(err);
    return <p className="text-danger">학습 여정을 불러오지 못했어요. 잠시 후 새로고침해 주세요.</p>;
  }
  return <Journey journey={journey} reflections={reflections} />;
}
