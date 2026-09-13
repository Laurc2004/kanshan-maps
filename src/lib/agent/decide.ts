// Agent Decision 生成：规则优先，模型只补齐规则覆盖不了的部分
import type { KnowledgeGraph } from "../harness/types.ts";
import type { AgentDecision, AgentContext, GraphChange } from "./types.ts";
import { buildAgentContext } from "./types.ts";
import { routeByRules, buildClassifierMessages, parseClassifierResult, changesFromRules } from "./router.ts";
import { classifyRisk, validateChanges } from "./apply.ts";

type Complete = (messages: { role: string; content: string }[]) => Promise<string>;

const CHANGE_INSTRUCTION = `你是知识图编辑助手。根据用户意图输出严格的 JSON：{"reply":"一句中文解释","changes":[变更列表]}。
可用变更（type 字段）：
- {"type":"rename_graph","title":"..."}
- {"type":"rename_node","nodeId":"...","label":"..."}
- {"type":"rewrite_node_description","nodeId":"...","description":"..."}
- {"type":"emphasize_node","nodeId":"...","level":"high|normal|low"}
- {"type":"move_node","nodeId":"...","groupId":"分组ID 或 null"}
- {"type":"remove_nodes","nodeIds":["..."],"reasons":["每个节点的删除理由"]}
- {"type":"merge_nodes","nodeIds":["...","..."],"targetLabel":"...","description":"..."}
- {"type":"rewrite_consensus","items":["..."]}
- {"type":"set_presentation","patch":{"palette":"zhihu-blue|paper-pastel|research-mono|poster-bold|nature-notes","density":"compact|comfortable|spacious","stroke":"clean|sketch|marker"}}
- {"type":"relayout","scope":"local|all"}
规则：
- nodeId/groupId 只能用下方给出的真实 ID，禁止编造
- 删除/合并时必须给每个节点一句理由（引用不足/内容重复/无独立信息）
- description 不超过 60 字
- 如果意图是 answer（只回答），输出 {"reply":"...","changes":[]}
- 如果指代不明，输出 {"reply":"...","changes":[],"needClarify":["问题1","问题2"]}`;

const ANSWER_INSTRUCTION = `你是知识图解说助手。基于图内容用中文简洁回答用户问题（3-5 句话），不修改图。引用具体节点名。`;

export function parseDecision(raw: string, riskOf: (c: GraphChange[]) => "low" | "medium" | "high"): AgentDecision | null {
  const m = raw.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    const p = JSON.parse(m[0]);
    const reply = typeof p.reply === "string" ? p.reply : "已处理";
    const changes: GraphChange[] = Array.isArray(p.changes) ? p.changes : [];
    if (Array.isArray(p.needClarify) && p.needClarify.length > 0) {
      return { type: "clarify", reply, questions: p.needClarify.slice(0, 2).map(String) };
    }
    if (changes.length === 0) return { type: "answer", reply };
    const risk = riskOf(changes);
    if (risk === "high") {
      const summary = changes
        .map((c) => {
          if (c.type === "remove_nodes") return `删除 ${c.nodeIds.length} 个节点（${c.reasons?.join("；") ?? "未说明理由"}）`;
          if (c.type === "merge_nodes") return `合并 ${c.nodeIds.length} 个节点为「${c.targetLabel}」`;
          return c.type;
        })
        .join("；");
      return { type: "preview", reply, changes, risk: "high", confirmation: `我准备：${summary}。要执行吗？` };
    }
    return { type: "apply", reply, changes, risk };
  } catch {
    return null;
  }
}

export async function decideAgentAction(
  graph: KnowledgeGraph,
  message: string,
  recentChanges: string[],
  complete: Complete,
): Promise<AgentDecision> {
  const ctx: AgentContext = buildAgentContext(graph, recentChanges);

  // 1) 规则路由
  let route = routeByRules(message, ctx);

  // 2) 规则不识别 → 模型分类
  if (!route) {
    const raw = await complete(buildClassifierMessages(message, ctx));
    route = parseClassifierResult(raw) ?? { intent: "clarify", targetIds: [], confidence: "low", reason: "无法识别意图" };
  }

  // 3) clarify：指代不明
  if (route.intent === "clarify" || (route.confidence === "low" && ["emphasize", "rewrite", "structure"].includes(route.intent) && route.targetIds.length === 0)) {
    const examples = ctx.nodes.slice(0, 3).map((n) => `「${n.label}」`).join("、");
    return {
      type: "clarify",
      reply: "我没确定你想改哪一张卡片。",
      questions: [`你是指 ${examples || "图中的某个节点"} 中的哪一个？`, "可以直接点一下画布上的卡片，或复制卡片标题发给我。"],
    };
  }

  // 4) answer：只回答不改图
  if (route.intent === "answer") {
    const nodeDigest = ctx.nodes.map((n) => `- ${n.label}：${n.description.slice(0, 60)}`).join("\n");
    const raw = await complete([
      { role: "system", content: ANSWER_INSTRUCTION },
      { role: "user", content: `图标题：${ctx.title}\n图摘要：${ctx.summary}\n节点：\n${nodeDigest}\n用户问题：${message}` },
    ]);
    return { type: "answer", reply: raw.trim().slice(0, 600) };
  }

  // 5) 规则可直接生成变更（无需模型）
  const ruleChanges = changesFromRules(route, message, ctx);
  if (ruleChanges && ruleChanges.length > 0) {
    const issues = validateChanges(graph, ruleChanges);
    if (issues.length === 0) {
      const risk = classifyRisk(ruleChanges);
      const reply = route.intent === "rename" ? "标题已更新。" : route.intent === "emphasize" ? "已标为重点。" : route.intent === "style" ? "风格已调整。" : "已处理。";
      if (risk === "high") {
        return { type: "preview", reply, changes: ruleChanges, risk: "high", confirmation: "这是结构性修改，确认执行吗？" };
      }
      return { type: "apply", reply, changes: ruleChanges, risk };
    }
  }

  // 6) 模型生成变更
  const nodeList = ctx.nodes.map((n) => `[${n.id}] ${n.label}${n.group ? `（分组:${n.group}）` : ""}`).join("\n");
  const groupList = ctx.groups.map((g) => `[${g.id}] ${g.label}`).join("\n") || "（无分组）";
  const raw = await complete([
    { role: "system", content: CHANGE_INSTRUCTION },
    {
      role: "user",
      content: `图标题：${ctx.title}\n可用节点：\n${nodeList}\n可用分组：\n${groupList}\n意图：${route.intent}${route.targetIds.length > 0 ? `\n规则已定位目标：${route.targetIds.join(", ")}` : ""}\n用户要求：${message}`,
    },
  ]);
  const decision = parseDecision(raw, classifyRisk);
  if (!decision) {
    return { type: "answer", reply: "这次没听懂，换个说法试试？比如「把第一个立场标为重点」。" };
  }
  // 校验模型生成的变更
  if (decision.type !== "answer" && decision.type !== "clarify") {
    const issues = validateChanges(graph, decision.changes);
    if (issues.length > 0) {
      return {
        type: "clarify",
        reply: "我生成的修改方案没通过校验，没有动你的图。",
        questions: [`问题：${issues[0].message}`, "可以换个更具体的说法，或先点选卡片再让我改。"],
      };
    }
  }
  return decision;
}
