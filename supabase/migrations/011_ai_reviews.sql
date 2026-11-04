-- 011: AI 되돌아보기 (새 테이블, v1과 무관)
--
-- 실행 방법: Supabase 대시보드 → SQL Editor에 붙여넣고 Run (한 번만, 두 번 실행해도 괜찮음)
-- 기존 테이블은 건드리지 않는다.
--
-- 학생이 제출한 뒤 "AI와 되돌아보기"를 누르면, AI가 작성 과정의 특정 순간을 짚는 질문 2~3개를 만들고
-- 학생이 답을 적는다. 제출 하나에 하나만 만든다(비용 관리).
-- 미성년자 보호 규칙: 교사가 열람하고 부적절한 내용을 표시(신고)할 수 있어야 한다.

create table if not exists ai_reviews (
  id bigint generated always as identity primary key,
  user_id text not null,              -- 학생 users.id
  submission_id bigint not null unique, -- submissions.id (제출 하나에 하나)
  subject text not null,
  problem text not null,
  intro text not null,                -- AI가 먼저 건네는 말 (잘한 점 한두 문장)
  questions jsonb not null,           -- [{moment: {id, at, kind, label} | null, question, answer}] answer는 학생이 적음
  model text,
  input_tokens integer,
  output_tokens integer,
  flagged_by text check (flagged_by in ('student', 'teacher')),
  flag_note text,
  flagged_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ai_reviews_user_idx on ai_reviews (user_id, created_at);
create index if not exists ai_reviews_created_idx on ai_reviews (created_at);

-- 보안 잠금(RLS). v2 서버는 서버 전용 키로 접근하므로 영향 없다.
alter table ai_reviews enable row level security;
