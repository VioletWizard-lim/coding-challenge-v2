-- 012: 과목별 채점 기준 + 제출별 채점표 (새 테이블 2개, v1과 무관)
--
-- 실행 방법: Supabase 대시보드 → SQL Editor에 붙여넣고 Run (한 번만, 두 번 실행해도 괜찮음)
-- 기존 테이블은 건드리지 않는다.
--
-- grading_rubrics: 과목마다 교사가 정한 채점 영역과 배점. 예: [{"name":"기능","max":40},{"name":"코드 설명","max":40},{"name":"도전","max":20}]
--   (없으면 v1과 같은 기능 40 / 코드 설명 40 / 도전 20)
-- submission_scores: 채점할 때의 기준 사본과 영역별 점수. 학기 중에 기준을 바꿔도 예전 제출은 그때 기준으로 보인다.
--   예: [{"name":"기능","max":40,"score":35}, ...]
-- v1 호환: 합계(score_total)·감점 이유(feedback)·오답(wrong_reason)은 항상 submissions의 기존 칸에도 저장한다.
--   영역이 3개면 score_function·score_understanding·score_challenge에도 순서대로 저장한다.

create table if not exists grading_rubrics (
  subject text primary key,
  parts jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists submission_scores (
  submission_id bigint primary key,   -- submissions.id
  parts jsonb not null,
  graded_by text,                     -- 채점한 교사 users.id
  updated_at timestamptz not null default now()
);

-- 보안 잠금(RLS). v2 서버는 서버 전용 키로 접근하므로 영향 없다.
alter table grading_rubrics enable row level security;
alter table submission_scores enable row level security;
