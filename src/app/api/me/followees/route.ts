import { NextRequest, NextResponse } from "next/server";
import { decodeSession, SESSION_COOKIE } from "@/lib/session";
import { userFollowees } from "@/lib/zhihu";

// 当前登录用户的关注列表（答主高亮用）
// 昵称归一化在客户端做（匹配搜索结果的 AuthorName）
const cache = new Map<string, { names: string[]; ts: number }>();
const TTL = 1000 * 60 * 30; // 30 分钟

export async function GET(req: NextRequest) {
  const session = await decodeSession(req.cookies.get(SESSION_COOKIE)?.value);
  if (!session) {
    return NextResponse.json({ error: "未登录", loggedIn: false }, { status: 401 });
  }

  const cacheKey = session.t.slice(-12); // token 尾段做 key，完整 token 不进内存索引
  const hit = cache.get(cacheKey);
  if (hit && Date.now() - hit.ts < TTL) {
    return NextResponse.json({ names: hit.names, cached: true });
  }

  try {
    // 翻页拉前 200 个关注（够用了，黑客松场景）
    const names: string[] = [];
    for (let offset = 0; offset < 200; offset += 50) {
      const items = await userFollowees(session.t, 50, offset);
      if (!Array.isArray(items) || items.length === 0) break;
      items.forEach((u: { Fullname?: string }) => u.Fullname && names.push(u.Fullname));
      if (items.length < 50) break;
    }
    cache.set(cacheKey, { names, ts: Date.now() });
    return NextResponse.json({ names, cached: false });
  } catch (e) {
    console.error("[/api/me/followees]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "关注列表获取失败" },
      { status: 502 }
    );
  }
}
