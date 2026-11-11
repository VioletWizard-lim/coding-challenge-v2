/** 동시접속 부하 테스트용 계정 (scripts/load-test.mjs). 브라우저·서버 공용 상수 */

/** 이 글자로 시작하는 학생 계정만 테스트 계정으로 보고 한꺼번에 지울 수 있다 */
export const LOAD_TEST_PREFIX = "loadtest";

/** 테스트 계정을 지울 때 적는 확인 문구 */
export const LOAD_TEST_PHRASE = "부하 테스트 계정 삭제";
