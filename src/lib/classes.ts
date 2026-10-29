/** 교사 화면에서 학생을 반별로 나누는 순수 함수들 (학생 계정·학습 여정 화면이 함께 씀) */

type ClassFields = {
  grade: number | string | null;
  class: number | string | null;
  programming_grade: number | string | null;
  programming_class: number | string | null;
};

export const classOf = (grade: unknown, cls: unknown) => (grade || cls ? `${grade ?? "?"}-${cls ?? "?"}` : "");
export const byNumber = (a: string, b: string) => a.localeCompare(b, "ko", { numeric: true });

/** 반 고르기 목록: 학년-반과 프로그래밍 반 (값은 "class:2-3", "prog:2-5") */
export function classOptions(students: ClassFields[]) {
  const plain = new Set<string>(),
    prog = new Set<string>();
  for (const s of students) {
    if (classOf(s.grade, s.class)) plain.add(classOf(s.grade, s.class));
    if (classOf(s.programming_grade, s.programming_class)) prog.add(classOf(s.programming_grade, s.programming_class));
  }
  return { plain: [...plain].sort(byNumber), prog: [...prog].sort(byNumber) };
}

/** 고른 반에 드는 학생인지 (빈 값이면 전체) */
export function inClass(s: ClassFields, picked: string) {
  if (!picked) return true;
  const [kind, value] = picked.split(":");
  return kind === "prog"
    ? classOf(s.programming_grade, s.programming_class) === value
    : classOf(s.grade, s.class) === value;
}
