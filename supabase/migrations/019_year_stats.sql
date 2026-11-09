-- 019: 학년도별 이름 없는 통계 (새 테이블, v1과 무관)
--
-- 실행 방법: Supabase 대시보드 → SQL Editor에 붙여넣고 Run (한 번만, 두 번 실행해도 괜찮음)
-- 기존 테이블은 건드리지 않는다. 실행 전에 백업을 권한다.
--
-- 학년도 말(다음 해 3월)에 지난 학년도의 학습 활동 기록(AI 대화, 성찰, 연습 등)을 지우기 전에,
-- 이름·아이디 없이 숫자만 담은 통계(월 × 과목 × 반)를 남겨 보고서·연구에 쓴다. 제출·채점 기록은 지우지 않는다.

create table if not exists year_stats (
  school_year integer primary key,     -- 학년도 (2026 = 2026년 3월 ~ 2027년 2월)
  rows jsonb not null,                 -- [{month, subject, cls, submissions, submitStudents, typedChars, …}] 이름·아이디 없음
  created_at timestamptz not null default now()
);

-- 보안 잠금(RLS). v2 서버는 서버 전용 키로 접근하므로 영향 없다.
alter table year_stats enable row level security;
