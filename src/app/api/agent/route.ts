import { NextRequest, NextResponse } from "next/server";
import { buildAgentMessages, parseAgentResponse, applyOps, type GraphOp } from "@/lib/graph-patch";
import type { ViewpointGraph } from "@/lib/viewpoints";

export async function POST(req: NextRequest) {
  try {
    const { message, graph, history, engine } = await req.json();
    if (!message || typeof message !== "string") {
      return NextResponse.json({ error: "消息不能为空" }, { status: 400 });
    }
    if (!graph || !Array.isArray(graph.viewpoints)) {
      return NextResponse.json({ error: "缺少当前图数据，请先生成一张图" }, { status: 400 });
    }

    const messages = buildAgentMessages(history ?? [], graph as ViewpointGraph, message);
    // 原图快照：reset 操作恢复用（deep copy 在 applyOps 内做）
    const originalGraph = JSON.parse(JSON.stringify(graph)) as ViewpointGraph;

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

    const parsed = parseAgentResponse(raw);
    // 服务端先校验一遍 ops 能否落地，把结果随响应返回，前端直接用新 graph
    const { graph: newGraph, applied, failed } = applyOps(
      graph as ViewpointGraph,
      parsed.ops as GraphOp[],
      originalGraph
    );

    return NextResponse.json({
      reply: parsed.reply,
      graph: newGraph,
      applied,
      failed,
      changed: applied.length > 0,
    });
  } catch (e) {
    console.error("[/api/agent]", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "助手开小差了，请重试" }, { status: 500 });
  }
}
