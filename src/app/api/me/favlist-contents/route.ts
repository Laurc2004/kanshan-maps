import { NextRequest, NextResponse } from "next/server";
import { decodeSession, SESSION_COOKIE } from "@/lib/session";
import { userFavlistContents, type CollectionContentItem } from "@/lib/zhihu";

// 收藏夹内容（个人学习路线的素材来源）
// 只取 answer/article/question 三类文字内容，video/pin 跳过
// 直接返回 SearchResultItem 结构（大写字段），与 generate(picked) 管线对齐
const cache = new Map<string, { items: unknown[]; ts: number }>();
const TTL = 1000 * 60 * 10;

function toSearchResultItem(it: CollectionContentItem, index: number) {
  return {
    Title: it.Title ?? "",
    ContentType: it.ContentType ?? "answer",
    ContentID: `favlist-${it.Url ?? index}`,
    ContentText: it.Summary ?? "",
    Url: it.Url ?? "",
    VoteUpCount: it.LikeCount ?? 0,
    AuthorName: it.Author?.Name ?? "",
    CommentCount: it.CommentCount ?? 0,
    EditTime: it.CreatedAt ?? 0,
  };
}

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
    const all: ReturnType<typeof toSearchResultItem>[] = [];
    let offset = 0;
    for (let page = 0; page < 2; page++) {
      const { items, isEnd } = await userFavlistContents(session.t, urlToken, 50, offset);
      for (const it of items) {
        if (it.ContentType !== "answer" && it.ContentType !== "article" && it.ContentType !== "question") continue;
        all.push(toSearchResultItem(it, all.length));
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
