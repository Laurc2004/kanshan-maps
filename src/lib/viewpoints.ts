import type { SearchResultItem } from "./zhihu";

export type ViewpointNode = {
  stance: string;
  summary: string;
  evidence: string[];
  authors: string[];
  sources: string[];
};

export type GraphStyle = "default" | "monochrome" | "pastel" | "bold";

export type ViewpointGraph = {
  question: string;
  consensus: string[];
  viewpoints: ViewpointNode[];
  style?: GraphStyle;
};

// 指令并入 user 消息末尾（zhida-fast 会忽略 system 指令；其他模型同样兼容此格式）
export const INSTRUCTION = `分析上面这些知乎回答的观点立场。只输出一个 JSON 对象，不要 markdown，不要解释，第一个字符必须是 { 最后一个字符必须是 }。
格式：{"consensus":["共识要点"],"viewpoints":[{"stance":"2-5字立场标签","summary":"30字内核心观点","evidence":["20字内论据"],"authors":["答主昵称，从输入原样复制"],"sources":["链接，从输入原样复制"]}]}
viewpoints 2-4 个且必须有区分度（按支持度从高到低排序，最重要的放第一个）；没有共识就给空数组。`;

export function buildExtractMessages(question: string, items: SearchResultItem[]) {
  const material = items
    .slice(0, 8)
    .map((i, idx) => `[${idx}] 作者:${i.AuthorName} 赞:${i.VoteUpCount}\n摘要:${i.ContentText.slice(0, 400)}\n链接:${i.Url}`)
    .join("\n---\n");
  return [{ role: "user", content: `问题：${question}\n\n以下是知乎回答：\n${material}\n\n${INSTRUCTION}` }];
}

export function parseViewpointJson(raw: string, question: string, items: SearchResultItem[]): ViewpointGraph {
  const jsonText = raw.replace(/```json|```/g, "").trim();
  const start = jsonText.indexOf("{");
  const end = jsonText.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("AI 返回格式异常，请重试");
  const parsed = JSON.parse(jsonText.slice(start, end + 1));

  // 防幻觉：authors/sources 必须来自真实输入
  const validNames = new Set(items.map((i) => i.AuthorName));
  const validUrls = new Set(items.map((i) => i.Url));
  const viewpoints = (parsed.viewpoints ?? [])
    .filter((v: ViewpointNode) => v.stance && v.summary)
    .map((v: ViewpointNode) => ({
      ...v,
      authors: (v.authors ?? []).filter((a: string) => validNames.has(a)),
      sources: (v.sources ?? []).filter((s: string) => validUrls.has(s)),
    }))
    .filter((v: ViewpointNode) => v.authors.length > 0 || (v.evidence?.length ?? 0) > 0);

  return { question, consensus: parsed.consensus ?? [], viewpoints };
}

// 统一入口：按引擎分发（zhida 走官方直答；builtin/custom 走 OpenAI 兼容）
export async function extractViewpoints(
  question: string,
  items: SearchResultItem[],
  engine: { id: string; baseURL?: string; apiKey?: string; model?: string }
): Promise<ViewpointGraph> {
  const messages = buildExtractMessages(question, items);
  let raw: string;

  if (engine.id === "zhida") {
    const { zhida } = await import("./zhihu");
    raw = await zhida(messages);
  } else if (engine.id === "custom") {
    if (!engine.baseURL || !engine.apiKey) throw new Error("自定义引擎缺少 baseURL 或 apiKey");
    const { chatComplete } = await import("./engines");
    raw = await chatComplete(
      { baseURL: engine.baseURL, apiKey: engine.apiKey, model: engine.model || "deepseek-v4-flash" },
      messages
    );
  } else {
    // builtin：服务端环境变量注入
    const { chatComplete, builtinEngines } = await import("./engines");
    const cfg = builtinEngines().builtin;
    if (!cfg.apiKey) throw new Error("内置引擎未配置 API Key");
    raw = await chatComplete(cfg, messages);
  }

  return parseViewpointJson(raw, question, items);
}
