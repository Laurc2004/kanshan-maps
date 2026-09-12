import type { ViewpointGraph, ViewpointNode } from "./viewpoints";

// Agent 对话改图的操作语义层
// Agent 输出操作序列（JSON ops），前端应用后重新布局渲染。
// 好处：可解释、可撤销、防幻觉（操作必须落在真实节点上）。

export type GraphOp =
  | { op: "add_viewpoint"; viewpoint: ViewpointNode }
  | { op: "update_viewpoint"; index: number; patch: Partial<ViewpointNode> }
  | { op: "remove_viewpoint"; index: number }
  | { op: "emphasize_viewpoint"; index: number }
  | { op: "set_consensus"; consensus: string[] }
  | { op: "add_consensus"; item: string }
  | { op: "rename_question"; question: string }
  | { op: "relayout" }
  | { op: "reset" };

export type AgentResponse = {
  reply: string; // 给用户看的解释
  ops: GraphOp[];
};

export const AGENT_INSTRUCTION = `你是「一图看山」的画板助手。用户正在编辑一张知乎观点对照图（JSON graph 在下方）。
graph 结构：{question: string, consensus: string[], viewpoints: [{stance, summary, evidence[], authors[], sources[]}]}
用户会用自然语言要求修改这张图。你必须只输出一个 JSON 对象，不要 markdown，第一个字符必须是 { 最后一个字符必须是 }。
格式：{"reply":"一句中文解释你做了什么","ops":[操作序列]}
可用操作：
- {"op":"add_viewpoint","viewpoint":{stance,summary,evidence,authors,sources}} 新增立场
- {"op":"update_viewpoint","index":N,"patch":{...}} 修改第 N 个立场（0 起）
- {"op":"remove_viewpoint","index":N} 删除第 N 个立场
- {"op":"emphasize_viewpoint","index":N} 把第 N 个立场标为重点
- {"op":"set_consensus","consensus":[...]} 重写共识
- {"op":"add_consensus","item":"..."} 追加一条共识
- {"op":"rename_question","question":"..."} 改标题
- {"op":"relayout"} 仅重新布局
- {"op":"reset"} 撤销本条消息里的全部修改，恢复为用户发消息前的原图
规则：修改必须基于用户要求和现有 graph；index 必须落在现有 viewpoints 范围内，不能凭空引用不存在的立场；不要编造知乎链接；无法做到时在 reply 中说明并给空 ops。`;
// reset 需要原图：由调用方在操作应用前注入
export function buildAgentMessages(
  history: { role: string; content: string }[],
  graph: ViewpointGraph,
  userMessage: string
) {
  const transcript = history
    .slice(-8)
    .map((m) => `${m.role === "user" ? "用户" : "助手"}: ${m.content}`)
    .join("\n");
  const content = `${AGENT_INSTRUCTION}

当前 graph：
${JSON.stringify(graph)}

${transcript ? `对话历史：\n${transcript}\n\n` : ""}用户新要求：${userMessage}`;
  return [{ role: "user", content }];
}

export function parseAgentResponse(raw: string): AgentResponse {
  const jsonText = raw.replace(/```json|```/g, "").trim();
  const start = jsonText.indexOf("{");
  const end = jsonText.lastIndexOf("}");
  if (start === -1 || end === -1) return { reply: raw.slice(0, 200), ops: [] };
  try {
    const parsed = JSON.parse(jsonText.slice(start, end + 1));
    return {
      reply: typeof parsed.reply === "string" ? parsed.reply : "已更新",
      ops: Array.isArray(parsed.ops) ? parsed.ops : [],
    };
  } catch {
    return { reply: "这次没听懂，换个说法试试？", ops: [] };
  }
}

// 把操作序列应用到 graph，返回新 graph + 每条操作的人话描述（失败的操作跳过并说明）
export function applyOps(
  graph: ViewpointGraph,
  ops: GraphOp[],
  originalGraph?: ViewpointGraph
): { graph: ViewpointGraph; applied: string[]; failed: string[] } {
  const g: ViewpointGraph = JSON.parse(JSON.stringify(graph));
  const applied: string[] = [];
  const failed: string[] = [];

  ops.forEach((op, i) => {
    const tag = `操作${i + 1}`;
    try {
      switch (op.op) {
        case "add_viewpoint": {
          const v = op.viewpoint;
          if (!v?.stance || !v?.summary) throw new Error("缺少 stance/summary");
          g.viewpoints.push({
            stance: String(v.stance).slice(0, 12),
            summary: String(v.summary).slice(0, 120),
            evidence: (v.evidence ?? []).slice(0, 4).map(String),
            authors: (v.authors ?? []).slice(0, 5).map(String),
            sources: (v.sources ?? []).slice(0, 5).map(String),
          });
          applied.push(`${tag}：新增立场「${v.stance}」`);
          break;
        }
        case "update_viewpoint": {
          const v = g.viewpoints[op.index];
          if (!v) throw new Error(`没有第 ${op.index} 个立场`);
          Object.assign(v, op.patch ?? {});
          applied.push(`${tag}：修改立场「${v.stance}」`);
          break;
        }
        case "remove_viewpoint": {
          const v = g.viewpoints[op.index];
          if (!v) throw new Error(`没有第 ${op.index} 个立场`);
          g.viewpoints.splice(op.index, 1);
          applied.push(`${tag}：删除立场「${v.stance}」`);
          break;
        }
        case "emphasize_viewpoint": {
          const v = g.viewpoints[op.index];
          if (!v) throw new Error(`没有第 ${op.index} 个立场`);
          // 提到第一位 = 布局时最显眼
          g.viewpoints.splice(op.index, 1);
          g.viewpoints.unshift(v);
          applied.push(`${tag}：「${v.stance}」已标为重点`);
          break;
        }
        case "set_consensus":
          g.consensus = (op.consensus ?? []).slice(0, 6).map(String);
          applied.push(`${tag}：重写共识（${g.consensus.length} 条）`);
          break;
        case "add_consensus":
          if (op.item) {
            g.consensus.push(String(op.item).slice(0, 80));
            applied.push(`${tag}：追加共识`);
          }
          break;
        case "rename_question":
          if (op.question) {
            g.question = String(op.question).slice(0, 60);
            applied.push(`${tag}：标题改为「${g.question}」`);
          }
          break;
        case "relayout":
          applied.push(`${tag}：重新布局`);
          break;
        case "reset":
          if (!originalGraph) {
            failed.push(`${tag}：没有可恢复的原图`);
          } else {
            Object.assign(g, JSON.parse(JSON.stringify(originalGraph)));
            applied.push(`${tag}：已恢复为修改前的原图`);
          }
          break;
        default:
          failed.push(`${tag}：未知操作`);
      }
    } catch (e) {
      failed.push(`${tag}：${e instanceof Error ? e.message : "失败"}`);
    }
  });

  return { graph: g, applied, failed };
}
