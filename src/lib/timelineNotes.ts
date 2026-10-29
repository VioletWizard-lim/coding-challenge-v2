/**
 * 타임라인 메모: 학생이 재생을 보며 그 순간에 남긴 생각(student),
 * 교사가 학생 재생의 그 순간에 남긴 피드백(teacher). 여기는 브라우저·서버가 함께 쓰는 모양과 검사만.
 */

export type NoteAuthor = "student" | "teacher";

export type TimelineNote = {
  id: number;
  author: NoteAuthor;
  /** 지금 보는 사람이 쓴 메모인지 (고치기·지우기는 자기 것만) */
  mine: boolean;
  submissionId: number;
  /** 작성 기록 안의 시각 (ms) */
  at: number;
  text: string;
  createdAt: string;
};

export const MAX_NOTE_TEXT = 500;

/** 재생기와 함께 내려보내는 메모 묶음. ready=false면 표가 아직 없음(008 실행 전) */
export type NotesBundle = { ready: boolean; notes: TimelineNote[] };
/** 제출 하나에 남길 수 있는 메모 수 */
export const MAX_NOTES_PER_SUBMISSION = 50;

/** 저장할 수 없으면 이유를, 괜찮으면 null */
export function validateNote(text: string): string | null {
  const t = text.trim();
  if (!t) return "메모를 적어 주세요.";
  if (t.length > MAX_NOTE_TEXT) return `메모는 ${MAX_NOTE_TEXT}자까지 쓸 수 있어요.`;
  return null;
}
