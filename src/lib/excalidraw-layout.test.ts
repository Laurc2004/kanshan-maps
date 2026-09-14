import test from "node:test";
import assert from "node:assert/strict";
import * as fsNs from "node:fs";

// 回归：roadmapToScene 曾把 block() 返回的 {el,height} 整个展开（而非 .el），
// 产出无 type 的非法元素导致 Excalidraw 整板渲染空白（导出走包围盒所以正常）。
// node --test 无法解析 excalidraw-layout.ts 里无后缀的子 import，先写副本再加载。
const fs = fsNs;
const src = fs.readFileSync(new URL("./excalidraw-layout.ts", import.meta.url), "utf8")
  .replace('from "./harness/layouts"', 'from "./layouts.ts"')
  .replace('from "./harness/compat"', 'from "./compat.ts"')
  .replace('from "./viewpoints"', 'from "../viewpoints.ts"')
  .replace('from "./roadmap"', 'from "../roadmap.ts"')
  .replace('from "./zhihu"', 'from "../zhihu.ts"');
fs.writeFileSync(new URL("./harness/__layout_copy.ts", import.meta.url), src);
// @ts-expect-error 副本由上一行动态生成，静态检查时不存在
const { roadmapToScene: render, graphToScene: renderGraph } = await import("./harness/__layout_copy.ts");

test("roadmap scene elements all carry valid type and id (blank-board regression)", () => {
  const g = {
    kind: "roadmap", topic: "前端入门",
    stages: [
      { title: "基础", items: [{ topic: "HTML 标签", detail: "语义化结构", source: "https://e.com/1" }] },
      { title: "进阶", items: [{ topic: "JS 异步", detail: "Promise 与 async" }] },
    ],
  };
  const els = render(g);
  assert.ok(els.length > 4);
  for (const e of els) {
    assert.ok(typeof e.type === "string" && e.type !== "", `element missing type: ${JSON.stringify(e).slice(0, 80)}`);
    assert.ok(typeof e.id === "string", "element missing id");
  }
});

// 换配色坐标映射依赖「同一布局器重生成元素 id 完全一致」；旧 nid() 带时间戳随机后缀导致全 miss。
const roadmapFixture = {
  kind: "roadmap", topic: "前端入门",
  stages: [
    { title: "基础", items: [{ topic: "HTML 标签", detail: "语义化结构", source: "https://e.com/1" }, { topic: "CSS 布局", detail: "Flex 与 Grid" }] },
    { title: "进阶", items: [{ topic: "JS 异步", detail: "Promise 与 async" }] },
    { title: "框架", items: [{ topic: "React 状态", detail: "hooks 与 reducer" }] },
  ],
};
const graphFixture = {
  kind: "viewpoint", question: "考研还是就业？",
  viewpoints: [
    { stance: "支持考研", summary: "学历溢价仍在，研发岗门槛提高", authors: ["答主A"], evidence: ["某厂校招硕士起步", "读研转专业机会"] },
    { stance: "支持就业", summary: "三年工作经验胜过一个学位", authors: ["答主B"], evidence: ["行业变化快，早入场", "经济压力"] },
    { stance: "看专业", summary: "理工科读研收益高，文科谨慎", authors: ["答主C"], evidence: [] },
  ],
  consensus: ["先评估自身专业与行业", "实习经历很重要"],
};

test("roadmapToScene element ids are deterministic across renders (palette-remap regression)", () => {
  const a = render(roadmapFixture);
  const b = render(roadmapFixture);
  assert.equal(a.length, b.length);
  assert.deepEqual(a.map((e: { id: string }) => e.id), b.map((e: { id: string }) => e.id));
  // 全元素完整 fingerprint 也应一致（换配色前后除样式字段外坐标/种子都不应变）
  assert.deepEqual(
    a.map((e: Record<string, unknown>) => [e.id, e.x, e.y, e.seed, e.versionNonce]),
    b.map((e: Record<string, unknown>) => [e.id, e.x, e.y, e.seed, e.versionNonce]),
  );
  // id 不允许带随机/时间后缀形态（旧 bug：`txt_mtzmrps6_0` 每次变）
  for (const e of a) assert.ok(!/_[a-z0-9]{8}_\d+$/.test(e.id), `id looks random: ${e.id}`);
});

test("graphToScene element ids are deterministic across renders (palette-remap regression)", () => {
  const a = renderGraph(graphFixture);
  const b = renderGraph(graphFixture);
  assert.equal(a.length, b.length);
  assert.deepEqual(a.map((e: { id: string }) => e.id), b.map((e: { id: string }) => e.id));
  assert.deepEqual(
    a.map((e: Record<string, unknown>) => [e.id, e.x, e.y, e.seed, e.versionNonce]),
    b.map((e: Record<string, unknown>) => [e.id, e.x, e.y, e.seed, e.versionNonce]),
  );
});

test("interleaved renders still produce identical ids (module counter reset per render)", () => {
  const r1 = render(roadmapFixture);
  renderGraph(graphFixture); // 中间穿插另一种渲染，计数器必须被 beginIds 重置
  const r2 = render(roadmapFixture);
  assert.deepEqual(r1.map((e: { id: string }) => e.id), r2.map((e: { id: string }) => e.id));
  const g1 = renderGraph(graphFixture);
  render(roadmapFixture);
  const g2 = renderGraph(graphFixture);
  assert.deepEqual(g1.map((e: { id: string }) => e.id), g2.map((e: { id: string }) => e.id));
});

test("different content yields different ids (no constant-id collapse)", () => {
  const a = render(roadmapFixture);
  const b = render({ ...roadmapFixture, topic: "后端入门" });
  assert.notDeepEqual(a.map((e: { id: string }) => e.id), b.map((e: { id: string }) => e.id));
});

// 清理动态副本
test.after(() => {
  try { fs.unlinkSync(new URL("./harness/__layout_copy.ts", import.meta.url)); } catch { /* ignore */ }
});
