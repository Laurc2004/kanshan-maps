// Intent Router：规则优先识别明显请求，模型兜底只输出结构化分类
import type { AgentIntent, GraphChange, AgentContext } from "./types.ts";

const RENAME_RE = /标题|名字|改名|改叫|换成.{0,8}(标题|名字)/;
const STYLE_RE = /颜色|风格|好看|手绘|配色|调色|皮肤|主题|布局|排版|紧凑|稀疏|黑白|单色|简约|柔和|淡雅|宽松|视觉|思维导图|证据树|版式|树状/;
const EMPHASIZE_RE = /重点|突出|高亮|强调|标星|放大/;
const REWRITE_RE = /精简|改短|缩短|改写|润色|重写|提炼|压缩/;
const STRUCTURE_RE = /删除|删掉|去掉|移除|保留|合并|整理|重组|最弱|多余|重复/;
const ANSWER_RE = /为什么|怎么看|是什么|核心|分歧|区别|谁对|哪个对|解释|分析|评价|靠谱/;
const RELAYOUT_RE = /重新排版|重新布局|重排|排一下/;
const MINDMAP_RE = /思维导图|树状图|左右分支|分支图/;
const TREE_RE = /证据树|层级树|单侧分支|换回.{0,4}树|还原版式/;

export interface RouteResult {
  intent: AgentIntent;
  targetIds: string[]; // 规则能定位到的节点 ID；空则交给模型或 clarify
  confidence: "high" | "medium" | "low";
  reason: string;
}

// 从用户文本中解析位置指代（"第一个立场""左边的"等）到节点 ID
function resolveTargets(text: string, ctx: AgentContext): string[] {
  const ids: string[] = [];
  const ordinalMap: Record<string, number> = {
    一: 0, 二: 1, 三: 2, 四: 3, 五: 4, 六: 5, 1: 0, 2: 1, 3: 2, 4: 3, 5: 4, 6: 5,
  };
  for (const [ch, idx] of Object.entries(ordinalMap)) {
    if (new RegExp(`第${ch}个`).test(text) && ctx.nodes[idx]) ids.push(ctx.nodes[idx].id);
  }
  // 按 label 直接匹配（用户引用卡片上的文字）
  for (const n of ctx.nodes) {
    if (n.label && n.label.length >= 2 && text.includes(n.label)) ids.push(n.id);
  }
  return [...new Set(ids)];
}

export function routeByRules(message: string, ctx: AgentContext): RouteResult | null {
  const text = message.trim();
  if (!text) return null;
  const targets = resolveTargets(text, ctx);

  if (RELAYOUT_RE.test(text)) {
    return { intent: "structure", targetIds: [], confidence: "high", reason: "明确重新布局请求" };
  }
  if (ANSWER_RE.test(text) && !REWRITE_RE.test(text) && !STRUCTURE_RE.test(text)) {
    return { intent: "answer", targetIds: targets, confidence: "high", reason: "解释型问题，不改图" };
  }
  if (STRUCTURE_RE.test(text)) {
    return { intent: "structure", targetIds: targets, confidence: targets.length > 0 ? "high" : "medium", reason: "结构性修改，需要预览确认" };
  }
  if (RENAME_RE.test(text)) {
    return { intent: "rename", targetIds: targets, confidence: "high", reason: "标题/改名请求" };
  }
  if (EMPHASIZE_RE.test(text)) {
    return { intent: "emphasize", targetIds: targets, confidence: targets.length > 0 ? "high" : "low", reason: "强调请求" };
  }
  if (STYLE_RE.test(text)) {
    return { intent: "style", targetIds: [], confidence: "high", reason: "视觉风格请求" };
  }
  if (REWRITE_RE.test(text)) {
    return { intent: "rewrite", targetIds: targets, confidence: targets.length > 0 ? "high" : "low", reason: "内容改写请求" };
  }
  return null; // 规则无法识别 → 交给模型分类
}

// 规则无法识别时，用模型做结构化分类（输出严格 JSON）
export function buildClassifierMessages(message: string, ctx: AgentContext): { role: string; content: string }[] {
  const nodeList = ctx.nodes.map((n, i) => `${i + 1}. [${n.id}] ${n.label}`).join("\n");
  return [
    {
      role: "system",
      content: `你是意图分类器。只输出 JSON：{"intent":"rename|style|emphasize|rewrite|structure|answer|clarify","targetIds":["..."],"reason":"一句话"}。
规则：
- answer=只回答不改图（为什么/怎么看/分析类）
- clarify=指代不明需要追问（它/这个/那个，且无明确目标）
- structure=删除/合并/重组/保留（高风险，需要用户确认）
- rename/style/emphasize/rewrite=对应的修改意图
- targetIds 只能从下方节点 ID 中选，不确定就留空`,
    },
    {
      role: "user",
      content: `图标题：${ctx.title}\n节点：\n${nodeList}\n用户说：${message}`,
    },
  ];
}

export function parseClassifierResult(raw: string): RouteResult | null {
  const m = raw.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    const p = JSON.parse(m[0]);
    const valid = ["rename", "style", "emphasize", "rewrite", "structure", "answer", "clarify"];
    if (!valid.includes(p.intent)) return null;
    return {
      intent: p.intent,
      targetIds: Array.isArray(p.targetIds) ? p.targetIds.filter((x: unknown) => typeof x === "string") : [],
      confidence: "medium",
      reason: typeof p.reason === "string" ? p.reason : "模型分类",
    };
  } catch {
    return null;
  }
}

// 根据意图 + 上下文生成 GraphChange（规则能完全确定的直接生成，不需要模型）
export function changesFromRules(
  route: RouteResult,
  message: string,
  ctx: AgentContext,
): GraphChange[] | null {
  const text = message.trim();
  if (route.intent === "emphasize" && route.targetIds.length > 0) {
    return route.targetIds.map((id) => ({ type: "emphasize_node" as const, nodeId: id, level: "high" as const }));
  }
  if (route.intent === "rename" && route.targetIds.length === 0) {
    // "标题改成 X" / "标题叫 X" / "把标题换成 X"
    const m = text.match(/(?:标题|名字)(?:\s*改[成为叫]?|\s*换成|\s*叫)\s*[：:是为叫]?\s*[「「]?(.{2,60}?)[」」]?$/)
      ?? text.match(/改[成为叫]?\s*[「「]?(.{2,60}?)[」」]?$/);
    if (m) return [{ type: "rename_graph", title: m[1].replace(/^[成为叫\s]+/, "").replace(/[。！!？?]+$/, "") }];
  }
  if (route.intent === "style") {
    // 思维导图/证据树切换必须 set_mode（metadata.mode）+ 对齐 layout；只改 presentation.layout
    // 会撞上摘要图的思维导图分支（evidence-tree + metadata.mode=summary）渲染不出来
    if (MINDMAP_RE.test(text)) {
      return ctx.mode === "summary"
        ? [{ type: "set_mode", mode: "summary" }]
        : [{ type: "set_presentation", patch: { layout: "evidence-tree" } }, { type: "set_mode", mode: "summary" }];
    }
    if (TREE_RE.test(text)) {
      return ctx.mode === "summary"
        ? [{ type: "set_presentation", patch: { layout: "evidence-tree" } }, { type: "set_mode", mode: null }]
        : [{ type: "set_presentation", patch: { layout: "evidence-tree" } }];
    }
    if (/蓝色|知乎蓝/.test(text)) return [{ type: "set_presentation", patch: { palette: "zhihu-blue" } }];
    if (/黑白|单色|简约/.test(text)) return [{ type: "set_presentation", patch: { palette: "research-mono" } }];
    if (/彩色|活泼|明快|大胆/.test(text)) return [{ type: "set_presentation", patch: { palette: "poster-bold" } }];
    if (/柔和| pastel|淡雅/.test(text)) return [{ type: "set_presentation", patch: { palette: "paper-pastel" } }];
    if (/紧凑/.test(text)) return [{ type: "set_presentation", patch: { density: "compact" } }];
    if (/宽松|稀疏/.test(text)) return [{ type: "set_presentation", patch: { density: "spacious" } }];
    if (/手绘|草图/.test(text)) return [{ type: "set_presentation", patch: { stroke: "sketch" } }];
  }
  if (route.intent === "structure" && /重新(排版|布局)|重排/.test(text)) {
    return [{ type: "relayout", scope: "all" }];
  }
  return null; // 需要模型生成 changes
}
