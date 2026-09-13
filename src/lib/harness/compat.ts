import type { RoadmapGraph } from "../roadmap";
import type { ViewpointGraph } from "../viewpoints";
import type { KnowledgeGraph, KnowledgeNode, PresentationSpec } from "./types";

const presentation = (layout: KnowledgeGraph["kind"]): PresentationSpec => ({ layout, palette: "zhihu-blue", density: "comfortable", stroke: "clean", hierarchy: { title: 1, keyFinding: 1, evidence: 1 } });
const isKnowledgeGraph = (value: unknown): value is KnowledgeGraph => {
  const v = value as KnowledgeGraph | null;
  return !!v && typeof v === "object" && Array.isArray(v.nodes) && Array.isArray(v.edges) && typeof v.title === "string" && !!v.presentation;
};

type LegacyViewpointInput = {
  question: string;
  consensus: readonly string[];
  viewpoints: readonly {
    stance: string;
    summary: string;
    evidence: readonly string[];
    authors: readonly string[];
    sources: readonly string[];
  }[];
  style?: ViewpointGraph["style"];
};


export function viewpointToKnowledgeGraph(value: LegacyViewpointInput | KnowledgeGraph): KnowledgeGraph {
  if (isKnowledgeGraph(value)) return value;
  const citationUrls = [...new Set(value.viewpoints.flatMap((v) => v.sources).filter((url) => /^https?:\/\//.test(url)))];
  const citations = citationUrls.map((url, i) => ({ id: `citation-${i + 1}`, sourceIndex: i, url, title: url }));
  const citationId = new Map(citations.map((citation) => [citation.url, citation.id]));
  const nodes: KnowledgeNode[] = [{ id: "question", label: value.question, description: value.question, citations: [], emphasis: "high" }];
  value.viewpoints.forEach((v, i) => nodes.push({ id: `viewpoint-${i + 1}`, label: v.stance, description: v.summary, citations: v.sources.map((url) => citationId.get(url)).filter((id): id is string => !!id), group: "viewpoints", metadata: { evidence: [...v.evidence], authors: [...v.authors] } }));
  value.consensus.forEach((text, i) => nodes.push({ id: `consensus-${i + 1}`, label: "共识", description: text, citations: [], group: "consensus" }));
  return { kind: "debate-grid", title: value.question, summary: value.consensus.join("；"), nodes, edges: nodes.slice(1).map((n) => ({ fromId: "question", toId: n.id })), groups: [{ id: "viewpoints", label: "观点", nodeIds: nodes.filter((n) => n.group === "viewpoints").map((n) => n.id) }, { id: "consensus", label: "共识", nodeIds: nodes.filter((n) => n.group === "consensus").map((n) => n.id) }], citations, presentation: presentation("debate-grid"), ...(value.style ? { metadata: { legacyViewpointStyle: value.style } } : {}) };
}

export function roadmapToKnowledgeGraph(value: RoadmapGraph | KnowledgeGraph): KnowledgeGraph {
  if (isKnowledgeGraph(value)) return value;
  const citationUrls = [...new Set(value.stages.flatMap((stage) => stage.items.map((item) => item.source)).filter((url): url is string => !!url && /^https?:\/\//.test(url)))];
  const citations = citationUrls.map((url, i) => ({ id: `citation-${i + 1}`, sourceIndex: i, url, title: url }));
  const citationId = new Map(citations.map((citation) => [citation.url, citation.id]));
  const nodes: KnowledgeNode[] = [];
  const groups = value.stages.map((stage, si) => {
    const ids: string[] = [];
    stage.items.forEach((item, ii) => { const id = `stage-${si + 1}-item-${ii + 1}`; ids.push(id); nodes.push({ id, label: item.topic, description: item.detail, citations: item.source ? [citationId.get(item.source)].filter((v): v is string => !!v) : [], group: `stage-${si + 1}` }); });
    return { id: `stage-${si + 1}`, label: stage.title, nodeIds: ids };
  });
  return { kind: "swimlane-roadmap", title: value.topic, summary: "", nodes, edges: nodes.slice(1).map((n, i) => ({ fromId: nodes[i].id, toId: n.id })), groups, citations, presentation: presentation("swimlane-roadmap") };
}

export function knowledgeGraphToViewpoint(graph: KnowledgeGraph): ViewpointGraph {
  const urlByCitationId = new Map(graph.citations.map((citation) => [citation.id, citation.url]));
  const viewpoints = graph.nodes.filter((n) => n.group === "viewpoints").map((n) => ({ stance: n.label, summary: n.description, evidence: Array.isArray(n.metadata?.evidence) ? n.metadata.evidence as string[] : [], authors: Array.isArray(n.metadata?.authors) ? n.metadata.authors as string[] : [], sources: n.citations.map((id) => urlByCitationId.get(id)).filter((url): url is string => !!url) }));
  const consensus = graph.nodes.filter((n) => n.group === "consensus").map((n) => n.description);
  const style = graph.metadata?.legacyViewpointStyle;
  return { question: graph.title, consensus, viewpoints, ...(style === "default" || style === "monochrome" || style === "pastel" || style === "bold" ? { style } : {}) };
}

export function knowledgeGraphToRoadmap(graph: KnowledgeGraph): RoadmapGraph {
  const urlByCitationId = new Map(graph.citations.map((citation) => [citation.id, citation.url]));
  return { kind: "roadmap", topic: graph.title, stages: graph.groups.map((group) => ({ title: group.label, items: group.nodeIds.map((id) => { const n = graph.nodes.find((node) => node.id === id)!; const source = n.citations.map((citationId) => urlByCitationId.get(citationId)).find((url): url is string => !!url); return { topic: n.label, detail: n.description, ...(source ? { source } : {}) }; }) })) };
}
