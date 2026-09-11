import { NextRequest } from "next/server";
import { zhihuSearch } from "@/lib/zhihu";
import { extractViewpoints } from "@/lib/viewpoints";
import { buildRoadmapMessages, parseRoadmapJson } from "@/lib/roadmap";

// SSE 流式生成：先推素材（sources）→ 再推图（graph），分步可见
// mode=viewpoint（观点对照图，默认）/ roadmap（学习路线图）

const cache = new Map<string, { graph: unknown; items: unknown; ts: number }>();
const TTL = 1000 * 60 * 60 * 6;

function sse(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

async function runEngine(
  engineCfg: { id: string; baseURL?: string; apiKey?: string; model?: string },
  messages: { role: string; content: string }[]
): Promise<string> {
  if (engineCfg.id === "zhida") {
    const { zhida } = await import("@/lib/zhihu");
    return zhida(messages);
  }
  if (engineCfg.id === "custom") {
    if (!engineCfg.baseURL || !engineCfg.apiKey) throw new Error("自定义引擎缺少 baseURL 或 apiKey");
    const { chatComplete } = await import("@/lib/engines");
    return chatComplete(
      { baseURL: engineCfg.baseURL, apiKey: engineCfg.apiKey, model: engineCfg.model || "deepseek-v4-pro" },
      messages
    );
  }
  const { chatComplete, builtinEngines } = await import("@/lib/engines");
  const cfg = builtinEngines().builtin;
  if (!cfg.apiKey) throw new Error("内置引擎未配置 API Key");
  return chatComplete(cfg, messages);
}

export async function POST(req: NextRequest) {
  const { question, engine, mode } = await req.json();
  if (!question || typeof question !== "string" || question.trim().length < 2) {
    return new Response(sse("error", { error: "请输入有效的问题" }), {
      status: 400,
      headers: { "Content-Type": "text/event-stream" },
    });
  }
  const q = question.trim();
  const engineId = engine?.id || "builtin";
  const graphMode = mode === "roadmap" ? "roadmap" : "viewpoint";
  const cacheKey = `${graphMode}:${engineId}:${q.toLowerCase()}`;

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => controller.enqueue(new TextEncoder().encode(sse(event, data)));
      try {
        const hit = cache.get(cacheKey);
        if (hit && Date.now() - hit.ts < TTL) {
          send("status", { text: "已生成（缓存）" });
          send("sources", { items: hit.items });
          send("graph", { graph: hit.graph, mode: graphMode, cached: true });
          send("done", {});
          controller.close();
          return;
        }

        send("status", { text: "正在搜索知乎相关回答…" });
        const items = await zhihuSearch(q, 10);
        if (items.length === 0) {
          send("error", { error: "知乎上没有找到相关内容，换个问法试试" });
          controller.close();
          return;
        }
        // 第一步：素材先到位，SourcesPanel 立刻有内容
        send("sources", { items });

        const engineCfg = { id: engineId, baseURL: engine?.baseURL, apiKey: engine?.apiKey, model: engine?.model };

        if (graphMode === "roadmap") {
          send("status", { text: `正在从 ${items.length} 条回答里提炼学习路径…` });
          const raw = await runEngine(engineCfg, buildRoadmapMessages(q, items));
          const graph = parseRoadmapJson(raw, q, items);
          send("status", { text: "正在铺设学习路线图…" });
          cache.set(cacheKey, { graph, items, ts: Date.now() });
          send("graph", { graph, mode: "roadmap", cached: false, sources: items.length });
        } else {
          send("status", { text: `正在分析 ${items.length} 条回答的观点立场…` });
          const graph = await extractViewpoints(q, items, engineCfg);
          if (graph.viewpoints.length === 0) {
            send("error", { error: "这些内容观点太分散，暂时无法归纳立场，换个更具体的问题试试" });
            controller.close();
            return;
          }
          send("status", { text: "正在绘制知识地图…" });
          cache.set(cacheKey, { graph, items, ts: Date.now() });
          send("graph", { graph, mode: "viewpoint", cached: false, sources: items.length });
        }
        send("done", {});
        controller.close();
      } catch (e) {
        console.error("[/api/generate/stream]", e);
        send("error", { error: e instanceof Error ? e.message : "生成失败，请稍后重试" });
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
