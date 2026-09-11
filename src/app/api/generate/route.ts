import { NextRequest, NextResponse } from "next/server";
import { zhihuSearch } from "@/lib/zhihu";
import { extractViewpoints } from "@/lib/viewpoints";

const cache = new Map<string, { graph: unknown; ts: number }>();
const TTL = 1000 * 60 * 60 * 6;

export async function POST(req: NextRequest) {
  try {
    const { question, engine } = await req.json();
    if (!question || typeof question !== "string" || question.trim().length < 2) {
      return NextResponse.json({ error: "请输入有效的问题" }, { status: 400 });
    }
    const q = question.trim();
    const engineId = engine?.id || "builtin";
    // 缓存 key 包含引擎（不同引擎结果分开缓存）；custom 引擎的用户 key 不进缓存 key
    const key = `${engineId}:${q.toLowerCase()}`;

    const hit = cache.get(key);
    if (hit && Date.now() - hit.ts < TTL) {
      return NextResponse.json({ graph: hit.graph, cached: true });
    }

    const items = await zhihuSearch(q, 10);
    if (items.length === 0) {
      return NextResponse.json({ error: "知乎上没有找到相关内容，换个问法试试" }, { status: 404 });
    }

    // 只透传引擎的必要字段，用户 apiKey 仅本次请求使用
    const engineCfg = { id: engineId, baseURL: engine?.baseURL, apiKey: engine?.apiKey, model: engine?.model };
    const graph = await extractViewpoints(q, items, engineCfg);
    if (graph.viewpoints.length === 0) {
      return NextResponse.json({ error: "这些内容观点太分散，暂时无法归纳立场，换个更具体的问题试试" }, { status: 422 });
    }

    cache.set(key, { graph, ts: Date.now() });
    return NextResponse.json({ graph, cached: false, sources: items.length, items });
  } catch (e) {
    console.error("[/api/generate]", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "生成失败，请稍后重试" }, { status: 500 });
  }
}
