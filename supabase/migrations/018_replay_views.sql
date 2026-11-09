-- 018: 학생이 내 작성 과정 재생을 끝까지 본 기록 (새 테이블, v1과 무관)
--
-- 실행 방법: Supabase 대시보드 → SQL Editor에 붙여넣고 Run (한 번만, 두 번 실행해도 괜찮음)
-- 기존 테이블은 건드리지 않는다. 실행 전에 백업을 권한다.
--
-- 업적 "나를 보는 눈"(내 재생을 끝까지 보기)에 쓴다. 제출 하나에 학생 한 명당 한 줄(처음 끝까지 본 때)만 남긴다.
-- 감시용이 아니라 성찰을 칭찬하기 위한 기록이다.

create table if not exists replay_views (
  user_id text not null,               -- 학생 users.id
  submission_id bigint not null,       -- submissions.id (내 제출)
  watched_at timestamptz not null default now(),
  primary key (user_id, submission_id)
);

-- 보안 잠금(RLS). v2 서버는 서버 전용 키로 접근하므로 영향 없다.
alter table replay_views enable row level security;
