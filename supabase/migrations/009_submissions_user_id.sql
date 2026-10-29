-- 009: 제출에 학생 아이디(user_id) 칸 추가 — 동명이인 제출이 섞이지 않게
--
-- 실행 방법: Supabase 대시보드 → SQL Editor에 붙여넣고 Run (한 번만, 두 번 실행해도 괜찮음)
-- ⚠️ submissions 테이블에 새 칸을 더하고 지난 제출에 값을 채우므로, 실행 전에 백업을 권해요.
-- 기존 칸은 건드리지 않는다. v1은 이 칸을 모르고 계속 이름(name)으로 저장·조회한다.
--
-- v2는 새 제출에 user_id를 함께 저장하고, "내 제출"을 user_id로 찾는다.
-- user_id가 비어 있는 제출(지난 제출, v1에서 낸 제출)은 이름으로 찾되, 동명이인이 있으면 반까지 맞춰 본다.

-- 1) 칸 추가
alter table submissions add column if not exists user_id text;
create index if not exists submissions_user_id_idx on submissions (user_id);

-- 2) 지난 제출 채우기: 같은 이름의 학생이 한 명뿐이면 그 학생
update submissions s
set user_id = u.id
from users u
where s.user_id is null
  and u.role = 'student'
  and u.name = s.name
  and (select count(*) from users u2 where u2.role = 'student' and u2.name = s.name) = 1;

-- 3) 동명이인: 제출할 때의 반(grade/class)이 학생 계정의 반이나 프로그래밍 반과 맞는 학생이 한 명뿐이면 그 학생
update submissions s
set user_id = (
  select u.id from users u
  where u.role = 'student' and u.name = s.name
    and (
      (u.grade::text = s.grade::text and u.class::text = s.class::text)
      or (u.programming_grade::text = s.grade::text and u.programming_class::text = s.class::text)
    )
)
where s.user_id is null
  and (
    select count(*) from users u
    where u.role = 'student' and u.name = s.name
      and (
        (u.grade::text = s.grade::text and u.class::text = s.class::text)
        or (u.programming_grade::text = s.grade::text and u.programming_class::text = s.class::text)
      )
  ) = 1;

-- 4) 확인용: 아직 user_id가 비어 있는 제출 수 (v1 제출, 학생 계정이 없는 이름 등)
select count(*) as user_id_비어있는_제출 from submissions where user_id is null;
