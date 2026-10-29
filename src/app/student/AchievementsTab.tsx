import { computeAchievements, unitProblemsOf } from "@/lib/achievements";
import { getAchievementsSeen } from "@/lib/achievementStore";
import type { Problem } from "@/lib/problemBank";
import { listMyReflections } from "@/lib/reflectionStore";
import { getMyJourneyData } from "@/lib/submissions";
import { listMyNotes } from "@/lib/timelineNoteStore";
import Achievements from "./Achievements";

/** 서버에서 내 기록으로 업적을 계산한다 (학습 여정 탭과 같은 기록을 나눠 씀) */
export default async function AchievementsTab({
  userId,
  name,
  problems,
}: {
  userId: string;
  name: string;
  problems: Problem[];
}) {
  let list, seen;
  try {
    const [{ records }, mine, seenRecord, notes] = await Promise.all([
      getMyJourneyData(name),
      listMyReflections(userId),
      getAchievementsSeen(userId),
      listMyNotes(userId),
    ]);
    seen = seenRecord;
    list = computeAchievements(
      records,
      mine.reflections.map((r) => ({ date: r.classDate, savedAt: r.updatedAt })),
      unitProblemsOf(problems),
      notes.notes,
    );
  } catch (err) {
    console.error(err);
    return <p className="text-danger">업적을 불러오지 못했어요. 잠시 후 새로고침해 주세요.</p>;
  }
  return <Achievements userId={userId} list={list} seen={seen} />;
}
