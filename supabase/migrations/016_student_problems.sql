-- 016: 학생이 만든 문제 (새 테이블 2개, v1과 무관)
--
-- 실행 방법: Supabase 대시보드 → SQL Editor에 붙여넣고 Run (한 번만, 두 번 실행해도 괜찮음)
-- 기존 테이블은 건드리지 않는다. 실행 전에 백업을 권한다.
--
-- 학생이 연습 모드에서 문제·예시(입력과 기대 출력)·내 답을 직접 만든다. 내 답으로 예시를 모두 통과해야 저장된다(브라우저에서 확인).
-- 공개 범위: 나만 풀기(private) 또는 선생님 승인 후 같은 반 친구와 풀기(pending → approved / rejected).
-- 만든 학생의 답(solution)은 반 친구에게 보내지 않는다. 미성년자 보호: 선생님이 모든 문제를 보고 승인·표시할 수 있다.

create table if not exists student_problems (
  id bigint generated always as identity primary key,
  author_id text not null,            -- 만든 학생 users.id
  subject text not null,
  class_key text not null default '', -- 만들 때의 "학년-반" (프로그래밍은 프로그래밍 반). 같은 반 친구에게만 보인다
  title text not null,
  description text not null,
  conditions jsonb not null default '[]',
  starter_code text not null default '',
  tests jsonb not null,               -- [{inputs: ["줄1", "줄2"], output: "기대 출력"}]
  solution text not null,             -- 만든 학생의 답 (반 친구에게 보내지 않음)
  solution_init text not null default '',
  solution_log jsonb,                 -- 답을 쓴 과정 (edit_log 형식, 선생님이 재생해 볼 수 있음)
  share text not null check (share in ('private', 'class')),
  status text not null check (status in ('private', 'pending', 'approved', 'rejected')),
  review_note text not null default '',
  reviewed_by text,
  reviewed_at timestamptz,
  flagged_by text check (flagged_by in ('student', 'teacher')),
  flag_note text,
  flagged_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists student_problems_author_idx on student_problems (author_id, created_at);
create index if not exists student_problems_class_idx on student_problems (subject, class_key, status);

-- 학생이 푼 기록 (문제 하나에 학생 한 명당 한 줄, 확인할 때마다 마지막 것으로 저장)
create table if not exists student_problem_attempts (
  id bigint generated always as identity primary key,
  problem_id bigint not null references student_problems (id) on delete cascade,
  user_id text not null,
  code text,
  init_code text,
  edit_log jsonb,
  passed smallint,
  checks integer not null default 0,
  solved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (problem_id, user_id)
);

create index if not exists student_problem_attempts_user_idx on student_problem_attempts (user_id);

-- 보안 잠금(RLS). v2 서버는 서버 전용 키로 접근하므로 영향 없다.
alter table student_problems enable row level security;
alter table student_problem_attempts enable row level security;
