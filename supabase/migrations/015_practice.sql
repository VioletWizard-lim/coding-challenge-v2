-- 015: 연습 모드 (새 테이블 2개, v1과 무관)
--
-- 실행 방법: Supabase 대시보드 → SQL Editor에 붙여넣고 Run (한 번만, 두 번 실행해도 괜찮음)
-- 기존 테이블은 건드리지 않는다. 실행 전에 백업을 권한다.
--
-- 학생이 "내가 막혔던 곳"(작성 기록에서 찾은 반복 오류·오래 멈춘 문제) 또는 개념을 골라 AI에게 연습 문제를 받는다.
-- 수업 제출(submissions)과 섞이지 않게 따로 저장한다. 참고 답안(solution)은 서버와 교사 화면에서만 쓰고 학생에게 보내지 않는다.
-- 미성년자 보호 규칙: 교사가 학생이 받은 연습 문제를 열람하고 부적절한 내용을 표시(신고)할 수 있어야 한다.

create table if not exists practice_problems (
  id bigint generated always as identity primary key,
  user_id text not null,              -- 학생 users.id
  subject text not null,
  source text not null check (source in ('concept', 'stuck')),  -- 개념을 골라서 / 내가 막혔던 곳에서
  concept text not null default '',
  level smallint not null default 2,  -- 1 쉬움, 2 보통, 3 어려움
  basis text not null default '',     -- 막힌 곳에서 만들었으면 그 근거 (예: "TypeError 7번 · 2-3 외 2문제")
  title text not null,
  description text not null,
  conditions jsonb not null default '[]',
  starter_code text not null default '',
  tests jsonb not null,               -- [{inputs: ["줄1", "줄2"], output: "기대 출력"}]
  solution text not null,             -- 참고 답안 (학생에게 보내지 않음)
  -- 학생이 푼 과정 (확인 버튼을 누를 때마다 마지막 것으로 저장, edit_log는 v1과 같은 형식)
  code text,
  init_code text,
  edit_log jsonb,
  passed smallint,                    -- 마지막 확인에서 통과한 테스트 수
  checks integer not null default 0,  -- 확인한 횟수
  solved_at timestamptz,              -- 처음 모두 통과한 시각
  model text,
  input_tokens integer,
  output_tokens integer,
  flagged_by text check (flagged_by in ('student', 'teacher')),
  flag_note text,
  flagged_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists practice_problems_user_idx on practice_problems (user_id, created_at);
create index if not exists practice_problems_created_idx on practice_problems (created_at);

-- 교사가 과목마다 정하는 연습 모드 설정: 켜고 끄기, 쓸 수 있는 개념(문법 범위), 범위 안내
create table if not exists practice_settings (
  subject text primary key,
  enabled boolean not null default true,
  concepts jsonb not null,            -- ["조건문(if·elif·else)", "반복문 for(range)", …]
  note text not null default '',
  updated_at timestamptz not null default now()
);

-- 보안 잠금(RLS). v2 서버는 서버 전용 키로 접근하므로 영향 없다.
alter table practice_problems enable row level security;
alter table practice_settings enable row level security;
