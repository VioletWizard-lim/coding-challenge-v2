import { computeAchievements, unitProblemsOf } from "@/lib/achievements";
import { buildJourney } from "@/lib/journey";
import type { Problem } from "@/lib/problemBank";
import { listMyReflections } from "@/lib/reflectionStore";
import { getMyJourneyData, type Owner } from "@/lib/submissions";
import { listMyNotes } from "@/lib/timelineNoteStore";
import Home, { type HomeData } from "./Home";

/** 학생 첫 화면: 오늘 할 일과 최근 기록 요약을 서버에서 계산한다 (학습 여정·업적 탭과 같은 기록을 나눠 씀) */
export default async function HomeTab({
  userId,
  owner,
  subjects,
  problems,
}: {
  userId: string;
  owner: Owner;
  subjects: string[];
  problems: Problem[];
}) {
  let data: HomeData;
  try {
    const [{ summaries, records, today }, mine, notes] = await Promise.all([
      getMyJourneyData(owner),
      listMyReflections(userId),
      listMyNotes(userId),
    ]);
    const submitted = new Set(summaries.map((s) => `${s.subject}_${s.problem}`));
    const todaySubs = summaries.filter((s) => s.date === today);
    const recent = summaries.find((s) => s.hasLog) ?? null;
    const achievements = computeAchievements(
      records,
      mine.reflections.map((r) => ({ date: r.classDate, savedAt: r.updatedAt })),
      unitProblemsOf(problems),
      notes.notes,
    );
    const earned = achievements
      .flatMap((a) =>
        a.steps.flatMap((s) =>
          s.earned ? [{ icon: a.icon, name: a.steps.length > 1 ? `${a.name} (${s.target}${a.unit})` : a.name, earnedAt: s.earned.earnedAt }] : [],
        ),
      )
      .sort((a, b) => b.earnedAt.localeCompare(a.earnedAt));
    data = {
      today,
      // 과목마다 따로: 공개됐지만 아직 안 낸 첫 문제
      subjects: subjects.map((subject) => {
        const open = problems.filter((p) => p.subject === subject);
        const unsolved = open.filter((p) => !submitted.has(`${p.subject}_${p.number}`));
        return { subject, next: unsolved[0]?.number ?? null, unsolvedCount: unsolved.length, openCount: open.length };
      }),
      todaySubs: [...new Map(todaySubs.map((s) => [`${s.subject}_${s.problem}`, s])).values()]
        .reverse()
        .map((s) => ({ subject: s.subject, problem: s.problem })),
      reflectedToday: mine.ready ? mine.reflections.some((r) => r.classDate === today) : null,
      recent: recent ? { id: recent.id, subject: recent.subject, problem: recent.problem, date: recent.date, stats: recent.stats } : null,
      totals: buildJourney(summaries, today).totals,
      achievedCount: achievements.filter((a) => a.steps.some((s) => s.earned)).length,
      recentAchievements: earned.slice(0, 3),
    };
  } catch (err) {
    console.error(err);
    return <p className="text-danger">첫 화면을 불러오지 못했어요. 잠시 후 새로고침해 주세요.</p>;
  }
  return <Home name={owner.name} data={data} />;
}
