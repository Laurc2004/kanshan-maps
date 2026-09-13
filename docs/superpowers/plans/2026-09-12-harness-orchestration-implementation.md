# Harness 多源编排 Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** 将“一图看山”升级为带清空确认、无伪分页、多源受约束编排、统一知识图 IR、多布局多风格及跨图类型 Agent 修改能力的可验证 Harness。

**Architecture:** 保留当前 `/api/generate/stream` SSE 入口和旧 graph 转换兼容层，在服务端增加 Planner、Source Adapter、Executor、Synthesizer、Validator 五个明确边界。模型只负责输出受约束的计划和知识结构，搜索调用、预算、布局坐标、引用校验与场景验证均由确定性 TypeScript 完成。

**Tech Stack:** Next.js 16 App Router、React 19、TypeScript、`@excalidraw/excalidraw`、Node 内置 `node:test`/`assert` 测试、SSE、知乎开放平台 API、OpenAI 兼容模型。

---

## 执行约束

- 开始每个任务前重读 `task_plan.md`、`findings.md`、`progress.md`。
- 严格按任务顺序执行；每个行为改动先写可失败测试，再实现。
- 不读取或输出 `.env` 的值；只使用现有服务端环境变量。
- 每个任务完成后更新三份 planning 文件并提交。
- 新 Harness 在验证前保留旧生成路径作为降级；不可让现有观点图、路线图、缓存恢复和导出回归。
- 最终提交前重新运行完整验证，推送 `main`，执行 Vercel 生产部署并读回线上结果。

### Task 1: 清空确认弹窗并移除无效分页

**Objective:** 清空画布前必须二次确认，并彻底移除“加载更多回答”的前后端伪分页能力。

**Files:**
- Modify: `src/app/page.tsx`
- Modify: `src/components/SourcesPanel.tsx`
- Modify: `src/app/api/search/route.ts`
- Modify: `src/lib/zhihu.ts`
- Create: `src/lib/board-actions.ts`
- Create: `src/lib/board-actions.test.ts`

**Step 1: 写失败测试**

在 `src/lib/board-actions.test.ts` 测试纯函数/动作契约：未确认不执行清理；确认后产生清理动作；搜索请求只包含 `Query` 和 `Count`，不再包含 `Offset`。

**Step 2: 验证 RED**

Run: `node --test --experimental-strip-types src/lib/board-actions.test.ts`
Expected: FAIL，模块或导出尚不存在。

**Step 3: 最小实现**

- 将当前 `clearBoard` 拆为“打开确认状态”和“执行清理”。
- 使用产品内 modal，不使用 `window.confirm`。
- 弹窗明确说明会清除画布、素材和本地缓存；取消只关闭弹窗。
- 删除 `searchOffset`、`searchHasMore`、`loadingMore`、`loadMoreAnswers`。
- 删除 SourcesPanel 的滚动监听、加载按钮和相关 props。
- `/api/search` 恢复单次 `question` 请求。
- `zhihuSearch` 移除 `offset` 参数和 `Offset` query。

**Step 4: 验证 GREEN**

Run: `node --test --experimental-strip-types src/lib/board-actions.test.ts && npx tsc --noEmit && npm run lint`
Expected: PASS。

**Step 5: 浏览器行为验证**

启动 dev server 后断言：点击垃圾桶只出现确认弹窗，画布仍存在；点击取消保留画布；再次打开并确认后 graph、素材和缓存清空；DOM 中不存在“继续加载更多回答”。

**Step 6: 提交**

```bash
git add src/app/page.tsx src/components/SourcesPanel.tsx src/app/api/search/route.ts src/lib/zhihu.ts src/lib/board-actions.ts src/lib/board-actions.test.ts task_plan.md findings.md progress.md
git commit -m "fix: confirm board reset and remove search pagination"
```

### Task 2: 定义 Harness 契约和 Planner

**Objective:** 建立可校验的 RunPlan、预算和规则降级 Planner，不接入真实搜索。

**Files:**
- Create: `src/lib/harness/types.ts`
- Create: `src/lib/harness/planner.ts`
- Create: `src/lib/harness/planner.test.ts`

**Step 1: 写失败测试**

覆盖：
- 学习类输入降级为 `roadmap`。
- 时间演进输入降级为 `timeline`。
- 争议问题降级为 `compare`。
- 普通主题降级为 `concept-map`。
- queries 最多 3 个，文档数和模型调用预算被硬裁剪。
- 非法 source/layout/style 回落到允许值。

**Step 2: 验证 RED**

Run: `node --test --experimental-strip-types src/lib/harness/planner.test.ts`
Expected: FAIL，Planner 尚不存在。

**Step 3: 实现类型和规则 Planner**

定义：
- `IntentKind`
- `SourceId`
- `LayoutKind`
- `PresentationSpec`
- `HarnessBudget`
- `RunPlan`
- `HarnessEvent`
- `SourceDocument`
- `KnowledgeGraph`

实现 `fallbackPlan(input)` 与 `validatePlan(candidate, input)`。本任务不调用模型，先让确定性规划器可独立工作。

**Step 4: 验证 GREEN**

Run: `node --test --experimental-strip-types src/lib/harness/planner.test.ts && npx tsc --noEmit`
Expected: PASS。

**Step 5: 提交**

```bash
git add src/lib/harness task_plan.md findings.md progress.md
git commit -m "feat: define constrained harness planner"
```

### Task 3: 建立 Source Adapter 与规范化层

**Objective:** 将用户自选资料、知乎搜索、全网搜索、知乎知识统一成同一种文档结构，并支持部分失败。

**Files:**
- Modify: `src/lib/zhihu.ts`
- Create: `src/lib/harness/sources.ts`
- Create: `src/lib/harness/sources.test.ts`

**Step 1: 写失败测试**

使用 fake fetch/adapter 覆盖：
- picked 资料不触发网络请求。
- 知乎搜索 Count 不超过 10。
- 全网搜索参数不超过官方限制。
- 知乎知识响应被规范化。
- 相同 URL/ContentID 去重。
- 单个 adapter 失败时返回错误记录并保留其他成功结果。
- 文档文本按预算裁剪，空内容被过滤。

**Step 2: 验证 RED**

Run: `node --test --experimental-strip-types src/lib/harness/sources.test.ts`
Expected: FAIL。

**Step 3: 实现适配器**

在 `src/lib/zhihu.ts` 增加经过仓库官方文档核对的：
- `globalSearch(query, count)`
- `zhihuKnowledge(...)`

在 `sources.ts` 实现 `SourceAdapter`、`collectSources`、`normalizeDocument`、`deduplicateDocuments`。所有 adapter 接受注入的 fetcher，便于测试；设置独立超时和错误边界。

**Step 4: 验证 GREEN**

Run: `node --test --experimental-strip-types src/lib/harness/sources.test.ts && npx tsc --noEmit && npm run lint`
Expected: PASS。

**Step 5: 提交**

```bash
git add src/lib/zhihu.ts src/lib/harness task_plan.md findings.md progress.md
git commit -m "feat: add multi-source harness adapters"
```

### Task 4: 实现 KnowledgeGraph Synthesizer 与引用校验

**Objective:** 把多源文档综合为统一 IR，并保证引用只能来自输入资料。

**Files:**
- Create: `src/lib/harness/synthesizer.ts`
- Create: `src/lib/harness/synthesizer.test.ts`
- Modify: `src/lib/engines.ts`

**Step 1: 写失败测试**

覆盖：
- 合法模型 JSON 转成 KnowledgeGraph。
- 未知 citation URL 被剔除。
- 节点缺少稳定 ID 时确定性补齐。
- 未知 edge 引用被剔除。
- 空节点/空标题返回明确错误。
- presentation 缺省时使用 RunPlan 值。

**Step 2: 验证 RED**

Run: `node --test --experimental-strip-types src/lib/harness/synthesizer.test.ts`
Expected: FAIL。

**Step 3: 实现 Synthesizer**

- 构造以资料为数据、忽略资料内指令的 Prompt。
- 通过现有 builtin/custom/zhida 引擎执行一次综合。
- 实现 `parseKnowledgeGraph`、`validateCitations`、`repairGraphStructure`。
- 限制节点、边、组和引用数量，防止上下文或场景失控。

**Step 4: 验证 GREEN**

Run: `node --test --experimental-strip-types src/lib/harness/synthesizer.test.ts && npx tsc --noEmit`
Expected: PASS。

**Step 5: 提交**

```bash
git add src/lib/engines.ts src/lib/harness task_plan.md findings.md progress.md
git commit -m "feat: synthesize cited knowledge graphs"
```

### Task 5: 实现 Harness Executor 与 SSE 事件链

**Objective:** 用有限步骤执行 Plan → Sources → Synthesis → Validation，并通过现有流式路由输出状态。

**Files:**
- Create: `src/lib/harness/executor.ts`
- Create: `src/lib/harness/executor.test.ts`
- Modify: `src/app/api/generate/stream/route.ts`

**Step 1: 写失败测试**

使用 fake planner/adapters/synthesizer 验证：
- 事件顺序为 planning → searching → sources → synthesizing → validating → graph。
- adapters 并行执行。
- 部分失败继续。
- 无有效资料时终止并返回 source 级错误。
- 补充查询最多一次。
- 模型调用次数不超过预算。
- 旧 `mode=viewpoint|roadmap` 请求仍可降级兼容。

**Step 2: 验证 RED**

Run: `node --test --experimental-strip-types src/lib/harness/executor.test.ts`
Expected: FAIL。

**Step 3: 实现 Executor**

实现 `runHarness(input, deps)` async generator。路由只负责请求校验、缓存 key、SSE 编码和消费 generator，不再内嵌完整业务链。

**Step 4: 验证 GREEN**

Run: `node --test --experimental-strip-types src/lib/harness/executor.test.ts && npx tsc --noEmit && npm run lint`
Expected: PASS。

**Step 5: API 烟测**

使用本地 `curl -N` 调用 `/api/generate/stream`，确认事件顺序、sources 数量和最终 graph；记录真实耗时与失败降级。

**Step 6: 提交**

```bash
git add src/lib/harness src/app/api/generate/stream/route.ts task_plan.md findings.md progress.md
git commit -m "feat: orchestrate generation with harness events"
```

### Task 6: 统一 IR 兼容层与前三种布局

**Objective:** 将 KnowledgeGraph 渲染为明显不同的 `debate-grid`、`radial-map`、`timeline` 场景，同时兼容旧缓存。

**Files:**
- Create: `src/lib/harness/compat.ts`
- Create: `src/lib/harness/layouts.ts`
- Create: `src/lib/harness/layouts.test.ts`
- Modify: `src/lib/excalidraw-layout.ts`
- Modify: `src/app/page.tsx`

**Step 1: 写失败测试**

覆盖：
- ViewpointGraph/RoadmapGraph 能转换为 KnowledgeGraph。
- 三种 layout 对同一 IR 产生结构不同的场景。
- 所有元素字段完整，可被 Excalidraw 接受。
- 大矩形无实质交叠。
- 文本宽度不超过模板上限。
- timeline 的边按时间顺序连接。

**Step 2: 验证 RED**

Run: `node --test --experimental-strip-types src/lib/harness/layouts.test.ts`
Expected: FAIL。

**Step 3: 实现布局注册表**

建立 `layoutRegistry`，复用现有 `block/card/curveArrow/finalize` 基础能力。页面渲染入口根据 `graph.presentation.layout` 分发；旧 graph 先经过 compat 转换。

**Step 4: 验证 GREEN**

Run: `node --test --experimental-strip-types src/lib/harness/layouts.test.ts && npx tsc --noEmit && npm run lint`
Expected: PASS。

**Step 5: 提交**

```bash
git add src/lib/harness src/lib/excalidraw-layout.ts src/app/page.tsx task_plan.md findings.md progress.md
git commit -m "feat: render adaptive knowledge graph layouts"
```

### Task 7: 扩展三种布局与参数化风格

**Objective:** 增加 `swimlane-roadmap`、`cluster-board`、`evidence-tree`，并让调色、密度、线条和层级真实影响场景。

**Files:**
- Modify: `src/lib/harness/layouts.ts`
- Modify: `src/lib/harness/layouts.test.ts`
- Create: `src/lib/harness/presentation.ts`
- Create: `src/lib/harness/presentation.test.ts`

**Step 1: 写失败测试**

覆盖：
- 6 个模板都可生成非空场景。
- palette/density/stroke/hierarchy 参数分别造成可观测差异。
- 同一输入的同一 presentation 输出结构确定。
- 所有模板通过碰撞和文本边界检查。

**Step 2: 验证 RED**

Run: `node --test --experimental-strip-types src/lib/harness/layouts.test.ts src/lib/harness/presentation.test.ts`
Expected: 新模板或参数断言失败。

**Step 3: 最小实现**

实现模板和 `resolvePresentation(plan, graph)`；禁止随机数影响布局，视觉变化来自受约束参数和内容结构。

**Step 4: 验证 GREEN**

Run: `node --test --experimental-strip-types src/lib/harness/layouts.test.ts src/lib/harness/presentation.test.ts && npx tsc --noEmit`
Expected: PASS。

**Step 5: 提交**

```bash
git add src/lib/harness task_plan.md findings.md progress.md
git commit -m "feat: diversify graph layouts and presentation"
```

### Task 8: 升级看山助手为跨图类型 IR Patch

**Objective:** 助手可以修改任意 KnowledgeGraph 的内容与呈现，不再只认识 viewpoints。

**Files:**
- Create: `src/lib/harness/patch.ts`
- Create: `src/lib/harness/patch.test.ts`
- Modify: `src/app/api/agent/route.ts`
- Modify: `src/components/AgentPanel.tsx`
- Modify: `src/app/page.tsx`
- Retain/Modify: `src/lib/graph-patch.ts`

**Step 1: 写失败测试**

覆盖：
- 更新/删除/新增节点。
- 调整组和强调级别。
- 切换 layout、palette、density、stroke。
- 引用不存在节点/来源时拒绝。
- reset 恢复消息前 IR。
- 旧 ViewpointGraph 请求仍由兼容层处理。

**Step 2: 验证 RED**

Run: `node --test --experimental-strip-types src/lib/harness/patch.test.ts`
Expected: FAIL。

**Step 3: 实现受限 Patch 协议**

Agent 路由识别 KnowledgeGraph 或旧 graph，模型返回受限 ops，服务端应用并验证后返回。前端 `onApply` 始终经 Layout → Validate → Render。

**Step 4: 验证 GREEN**

Run: `node --test --experimental-strip-types src/lib/harness/patch.test.ts && npx tsc --noEmit && npm run lint`
Expected: PASS。

**Step 5: 提交**

```bash
git add src/lib/harness src/lib/graph-patch.ts src/app/api/agent/route.ts src/components/AgentPanel.tsx src/app/page.tsx task_plan.md findings.md progress.md
git commit -m "feat: edit any graph through constrained agent patches"
```

### Task 9: 接入智能编排 UI 和混合来源展示

**Objective:** 默认智能编排，展示 Harness 阶段与混合来源，同时保持界面简洁。

**Files:**
- Modify: `src/app/page.tsx`
- Modify: `src/components/SourcesPanel.tsx`
- Modify: `src/components/AgentPanel.tsx`
- Create: `src/components/HarnessStatus.tsx`

**Step 1: 写失败的浏览器/组件断言**

断言：
- 默认模式是“智能编排”。
- 状态条显示规划、检索、综合、布局、验证阶段。
- 素材卡显示知乎/全网/知识/自选来源标签。
- 用户可勾选混合来源再次生成。
- 清空确认 modal 键盘 Escape/遮罩取消可用，确认按钮明确为危险操作。

**Step 2: 验证 RED**

运行浏览器脚本，Expected: 智能编排和混合来源 DOM 尚不存在。

**Step 3: 实现 UI**

- `Mode` 扩为 `auto|viewpoint|roadmap`，默认 `auto`。
- 消费新的 Harness SSE 事件。
- SourcesPanel 接收统一 SourceDocument 或兼容映射。
- 保持三栏设计，不新增重型设置页。

**Step 4: 验证 GREEN**

运行同一浏览器脚本并检查 page errors 为 0。

**Step 5: 提交**

```bash
git add src/app/page.tsx src/components task_plan.md findings.md progress.md
git commit -m "feat: expose smart harness generation workflow"
```

### Task 10: 全链路回归、生产部署和读回验证

**Objective:** 证明新 Harness 工作且旧能力不回归，并将确切版本上线。

**Files:**
- Modify: `task_plan.md`
- Modify: `findings.md`
- Modify: `progress.md`
- Modify tests/scripts only if verification exposes real defects

**Step 1: 完整本地验证**

Run:

```bash
node --test --experimental-strip-types src/lib/**/*.test.ts
npx tsc --noEmit
npm run lint
npm run build
git diff --check
```

Expected: 全部 PASS，无 ESLint 错误、TypeScript 错误或构建错误。

**Step 2: 本地 E2E**

覆盖：
- 观点争议问题生成 `debate-grid`。
- 学习问题生成 `swimlane-roadmap`。
- 时间问题生成 `timeline`。
- 至少一次全网或知乎知识补充。
- Agent 把布局切换为另一模板，场景内容真实改变。
- 清空取消与确认。
- 导出 PNG 下载且尺寸覆盖内容边界。

Expected: 全绿，page errors 为 0。

**Step 3: 更新 planning 文件**

记录每项真实命令、结果、外部额度或服务阻塞。只有所有验收通过后才将 Phase 10 标记 complete。

**Step 4: 最终提交与推送**

```bash
git add -A
git diff --cached --check
git commit -m "feat: ship multi-source graph harness"
git push origin main
git ls-remote --heads origin main
```

Expected: 远程 main SHA 与本地 HEAD 一致。

**Step 5: Vercel 生产部署**

Run: `npx vercel --prod --yes`
Expected: `readyState: READY` 且 alias 为 `https://kanshan-maps.vercel.app`。

**Step 6: 外部状态读回**

验证：
- `GET https://kanshan-maps.vercel.app/` → 200。
- 关键 Harness API 返回预期 SSE 事件或明确的额度错误，不返回 404/500。
- 浏览器打开生产站，默认智能编排、清空确认、无加载更多入口。
- `git status --short` 为空。

**Step 7: 交付报告**

报告 commit SHA、线上 URL、验证结果和任何真实外部限制，不声称未执行的能力通过。
