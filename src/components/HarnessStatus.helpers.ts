import type { HarnessEventType, SourceId } from "@/lib/harness/types";

const STAGE_LABELS: Record<HarnessEventType, string> = {
  planning: "规划",
  searching: "检索",
  sources: "整理素材",
  synthesizing: "综合",
  laying_out: "布局",
  validating: "验证",
  graph: "完成",
  error: "出错",
};

const SOURCE_LABELS: Record<SourceId, string> = {
  picked: "自选资料",
  "zhihu-search": "知乎回答",
  "global-search": "全网搜索",
  "zhihu-knowledge": "知乎知识",
  "hot-list": "热榜",
  zhida: "直答",
};

export function harnessStageLabel(stage: HarnessEventType): string {
  return STAGE_LABELS[stage];
}

export function sourceLabel(source: SourceId | string): string {
  return SOURCE_LABELS[source as SourceId] ?? "其他来源";
}
