import { NextRequest, NextResponse } from "next/server";
import type { KnowledgeGraph } from "@/lib/harness/types";
import type { RoadmapGraph } from "@/lib/roadmap";
import type { ViewpointGraph } from "@/lib/viewpoints";
import { roadmapToKnowledgeGraph, viewpointToKnowledgeGraph } from "@/lib/harness/compat";
import { decideAgentAction } from "@/lib/agent/decide";
import { applyChangesAtomically, classifyRisk } from "@/lib/agent/apply";
import { graphHash } from "@/lib/agent/types";
import { buildAgentMessages, parseAgentResponse, applyOps, type GraphOp } from "@/lib/graph-patch";

function isKnowledgeGraph(graph: unknown): graph is KnowledgeGraph {
  const value = graph as KnowledgeGraph | null;
  return !!value && typeof value === "object" && Array.isArray(value.nodes) && Array.isArray(value.edges)
    && Array.isArray(value.groups) && Array.isArray(value.citations) && !!value.presentation;
}

function isRoadmapGraph(graph: unknown): graph is RoadmapGraph {
  const value = graph as RoadmapGraph | null;
  return !!value && value.kind === "roadmap" && typeof value.topic === "string" && Array.isArray(value.stages);
}

function isViewpointGraph(graph: unknown): graph is ViewpointGraph {
  const value = graph as ViewpointGraph | null;
  return !!value && Array.isArray((value as ViewpointGraph).viewpoints) && typeof (value as ViewpointGraph).question === "string";
}

// preview 暂存：planId -> { changes, graphHash, expiresAt }
// 生产多实例下会退化为 miss（用户需重新确认），黑客松单实例可用
const previewStore = new Map<string, { changes: unknown[]; hash: string; expiresAt: number }>();
const PREVIEW_TTL = 5 * 60 * 1000;

function newPlanId(): string {
  return `plan_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { message, graph, history, engine, action, planId, baseHash } = body;

    // ---- commit 路径：执行已确认的 preview ----
    if (action === "commit") {
      if (!planId || typeof planId !== "string") {
        return NextResponse.json({ error: "缺少 planId" }, { status: 400 });
      }
      if (!isKnowledgeGraph(graph)) {
        return NextResponse.json({ error: "缺少当前图数据" }, { status: 400 });
      }
      const pending = previewStore.get(planId);
      if (!pending || pending.expiresAt < Date.now()) {
        previewStore.delete(planId);
        return NextResponse.json({ error: "预览已过期，请重新让助手生成修改方案", code: "preview_expired" }, { status: 409 });
      }
      const currentHash = graphHash(graph);
      if (currentHash !== pending.hash) {
        previewStore.delete(planId);
        return NextResponse.json({ error: "画布在你确认前发生了变化，请基于最新版本重新生成方案", code: "graph_changed" }, { status: 409 });
      }
      previewStore.delete(planId);
      const result = applyChangesAtomically(graph, pending.changes as never);
      if (!result.ok) {
        return NextResponse.json({ error: `修改未通过校验：${result.issues[0]?.message ?? "未知原因"}`, failed: result.issues.map((i) => i.message) }, { status: 422 });
      }
      return NextResponse.json({
        reply: "已按确认的方案修改。",
        graph: result.graph,
        applied: result.applied,
        failed: [],
        changed: true,
        graphHash: graphHash(result.graph),
      });
    }

    // ---- 普通对话路径 ----
    if (!message || typeof message !== "string") {
      return NextResponse.json({ error: "消息不能为空" }, { status: 400 });
    }
    if (!graph || (!isViewpointGraph(graph) && !isKnowledgeGraph(graph) && !isRoadmapGraph(graph))) {
      return NextResponse.json({ error: "缺少当前图数据，请先生成一张图" }, { status: 400 });
    }

    // 版本冲突预检：前端带了 baseHash 且与当前图不一致 → 409
    if (typeof baseHash === "string" && isKnowledgeGraph(graph)) {
      // baseHash 是客户端上次见到的版本；这里无法直接比对（graph 是当前快照），
      // 真正的冲突检测依赖客户端发请求时用的 graph 就是最新快照。
      // 保留字段以便后续接入服务端会话态。
      void baseHash;
    }

    const engineId = engine?.id || "builtin";
    const complete = async (messages: { role: string; content: string }[]): Promise<string> => {
      if (engineId === "zhida") {
        const { zhida } = await import("@/lib/zhihu");
        return zhida(messages);
      }
      if (engineId === "custom") {
        if (!engine?.baseURL || !engine?.apiKey) throw new Error("自定义引擎缺少 baseURL 或 apiKey");
        const { chatComplete } = await import("@/lib/engines");
        return chatComplete(
          { baseURL: engine.baseURL, apiKey: engine.apiKey, model: engine.model || "deepseek-v4-flash" },
          messages,
        );
      }
      const { chatComplete, builtinEngines } = await import("@/lib/engines");
      const cfg = builtinEngines().builtin;
      if (!cfg.apiKey) throw new Error("内置引擎未配置 API Key");
      return chatComplete(cfg, messages);
    };

    // 统一转 KnowledgeGraph IR（legacy viewpoint/roadmap 经兼容层转换）
    let kg: KnowledgeGraph | null = null;
    if (isKnowledgeGraph(graph)) kg = graph;
    else if (isRoadmapGraph(graph)) kg = roadmapToKnowledgeGraph(graph);
    else if (isViewpointGraph(graph)) kg = viewpointToKnowledgeGraph(graph);

    const recentChanges = (Array.isArray(history) ? history : [])
      .slice(-4)
      .map((m: { role?: string; content?: string }) => `${m?.role === "user" ? "用户" : "助手"}: ${m?.content ?? ""}`);

    // KnowledgeGraph 路径：Agent 2.0
    if (kg) {
      const decision = await decideAgentAction(kg, message, recentChanges, complete);

      if (decision.type === "answer" || decision.type === "clarify") {
        return NextResponse.json({
          reply: decision.reply,
          questions: decision.type === "clarify" ? decision.questions : undefined,
          graph: kg,
          applied: [],
          failed: [],
          changed: false,
          decisionType: decision.type,
          graphHash: graphHash(kg),
        });
      }

      if (decision.type === "preview") {
        const id = newPlanId();
        previewStore.set(id, { changes: decision.changes, hash: graphHash(kg), expiresAt: Date.now() + PREVIEW_TTL });
        return NextResponse.json({
          reply: decision.reply,
          confirmation: decision.confirmation,
          planId: id,
          changes: decision.changes,
          risk: decision.risk,
          graph: kg,
          applied: [],
          failed: [],
          changed: false,
          decisionType: "preview",
          graphHash: graphHash(kg),
        });
      }

      // apply：低风险/中风险直接原子执行
      const result = applyChangesAtomically(kg, decision.changes);
      if (!result.ok) {
        return NextResponse.json({
          reply: "修改方案未通过校验，没有动你的图。",
          graph: kg,
          applied: [],
          failed: result.issues.map((i) => i.message),
          changed: false,
          graphHash: graphHash(kg),
        });
      }
      return NextResponse.json({
        reply: decision.reply,
        graph: result.graph,
        applied: result.applied,
        failed: [],
        changed: JSON.stringify(result.graph) !== JSON.stringify(kg),
        risk: classifyRisk(decision.changes),
        graphHash: graphHash(result.graph),
      });
    }

    // legacy viewpoint 兜底（compat 转换失败时的安全网，正常不会走到）
    const messages = buildAgentMessages(history ?? [], graph as ViewpointGraph, message);
    const raw = await complete(messages);
    const parsed = parseAgentResponse(raw);
    const originalGraph = JSON.parse(JSON.stringify(graph));
    const result = applyOps(graph as ViewpointGraph, parsed.ops as GraphOp[], originalGraph);
    return NextResponse.json({
      reply: parsed.reply,
      graph: result.graph,
      applied: result.applied,
      failed: result.failed,
      changed: result.applied.length > 0,
    });
  } catch (e) {
    console.error("[/api/agent]", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "助手开小差了，请重试" }, { status: 500 });
  }
}
