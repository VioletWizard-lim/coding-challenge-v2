-- 001: 비밀번호 bcrypt 해시 컬럼 추가 (v2 로그인용)
--
-- 실행 방법: Supabase 대시보드 → SQL Editor에 붙여넣고 Run (한 번만)
-- 실행 전 백업 권장: Database → Backups, 또는 Table Editor에서 users를 CSV로 내려받기
--
-- v1에는 영향이 없다: 기존 password(평문) 컬럼은 그대로 두고 새 컬럼만 추가한다.
-- v2는 로그인에 성공할 때마다 해시가 없으면 만들어 이 컬럼에 저장한다.

alter table users add column if not exists password_hash text;
