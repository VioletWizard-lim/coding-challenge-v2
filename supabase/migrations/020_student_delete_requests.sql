-- 020: 학생 삭제 요청 (새 테이블, v1과 무관)
--
-- 실행 방법: Supabase 대시보드 → SQL Editor에 붙여넣고 Run (한 번만, 두 번 실행해도 괜찮음)
-- 기존 테이블은 건드리지 않는다. 실행 전에 백업을 권한다.
--
-- 학생 한 명(전학, 잘못 만든 계정, 개인정보 삭제 요청 등)을 지울 때: 교사가 🏫 학생 관리에서 "삭제 요청"을 보내고,
-- 관리자가 그 학생의 백업 ZIP을 받은 뒤 계정과 모든 기록을 지운다(또는 거절). 지우는 것은 관리자만 할 수 있다.

create table if not exists student_delete_requests (
  id bigint generated always as identity primary key,
  student_id text not null,             -- 지울 학생 users.id
  student_name text not null default '',-- 요청할 때의 이름 (지운 뒤에도 누구였는지 남김)
  reason text not null,                 -- 요청 이유 (예: 전학)
  requested_by text not null,           -- 요청한 교사 users.id
  status text not null default 'pending' check (status in ('pending', 'done', 'rejected', 'canceled')),
  handled_by text,                      -- 처리한 관리자 users.id
  handled_note text not null default '',-- 거절 이유 등
  created_at timestamptz not null default now(),
  handled_at timestamptz
);

create index if not exists student_delete_requests_status_idx on student_delete_requests (status, created_at);

-- 보안 잠금(RLS). v2 서버는 서버 전용 키로 접근하므로 영향 없다.
alter table student_delete_requests enable row level security;
