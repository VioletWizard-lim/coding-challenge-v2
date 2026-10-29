-- 008: 타임라인 메모·피드백 (새 테이블, v1과 무관)
--
-- 실행 방법: Supabase 대시보드 → SQL Editor에 붙여넣고 Run (한 번만, 두 번 실행해도 괜찮음)
-- 기존 테이블은 건드리지 않는다.
--
-- 학생이 내 제출의 재생을 보며 "이 순간에 무슨 생각을 했는지" 적는 메모(author_role='student'),
-- 교사가 학생 재생의 특정 순간에 남기는 피드백(author_role='teacher').
-- at_ms는 작성 기록(edit_log) 안의 시각(ms)이라, 재생기에서 그 순간으로 바로 갈 수 있다.
-- 각자 자기가 쓴 것만 고치고 지운다. 학생은 선생님 피드백을 읽기만 한다.

create table if not exists timeline_notes (
  id bigint generated always as identity primary key,
  user_id text not null,              -- 쓴 사람 users.id (학생 학번 또는 교사 아이디)
  author_role text not null default 'student' check (author_role in ('student', 'teacher')),
  submission_id bigint not null,      -- submissions.id
  at_ms bigint not null,              -- 기록 안의 시각 (edit_log의 시각ms)
  note text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists timeline_notes_submission_idx on timeline_notes (submission_id);
create index if not exists timeline_notes_user_idx on timeline_notes (user_id);

-- 보안 잠금(RLS). v2 서버는 서버 전용 키로 접근하므로 영향 없다.
alter table timeline_notes enable row level security;
