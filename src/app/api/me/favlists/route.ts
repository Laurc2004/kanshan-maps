import { NextRequest, NextResponse } from "next/server";
import { decodeSession, SESSION_COOKIE } from "@/lib/session";
import { userFavlists } from "@/lib/zhihu";

// 当前登录用户的收藏夹列表（个人学习路线入口）
// 个人数据缓存按 token 尾段隔离，绝不跨用户共享
const cache = new Map<string, { items: unknown[]; ts: number }>();
const TTL = 1000 * 60 * 10; // 10 分钟

export async function GET(req: NextRequest) {
  const session = await decodeSession(req.cookies.get(SESSION_COOKIE)?.value);
  if (!session) {
    return NextResponse.json({ error: "未登录", loggedIn: false }, { status: 401 });
  }

  const cacheKey = session.t.slice(-12);
  const hit = cache.get(cacheKey);
  if (hit && Date.now() - hit.ts < TTL) {
    return NextResponse.json({ items: hit.items, cached: true });
  }

  try {
    const favlists = await userFavlists(session.t, 50);
    const items = favlists.map((f) => ({
      urlToken: f.UrlToken,
      title: f.Title,
      description: f.Description,
      url: f.Url,
      isPublic: f.IsPublic,
    }));
    cache.set(cacheKey, { items, ts: Date.now() });
    return NextResponse.json({ items, cached: false });
  } catch (e) {
    console.error("[/api/me/favlists]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "收藏夹获取失败" },
      { status: 502 }
    );
  }
}
