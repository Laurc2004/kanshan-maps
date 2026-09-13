import type { KnowledgeGraph } from "./harness/types.ts";
import type { SearchResultItem } from "./zhihu.ts";
import type { RoadmapGraph } from "./roadmap.ts";
import type { ViewpointGraph } from "./viewpoints.ts";

export type GraphLike = KnowledgeGraph | RoadmapGraph | ViewpointGraph;
export type KnowledgeSource = { url: string; title: string; author: string; type: string };

const isUrl = (value: unknown): value is string => typeof value === "string" && /^https?:\/\//.test(value);

export function graphTitle(graph: GraphLike): string {
  if ("question" in graph) return graph.question;
  if ("topic" in graph) return graph.topic;
  return graph.title;
}

export function collectKnowledgeSources(graph: GraphLike, items: SearchResultItem[] = []): KnowledgeSource[] {
  const itemByUrl = new Map(items.filter((item) => isUrl(item.Url)).map((item) => [item.Url, item]));
  const urls: { url: string; title?: string }[] = [];
  if ("citations" in graph) graph.citations.forEach((citation) => isUrl(citation.url) && urls.push({ url: citation.url, title: citation.title }));
  else if ("viewpoints" in graph) graph.viewpoints.flatMap((node) => node.sources).forEach((url) => isUrl(url) && urls.push({ url }));
  else graph.stages.flatMap((stage) => stage.items).forEach((item) => isUrl(item.source) && urls.push({ url: item.source }));

  const seen = new Set<string>();
  return urls.filter(({ url }) => !seen.has(url) && seen.add(url)).map(({ url, title }) => {
    const item = itemByUrl.get(url);
    return {
      url,
      title: item?.Title || title || new URL(url).hostname,
      author: item?.AuthorName || "知乎用户",
      type: item?.ContentType || "zhihu",
    };
  });
}

export function shouldOpenCardLink(input: { link?: string | null; dragged?: boolean; editing?: boolean }): boolean {
  return !!input.link && isUrl(input.link) && !input.dragged && !input.editing;
}
