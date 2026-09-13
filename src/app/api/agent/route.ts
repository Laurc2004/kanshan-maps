import { NextRequest, NextResponse } from "next/server";
import { buildAgentMessages, parseAgentResponse, applyOps, type GraphOp } from "@/lib/graph-patch";
import type { ViewpointGraph } from "@/lib/viewpoints";
import { buildKnowledgeGraphAgentMessages, parseKnowledgeGraphAgentResponse, applyKnowledgeGraphOps, type KnowledgeGraphOp } from "@/lib/harness/patch";
import type { KnowledgeGraph } from "@/lib/harness/types";
import { roadmapToKnowledgeGraph } from "@/lib/harness/compat";
import type { RoadmapGraph } from "@/lib/roadmap";

function isKnowledgeGraph(graph: unknown): graph is KnowledgeGraph {
  const value = graph as KnowledgeGraph | null;
  return !!value && typeof value === "object" && Array.isArray(value.nodes) && Array.isArray(value.edges)
    && Array.isArray(value.groups) && Array.isArray(value.citations) && !!value.presentation;
}

function isRoadmapGraph(graph: unknown): graph is RoadmapGraph {
  const value = graph as RoadmapGraph | null;
  return !!value && value.kind === "roadmap" && typeof value.topic === "string" && Array.isArray(value.stages);
}

export async function POST(req: NextRequest) {
  try {
    const { message, graph, history, engine } = await req.json();
    if (!message || typeof message !== "string") {
      return NextResponse.json({ error: "消息不能为空" }, { status: 400 });
    }
    if (!graph || (!Array.isArray(graph.viewpoints) && !isKnowledgeGraph(graph) && !isRoadmapGraph(graph))) {
      return NextResponse.json({ error: "缺少当前图数据，请先生成一张图" }, { status: 400 });
    }

    const unified = isKnowledgeGraph(graph) || isRoadmapGraph(graph);
    const unifiedGraph = isKnowledgeGraph(graph) ? graph : isRoadmapGraph(graph) ? roadmapToKnowledgeGraph(graph) : null;
    const messages = unified
      ? buildKnowledgeGraphAgentMessages(history ?? [], unifiedGraph!, message)
      : buildAgentMessages(history ?? [], graph as ViewpointGraph, message);
    // 原图快照：reset 操作恢复用（deep copy 在 applyOps 内做）
    const originalGraph = JSON.parse(JSON.stringify(unifiedGraph ?? graph));

    const engineId = engine?.id || "builtin";
    let raw: string;
    if (engineId === "zhida") {
      const { zhida } = await import("@/lib/zhihu");
      raw = await zhida(messages);
    } else if (engineId === "custom") {
      if (!engine?.baseURL || !engine?.apiKey) {
        return NextResponse.json({ error: "自定义引擎缺少 baseURL 或 apiKey" }, { status: 400 });
      }
      const { chatComplete } = await import("@/lib/engines");
      raw = await chatComplete(
        { baseURL: engine.baseURL, apiKey: engine.apiKey, model: engine.model || "deepseek-v4-flash" },
        messages
      );
    } else {
      const { chatComplete, builtinEngines } = await import("@/lib/engines");
      const cfg = builtinEngines().builtin;
      if (!cfg.apiKey) return NextResponse.json({ error: "内置引擎未配置 API Key" }, { status: 500 });
      raw = await chatComplete(cfg, messages);
    }

    const parsed = unified ? parseKnowledgeGraphAgentResponse(raw) : parseAgentResponse(raw);
    // Keep all patch validation server-side; the client only receives renderer-ready IR.
    const result = unified
      ? applyKnowledgeGraphOps(unifiedGraph!, parsed.ops as KnowledgeGraphOp[], originalGraph)
      : applyOps(graph as ViewpointGraph, parsed.ops as GraphOp[], originalGraph as ViewpointGraph);

    return NextResponse.json({
      reply: parsed.reply,
      graph: result.graph,
      applied: result.applied,
      failed: result.failed,
      changed: "changed" in result ? result.changed : result.applied.length > 0,
    });
  } catch (e) {
    console.error("[/api/agent]", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "助手开小差了，请重试" }, { status: 500 });
  }
}
