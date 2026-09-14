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
- {"type":"add_node","label":"新卡片标题","description":"一句描述","groupId":"分组ID（可选，不给就不入组）"} ← 用户要「再加一点/补充一条/新增一个阶段/加第 N 点」时用这个
- {"type":"add_group","label":"分组名","nodeIds":["...","..."]} ← 新建分组并把成员移入；label 给空字符串 "" 表示「大卡片包住这些小卡片」（只画包围框，不改变成员原有版式归属）
- {"type":"move_node","nodeId":"...","groupId":"分组ID 或 null"}
- {"type":"remove_nodes","nodeIds":["..."],"reasons":["每个节点的删除理由"]}
- {"type":"merge_nodes","nodeIds":["...","..."],"targetLabel":"...","description":"..."}
- {"type":"add_edge","fromId":"...","toId":"..."} ← 用户要「把 A 和 B 连起来」时用
- {"type":"remove_edges","pairs":[{"fromId":"...","toId":"..."}],"reason":"一句话"} ← 用户要「去掉 A 到 B 的箭头/连线」时用；fromId/toId 用节点 ID，泳道场景可用 "lane-0"/"lane-1" 指代「第1站→第2站」这类装饰箭头，观点对照图胶囊到共识可用 "question"→"debate-consensus"
- {"type":"rewrite_consensus","items":["..."]}
- {"type":"set_presentation","patch":{"palette":"zhihu-blue|paper-pastel|research-mono|poster-bold|nature-notes","density":"compact|comfortable|spacious","stroke":"clean|sketch|marker","layout":"debate-grid|radial-map|timeline|swimlane-roadmap|cluster-board|evidence-tree"}}
- {"type":"set_mode","mode":"summary"} 把 evidence-tree 版式切成思维导图（中心主题+左右分支）；{"type":"set_mode","mode":null} 还原为证据树
- {"type":"set_links","enabled":false} 去除所有卡片上的原文超链接；{"type":"set_links","enabled":true} 恢复
- {"type":"relayout","scope":"local|all"}
规则：
- nodeId/groupId 只能用下方给出的真实 ID，禁止编造
- 新增卡片（add_node）必须给具体的 label 和 description：结合图的主题和用户要求生成一个真实、有信息量的新观点/新步骤，禁止输出「新节点」「第四点」这类占位文字
- 「大卡包住 A 和 B」「把这两点圈起来/归为一组」：用 add_group 且 label 为 ""，nodeIds 是被包住的卡片 ID
- 「去掉某箭头/连线」：pairs 里给出两端节点 ID；用户说「第1站到第2站的箭头」对应 fromId "lane-0"、toId "lane-1"
- 用户说「恢复连线/箭头」：用 add_edge 给出原来的两端（系统会识别之前被去掉的连线并恢复）
- 删除/合并时必须给每个节点一句理由（引用不足/内容重复/无独立信息）
- description 不超过 60 字
- 用户要「思维导图」时：当前版式已是 evidence-tree 就输出 set_mode=summary（不要再改 layout）；否则同时输出 set_presentation.layout=evidence-tree 和 set_mode=summary
- 用户要「证据树/层级树」且当前已是思维导图（模式 summary）时：输出 set_mode=null（layout 已是 evidence-tree 就不用再改）
- 用户要「去除/不要链接、超链接、跳转」时：输出 set_links，不要删除或改写任何节点内容
- 如果意图是 answer（只回答），输出 {"reply":"...","changes":[]}
- 如果指代不明（比如「把它删掉」但不知道它是谁），输出 {"reply":"...","changes":[],"needClarify":["问题1","问题2"]}；但新增类请求（加卡片）不需要指代现有卡片，直接输出 add_node`;

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
          if (c.type === "remove_edges") return `去掉 ${c.pairs.length} 条连线（${c.reason}）`;
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

  // 5) clarify：指代不明——但新增/容器/连线类 structure 请求本就不需要指代现有卡片，只在确有目标缺失时才追问
  const structureWithoutTargets =
    route.intent === "structure" &&
    route.targetIds.length === 0 &&
    /删除|删掉|去掉|移除|合并|移动|断开/.test(message);
  if (route.intent === "clarify" || (route.confidence === "low" && (["emphasize", "rewrite"].includes(route.intent) || structureWithoutTargets))) {
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
      const reply = route.intent === "rename" ? "标题已更新。" : route.intent === "emphasize" ? "已标为重点。" : route.intent === "style" ? (ruleChanges.some((c) => c.type === "set_links") ? (ruleChanges[0].type === "set_links" && ruleChanges[0].enabled ? "已恢复卡片上的原文链接。" : "已去除卡片上的原文链接。") : ruleChanges.some((c) => c.type === "set_mode" || (c.type === "set_presentation" && !!c.patch.layout)) ? "版式已调整。" : "风格已调整。") : "已处理。";
      if (risk === "high") {
        return { type: "preview", reply, changes: ruleChanges, risk: "high", confirmation: "这是结构性修改，确认执行吗？" };
      }
      return { type: "apply", reply, changes: ruleChanges, risk };
    }
  }

  // 6) 模型生成变更
  const nodeList = ctx.nodes.map((n) => `[${n.id}] ${n.label}${n.group ? `（分组:${n.group}）` : ""}`).join("\n");
  const groupList = ctx.groups.map((g) => `[${g.id}] ${g.label || "（大卡片容器）"}（含 ${g.nodeIds.length} 张卡）`).join("\n") || "（无分组）";
  const labelOf = (id: string) => ctx.nodes.find((n) => n.id === id)?.label ?? id;
  const edgeList = ctx.edges.map((e) => `[${e.fromId}] ${labelOf(e.fromId)} → [${e.toId}] ${labelOf(e.toId)}`).join("\n") || "（无数据型连线；泳道图的站间箭头用 lane-0→lane-1 指代，观点对照图的胶囊→共识连线用 question→debate-consensus 指代）";
  const raw = await complete([
    { role: "system", content: CHANGE_INSTRUCTION },
    {
      role: "user",
      content: `图标题：${ctx.title}\n当前版式：${ctx.kind}${ctx.mode ? `（模式：${ctx.mode}）` : ""}\n可用节点：\n${nodeList}\n可用分组：\n${groupList}\n现有连线：\n${edgeList}\n意图：${route.intent}${route.targetIds.length > 0 ? `\n规则已定位目标：${route.targetIds.join(", ")}` : ""}\n用户要求：${message}`,
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
