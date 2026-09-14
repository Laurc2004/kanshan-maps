// 无 DOM 渲染探针：KnowledgeGraph → 统一渲染器 → 自绘 SVG（rect/ellipse/text/polyline 直出）
// 用法：node --experimental-strip-types scripts/visual-probe.ts <kind> [palette] [mode]
//   kind: compare | roadmap | summary   palette: zhihu-blue | paper-pastel | ...   mode: mindmap(summary 时默认)
import { knowledgeGraphToScene } from "../src/lib/harness/layouts.ts";
import type { KnowledgeGraph } from "../src/lib/harness/types.ts";
import { writeFileSync } from "node:fs";

const kind = process.argv[2] ?? "compare";
const palette = process.argv[3] ?? "zhihu-blue";
const summaryMindmap = kind === "summary";

const mkNode = (id: string, label: string, description: string, i: number) => ({
  id, label, description, citations: [`c${(i % 4) + 1}`], emphasis: "normal" as const,
});
const spec = (extra: Record<string, unknown> = {}) =>
  ({ palette, density: "comfortable", stroke: "clean", hierarchy: { title: 1, keyFinding: 1, evidence: 1 }, ...extra }) as KnowledgeGraph["presentation"];

function makeGraph(): KnowledgeGraph {
  const citations = [1, 2, 3, 4].map((n) => ({
    id: `c${n}`, sourceIndex: n - 1, url: `https://www.zhihu.com/answer/${100 + n}`, title: `知乎回答 ${n}`,
  }));
  if (kind === "roadmap") {
    return {
      kind: "swimlane-roadmap", title: "前端工程师入门到进阶 · 学习路线", summary: "基于 8 篇知乎高赞回答整理的四阶段路线",
      presentation: spec(),
      citations, edges: [],
      groups: [
        { id: "g0", label: "打好基础", nodeIds: ["n1", "n2", "n3"] },
        { id: "g1", label: "框架实战", nodeIds: ["n4", "n5"] },
        { id: "g2", label: "工程化", nodeIds: ["n6", "n7"] },
        { id: "g3", label: "进阶方向", nodeIds: ["n8"] },
      ],
      nodes: [
        mkNode("n1", "HTML/CSS 语义化与布局", "掌握 Flex/Grid 布局，理解盒模型与层叠上下文，能还原常见页面", 0),
        mkNode("n2", "JavaScript 核心语法", "原型链、闭包、事件循环、模块化，配合《你不知道的 JavaScript》精读", 1),
        mkNode("n3", "浏览器工作原理", "渲染流水线、重排重绘、性能分析工具的使用", 2),
        mkNode("n4", "React 全家桶", "Hooks 心智模型、状态管理选型、组件设计模式，做一个完整项目", 3),
        mkNode("n5", "TypeScript 工程实践", "类型体操不必深入，重点是泛型约束与类型收窄的日常应用", 0),
        mkNode("n6", "构建与部署", "Vite 原理、CI/CD、边缘渲染与缓存策略", 1),
        mkNode("n7", "性能优化方法论", "首屏指标、包体积治理、长列表与动画性能", 2),
        mkNode("n8", "选择一个垂直方向深挖", "可视化 / 编辑器 / 跨端任选其一，形成个人技术标签", 3),
      ],
    };
  }
  if (kind === "summary") {
    return {
      kind: "cluster-board", title: "为什么年轻人越来越反感酒桌文化？这篇文章讲透了", summary: "来自知乎文章的摘要地图",
      presentation: spec({ layout: "evidence-tree" }),
      metadata: summaryMindmap ? { mode: "summary" } : {},
      citations, edges: [],
      groups: [],
      nodes: [
        mkNode("n1", "酒桌文化的本质是权力测试", "劝酒的核心不是酒，而是服从性验证：你能不能为了上位者委屈自己", 0),
        mkNode("n2", "年轻一代的职场筹码变了", "95后/00后更看重技能流动性，不再把单一组织的晋升通道当作唯一出路", 1),
        mkNode("n3", "健康意识与生活方式转变", "体检报告上的脂肪肝和尿酸，比领导的笑脸更有说服力", 2),
        mkNode("n4", "法律与舆论环境在收紧", "多起劝酒致死判例让组织者有了真实的连带责任风险", 3),
        mkNode("n5", "替代社交场景在增多", "咖啡局、飞盘局、剧本杀正在承接原本属于酒桌的社交功能", 0),
        mkNode("n6", "但彻底的拒绝仍需资本", "在某些行业，酒桌仍是信息流通的非正式渠道，拒绝的代价是真实存在的", 1),
      ],
    };
  }
  // compare / debate-grid
  return {
    kind: "debate-grid", title: "考研还是直接就业？知乎答主的四种立场", summary: "基于 10 篇高赞回答",
    presentation: spec(),
    citations, edges: [],
    groups: [
      { id: "g0", label: "支持考研", nodeIds: ["question", "n1", "n2"] },
      { id: "g1", label: "支持就业", nodeIds: ["n3", "n4"] },
      { id: "consensus", label: "共识", nodeIds: ["n5", "n6"] },
    ],
    nodes: [
      { id: "question", label: "考研还是直接就业？", description: "", citations: [], emphasis: "high" },
      mkNode("n1", "学历通胀下考研是避险", "本科双非简历关都过不了，硕士学历是进入大厂的最低门槛，三年时间换一个入场券不亏", 0),
      mkNode("n2", "考研是重新选择专业的机会", "本科被调剂到冷门专业的人，跨考是成本最低的转向方式", 1),
      mkNode("n3", "三年工作经验比学历更值钱", "互联网行业的职级体系里，三年经验的本科生薪资普遍高于应届硕士，且早三年积累复利", 2),
      mkNode("n4", "先就业再决定要不要读", "很多人考研只是逃避就业，工作一年后才知道自己真正缺什么", 3),
      { ...mkNode("n5", "共识：别把考研当逃避", "无论哪一派都同意：为了逃避就业而考研，大概率三年后更迷茫", 0), group: "consensus" },
      { ...mkNode("n6", "共识：看行业不看鸡汤", "医学法学必须读，计算机设计看作品，先查目标行业的真实招聘要求", 1), group: "consensus" },
    ],
  };
}

// ── elements → SVG ──
type El = Record<string, unknown>;
function esc(s: string): string { return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }

function toSvg(els: El[]): string {
  const alive = els.filter((e) => !e.isDeleted);
  const pad = 40;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const e of alive) {
    const x = e.x as number, y = e.y as number, w = e.width as number, h = e.height as number;
    minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x + w); maxY = Math.max(maxY, y + h);
  }
  const W = maxX - minX + pad * 2, H = maxY - minY + pad * 2;
  const parts: string[] = [`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`,
    `<rect width="${W}" height="${H}" fill="#fbfaf6"/>`];
  const texts: string[] = [];
  for (const e of alive) {
    const x = (e.x as number) - minX + pad, y = (e.y as number) - minY + pad;
    const w = e.width as number, h = e.height as number;
    const stroke = (e.strokeColor as string) ?? "#1e1e1e";
    const bg = (e.backgroundColor as string) ?? "transparent";
    const sw = (e.strokeWidth as number) ?? 2;
    const op = ((e.opacity as number) ?? 100) / 100;
    if (e.type === "rectangle") {
      const rx = e.roundness ? Math.min(14, w / 8) : 0;
      parts.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${bg}" fill-opacity="${bg === "transparent" ? 0 : op}" stroke="${stroke}" stroke-width="${sw}"/>`);
    } else if (e.type === "ellipse") {
      parts.push(`<ellipse cx="${x + w / 2}" cy="${y + h / 2}" rx="${w / 2}" ry="${h / 2}" fill="${bg}" stroke="${stroke}" stroke-width="${sw}"/>`);
    } else if (e.type === "arrow" || e.type === "line") {
      const pts = (e.points as number[][]).map(([px, py]) => `${x + px},${y + py}`).join(" ");
      const marker = `m${e.id}`.replace(/[^a-zA-Z0-9_-]/g, "");
      parts.push(`<defs><marker id="${marker}" markerWidth="10" markerHeight="8" refX="9" refY="4" orient="auto"><path d="M0,0 L10,4 L0,8 z" fill="${stroke}"/></marker></defs>`,
        `<polyline points="${pts}" fill="none" stroke="${stroke}" stroke-width="${sw}" marker-end="url(#${marker})"/>`);
    } else if (e.type === "text") {
      const size = (e.fontSize as number) ?? 14;
      const lh = size * ((e.lineHeight as number) ?? 1.25);
      const lines = String(e.text ?? "").split("\n");
      const anchor = e.textAlign === "center" ? "middle" : "start";
      const tx = anchor === "middle" ? x + w / 2 : x;
      // verticalAlign middle: 文字块垂直中心对齐元素中心；top: 首行 baseline = y + size*0.8
      const startY = e.verticalAlign === "middle" ? y + h / 2 - (lines.length * lh) / 2 + size * 0.8 : y + size * 0.8;
      lines.forEach((line, li) => {
        texts.push(`<text x="${tx}" y="${startY + li * lh}" font-size="${size}" fill="${stroke}" text-anchor="${anchor}" font-family="PingFang SC, Hiragino Sans GB, sans-serif">${esc(line)}</text>`);
      });
    }
  }
  parts.push(...texts, "</svg>");
  return parts.join("\n");
}

const graph = makeGraph();
const els = knowledgeGraphToScene(graph);
const svg = toSvg(els);
const out = `/tmp/kanshan-probe-${kind}${summaryMindmap ? "-mindmap" : ""}-${palette}.svg`;
writeFileSync(out, svg);
// 汇总：元素数 / 文本溢出粗检（文字元素超出其所属卡右缘）
console.log(`elements=${els.length} rects=${els.filter((e) => e.type === "rectangle").length} arrows=${els.filter((e) => e.type === "arrow").length} texts=${els.filter((e) => e.type === "text").length}`);
console.log(`svg: ${out}`);
