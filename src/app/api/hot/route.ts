import { NextResponse } from "next/server";
import { hotList } from "@/lib/zhihu";

// 知乎热榜（首页落地内容，不登录可看）
const cache = { items: null as unknown, ts: 0 };
const TTL = 1000 * 60 * 15; // 15 分钟

export async function GET() {
  if (cache.items && Date.now() - cache.ts < TTL) {
    return NextResponse.json({ items: cache.items, cached: true });
  }
  try {
    const items = await hotList(30);
    cache.items = items;
    cache.ts = Date.now();
    return NextResponse.json({ items, cached: false });
  } catch (e) {
    console.error("[/api/hot]", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "热榜获取失败" }, { status: 502 });
  }
}
