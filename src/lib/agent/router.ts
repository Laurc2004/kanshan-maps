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
// 卡片超链接开关：「去除/不要链接」优先于删除/改写类规则（链接是渲染属性，不是内容）
const LINK_OFF_RE = /(去掉|去除|移除|取消|删掉|删除|关闭|不要|禁用|隐藏).{0,5}(超链接|链接|跳转|网址)|(链接|超链接).{0,4}(去掉|去除|删掉|删除|关闭|取消)/;
const LINK_ON_RE = /(恢复|打开|加上|加回|开启).{0,4}(超链接|链接|跳转)/;
// 新增卡片/观点：「再加一点」「补充一条」「新增一个阶段」「加一张卡片」
const ADD_NODE_RE = /(添加|新增|加上|补充|再要|再来|补一).{0,6}(点|条|个|张|一项|一项内容|张卡|卡片|节点|观点|立场|阶段|步骤|部分|分支|方面|路线)|加一(点|条|个|张)|(点|条|卡片|观点|立场|阶段|步骤).{0,3}(不够|太少|再加|加一个)|第[一二三四五六七八九十\d]+(点|条|个|步|阶段)/;
// 连线操作：「去掉 A 到 B 的箭头」「断开两者的连线」「把 1 和 2 连起来」「恢复箭头」
const EDGE_OFF_RE = /(去掉|去除|断开|删掉|删除|取消|不要).{0,10}(箭头|连线|连接线|关系线)|(箭头|连线).{0,4}(去掉|去除|断开|删掉|删除)/;
const EDGE_ON_RE = /(连起来|连一下|加连线|加箭头|画条线|连接|关联).{0,4}/;
const EDGE_RESTORE_RE = /恢复.{0,4}(箭头|连线|连接线)/;
// 大卡片容器：「一张大卡包住 A 和 B」「把这两点圈在一起/归为一组」
const CONTAINER_RE = /(大卡|大卡片|大框|框|框起来|圈起来|圈在|包起来|包住|包裹|包含|归为一组|归到一组|放在一起|合并成一组|分成一组)/;
// P30 微调：单卡移动（「把这张卡往左挪一点」「往上移 50」）
const MOVE_RE = /(往|向|朝).{0,6}(左|右|上|下).{0,6}(挪|移|移动|偏移|挪动)|(挪|移动|移)一(点|下|些)|回到原位|回到默认位置|复位/;
// P30 微调：全局间距（「卡片间距大一点/紧凑些/再松一点」）
const SPACING_RE = /(卡片|元素|节点|图).{0,4}(间距|间隔|距离).{0,8}(大|小|宽|窄|松|紧|多|少|调)|间距(太|有点)?(大|小|宽|窄|松|紧)|间距.{0,4}(收紧|放宽|拉开|缩小|调|恢复)|(收紧|放宽|拉开|缩小).{0,6}(间距|间隔)|间距恢复(默认|正常)/;
// P30 微调：单卡字号（「这张卡字大一点/字号调小」）——必须先于 EMPHASIZE（「放大」会命中「放大」关键词）
const FONTSIZE_RE = /(字|文字|字号|字体)(体)?(太)?(大|小)一?(点|些|下)|(字号|字体|文字).{0,4}(调|改|放大|缩小|变大|变小|增大|减小)|(把|将).{0,12}(字|文字)(号)?.{0,6}(放大|变大|增大|缩小|变小|调小|调大)/;

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
  // 连线/箭头操作必须在 ANSWER_RE 之前：「去掉 A 到 B 的箭头」里的「区别/关系」类词不该误判成问答
  if (EDGE_RESTORE_RE.test(text)) {
    return { intent: "structure", targetIds: targets, confidence: "high", reason: "恢复被去掉的连线" };
  }
  if (EDGE_OFF_RE.test(text) && !LINK_OFF_RE.test(text)) {
    return { intent: "structure", targetIds: targets, confidence: "high", reason: "去掉卡片之间的连线/箭头" };
  }
  if (EDGE_ON_RE.test(text) && targets.length >= 2) {
    return { intent: "structure", targetIds: targets, confidence: "high", reason: "在两卡片间加连线" };
  }
  // 大卡片容器：「大卡包住 A 和 B」「把这两点圈在一起」——成员已按 label/序数定位
  if (CONTAINER_RE.test(text) && targets.length >= 1) {
    return { intent: "structure", targetIds: targets, confidence: "high", reason: "大卡片包住若干小卡片" };
  }
  // 新增卡片：本就无现有目标，targetIds 为空是正常的，必须高置信直达模型（否则被 clarify 吞掉）
  if (ADD_NODE_RE.test(text) && !STRUCTURE_RE.test(text) && !EMPHASIZE_RE.test(text) && !RENAME_RE.test(text)) {
    return { intent: "structure", targetIds: targets, confidence: "high", reason: "新增卡片/观点" };
  }
  // 超链接开关必须在删除/结构规则之前：用户说「去掉链接」不是删内容
  if (LINK_OFF_RE.test(text) && !LINK_ON_RE.test(text)) {
    return { intent: "style", targetIds: [], confidence: "high", reason: "去除卡片超链接" };
  }
  if (LINK_ON_RE.test(text)) {
    return { intent: "style", targetIds: [], confidence: "high", reason: "恢复卡片超链接" };
  }
  // P30 微调：单卡移动/全局间距——必须先于 ANSWER/STRUCTURE（「移动」会命中 STRUCTURE_RE 的「移动」）
  if (MOVE_RE.test(text)) {
    return { intent: "style", targetIds: targets, confidence: "high", reason: "单卡位置微调" };
  }
  if (SPACING_RE.test(text) && !STRUCTURE_RE.test(text)) {
    return { intent: "style", targetIds: [], confidence: "high", reason: "全局间距微调" };
  }
  // P30 微调：单卡字号——先于 EMPHASIZE（「字大一点」里的「大」不该变成标重点）
  if (FONTSIZE_RE.test(text)) {
    return { intent: "style", targetIds: targets, confidence: targets.length > 0 ? "high" : "low", reason: "单卡字号微调" };
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
- clarify=指代不明需要追问（它/这个/那个，且无明确目标）——但「新增/添加/补充」类请求不需要指代现有卡片，应判 structure 而不是 clarify
- structure=新增/删除/合并/移动/分组/连线（增删箭头）等结构性修改（删除/合并高风险，需要用户确认）
- rename/style/emphasize/rewrite=对应的修改意图
- targetIds 只能从下方节点 ID 中选，不确定就留空（新增类请求本来就该留空）`,
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
    // 超链接开关（在版式/配色之前判定，「去掉链接」不会被误判成删内容或改样式）
    if (LINK_OFF_RE.test(text) && !LINK_ON_RE.test(text)) return [{ type: "set_links", enabled: false }];
    if (LINK_ON_RE.test(text)) return [{ type: "set_links", enabled: true }];
    // P30 微调：单卡移动——「往左挪一点/往上移 50px」（target 由规则按 label/序数定位）
    if (MOVE_RE.test(text)) {
      if (/回到原位|回到默认位置|复位/.test(text) && route.targetIds.length > 0) {
        return route.targetIds.map((id) => ({ type: "move_element" as const, nodeId: id, dx: 0, dy: 0, reset: true }));
      }
      const dirM = text.match(/(往|向|朝)\s*(左|右|上|下)\s*(?:移|挪|移动|偏移|挪动)?\s*(?:([0-9]+)\s*(?:px|像素)?)?/);
      if (dirM && route.targetIds.length > 0) {
        const dist = Math.min(400, Math.max(20, dirM[3] ? parseInt(dirM[3], 10) : 60));
        const dx = dirM[2] === "左" ? -dist : dirM[2] === "右" ? dist : 0;
        const dy = dirM[2] === "上" ? -dist : dirM[2] === "下" ? dist : 0;
        return route.targetIds.map((id) => ({ type: "move_element" as const, nodeId: id, dx, dy }));
      }
      return null; // 方向/目标不全 → 交给模型
    }
    // P30 微调：全局间距——「间距大一点/收紧/放宽/恢复默认」
    if (SPACING_RE.test(text) && !STRUCTURE_RE.test(text)) {
      if (/恢复(默认|正常)/.test(text)) return [{ type: "set_spacing", reset: true }];
      if (/(大|宽|松|多|放宽|拉开)/.test(text)) return [{ type: "set_spacing", scale: 1.25 }];
      if (/(小|窄|紧|少|收紧|缩小)/.test(text)) return [{ type: "set_spacing", scale: 0.8 }];
      return null;
    }
    // P30 微调：单卡字号——「字大一点/字号调小」（需定位到具体卡）
    if (FONTSIZE_RE.test(text) && route.targetIds.length > 0) {
      const up = /(大|放大|变大|增大|调大)/.test(text);
      return route.targetIds.map((id) => ({ type: "set_node_style" as const, nodeId: id, patch: { fontScale: up ? 1.25 : 0.85 } }));
    }
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
  // P30 修复：恢复连线——从 metadata.removedEdges 里恢复所有被删的连线（确定性，不经过模型）
  if (route.intent === "structure" && EDGE_RESTORE_RE.test(text)) {
    const removed = Array.isArray(ctx.removedEdges) ? ctx.removedEdges : [];
    if (removed.length === 0) return null; // 没有被删的连线，交给模型友好回答
    return removed.map((key) => {
      const [fromId, toId] = key.split("→");
      return { type: "add_edge" as const, fromId, toId };
    });
  }
  return null; // 需要模型生成 changes
}
