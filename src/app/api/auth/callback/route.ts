import { NextRequest, NextResponse } from "next/server";
import { encodeSession, SESSION_COOKIE, SESSION_MAX_AGE } from "@/lib/session";

// 知乎 OAuth 回调：authorization_code 换 access_token，写签名会话 cookie，回首页
export async function GET(req: NextRequest) {
  const url = req.nextUrl;
  const code = url.searchParams.get("authorization_code") ?? url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const home = new URL("/", url.origin);

  if (!code) {
    home.searchParams.set("auth_error", "missing_code");
    return NextResponse.redirect(home);
  }
  // state 校验（防 CSRF）；知乎回跳是同站 top-level 导航，lax cookie 能带到
  const savedState = req.cookies.get("ks_oauth_state")?.value;
  if (!savedState || savedState !== state) {
    home.searchParams.set("auth_error", "state_mismatch");
    return NextResponse.redirect(home);
  }

  const appId = process.env.ZHIHU_APP_ID;
  const appKey = process.env.ZHIHU_APP_KEY;
  const redirectUri = process.env.OAUTH_REDIRECT_URI;
  if (!appId || !appKey || !redirectUri) {
    home.searchParams.set("auth_error", "server_not_configured");
    return NextResponse.redirect(home);
  }

  try {
    // 表单字段名是 code 不是 authorization_code（官方文档明确的坑）
    const body = new URLSearchParams({
      app_id: appId,
      app_key: appKey,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
      code,
    });
    const tokenRes = await fetch("https://openapi.zhihu.com/access_token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    const json = await tokenRes.json();
    // 成功判断以响应含 access_token 为准（业务码可能是 20000）
    const token = json.access_token as string | undefined;
    if (!token) {
      console.error("[oauth] token exchange failed:", JSON.stringify(json).slice(0, 200));
      home.searchParams.set("auth_error", "token_exchange_failed");
      return NextResponse.redirect(home);
    }

    const res = NextResponse.redirect(home);
    res.cookies.set(SESSION_COOKIE, await encodeSession(token), {
      httpOnly: true,
      maxAge: SESSION_MAX_AGE,
      sameSite: "lax",
      path: "/",
    });
    res.cookies.delete("ks_oauth_state");
    return res;
  } catch (e) {
    console.error("[oauth]", e);
    home.searchParams.set("auth_error", "network");
    return NextResponse.redirect(home);
  }
}
