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
const { roadmapToScene: render } = await import("./harness/__layout_copy.ts");

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

// 清理动态副本
test.after(() => {
  try { fs.unlinkSync(new URL("./harness/__layout_copy.ts", import.meta.url)); } catch { /* ignore */ }
});
