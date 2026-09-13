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
type ViewpointCompatGraph = KnowledgeGraph & { legacyViewpoint?: ViewpointGraph };
type RoadmapCompatGraph = KnowledgeGraph & { legacyRoadmap?: RoadmapGraph };

export function viewpointToKnowledgeGraph(value: LegacyViewpointInput | KnowledgeGraph): KnowledgeGraph {
  if (isKnowledgeGraph(value)) return value;
  const nodes: KnowledgeNode[] = [{ id: "question", label: value.question, description: value.question, citations: [], emphasis: "high" }];
  value.viewpoints.slice(0, 8).forEach((v, i) => nodes.push({ id: `viewpoint-${i + 1}`, label: v.stance, description: v.summary, citations: [...v.sources], group: "viewpoints" }));
  value.consensus.slice(0, 8).forEach((text, i) => nodes.push({ id: `consensus-${i + 1}`, label: "共识", description: text, citations: [], group: "consensus" }));
  const legacyViewpoint: ViewpointGraph = { question: value.question, consensus: [...value.consensus], viewpoints: value.viewpoints.map((v) => ({ ...v, evidence: [...v.evidence], authors: [...v.authors], sources: [...v.sources] })), ...(value.style ? { style: value.style } : {}) };
  return { kind: "debate-grid", title: value.question, summary: value.consensus.join("；"), nodes, edges: nodes.slice(1).map((n) => ({ fromId: "question", toId: n.id })), groups: [{ id: "viewpoints", label: "观点", nodeIds: nodes.filter((n) => n.group === "viewpoints").map((n) => n.id) }, { id: "consensus", label: "共识", nodeIds: nodes.filter((n) => n.group === "consensus").map((n) => n.id) }], citations: [], presentation: presentation("debate-grid"), legacyViewpoint } as ViewpointCompatGraph;
}

export function roadmapToKnowledgeGraph(value: RoadmapGraph | KnowledgeGraph): KnowledgeGraph {
  if (isKnowledgeGraph(value)) return value;
  const nodes: KnowledgeNode[] = [];
  const groups = value.stages.slice(0, 8).map((stage, si) => {
    const ids: string[] = [];
    stage.items.slice(0, 8).forEach((item, ii) => { const id = `stage-${si + 1}-item-${ii + 1}`; ids.push(id); nodes.push({ id, label: item.topic, description: item.detail, citations: item.source ? [item.source] : [], group: `stage-${si + 1}` }); });
    return { id: `stage-${si + 1}`, label: stage.title, nodeIds: ids };
  });
  return { kind: "swimlane-roadmap", title: value.topic, summary: "", nodes, edges: nodes.slice(1).map((n, i) => ({ fromId: nodes[i].id, toId: n.id })), groups, citations: [], presentation: presentation("swimlane-roadmap"), legacyRoadmap: value } as RoadmapCompatGraph;
}

export function knowledgeGraphToViewpoint(graph: KnowledgeGraph): ViewpointGraph {
  const legacy = (graph as ViewpointCompatGraph).legacyViewpoint;
  if (legacy) return legacy;
  const viewpoints = graph.nodes.filter((n) => n.group === "viewpoints").map((n) => ({ stance: n.label, summary: n.description, evidence: [], authors: [], sources: n.citations }));
  const consensus = graph.nodes.filter((n) => n.group === "consensus").map((n) => n.description);
  return { question: graph.title, consensus, viewpoints };
}

export function knowledgeGraphToRoadmap(graph: KnowledgeGraph): RoadmapGraph {
  const legacy = (graph as RoadmapCompatGraph).legacyRoadmap;
  if (legacy) return legacy;
  return { kind: "roadmap", topic: graph.title, stages: graph.groups.map((group) => ({ title: group.label, items: group.nodeIds.map((id) => { const n = graph.nodes.find((node) => node.id === id)!; return { topic: n.label, detail: n.description, ...(n.citations[0] ? { source: n.citations[0] } : {}) }; }) })) };
}
