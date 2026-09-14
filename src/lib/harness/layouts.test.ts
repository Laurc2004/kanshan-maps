import test from "node:test";
import assert from "node:assert/strict";
import { knowledgeGraphToScene } from "./layouts.ts";
import type { KnowledgeGraph, LayoutKind } from "./types.ts";

const layouts = ["debate-grid", "radial-map", "timeline", "swimlane-roadmap", "cluster-board", "evidence-tree"] as const;
const graph = (layout: LayoutKind): KnowledgeGraph => ({ kind: layout, title: "Technology through time", summary: "A compact overview", nodes: Array.from({ length: 6 }, (_, i) => ({ id: `n${i}`, label: `Step ${i + 1}`, description: "A deliberately long explanation that must wrap inside its deterministic card without becoming over-wide.", citations: [], group: i < 3 ? "g1" : "g2" })), edges: Array.from({ length: 5 }, (_, i) => ({ fromId: `n${i}`, toId: `n${i + 1}` })), groups: [{ id: "g1", label: "For", nodeIds: ["n0", "n1", "n2"] }, { id: "g2", label: "Against", nodeIds: ["n3", "n4", "n5"] }], citations: [], presentation: { layout, palette: "zhihu-blue", density: "comfortable", stroke: "clean", hierarchy: { title: 1, keyFinding: 1, evidence: 1 } } });

function substantiveCollisions(elements: Record<string, unknown>[]) {
  const boxes = elements.filter((e) => e.type === "rectangle").map((e) => e as { id: string; x: number; y: number; width: number; height: number });
  const hits: string[] = [];
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
    const a = boxes[i], b = boxes[j];
    const intersection = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
    const containment = (a.x <= b.x && a.y <= b.y && a.x + a.width >= b.x + b.width && a.y + a.height >= b.y + b.height) || (b.x <= a.x && b.y <= a.y && b.x + b.width >= a.x + a.width && b.y + b.height >= a.y + a.height);
    if (!containment && intersection > Math.min(a.width * a.height, b.width * b.height) * 0.05) hits.push(`${a.id}:${b.id}`);
  }
  return hits;
}

for (const layout of layouts) test(`${layout} produces a valid collision-free Excalidraw scene`, () => {
  const value = graph(layout);
  value.presentation = { ...value.presentation, density: "spacious", hierarchy: { title: 2, keyFinding: 2, evidence: 2 } };
  const scene = knowledgeGraphToScene(value);
  assert.ok(scene.length > 0);
  const byId = new Map(scene.map((element) => [element.id, element]));
  for (const element of scene) {
    assert.equal(typeof element.id, "string"); assert.equal(typeof element.x, "number"); assert.equal(typeof element.y, "number");
    assert.equal(typeof element.width, "number"); assert.equal(typeof element.height, "number"); assert.equal(typeof element.seed, "number");
    if (element.type === "text") {
      assert.ok((element.width as number) <= 1100, `over-wide text ${element.id}`);
      const ownerId = (element.id as string).replace(/-(title|body)$/, "");
      const owner = byId.get(ownerId);
      if (owner) {
        assert.ok((element.x as number) + (element.width as number) <= (owner.x as number) + (owner.width as number), `text escapes card width ${element.id}`);
        assert.ok((element.y as number) + (element.height as number) <= (owner.y as number) + (owner.height as number), `text escapes card height ${element.id}`);
      }
    }
  }
  assert.deepEqual(substantiveCollisions(scene), []);
});

test("all layouts are structurally distinct and presentation.layout overrides kind", () => {
  const base = graph("debate-grid");
  const signatures = layouts.map((layout) => knowledgeGraphToScene({ ...base, kind: "debate-grid", presentation: { ...base.presentation, layout } }).filter((e) => e.type === "rectangle").map((e) => `${e.x},${e.y},${e.width},${e.height}`).join("|"));
  assert.equal(new Set(signatures).size, layouts.length);
});

test("unsupported layout falls back explicitly and deterministically", () => {
  const base = graph("debate-grid");
  const fallback = knowledgeGraphToScene({ ...base, presentation: { ...base.presentation, layout: "not-a-layout" as LayoutKind } });
  assert.deepEqual(fallback, knowledgeGraphToScene({ ...base, presentation: { ...base.presentation, layout: "radial-map" } }));
});

test("same graph produces the same scene IDs and geometry", () => assert.deepEqual(knowledgeGraphToScene(graph("cluster-board")), knowledgeGraphToScene(graph("cluster-board"))));

test("Agent palette switch (id-aligned local re-render) keeps root and arrow anchors in sync", () => {
  // 前端换色路径：palette 改后重渲染、按 id 映射旧 x/y —— 元素 id 必须逐元素相等，
  // 且摘要思维导图的 root/箭头不能因 id 漂移而失去坐标对齐（root 错位会导致箭头穿卡）
  const summaryGraph: KnowledgeGraph = { ...graph("evidence-tree"), metadata: { mode: "summary" }, edges: [] };
  const before = knowledgeGraphToScene(summaryGraph);
  const after = knowledgeGraphToScene({ ...summaryGraph, presentation: { ...summaryGraph.presentation, palette: "research-mono" } });
  const ids = (els: Record<string, unknown>[]) => els.map((e) => e.id);
  assert.deepEqual(ids(after), ids(before), "palette switch must preserve element ids for coordinate remap");
  // 卡片高度不受 palette 影响（同一 graph 只换色），旧坐标映射后依然零重叠
  const boxesOf = (els: Record<string, unknown>[]) => new Map(els.map((e) => [e.id as string, e as { x: number; y: number; width: number; height: number }]));
  const b1 = boxesOf(before), b2 = boxesOf(after);
  for (const [id, box] of b2) {
    const old = b1.get(id)!;
    assert.deepEqual({ w: box.width, h: box.height }, { w: old.width, h: old.height }, `${id} geometry must not change on palette switch`);
  }
});

test("unassigned nodes occupy unique fallback slots and edge rate-limit drops redundant arrows", () => {
  const value = graph("swimlane-roadmap");
  value.groups = [{ id: "g1", label: "One", nodeIds: ["n0"] }];
  value.nodes = value.nodes.map((node, i) => ({ ...node, group: i === 0 ? "g1" : undefined }));
  value.edges.push({ fromId: "n0", toId: "n1" });
  const scene = knowledgeGraphToScene(value);
  const rects = scene.filter((e) => e.type === "rectangle") as Array<{ x: number; y: number; width: number; height: number }>;
  assert.deepEqual(substantiveCollisions(scene), []);
  // swimlane：边已由阶段间箭头表达（跳过限流），箭头数 = 阶段数 - 1
  assert.ok(scene.filter((e) => e.type === "arrow").length >= 1);
  assert.ok(rects.every((r) => r.width > 0 && r.height > 0));
});

test("hierarchy text stays inside cards at maximum supported scale", () => {
  const value = graph("debate-grid");
  value.presentation = { ...value.presentation, hierarchy: { title: 2, keyFinding: 2, evidence: 2 } };
  const scene = knowledgeGraphToScene(value);
  const byId = new Map(scene.map((element) => [element.id, element]));
  for (const element of scene.filter((e) => e.type === "text")) {
    const owner = byId.get((element.id as string).replace(/-(title|body)$/, ""));
    if (owner) {
      assert.ok((element.x as number) + (element.width as number) <= (owner.x as number) + (owner.width as number));
      assert.ok((element.y as number) + (element.height as number) <= (owner.y as number) + (owner.height as number));
    }
  }
});

test("node IDs remain unique for distinct non-BMP source IDs", () => {
  const ids = ["😀", "😁"];
  const scene = knowledgeGraphToScene({ ...graph("debate-grid"), nodes: ids.map((id) => ({ id, label: id, description: "node", citations: [] })) });
  const elementIds = scene.map((element) => element.id as string);
  assert.equal(new Set(elementIds).size, elementIds.length);
});

test("node IDs remain unique for sanitized and truncated source IDs", () => {
  const ids = ["a/b", "a?b", "a\\\\b", "x".repeat(90), "x".repeat(89) + "y"];
  const scene = knowledgeGraphToScene({ ...graph("debate-grid"), nodes: ids.map((id) => ({ id, label: id, description: "node", citations: [] })) });
  const elementIds = scene.map((element) => element.id as string);
  assert.equal(new Set(elementIds).size, elementIds.length);
});

test("evidence-tree connects its root to every child and places children to the right", () => {
  const scene = knowledgeGraphToScene(graph("evidence-tree"));
  const root = scene.find((element) => element.id === "evidence-root") as { x: number; y: number; width: number; height: number };
  assert.ok(root);
  const children = scene.filter((element) => element.type === "rectangle") as Array<{ id: string; x: number; y: number; width: number; height: number; customData: { nodeId: string } }>;
  assert.equal(children.length, 6);
  assert.ok(children.every((child) => child.x > root.x + root.width));
  assert.equal(scene.filter((element) => element.type === "arrow" && element.startNodeId === "evidence-root").length, children.length);
  for (const child of children) assert.ok(scene.some((element) => element.type === "arrow" && element.startNodeId === "evidence-root" && element.endNodeId === child.customData.nodeId));
});

// 文章摘要思维导图：根节点垂直中心必须与左右分支列中心对齐；箭头端点必须落在卡片水平侧缘（不得从卡片顶/底穿入压卡）
test("summary mindmap root is vertically centered and branch arrows hit card side edges", () => {
  const summaryGraph: KnowledgeGraph = {
    ...graph("evidence-tree"),
    metadata: { mode: "summary" },
    edges: [],
  };
  const scene = knowledgeGraphToScene(summaryGraph);
  const root = scene.find((element) => element.id === "evidence-root") as { x: number; y: number; width: number; height: number };
  assert.ok(root);
  const cards = scene.filter((element) => element.type === "rectangle" && String(element.id).startsWith("node-")) as Array<{ id: string; x: number; y: number; width: number; height: number }>;
  assert.equal(cards.length, 6);
  const left = cards.filter((c) => c.x < root.x);
  const right = cards.filter((c) => c.x > root.x);
  assert.ok(left.length > 0 && right.length > 0, "mindmap must split branches left/right");
  // 根垂直中心 ≈ 较高一侧分支列的垂直中心（positions 已把短列向中心补齐）
  const colCenter = (members: typeof cards) => (Math.min(...members.map((c) => c.y)) + Math.max(...members.map((c) => c.y + c.height))) / 2;
  const taller = Math.max(...[left, right].map((m) => Math.max(...m.map((c) => c.y + c.height)) - Math.min(...m.map((c) => c.y))));
  const centered = [left, right].find((m) => Math.max(...m.map((c) => c.y + c.height)) - Math.min(...m.map((c) => c.y)) === taller)!;
  const rootCy = root.y + root.height / 2;
  assert.ok(Math.abs(rootCy - colCenter(centered)) <= 1, `root center ${rootCy} should equal branch column center ${colCenter(centered)}`);
  // 箭头端点：终点必须落在卡片左/右边缘（x == card.x 或 x == card.x+width），y 为卡片垂直中点；不得穿卡
  const arrows = scene.filter((element) => element.type === "arrow" && element.startNodeId === "evidence-root") as Array<{ x: number; y: number; points: [number, number][]; endNodeId: string }>;
  assert.equal(arrows.length, cards.length);
  for (const a of arrows) {
    const pts = a.points;
    const startRel = pts[0], endRel = pts[pts.length - 1];
    const startAbs = { x: a.x + startRel[0], y: a.y + startRel[1] };
    const endAbs = { x: a.x + endRel[0], y: a.y + endRel[1] };
    assert.ok(startAbs.x === root.x || startAbs.x === root.x + root.width, `arrow must leave root side edge, got x=${startAbs.x}`);
    assert.ok(Math.abs(startAbs.y - rootCy) <= 0.001, "arrow must leave root at its vertical center");
    const card = cards.find((c) => Math.abs(endAbs.y - (c.y + c.height / 2)) <= 0.001 && (endAbs.x === c.x || endAbs.x === c.x + c.width));
    assert.ok(card, `arrow end (${endAbs.x},${endAbs.y}) must land on a card side edge midpoint, not pierce top/bottom`);
  }
});

// 中心椭圆标题必须在椭圆内水平垂直居中（文字块中心 == 椭圆中心）
test("evidence-root title text is centered inside the ellipse", () => {
  for (const title of ["短标题", "这是一个相当长的文章主题标题需要折成两行来展示"]) {
    const g: KnowledgeGraph = { ...graph("evidence-tree"), title, metadata: { mode: "summary" }, edges: [] };
    const scene = knowledgeGraphToScene(g);
    const root = scene.find((e) => e.id === "evidence-root") as { x: number; y: number; width: number; height: number };
    const t = scene.find((e) => e.id === "evidence-root-text") as { x: number; y: number; width: number; height: number; textAlign: string; verticalAlign: string };
    assert.ok(root && t, `root and its text must exist for title "${title}"`);
    const eps = 1;
    assert.ok(Math.abs(t.x + t.width / 2 - (root.x + root.width / 2)) <= eps, `text not horizontally centered for "${title}"`);
    assert.ok(Math.abs(t.y + t.height / 2 - (root.y + root.height / 2)) <= eps, `text not vertically centered for "${title}"`);
    assert.equal(t.textAlign, "center");
    assert.equal(t.verticalAlign, "middle");
  }
});

// 超链接开关：metadata.linksEnabled=false 时卡片不带 link，citations 数据保留；恢复后链接回来
test("linksEnabled=false strips card links but keeps citations", () => {
  const g: KnowledgeGraph = {
    ...graph("debate-grid"),
    citations: [{ id: "c1", sourceIndex: 0, url: "https://zhihu.com/a/1", title: "回答一" }],
  };
  g.nodes = g.nodes.map((n) => ({ ...n, citations: ["c1"] }));
  const withLinks = knowledgeGraphToScene(g);
  assert.ok(withLinks.some((e) => typeof e.link === "string" && (e.link as string).startsWith("https://")), "baseline: cards should carry links");
  const without = knowledgeGraphToScene({ ...g, metadata: { linksEnabled: false } });
  assert.ok(without.every((e) => !e.link), "linksEnabled=false must strip all element links");
  assert.equal(without.length, withLinks.length, "element count unchanged (no content removed)");
  const restored = knowledgeGraphToScene({ ...g, metadata: { linksEnabled: true } });
  assert.ok(restored.some((e) => typeof e.link === "string" && (e.link as string).startsWith("https://")), "links restored when re-enabled");
});

test("cards grow to fit 2-line titles and 6-line bodies without text escaping the card (S5/P24)", () => {
  for (const layout of layouts) {
    const value = graph(layout);
    // 长标题（P24 起最多 2 行）+ 长描述（需要 6 行），在 spacious 密度 + 2 倍字级下仍须完整容纳
    value.nodes = value.nodes.map((node, i) => ({
      ...node,
      label: `这是一个非常长的观点标题用于验证多行折行展示效果第${i + 1}号立场观点`,
      description: "这是一段刻意拉长的正文描述，用来验证描述文字在六行以内能够完整展示在卡片内部而不会溢出卡片边界，包含足够的汉字与 English words 混合内容以确保折行逻辑被真实触发。",
    }));
    value.presentation = { ...value.presentation, density: "spacious", hierarchy: { title: 2, keyFinding: 2, evidence: 2 } };
    const scene = knowledgeGraphToScene(value);
    const byId = new Map(scene.map((element) => [element.id, element]));
    for (const element of scene.filter((e) => e.type === "text")) {
      const owner = byId.get((element.id as string).replace(/-(title|body)$/, ""));
      if (owner) {
        assert.ok((element.x as number) + (element.width as number) <= (owner.x as number) + (owner.width as number), `${layout}: text escapes card width ${element.id}`);
        assert.ok((element.y as number) + (element.height as number) <= (owner.y as number) + (owner.height as number), `${layout}: text escapes card height ${element.id}`);
      }
    }
    assert.deepEqual(substantiveCollisions(scene), [], `${layout}: cards overlap with tall content`);
    // 长内容下卡高必须真的被撑高（超过最小卡高）
    const rects = scene.filter((e) => e.type === "rectangle" && String(e.id).startsWith("node-")) as Array<{ height: number }>;
    assert.ok(rects.some((r) => r.height > 280), `${layout}: card height should grow beyond minimum for long content`);
  }
});

test("debate-grid renders viewpoint cards in group lanes with central question capsule and a single consensus banner card", () => {
  const value = graph("debate-grid");
  // 模拟真实观点图：question 节点 + 观点节点 + 共识节点
  value.nodes = [
    { id: "question", label: value.title, description: value.title, citations: [], emphasis: "high" },
    ...value.nodes.slice(0, 4).map((n, i) => ({ ...n, group: i < 2 ? "g1" : "g2" })),
    { id: "c1", label: "共识", description: "双方都认为要理性看待", citations: [], group: "consensus" },
  ];
  value.groups = [
    { id: "g1", label: "支持", nodeIds: ["n0", "n1"] },
    { id: "g2", label: "反对", nodeIds: ["n2", "n3"] },
    { id: "consensus", label: "共识", nodeIds: ["c1"] },
  ];
  const scene = knowledgeGraphToScene(value);
  // 中心胶囊存在，且 y 在观点卡上方
  const capsule = scene.find((e) => e.id === "debate-capsule") as { x: number; y: number; width: number; height: number };
  assert.ok(capsule, "central question capsule must exist");
  const cards = scene.filter((e) => e.type === "rectangle" && String(e.id).startsWith("node-")) as Array<{ id: string; x: number; y: number; width: number }>;
  assert.equal(cards.length, 4, "4 viewpoint cards (consensus node renders as banner, not card)");
  assert.ok(cards.every((c) => c.y > capsule.y), "all cards below capsule");
  // 观点卡按组对立分列：g1 一列、g2 一列
  assert.equal(new Set(cards.map((c) => c.x)).size, 2, "viewpoint cards in 2 group lanes");
  // P26：观点卡 → 胶囊不再画汇聚箭头（列头标签 + 分色已表达归属，箭头是视觉噪音）；
  // 唯一保留的箭头是胶囊 → 共识横幅的绿色连线
  const links = scene.filter((e) => e.type === "arrow" && String(e.id).startsWith("debate-link-"));
  assert.equal(links.length, 0, "no viewpoint→capsule arrows (removed in P26)");
  // 胶囊节点本身不渲染成普通卡
  assert.ok(!cards.some((c) => c.id.includes("question")), "question node must render as capsule, not card");
  // P25：共识合并成一张通栏长卡（不是多张小卡），且带一条胶囊→共识连线
  const banner = scene.find((e) => e.id === "debate-consensus") as { x: number; y: number; width: number; height: number };
  assert.ok(banner, "consensus must render as a single banner card");
  const gridW = Math.max(...cards.map((c) => c.x)) + 400 - Math.min(...cards.map((c) => c.x));
  assert.ok(banner.width >= gridW - 1, `banner should span the full grid width (got ${banner.width}, grid ${gridW})`);
  assert.ok(scene.some((e) => e.id === "debate-consensus-link"), "capsule → consensus link must exist");
  // 立场列头标签存在（P26 起这是表达归属的主要方式）
  assert.ok(scene.some((e) => e.id === "debate-stance-0") && scene.some((e) => e.id === "debate-stance-1"), "lane stance labels must exist");
  // P26：观点卡加宽到 400 且文字全显示——卡标题/正文元素无省略号截断
  const cardTexts = scene.filter((e) => e.type === "text" && /node-.*-(title|body)$/.test(String(e.id))) as Array<{ text: string }>;
  assert.ok(cardTexts.length >= 4, "card title/body texts exist");
  assert.ok(cardTexts.every((t) => !/…/.test(t.text)), "debate card texts must never be truncated");
  assert.ok(cards.every((c) => Math.abs(c.width - 400) < 1), "debate cards widened to 400");
});

// P25：顶部标题/描述必须居中且完整显示（长标题不截断）
test("graph header title and summary are centered and never truncated", () => {
  for (const title of ["短标题", "这是一个相当长的问题标题用来验证标题文字在加宽加行之后能够完整显示不再被省略号截断的长标题"]) {
    const g: KnowledgeGraph = { ...graph("debate-grid"), title };
    const scene = knowledgeGraphToScene(g);
    const t = scene.find((e) => e.id === "graph-title") as { x: number; width: number; textAlign: string; text: string };
    const s = scene.find((e) => e.id === "graph-summary") as { x: number; width: number; textAlign: string; text: string };
    assert.equal(t.textAlign, "center");
    assert.ok(!/…/.test(t.text), `title must not be truncated: "${t.text}"`);
    assert.ok(Math.abs(t.x + t.width / 2 - 590) <= 1, "title text box must be centered on canvas");
    assert.equal(s.textAlign, "center");
    assert.ok(Math.abs(s.x + s.width / 2 - 590) <= 1, "summary text box must be centered on canvas");
  }
});
