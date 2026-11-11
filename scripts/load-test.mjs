#!/usr/bin/env node
/**
 * 동시접속 부하 테스트 (보고서용 수치) — docs/load-test.md
 *
 * 한 반이 함께 쓰는 순간을 흉내 낸다: N명이 "동시에" 로그인 → 각자 코드 작성 탭에서 코드·설명을 쓰고 → "동시에" 제출.
 * 서버가 걸린 시간은 브라우저가 잰 요청 시간(요청을 보낸 뒤 응답이 끝날 때까지)으로 잰다. 이 컴퓨터가 브라우저 여러 개를
 * 돌리느라 느려지는 것(글자 입력 등)은 숫자에 넣지 않으려는 것이다.
 *
 * 테스트 계정만 쓴다(아이디가 loadtest로 시작). 끝나면 🛠 관리자 → 🧑‍🎓 학생 삭제 요청 탭의 "🧪 부하 테스트 계정 정리"로 지운다.
 *
 * 쓰는 법:
 *   node scripts/load-test.mjs --base https://line-by-line-class.vercel.app --accounts accounts.csv [--users 30] [--out result.json]
 *   accounts.csv: 첫 줄 "아이디,이름,...,초기비밀번호" (학생 관리 CSV 등록 양식과 같음)
 * Playwright가 필요하다 (npm i -D playwright 또는 전역 설치).
 */
import { createRequire } from "node:module";
import { readFileSync, writeFileSync } from "node:fs";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
};
const BASE = String(arg("base", "http://localhost:3000")).replace(/\/$/, "");
const ACCOUNTS = arg("accounts");
const USERS = Number(arg("users", "0"));
const OUT = arg("out");
/** 실패한 사람의 화면을 이 폴더에 저장 (원인 찾기용) */
const SHOTS = arg("shots");
const TIMEOUT = 60_000;

if (!ACCOUNTS) {
  console.error("--accounts CSV 파일을 주세요 (아이디, 초기비밀번호 칸).");
  process.exit(1);
}

/** 학생 관리 CSV 양식에서 아이디·비밀번호만 읽는다 (loadtest로 시작하는 계정만) */
function readAccounts(path) {
  const lines = readFileSync(path, "utf8").replace(/^﻿/, "").trim().split(/\r?\n/);
  const head = lines[0].split(",").map((h) => h.trim());
  const idAt = head.findIndex((h) => h === "아이디" || h === "학번");
  const pwAt = head.findIndex((h) => h === "초기비밀번호" || h === "비밀번호");
  const list = lines.slice(1).map((l) => l.split(",")).map((c) => ({ id: c[idAt]?.trim(), password: c[pwAt]?.trim() }));
  const ok = list.filter((a) => a.id?.startsWith("loadtest") && a.password);
  if (ok.length !== list.length) console.warn(`loadtest로 시작하지 않거나 비밀번호가 없는 줄 ${list.length - ok.length}개는 뺐어요.`);
  return ok;
}

/** 여러 사람이 같은 순간에 출발하게 하는 출발선 */
function barrier(n) {
  let arrived = 0;
  let release;
  const gate = new Promise((r) => (release = r));
  return () => {
    arrived += 1;
    if (arrived >= n) release(Date.now());
    return gate;
  };
}

/**
 * 요청 하나의 서버 응답 시간(ms): 요청을 다 보낸 뒤 응답의 첫 바이트가 올 때까지.
 * Next.js 서버 액션(로그인·제출)은 액션(DB 저장 등)을 마친 뒤에 응답을 보내기 시작하므로 서버가 일한 시간에 가깝다.
 * (응답 끝까지 기다리지 않는다: 화면을 스트리밍으로 보내는 응답은 '다 받음' 표시가 늦거나 오지 않을 수 있다)
 */
const serverMs = (req) => {
  const t = req?.timing();
  return t && t.responseStart > 0 && t.requestStart >= 0 ? Math.round(t.responseStart - t.requestStart) : null;
};

/** 서버 액션(로그인·제출)의 응답이 오기 시작할 때까지 기다린다 → 그 요청 */
const waitAction = (page) => {
  const p = page
    .waitForResponse((res) => res.request().method() === "POST" && !!res.request().headers()["next-action"], { timeout: TIMEOUT })
    .then((res) => res.request());
  p.catch(() => {}); // 앞에서 실패하면 기다리던 것은 버린다
  return p;
};

async function runUser(browser, account, n, gates) {
  const r = { id: account.id, login: null, page: null, submit: null, ok: false, error: null, atLogin: false, atSubmit: false };
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  try {
    await page.goto(`${BASE}/`, { timeout: TIMEOUT });
    await page.fill("input[name=id]", account.id);
    await page.fill("input[name=password]", account.password);
    r.atLogin = true;
    await gates.login(); // 모두 함께 로그인
    const loginReq = waitAction(page);
    await page.click("button[type=submit]");
    // 로그인 요청의 응답에 학생 첫 화면(서버에서 그린 것)까지 함께 온다
    r.login = serverMs(await loginReq);
    await page.waitForURL("**/student**", { timeout: TIMEOUT });

    await page.locator("nav button, aside button", { hasText: "코드 작성" }).first().click();
    const editor = page.locator(".cm-content:visible").first();
    await editor.waitFor({ timeout: TIMEOUT });
    await editor.click();
    await page.keyboard.type(`# 부하 테스트 ${n}\nprint("안녕하세요")\n`, { delay: 5 });
    await page.getByPlaceholder("내 코드가 어떻게 동작하는지").fill(`부하 테스트 제출 ${n}`);
    r.atSubmit = true;
    await gates.submit(); // 모두 함께 제출
    const submitReq = waitAction(page);
    await page.getByRole("button", { name: "제출하기" }).click();
    r.submit = serverMs(await submitReq);
    await page.getByText(/제출 완료/).first().waitFor({ timeout: TIMEOUT });
    // 제출 직후 학생 화면을 새로 연다 (방금 쓴 제출까지 읽어 그리는 서버 시간: 학습 여정·업적·첫 화면)
    const doc = await page.goto(`${BASE}/student`, { timeout: TIMEOUT, waitUntil: "commit" });
    r.page = doc ? serverMs(doc.request()) : null;
    r.ok = true;
  } catch (err) {
    r.error = String(err?.message ?? err).split("\n")[0].slice(0, 200);
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/${account.id}.png` }).catch(() => {});
  } finally {
    await context.close();
  }
  return r;
}

function stats(values) {
  const v = values.filter((x) => typeof x === "number").sort((a, b) => a - b);
  if (!v.length) return null;
  const at = (p) => v[Math.min(v.length - 1, Math.ceil((p / 100) * v.length) - 1)];
  return { n: v.length, mean: Math.round(v.reduce((s, x) => s + x, 0) / v.length), p50: at(50), p95: at(95), max: v[v.length - 1] };
}

const accounts = readAccounts(ACCOUNTS).slice(0, USERS > 0 ? USERS : undefined);
if (!accounts.length) {
  console.error("테스트 계정(loadtest…)이 없어요.");
  process.exit(1);
}
console.log(`${BASE} · 동시 ${accounts.length}명 · 시작 ${new Date().toISOString()}`);

const browser = await chromium.launch();
// 안전장치: 무엇이 멈춰도 8분 뒤에는 끝낸다
setTimeout(() => {
  console.error("8분이 지나 테스트를 멈췄어요.");
  process.exit(3);
}, 8 * 60_000).unref();
// 실패한 사람이 있어도 나머지가 기다리다 멈추지 않게, 출발선은 '도착했거나 실패한 사람' 수로 센다
const login = barrier(accounts.length);
const submit = barrier(accounts.length);
const gates = { login, submit };
const started = Date.now();
const results = await Promise.all(
  accounts.map((a, i) =>
    runUser(browser, a, i + 1, gates).then((r) => {
      // 출발선에 오기 전에 실패한 사람은 대신 도착 처리 (남은 사람이 기다리다 멈추지 않게)
      if (!r.atLogin) login();
      if (!r.atSubmit) submit();
      delete r.atLogin;
      delete r.atSubmit;
      return r;
    }),
  ),
);
await browser.close();

const summary = {
  base: BASE,
  users: accounts.length,
  at: new Date(started).toISOString(),
  totalSeconds: Math.round((Date.now() - started) / 100) / 10,
  success: results.filter((r) => r.ok).length,
  errors: results.filter((r) => !r.ok).map((r) => `${r.id}: ${r.error}`),
  loginMs: stats(results.map((r) => r.login)),
  studentPageAfterSubmitMs: stats(results.map((r) => r.page)),
  submitMs: stats(results.map((r) => r.submit)),
};
console.log(JSON.stringify(summary, null, 2));
if (OUT) writeFileSync(OUT, JSON.stringify({ summary, results }, null, 2));
process.exit(summary.success === accounts.length ? 0 : 2);
