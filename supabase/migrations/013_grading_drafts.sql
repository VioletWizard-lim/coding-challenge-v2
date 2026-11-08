-- 013: AI 채점 초안 기록 (새 테이블, v1과 무관)
--
-- 실행 방법: Supabase 대시보드 → SQL Editor에 붙여넣고 Run (한 번만, 두 번 실행해도 괜찮음)
-- 기존 테이블은 건드리지 않는다.
--
-- 교사 채점 보조: AI가 만든 채점 초안(영역별 점수·이유, 감점 이유 문장)을 남긴다.
-- 같은 제출의 초안을 다시 열 때 AI를 또 부르지 않게(비용), 그리고 나중에 AI 초안과 교사가 확정한 점수
-- (submission_scores)를 비교해 볼 수 있게 한다. 학생 이름·아이디는 AI에 보내지 않는다.

create table if not exists grading_drafts (
  id bigint generated always as identity primary key,
  submission_id bigint not null,      -- submissions.id
  teacher_id text,                    -- 초안을 만든 교사 users.id
  parts jsonb not null,               -- [{name, max, desc?, score, reason}] 그때의 채점 기준 + AI 점수·이유
  feedback text not null default '',  -- 학생에게 보여 줄 감점 이유 초안
  note text not null default '',      -- 교사에게만: 과정 기록에서 본 것
  model text,
  input_tokens integer,
  output_tokens integer,
  created_at timestamptz not null default now()
);

create index if not exists grading_drafts_submission_idx on grading_drafts (submission_id, id);
create index if not exists grading_drafts_created_idx on grading_drafts (created_at);

-- 보안 잠금(RLS). v2 서버는 서버 전용 키로 접근하므로 영향 없다.
alter table grading_drafts enable row level security;
