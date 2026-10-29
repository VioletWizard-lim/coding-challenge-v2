import { listMySubmissions, type MySubmission, type Owner } from "@/lib/submissions";
import SubmissionList from "./SubmissionList";

/** 내 기록 다시 보기: 작성 과정 재생이 먼저, 그 아래 점수·선생님 피드백·오답 이유·제출한 코드 */
export default async function MySubmissions({ owner }: { owner: Owner }) {
  let rows: MySubmission[];
  try {
    rows = await listMySubmissions(owner);
  } catch (err) {
    console.error(err);
    return <p className="text-danger">내 기록을 불러오지 못했어요. 잠시 후 새로고침해 주세요.</p>;
  }
  if (!rows.length) return <p className="rounded-xl border border-line bg-white p-5 text-muted">아직 제출한 과제가 없어요.</p>;
  return <SubmissionList rows={rows} />;
}
