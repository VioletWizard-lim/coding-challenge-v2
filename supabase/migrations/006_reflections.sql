-- 006: 오늘의 성찰 (새 테이블, v1과 무관)
--
-- 실행 방법: Supabase 대시보드 → SQL Editor에 붙여넣고 Run (한 번만, 두 번 실행해도 괜찮음)
-- 기존 테이블은 건드리지 않는다.
--
-- 학생이 수업을 마치고 쓰는 성찰. 학생 한 명이 수업 날짜·과목마다 한 줄 (그날 안에는 고쳐 쓸 수 있다).
-- 학습지의 "오늘의 성찰" 칸과 같다: 가장 어려웠던 문제(번호, 이유) · AI에게 질문한 내용 · 오늘 배운 핵심 개념
-- grade/class는 쓴 날의 반을 남긴다 (과목이 "프로그래밍"이면 프로그래밍 수업 반, submissions와 같은 규칙).

create table if not exists reflections (
  id bigint generated always as identity primary key,
  user_id text not null,              -- users.id (학번/아이디)
  subject text not null,
  class_date date not null,           -- 수업 날짜 (한국 시간)
  grade text,
  class text,
  hardest_problem text not null default '',  -- 문제 번호 (예: "1-6"), 고르지 않으면 빈 칸
  hardest_reason text not null default '',
  ai_questions text not null default '',
  key_concepts text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, subject, class_date)
);

create index if not exists reflections_date_idx on reflections (class_date, subject);

-- 보안 잠금(RLS). v2 서버는 서버 전용 키로 접근하므로 영향 없다.
alter table reflections enable row level security;
