import { buildJourney, type Journey as JourneyData } from "@/lib/journey";
import { getMyJourneyData } from "@/lib/submissions";
import Journey from "./Journey";

/** 서버에서 내 제출 기록을 요약해 학습 여정을 만든다 */
export default async function JourneyTab({ name }: { name: string }) {
  let journey: JourneyData;
  try {
    const { summaries, today } = await getMyJourneyData(name);
    journey = buildJourney(summaries, today);
  } catch (err) {
    console.error(err);
    return <p className="text-danger">학습 여정을 불러오지 못했어요. 잠시 후 새로고침해 주세요.</p>;
  }
  return <Journey journey={journey} />;
}
