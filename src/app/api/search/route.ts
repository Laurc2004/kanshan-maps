import { NextRequest, NextResponse } from "next/server";
import { zhihuSearch } from "@/lib/zhihu";

// 只搜索回答不生成（用户自选素材流程第一步）
export async function POST(req: NextRequest) {
  try {
    const { question, offset } = await req.json();
    if (!question || typeof question !== "string" || question.trim().length < 2) {
      return NextResponse.json({ error: "请输入有效的问题" }, { status: 400 });
    }
    const safeOffset = Number.isInteger(offset) && offset >= 0 ? offset : 0;
    const items = await zhihuSearch(question.trim(), 10, safeOffset);
    return NextResponse.json({ items, offset: safeOffset, hasMore: items.length === 10 });
  } catch (e) {
    console.error("[/api/search]", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "搜索失败" }, { status: 502 });
  }
}
