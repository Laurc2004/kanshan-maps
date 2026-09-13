import type { KnowledgeGraph } from "./harness/types.ts";
import type { SearchResultItem } from "./zhihu.ts";

export const SUMMARY_INSTRUCTION = `请只输出 JSON：{"title":"标题","summary":"总述","points":[{"title":"要点","detail":"基于素材的摘要","sourceIndexes":[0]}]}。只能使用输入素材；不得编造反方观点、事实或链接；输出 4-8 个要点。`;

export function buildSummaryMessages(title: string, items: SearchResultItem[]) {
  const compact = items.map((item, index) => ({ index, title: item.Title, author: item.AuthorName, url: item.Url, text: item.ContentText.slice(0, 5000) }));
  return [{ role: "system", content: SUMMARY_INSTRUCTION }, { role: "user", content: `主题：${title}\n素材：${JSON.stringify(compact)}` }];
}

export function parseSummaryJson(raw: string, title: string, items: SearchResultItem[]): KnowledgeGraph {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("总结结果不是有效 JSON");
  const value = JSON.parse(match[0]) as { title?: unknown; summary?: unknown; points?: unknown };
  if (!Array.isArray(value.points)) throw new Error("总结结果缺少 points");
  const citations = items.flatMap((item, index) => /^https?:\/\//.test(item.Url) ? [{ id: `source-${index}`, sourceIndex: index, url: item.Url, title: item.Title }] : []);
  const nodes = value.points.slice(0, 8).map((point, index) => {
    const p = point as { title?: unknown; detail?: unknown; sourceIndexes?: unknown };
    const sourceIndexes = Array.isArray(p.sourceIndexes) ? p.sourceIndexes.filter((i): i is number => Number.isInteger(i) && i >= 0 && i < items.length) : [];
    if (!String(p.title ?? "").trim() || !String(p.detail ?? "").trim() || sourceIndexes.length === 0) return null;
    return { id: `summary-${index + 1}`, label: String(p.title).slice(0, 40), description: String(p.detail).slice(0, 180), citations: sourceIndexes.map((i) => `source-${i}`).filter((id) => citations.some((c) => c.id === id)) };
  }).filter((node): node is NonNullable<typeof node> => !!node);
  if (nodes.length === 0) throw new Error("总结结果没有带真实来源的有效要点");
  return { kind: "cluster-board", title: String(value.title ?? title).slice(0, 80) || title, summary: String(value.summary ?? "").slice(0, 240), nodes, edges: [], groups: [{ id: "summary", label: "文章总结", nodeIds: nodes.map((n) => n.id) }], citations, presentation: { layout: "evidence-tree", palette: "paper-pastel", density: "comfortable", stroke: "sketch", hierarchy: { title: 1.2, keyFinding: 1, evidence: 0.9 } }, metadata: { mode: "summary" } };
}
