# 파이썬 코딩 챌린지 v2

코드를 **어떻게** 썼는지 기록하고 돌아보는 수업 도구. v1(Streamlit, `VioletWizard-lim/coding-challenge`)을 Next.js로 다시 만드는 중이다.
방향과 규칙은 [`CLAUDE.md`](CLAUDE.md), 일정은 [`docs/PLAN.md`](docs/PLAN.md).

## 처음 실행하기

```bash
npm install
cp .env.example .env.local   # 값 채우기
npm run dev                  # http://localhost:3000
```

## 확인 명령

```bash
npm run lint
npm test        # 기록(edit_log) 형식 단위 테스트
npm run build
```

## DB 변경 (직접 실행)

`supabase/migrations/` 의 SQL은 자동으로 실행되지 않는다. 백업 후 Supabase 대시보드 → SQL Editor에서 번호 순서대로 한 번씩 실행한다.
모두 "추가만" 하는 변경이라 v1에 영향이 없다.

## 폴더 구조

```
src/app/              화면과 서버 코드 (/ 로그인, /student, /teacher, /api/health, /logout)
src/components/       RecordingEditor(기록 편집기), Header
src/lib/editLog.ts    edit_log 형식 (v1과 호환) + 테스트
src/lib/session.ts    서명 쿠키 세션 (jose)
src/lib/auth.ts       로그인 확인 (bcrypt, v1 평문 비밀번호와 함께 운영)
src/lib/problems.ts   과목·문제 목록 (v1 problem_data.py)
src/lib/pyodide.ts    브라우저 파이썬 실행
supabase/migrations/  DB 변경 SQL (직접 실행)
vercel.json           하루 1회 /api/health 호출 (DB 연결 확인)
```
