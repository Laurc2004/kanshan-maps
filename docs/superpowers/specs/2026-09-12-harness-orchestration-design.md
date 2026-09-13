# 一图看山 Harness 多源编排架构设计

日期：2026-09-12
状态：待用户复核

## 目标

把当前固定的“知乎搜索 → 单模型提炼 → 固定观点图/路线图”升级为可解释、可扩展的知识制图 Harness。用户只需要输入问题或选择资料，系统自动判断任务、选择数据源、组织证据、选择图结构与视觉风格，最终生成可编辑且有来源约束的 Excalidraw 图。

本轮同时修复两个确定问题：

1. 清空画布必须经过二次确认。
2. 移除无法可靠工作的“加载更多回答”能力；知乎搜索仍按官方单次最多 10 条返回。

## 设计原则

- 来源优先：每个观点、知识点或结论尽量绑定真实来源，模型不能伪造 URL。
- 编排透明：生成状态展示正在执行的阶段和使用的数据源，不把 Harness 做成不可解释的黑盒。
- 能力可插拔：新增数据源、图类型、布局或验证器时，不重写主流程。
- 有限预算：知乎搜索、热榜和直答均有额度；规划器必须限制调用次数并优先复用用户已选资料和缓存。
- 失败可降级：单个数据源失败不拖垮整条链；至少一个有效来源即可继续，全部失败才终止。
- 图形多样但确定：模型选择模板和参数，布局器负责无重叠、无裁切等硬约束；不让模型直接生成任意 Excalidraw 坐标。

## 方案选择

### 方案 A：单 Prompt 扩写

把所有来源内容拼到一个 Prompt，让模型同时决定结构和样式。实现最快，但难以控制额度、来源和错误，后续难以测试，不采用。

### 方案 B：规则编排器

用关键词规则选择来源和布局。稳定、便宜，但用户稍微换一种表达就容易选错，复杂任务扩展成本高，可作为降级路径。

### 方案 C：受约束的 Planner + 确定性执行器（采用）

模型只输出结构化计划；执行器校验计划、按预算调用工具；综合器输出统一中间表示；布局和验证由确定性代码完成。兼顾灵活度、可信度和可测试性。

## 总体架构

```text
用户问题 / 勾选资料 / 热榜入口
              |
              v
        Intent Planner
              |
              v
       Validated RunPlan
              |
              v
   Source Harness Executor
     |      |      |      |
 知乎搜索  全网搜索  知乎知识  已选资料/热榜
              |
              v
    Normalize + Deduplicate
              |
              v
       Zhida Synthesizer
              |
              v
     KnowledgeGraph IR
              |
       +------+------+
       |             |
 Layout Selector  Style Selector
       |             |
       +------+------+
              |
       Scene Validator
              |
              v
     Excalidraw Renderer
```

## 1. Intent Planner

输入：用户问题、当前模式、已选资料、当前画布摘要、引擎配置。

输出严格 JSON `RunPlan`：

- `intent`：`compare`、`roadmap`、`timeline`、`concept-map`、`argument-map`、`summary-board`
- `queries`：最多 3 个检索子问题
- `sources`：按优先级排列的数据源
- `synthesis`：需要提取的字段和证据要求
- `layout`：候选布局，不包含具体坐标
- `style`：视觉基调
- `budget`：各能力最大调用次数和最大资料量

执行前必须经过 schema 校验和预算裁剪。Planner 失败时使用规则降级：观点问题 → compare；学习类问题 → roadmap；含时间顺序 → timeline；其他 → concept-map。

## 2. Source Harness

统一接口：

```ts
interface SourceAdapter {
  id: SourceId;
  search(input: SourceQuery, context: RunContext): Promise<SourceDocument[]>;
}
```

第一阶段适配器：

- `picked`：用户勾选的知乎回答，优先级最高，不重复调用搜索。
- `zhihu-search`：知乎搜索，单次最多 10 条，不再伪装支持分页。
- `global-search`：全网搜索，补充知乎站外材料。
- `zhihu-knowledge`：黑客松知识内容，适合学习路线和知识图。
- `hot-list`：仅作为问题入口或趋势上下文，不作为事实证据主体。
- `zhida`：主要作为综合/直答能力，不与普通文档源混为一谈。

适配器统一输出 `SourceDocument`：`id/title/url/text/author/sourceType/score/publishedAt/metadata`。Normalize 层负责裁剪、去重、空内容过滤和 URL 白名单校验。

## 3. Harness Executor

Executor 按 `RunPlan` 运行有限步骤，而不是开放式无限 Agent 循环：

1. 收集用户已选资料。
2. 并行执行允许的搜索适配器。
3. 合并、去重、排序，控制总上下文量。
4. 若有效资料不足，最多触发一次补充查询。
5. 调用 Zhida/配置模型生成统一 KnowledgeGraph IR。
6. 选择布局和风格参数。
7. 验证 IR 与 Scene，失败时执行一次确定性修复；仍失败则返回明确错误。

每一步产生 `HarnessEvent`，复用 SSE 向前端展示：`planning`、`searching`、`sources`、`synthesizing`、`laying_out`、`validating`、`graph`、`error`。

## 4. 统一 KnowledgeGraph IR

不再让观点图和路线图拥有完全割裂的数据结构。使用统一外壳：

- `kind`：图类型
- `title`、`summary`
- `nodes[]`：节点内容、角色、层级、强调程度、来源引用
- `edges[]`：关系类型、起止节点
- `groups[]`：共识区、分歧区、阶段、主题簇
- `citations[]`：规范化来源
- `presentation`：布局模板、密度、调色板、字体尺度、连线风格

旧 `ViewpointGraph` 和 `RoadmapGraph` 通过转换器兼容，缓存恢复和 Agent 修改不用一次性推倒重写。

## 5. 布局与样式多样化

第一阶段提供 6 个确定性模板：

- `debate-grid`：多方观点对照
- `radial-map`：中心概念向外扩展
- `timeline`：事件或演进过程
- `swimlane-roadmap`：学习/行动路径
- `cluster-board`：主题聚类和知识卡片
- `evidence-tree`：结论、论据、来源层级

视觉风格不再只有固定配色，改为参数组合：

- Palette：知乎蓝、纸张柔彩、单色研究、醒目海报、自然笔记
- Density：compact / comfortable / spacious
- Stroke：clean / sketch / marker
- Hierarchy：标题、关键结论、普通证据的字号和线宽比例
- Accent：由主题或用户要求选择，而不是每次固定四张同色卡

模板选择由内容结构决定，具体坐标仍由确定性布局器计算。相同问题可以通过不同 intent/layout/style 得到结构明显不同但均无重叠的图。

## 6. 看山助手

助手从“只改 viewpoint 字段”升级为两类动作：

- 内容操作：增删节点、改标题、重写摘要、调整证据、移动分组。
- 呈现操作：切换布局模板、密度、配色、连线风格、强调层级。

助手输出对 KnowledgeGraph IR 的受限 Patch，不直接写 Excalidraw 元素。Patch 经 schema 和引用校验后，重新走 Layout → Validate → Render。路线图及其他图类型使用同一套协议，避免当前助手只认识 `viewpoints`。

## 7. UI 交互

- 清空按钮点击后打开产品内确认弹窗：说明会清除画布、当前素材和本地缓存；取消不改变任何状态。
- 移除素材栏的滚动触底、`hasMore` 状态和“继续加载更多回答”按钮。
- 输入区保留简洁模式选择，同时新增“智能编排”作为默认模式；高级来源选择放在可折叠区域，默认由 Planner 决定。
- 生成状态条展示 Harness 当前步骤和已采用的数据源，例如“正在检索知乎搜索 + 全网搜索”“正在验证 12 个节点”。
- 素材栏展示混合来源标签，并允许用户勾选后重新编排。

## 8. 错误处理与额度

- 每个 Adapter 独立超时和错误记录；部分成功时继续。
- RunPlan 设置硬预算：查询数、文档数、单文档字符数、模型调用次数。
- 搜索结果和综合结果按查询、来源组合、图类型与引擎缓存。
- 不在客户端、日志、图数据或计划文件中写入密钥。
- 外部内容视为数据，综合 Prompt 明确忽略其中的指令性文本。
- 全部来源失败时显示数据源级错误；验证失败时不返回看似成功但不可用的图。

## 9. 验证策略

- Planner：schema、预算裁剪、错误降级单测。
- Adapter：请求参数、响应规范化、超时和部分失败测试。
- Executor：使用 fake adapters 验证调用顺序、并行、去重、预算和补充查询上限。
- Synthesizer：引用必须来自输入文档，未知 URL 被剔除。
- Layout：每个模板做矩形碰撞、文本超宽、引用完整性测试。
- Agent Patch：跨图类型内容/呈现修改测试。
- UI：清空确认/取消、无加载更多入口、SSE 阶段显示。
- E2E：至少覆盖观点对照、路线图、全网补充和一次 Agent 换布局。
- 交付门：lint、typecheck、build、测试、`git diff --check`，再推送并部署；线上首页和关键 Harness API 返回正常。

## 10. 分阶段落地

1. UX 修复：清空确认弹窗，删除无效分页。
2. Harness 地基：类型、Planner schema、Adapter 接口、Executor、事件协议。
3. 多源接入：知乎搜索、全网搜索、知乎知识、已有资料。
4. IR 与模板：统一 KnowledgeGraph，先落地 3 个模板，再扩展到 6 个。
5. Agent 升级：统一 Patch 协议和呈现操作。
6. UI 与 E2E：智能编排状态、混合来源、关键全链路。

为了控制黑客松截止前风险，每个阶段都保持现有生成链可用；Harness 新链通过 feature flag/路由切换接入，验证通过后再设为默认。

## 已知限制

- 用户给出的飞书文档目前无法直接读取：抓取返回 403，本地 Chrome 登录资料也不可用。本设计基于仓库内知乎官方 Skill 文档和用户明确列出的能力，不声称复述飞书文档内容。
- 知乎搜索官方文档仅明确 `Count <= 10`，未承诺分页；本轮移除分页，避免制造不可用交互。
- 直答和热榜均有每日额度，Harness 必须有缓存和预算，不能以无限自主循环实现。
