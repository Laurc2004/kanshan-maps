// OAuth 五场景端到端测试：打真实 dev server（HTTP），不 mock 路由内部。
// 运行前提：
//   OAUTH_TEST_BASE        已配置凭证的 dev server（如 http://localhost:3001）
//   OAUTH_TEST_BASE_UNCFG  未配置 ZHIHU_* 凭证的 dev server（如 http://localhost:3002）
//   OAUTH_TEST_MOCK_TOKEN  本地 mock /access_token（如 http://localhost:3003/token）
// 未设置时全部 skip（不打真实知乎端点，不消耗额度）。
import assert from "node:assert/strict";
import test from "node:test";

const BASE = process.env.OAUTH_TEST_BASE;
const BASE_UNCFG = process.env.OAUTH_TEST_BASE_UNCFG;
const MOCK_TOKEN = process.env.OAUTH_TEST_MOCK_TOKEN;

test("未配置凭证：/api/auth/login 返回 503 友好错误", { skip: !BASE_UNCFG }, async () => {
  const res = await fetch(`${BASE_UNCFG}/api/auth/login`, { redirect: "manual" });
  assert.equal(res.status, 503);
  const json = await res.json();
  assert.ok(json.error.includes("OAuth 未配置"));
});

test("已配置凭证：/api/auth/login 302 到知乎授权页并种 state cookie", { skip: !BASE }, async () => {
  const res = await fetch(`${BASE}/api/auth/login`, { redirect: "manual" });
  assert.ok([302, 307].includes(res.status));
  const loc = res.headers.get("location") ?? "";
  const u = new URL(loc);
  assert.equal(u.hostname, "openapi.zhihu.com");
  assert.equal(u.pathname, "/authorize");
  assert.ok(u.searchParams.get("app_id"));
  assert.ok(u.searchParams.get("redirect_uri"));
  assert.equal(u.searchParams.get("response_type"), "code");
  assert.ok(u.searchParams.get("state"));
  const setCookie = res.headers.getSetCookie().join("\n");
  assert.match(setCookie, /ks_oauth_state=/);
});

test("缺少授权码：回调重定向 ?auth_error=missing_code", { skip: !BASE }, async () => {
  // 先拿一个合法 state cookie
  const login = await fetch(`${BASE}/api/auth/login`, { redirect: "manual" });
  const stateCookie = login.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .find((c) => c.startsWith("ks_oauth_state="));
  assert.ok(stateCookie, "login 应种下 state cookie");

  const res = await fetch(`${BASE}/api/auth/callback`, {
    redirect: "manual",
    headers: { cookie: stateCookie },
  });
  assert.ok([302, 307].includes(res.status));
  const loc = new URL(res.headers.get("location") ?? "");
  assert.equal(loc.searchParams.get("auth_error"), "missing_code");
});

test("state 不匹配/缺失：回调重定向 ?auth_error=state_mismatch", { skip: !BASE }, async () => {
  const res = await fetch(`${BASE}/api/auth/callback?authorization_code=abc`, {
    redirect: "manual",
  });
  assert.ok([302, 307].includes(res.status));
  const loc = new URL(res.headers.get("location") ?? "");
  assert.equal(loc.searchParams.get("auth_error"), "state_mismatch");
});

test("Token 交换失败：伪造 code 打 mock 失败端点 → ?auth_error=token_exchange_failed", { skip: !BASE || !MOCK_TOKEN }, async () => {
  // mock 返回无 access_token 的错误响应
  const mock = serveToken(MOCK_TOKEN as string, "fail");
  const login = await fetch(`${BASE}/api/auth/login`, { redirect: "manual" });
  const stateCookie = login.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .find((c) => c.startsWith("ks_oauth_state=")) as string;
  const state = new URL(login.headers.get("location") ?? "").searchParams.get("state");

  const res = await fetch(`${BASE}/api/auth/callback?authorization_code=fake&state=${state}`, {
    redirect: "manual",
    headers: { cookie: stateCookie },
  });
  const loc = new URL(res.headers.get("location") ?? "");
  assert.equal(loc.searchParams.get("auth_error"), "token_exchange_failed");
  mock.close();
});

test("成功登录：mock 换 token 成功 → 种会话 cookie + /api/auth/me 已登录", { skip: !BASE || !MOCK_TOKEN }, async () => {
  const mock = serveToken(MOCK_TOKEN as string, "ok");
  const login = await fetch(`${BASE}/api/auth/login`, { redirect: "manual" });
  const stateCookie = login.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .find((c) => c.startsWith("ks_oauth_state=")) as string;
  const state = new URL(login.headers.get("location") ?? "").searchParams.get("state");

  const res = await fetch(`${BASE}/api/auth/callback?authorization_code=good&state=${state}`, {
    redirect: "manual",
    headers: { cookie: stateCookie },
  });
  assert.ok([302, 307].includes(res.status));
  const loc = new URL(res.headers.get("location") ?? "");
  assert.equal(loc.searchParams.get("auth_error"), null, "不应有错误参数");
  const sessionCookie = res.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .find((c) => c.startsWith("ks_session="));
  assert.ok(sessionCookie, "应种下会话 cookie");

  const me = await fetch(`${BASE}/api/auth/me`, { headers: { cookie: sessionCookie } });
  const meJson = await me.json();
  assert.equal(meJson.loggedIn, true);
  mock.close();
});

// 轻量 mock /access_token：mode=ok 返回 access_token，mode=fail 返回错误
import http from "node:http";
import { URL as NodeURL } from "node:url";
function serveToken(base: string, mode: "ok" | "fail") {
  const u = new NodeURL(base);
  const server = http.createServer((req, res) => {
    res.setHeader("content-type", "application/json");
    if (mode === "ok") {
      res.end(JSON.stringify({ access_token: "mock_token_123", expires_in: 86400 }));
    } else {
      res.end(JSON.stringify({ error: "invalid_grant" }));
    }
  });
  server.listen(Number(u.port), "127.0.0.1");
  return {
    close: () => server.close(),
  };
}
