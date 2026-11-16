-- 022: 남아 있는 평문 비밀번호를 해시(bcrypt)로 바꾸고 평문 칸을 비운다 (v1 운영 끝, 2026-11)
--
-- 왜: v1이 쓰던 users.password(평문) 칸에 비밀번호가 글자 그대로 남아 있다. v2는 password_hash(bcrypt)만 쓴다.
-- 칸 자체는 지우지 않는다(값만 비움). 표·칸 구조는 그대로다.
--
-- 실행 전에:
--   1) 전체 백업을 받는다 (Supabase 대시보드 → Database → Backups, 또는 관리자 화면의 백업).
--   2) 수업이 없는 시간에 실행한다. 비밀번호 해시를 새로 만들므로, 지금 로그인해 있는 사람은 한 번 로그아웃된다
--      (같은 비밀번호로 다시 로그인하면 된다. 비밀번호는 바뀌지 않는다).
--
-- 실행 방법: Supabase 대시보드 → SQL Editor에 붙여넣고 Run.
--   Run을 한 번 누를 때마다 200명씩 처리된다 (해시 만들기가 느려서 나눠 한다).
--   맨 아래 결과(남은_평문)가 0이 될 때까지 Run을 여러 번 누른다. 여러 번 눌러도 괜찮다.

-- ① 해시를 만드는 기능 (Supabase에는 보통 이미 켜져 있다)
create extension if not exists pgcrypto with schema extensions;

-- ② 몇 명 남았는지 (참고)
select count(*) as 평문이_남은_계정 from users where password is not null;

-- ③ 200명씩: 평문 비밀번호로 해시를 새로 만들고 평문을 비운다.
--    v1에서 바꾼 비밀번호는 평문 칸에만 있었으므로, 평문을 기준으로 해시를 다시 만든다.
--    (v2의 bcrypt 비교는 여기서 만드는 $2a$ 해시도 그대로 읽는다)
update users
set password_hash = extensions.crypt(password, extensions.gen_salt('bf', 10)),
    password = null
where id in (
  select id from users where password is not null and password <> '' limit 200
);

-- ④ 빈 문자열('')로 남은 평문 칸도 비운다 (빈 비밀번호로는 로그인할 수 없으므로 해시는 만들지 않음)
update users set password = null where password = '';

-- ⑤ 확인: 0이어야 한다
select count(*) as 남은_평문 from users where password is not null;
