import { NextRequest, NextResponse } from "next/server";
import { decodeSession, SESSION_COOKIE } from "@/lib/session";
import { userFavlistContents } from "@/lib/zhihu";

// 收藏夹内容（个人学习路线的素材来源）
// 只取 answer/article/question 三类文字内容，video/pin 跳过
// 返回结构与 SourceItem 对齐，可直接进生成管线
const cache = new Map<string, { items: unknown[]; ts: number }>();
const TTL = 1000 * 60 * 10;

export async function GET(req: NextRequest) {
  const session = await decodeSession(req.cookies.get(SESSION_COOKIE)?.value);
  if (!session) {
    return NextResponse.json({ error: "未登录", loggedIn: false }, { status: 401 });
  }

  const urlToken = Number(req.nextUrl.searchParams.get("urlToken"));
  if (!Number.isFinite(urlToken) || urlToken <= 0) {
    return NextResponse.json({ error: "urlToken 无效" }, { status: 400 });
  }

  const cacheKey = `${session.t.slice(-12)}:${urlToken}`;
  const hit = cache.get(cacheKey);
  if (hit && Date.now() - hit.ts < TTL) {
    return NextResponse.json({ items: hit.items, cached: true });
  }

  try {
    // 最多翻 2 页（100 条），黑客松场景够用
    const all: { title: string; url: string; author: string; content: string; voteupCount: number; source: string }[] = [];
    let offset = 0;
    for (let page = 0; page < 2; page++) {
      const { items, isEnd } = await userFavlistContents(session.t, urlToken, 50, offset);
      for (const it of items) {
        if (it.ContentType !== "answer" && it.ContentType !== "article" && it.ContentType !== "question") continue;
        all.push({
          title: it.Title,
          url: it.Url,
          author: it.Author?.Name ?? "",
          content: it.Summary ?? "",
          voteupCount: it.LikeCount ?? 0,
          source: "favlist",
        });
      }
      if (isEnd) break;
      offset += 50;
    }
    cache.set(cacheKey, { items: all, ts: Date.now() });
    return NextResponse.json({ items: all, cached: false });
  } catch (e) {
    console.error("[/api/me/favlist-contents]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "收藏夹内容获取失败" },
      { status: 502 }
    );
  }
}
