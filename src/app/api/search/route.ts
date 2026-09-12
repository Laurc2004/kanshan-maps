import { NextRequest, NextResponse } from "next/server";
import { zhihuSearch } from "@/lib/zhihu";

// 只搜索回答不生成（用户自选素材流程第一步）
export async function POST(req: NextRequest) {
  try {
    const { question } = await req.json();
    if (!question || typeof question !== "string" || question.trim().length < 2) {
      return NextResponse.json({ error: "请输入有效的问题" }, { status: 400 });
    }
    const items = await zhihuSearch(question.trim(), 10);
    return NextResponse.json({ items });
  } catch (e) {
    console.error("[/api/search]", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "搜索失败" }, { status: 502 });
  }
}
