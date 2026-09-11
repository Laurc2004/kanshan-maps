import { NextResponse } from "next/server";

// 发起知乎 OAuth：302 到 openapi.zhihu.com/authorize
// 没配 app_id 时返回友好错误而不是死链
export async function GET() {
  const appId = process.env.ZHIHU_APP_ID;
  const redirectUri = process.env.OAUTH_REDIRECT_URI;
  if (!appId || !redirectUri) {
    return NextResponse.json(
      { error: "OAuth 未配置：需要 ZHIHU_APP_ID 和 OAUTH_REDIRECT_URI（黑客松活动页分配后填入 .env）" },
      { status: 503 }
    );
  }
  const state = crypto.randomUUID();
  const url = new URL("https://openapi.zhihu.com/authorize");
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("app_id", appId);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("state", state);

  const res = NextResponse.redirect(url.toString());
  // state 存 cookie 防 CSRF，回调时校验
  res.cookies.set("ks_oauth_state", state, { httpOnly: true, maxAge: 600, sameSite: "lax", path: "/" });
  return res;
}
