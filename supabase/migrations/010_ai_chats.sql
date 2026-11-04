-- 010: AI 대화 기록 (새 테이블, v1과 무관)
--
-- 실행 방법: Supabase 대시보드 → SQL Editor에 붙여넣고 Run (한 번만, 두 번 실행해도 괜찮음)
-- 기존 테이블은 건드리지 않는다.
--
-- 학생이 AI 도우미(나중에 되돌아보기·연습 문제 생성도)에게 물은 질문과 AI 답을 남긴다.
-- 미성년자 보호 규칙: 교사가 학생의 AI 대화를 열람하고, 부적절한 대화를 표시(신고)할 수 있어야 한다.
-- 학생 하루 질문 수(한도)도 이 표로 센다. at_ms는 작성 기록(edit_log) 안의 [시각ms, "q"]와 같은 시각이다.

create table if not exists ai_chats (
  id bigint generated always as identity primary key,
  user_id text not null,              -- 물어본 학생 users.id
  feature text not null default 'helper' check (feature in ('helper', 'review', 'practice')),
  subject text not null,
  problem text not null,              -- 문제 번호 (예: "2-3")
  at_ms bigint,                       -- 기록 안의 질문 시각 (edit_log의 "q"와 같음)
  question text not null,
  answer text not null,
  moments jsonb,                      -- 답에 나온 과정의 순간들 [{id, at, kind, label}]
  model text,                         -- 답한 AI 모델 이름
  input_tokens integer,               -- 사용량 (비용 확인용)
  output_tokens integer,
  flagged_by text check (flagged_by in ('student', 'teacher')),  -- 부적절한 대화 표시 (없으면 null)
  flag_note text,
  flagged_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists ai_chats_user_idx on ai_chats (user_id, created_at);
create index if not exists ai_chats_created_idx on ai_chats (created_at);

-- 보안 잠금(RLS). v2 서버는 서버 전용 키로 접근하므로 영향 없다.
alter table ai_chats enable row level security;
