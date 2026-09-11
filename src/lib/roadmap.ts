// 学习路线图：把多个回答的知识点拼成 入门 → 进阶 → 避坑 的路径图
import type { SearchResultItem } from "./zhihu";

export type RoadmapStage = {
  title: string; // 阶段名，如「入门」「进阶」「避坑」
  items: { topic: string; detail: string; source?: string }[];
};

export type RoadmapGraph = {
  kind: "roadmap";
  topic: string;
  stages: RoadmapStage[];
};

export const ROADMAP_INSTRUCTION = `分析上面这些知乎回答，提炼一份学习路线图。只输出一个 JSON 对象，不要 markdown，不要解释，第一个字符必须是 { 最后一个字符必须是 }。
格式：{"stages":[{"title":"阶段名(2-6字)","items":[{"topic":"知识点(4-12字)","detail":"一句话说明(25字内)","source":"链接，从输入原样复制"}]}]}
stages 必须按 入门→进阶→避坑 的逻辑顺序，3-5 个阶段；每个阶段 2-4 个知识点；source 只能从输入里复制，没有就省略该字段。`;

export function buildRoadmapMessages(topic: string, items: SearchResultItem[]) {
  const material = items
    .slice(0, 8)
    .map((i, idx) => `[${idx}] 作者:${i.AuthorName} 赞:${i.VoteUpCount}\n摘要:${i.ContentText.slice(0, 400)}\n链接:${i.Url}`)
    .join("\n---\n");
  return [{ role: "user", content: `领域：${topic}\n\n以下是知乎回答：\n${material}\n\n${ROADMAP_INSTRUCTION}` }];
}

export function parseRoadmapJson(raw: string, topic: string, items: SearchResultItem[]): RoadmapGraph {
  const jsonText = raw.replace(/```json|```/g, "").trim();
  const start = jsonText.indexOf("{");
  const end = jsonText.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("AI 返回格式异常，请重试");
  const parsed = JSON.parse(jsonText.slice(start, end + 1));

  const validUrls = new Set(items.map((i) => i.Url));
  const stages = (parsed.stages ?? [])
    .filter((s: RoadmapStage) => s.title && Array.isArray(s.items))
    .slice(0, 5)
    .map((s: RoadmapStage) => ({
      title: String(s.title).slice(0, 12),
      items: s.items.slice(0, 4).map((it) => ({
        topic: String(it.topic ?? "").slice(0, 20),
        detail: String(it.detail ?? "").slice(0, 60),
        source: it.source && validUrls.has(it.source) ? it.source : undefined,
      })).filter((it) => it.topic),
    }))
    .filter((s: RoadmapStage) => s.items.length > 0);

  if (stages.length === 0) throw new Error("没有提炼出有效的路线，换个更具体的领域试试");
  return { kind: "roadmap", topic, stages };
}
