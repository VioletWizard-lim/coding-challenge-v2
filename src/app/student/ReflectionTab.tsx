import { kstDate } from "@/lib/journey";
import type { Problem } from "@/lib/problemBank";
import type { Reflection } from "@/lib/reflection";
import { listMyReflections } from "@/lib/reflectionStore";
import { todaysSubmittedProblems, type Owner } from "@/lib/submissions";
import ReflectionForm from "./ReflectionForm";

/** 서버에서 오늘 제출한 문제와 오늘 쓴 성찰을 읽어 성찰 쓰기 화면에 넘긴다 */
export default async function ReflectionTab({
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
  const today = kstDate(new Date());
  let ready: boolean, reflections: Reflection[], todayProblems: Record<string, string[]>;
  try {
    [{ ready, reflections }, todayProblems] = await Promise.all([listMyReflections(userId), todaysSubmittedProblems(owner)]);
  } catch (err) {
    console.error(err);
    return <p className="text-danger">성찰을 불러오지 못했어요. 잠시 후 새로고침해 주세요.</p>;
  }
  const openProblems: Record<string, string[]> = {};
  for (const p of problems) (openProblems[p.subject] ??= []).push(p.number);
  return (
    <ReflectionForm
      ready={ready}
      today={today}
      subjects={subjects}
      todayProblems={todayProblems}
      openProblems={openProblems}
      todayReflections={reflections.filter((r) => r.classDate === today)}
    />
  );
}
