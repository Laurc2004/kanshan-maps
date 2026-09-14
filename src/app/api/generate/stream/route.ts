import { NextRequest } from "next/server";
import { zhihuSearch } from "@/lib/zhihu";
import { extractViewpoints } from "@/lib/viewpoints";
import { buildRoadmapMessages, parseRoadmapJson } from "@/lib/roadmap";
import { runHarness, resolveGenerationPath } from "@/lib/harness/executor";
import { viewpointToKnowledgeGraph, roadmapToKnowledgeGraph } from "@/lib/harness/compat";
import { normalizeSearchItem } from "@/lib/harness/sources";
import { buildSummaryMessages, parseSummaryJson } from "@/lib/summary";

// SSE 流式生成：先推素材（sources）→ 再推图（graph），分步可见
// mode=viewpoint（观点对照图，默认）/ roadmap（学习路线图）
// 生成链路（搜索+LLM）实测可达 60-100s，Vercel Hobby 默认 10s 会掐断 → maxDuration 拉满
export const maxDuration = 300;

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
  const { question, engine, mode, items: passedItems } = await req.json();
  if (!question || typeof question !== "string" || question.trim().length < 2) {
    return new Response(sse("error", { error: "请输入有效的问题" }), {
      status: 400,
      headers: { "Content-Type": "text/event-stream" },
    });
  }
  const q = question.trim();
  const engineId = engine?.id || "builtin";
  const generationPath = resolveGenerationPath(mode);
  const userMode = mode === "roadmap" ? "roadmap" : mode === "summary" ? "summary" : "compare";
  // 用户自选回答直传（跳过搜索）；缓存键区分，避免污染全量缓存
  const hasPicked = Array.isArray(passedItems) && passedItems.length > 0;
  const cacheMode = userMode === "summary" ? "summary" : generationPath === "harness" ? userMode : userMode === "roadmap" ? "roadmap" : "viewpoint";
  const engineKey = `${engineId}:${engine?.model ?? ""}:${engine?.baseURL ?? ""}`;
  const cacheKey = `${cacheMode}:${engineKey}:${q.toLowerCase()}${hasPicked ? `:picked${passedItems.length}` : ""}`;

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => controller.enqueue(new TextEncoder().encode(sse(event, data)));
      try {
        if (generationPath === "harness" && userMode !== "summary") {
          if (!hasPicked) {
            const hit = cache.get(cacheKey);
            if (hit && Date.now() - hit.ts < TTL) {
              send("status", { text: "已生成（缓存）" });
              send("sources", { items: hit.items });
              send("graph", { graph: hit.graph, mode: userMode, cached: true });
              send("done", {});
              controller.close();
              return;
            }
          }

          const pickedDocuments = hasPicked
            ? passedItems.map((item: Record<string, unknown>, index: number) => ({
              ...normalizeSearchItem(item as never, "picked"),
              id: `picked:${String(item.ContentID ?? index)}`,
            }))
            : undefined;
          const harnessInput = {
            query: q,
            mode: userMode,
            engine: {
              id: engineId === "custom" || engineId === "zhida" ? engineId : "builtin",
              baseURL: engine?.baseURL,
              apiKey: engine?.apiKey,
              model: engine?.model,
            },
            signal: req.signal,
            ...(userMode === "roadmap" ? { intent: "roadmap" } : { intent: "compare" }),
            ...(pickedDocuments ? { picked: pickedDocuments, sources: ["picked"] } : {}),
          };
          let finalGraph: unknown;
          let finalItems: unknown[] = [];
          for await (const event of runHarness(harnessInput, {})) {
            if (event.type === "sources") {
              const data = event.data as { documents?: unknown[] };
              finalItems = data.documents ?? [];
              send("sources", { items: finalItems, errors: (data as { errors?: unknown[] }).errors ?? [] });
            } else if (event.type === "graph-skeleton") {
              // 骨架先到：前端立刻落卡片+标题（流式感）
              const data = event.data as { graph: unknown; sources?: number; documents?: unknown[] };
              finalGraph = data.graph;
              send("graph-skeleton", { ...data, mode: userMode });
            } else if (event.type === "graph-detail") {
              // 详情后补：正文逐字填充已落卡片
              const data = event.data as { graph: unknown };
              finalGraph = data.graph;
              send("graph-detail", { ...data, mode: userMode });
            } else if (event.type === "graph") {
              const data = event.data as { graph: unknown; sources?: number };
              finalGraph = data.graph;
              send("graph", { ...data, mode: userMode, cached: false });
            } else {
              send(event.type, event.data);
            }
            if (event.type === "error") {
              controller.close();
              return;
            }
          }
          if (finalGraph) {
            cache.set(cacheKey, { graph: finalGraph, items: finalItems, ts: Date.now() });
          }
          send("done", {});
          controller.close();
          return;
        }

        if (!hasPicked) {
          const hit = cache.get(cacheKey);
          if (hit && Date.now() - hit.ts < TTL) {
            send("status", { text: "已生成（缓存）" });
            send("sources", { items: hit.items });
            send("graph", { graph: hit.graph, mode: userMode === "roadmap" ? "roadmap" : "viewpoint", cached: true });
            send("done", {});
            controller.close();
            return;
          }
        }

        let items: typeof passedItems;
        if (hasPicked) {
          send("status", { text: `用你选的 ${passedItems.length} 篇回答开始炼图…` });
          items = passedItems;
        } else {
          send("status", { text: "正在搜索知乎相关回答…" });
          items = await zhihuSearch(q, 10);
          if (items.length === 0) {
            send("error", { error: "知乎上没有找到相关内容，换个问法试试" });
            controller.close();
            return;
          }
        }
        // 第一步：素材先到位，SourcesPanel 立刻有内容
        send("sources", { items });

        const engineCfg = { id: engineId, baseURL: engine?.baseURL, apiKey: engine?.apiKey, model: engine?.model };

        if (userMode === "summary") {
          send("status", { text: `正在总结 ${items.length} 篇知乎内容…` });
          const raw = await runEngine(engineCfg, buildSummaryMessages(q, items));
          const graph = parseSummaryJson(raw, q, items);
          cache.set(cacheKey, { graph, items, ts: Date.now() });
          send("graph", { graph, mode: "summary", cached: false, sources: items.length });
        } else if (userMode === "roadmap") {
          send("status", { text: `正在从 ${items.length} 条回答里提炼学习路径…` });
          const raw = await runEngine(engineCfg, buildRoadmapMessages(q, items));
          // 统一出口：与摘要一致，前端只收 KnowledgeGraph（渲染器永远一套）
          const graph = roadmapToKnowledgeGraph(parseRoadmapJson(raw, q, items));
          send("status", { text: "正在铺设学习路线图…" });
          cache.set(cacheKey, { graph, items, ts: Date.now() });
          send("graph", { graph, mode: "roadmap", cached: false, sources: items.length });
        } else {
          send("status", { text: `正在分析 ${items.length} 条回答的观点立场…` });
          const viewpointGraph = await extractViewpoints(q, items, engineCfg);
          if (viewpointGraph.viewpoints.length === 0) {
            send("error", { error: "这些内容观点太分散，暂时无法归纳立场，换个更具体的问题试试" });
            controller.close();
            return;
          }
          send("status", { text: "正在绘制知识地图…" });
          const graph = viewpointToKnowledgeGraph(viewpointGraph);
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
