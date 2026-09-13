# 一图看山技术实施方案：双模式 Harness、知乎个性化与看山助手 2.0

日期：2026-09-13
状态：技术实施方案，尚未实施
关联产品方案：`docs/2026-09-13-product-decision-and-agent-improvement-plan.md`

## 0. 目标与实施原则

本方案将产品收敛为两个用户入口：

- `观点对照`：从知乎回答中提取可引用的观点、前提、证据和分歧。
- `学习路线`：结合知乎内容和用户目标，产出阶段、任务、原文和验证方式。

Harness 继续作为底层架构，但不再把“智能编排”作为用户可选模式。用户看到的是稳定的两种能力，内部仍然复用来源适配、统一 IR、引用白名单、确定性布局和 SSE。

实施原则：

1. 模型负责理解和生成短内容，程序负责安全、引用、ID、布局和提交。
2. 先减少模型承担的任务，再考虑更换模型。
3. 不为了结构完整而凑节点；没有证据就不生成事实性节点。
4. 破坏性操作必须预览确认。
5. 普通文字修改不能破坏用户手动排版。
6. 每个阶段都有可独立验证的测试和回滚点。

## 1. 当前代码基线与关键问题

### 1.1 生成链

当前主要链路是：

```text
POST /api/generate/stream
  -> resolveGenerationPath(mode)
  -> runHarness
  -> planner
  -> sources
  -> synthesizeSkeleton
  -> graph-skeleton SSE
  -> synthesizeDetails
  -> graph-detail SSE
  -> validate/layout
  -> graph SSE
  -> page.tsx 渲染 Excalidraw
```

关键文件：

- `src/app/api/generate/stream/route.ts`
- `src/lib/harness/executor.ts`
- `src/lib/harness/planner.ts`
- `src/lib/harness/sources.ts`
- `src/lib/harness/synthesizer.ts`
- `src/lib/harness/layouts.ts`
- `src/lib/harness/compat.ts`
- `src/app/page.tsx`

当前已有优点：

- 有统一 `KnowledgeGraph` IR。
- 有来源标准化和 citation 白名单。
- 有确定性布局和碰撞测试。
- 有骨架、详情、最终图的 SSE 事件。
- 已修复内部 citation id 直接作为画布链接的问题。

当前限制：

- `auto` 仍然承担过多通用编排职责。
- 骨架和详情是两个串行模型调用，完整结果仍然慢。
- `synthesize.ts` 中 `GRAPH_LIMITS.nodes` 为安全上限 80，目标范围是 6-12；应将“安全上限”和“展示目标”明确分离。
- 助手存在 legacy viewpoint 与 KnowledgeGraph 两套协议。
- 助手模型可以直接产出过宽的 `Partial<KnowledgeNode>` patch。
- patch 当前允许逐条部分成功，没有结构操作的原子提交。
- 页面状态同时维护 graph、graphRef、historyRef 和画布实例，缺少版本冲突保护。

## 2. 最终目标架构

```text
用户入口
  ├─ 观点对照
  └─ 学习路线
       |
       v
  Intent-specific Planner
       |
       v
  Source Pipeline
  - picked / zhihu-search / user-personal
  - normalize
  - dedupe
  - relevance filter
  - budget
       |
       v
  Intent-specific Synthesizer
  - compare synthesizer
  - roadmap synthesizer
       |
       v
  Shared KnowledgeGraph IR
       |
       v
  Deterministic Validator
  - schema
  - citation coverage
  - orphan references
  - content quality
  - node count
       |
       v
  Intent-specific Layout Resolver
       |
       v
  SSE + Excalidraw renderer
```

助手单独走另一条链：

```text
用户消息
  -> Intent Router
  -> Task Parser
  -> Context Builder
  -> Candidate Change Generator
  -> Deterministic Validator
  -> Risk Classifier
  -> apply / preview / answer / clarify
  -> version check
  -> atomic commit
  -> local render or full render
```

## 3. 第一阶段：收缩生成入口

### 3.1 类型修改

建议在 `src/app/page.tsx` 中将用户模式从：

```ts
type Mode = "auto" | "viewpoint" | "roadmap";
```

改为：

```ts
type UserMode = "compare" | "roadmap";
```

内部兼容层可以继续接受旧值，但不能在 UI 暴露 `auto`：

```ts
export function normalizeUserMode(value: unknown): "compare" | "roadmap" {
  if (value === "roadmap") return "roadmap";
  return "compare";
}
```

API 兼容策略：

- `mode=compare`：新观点对照 Harness。
- `mode=roadmap`：新学习路线 Harness。
- `mode=viewpoint`：暂时映射到 `compare`，仅兼容旧缓存和旧调用。
- `mode=auto`：不再作为用户模式；旧请求可映射到 `compare`，避免破坏已有链接。

### 3.2 Planner 规则

在 `src/lib/harness/planner.ts` 中取消通用 `auto` 规划，改为两个确定性 Planner：

```ts
export function buildComparePlan(input: PlanInput): RunPlan;
export function buildRoadmapPlan(input: PlanInput): RunPlan;
```

观点对照默认计划：

```ts
{
  intent: "compare",
  sources: ["picked" 或 "zhihu-search"],
  layout: "debate-grid" 或 "cluster-board",
  budget: {
    queryCount: 2,
    docs: 8,
    charsPerDoc: 2600,
    modelCalls: 1,
    millis: 60000
  }
}
```

学习路线默认计划：

```ts
{
  intent: "roadmap",
  sources: ["user-personal", "picked" 或 "zhihu-search", "zhihu-knowledge"],
  layout: "swimlane-roadmap",
  budget: {
    queryCount: 3,
    docs: 8,
    charsPerDoc: 2200,
    modelCalls: 1,
    millis: 60000
  }
}
```

`user-personal` 需要新增到 `SourceId`。如果用户未登录或没有授权数据，Planner 不应失败，而是将来源降级为 `picked` 或 `zhihu-search`，并在事件中标记：

```ts
{ personalized: false, fallbackReason: "not_authenticated" }
```

### 3.3 生成请求体

把 `/api/generate/stream` 请求体明确化：

```ts
type GenerateRequest = {
  question: string;
  mode: "compare" | "roadmap";
  goal?: string;
  userState?: {
    masteredNodeIds?: string[];
    skippedNodeIds?: string[];
    deepDiveNodeIds?: string[];
  };
  items?: SearchResultItem[];
  engine?: EngineRequest;
};
```

不要把所有个性化数据从前端传入。用户身份应从服务端 session 读取，前端只传当前页面的选择和目标。

### 3.4 缓存键

缓存键至少包含：

```text
mode + question + source fingerprint + user state fingerprint + engine
```

公共缓存和个人缓存必须分开：

- 公共搜索生成：可按问题和来源指纹缓存。
- 个人收藏/关注流生成：必须带用户 session subject 或匿名私有 key，不能进入公共缓存。

不要把 OAuth token 放进缓存键、日志或客户端。

## 4. 第二阶段：重做来源预处理

### 4.1 SourceDocument 扩展

扩展 `SourceDocument.metadata`，但不要把个人敏感信息直接放入图节点：

```ts
metadata: {
  contentId?: string;
  authorId?: string;
  authorName?: string;
  followerMatch?: boolean;
  personalCollectionId?: string;
  personalCollectionTitle?: string;
  sourceRank?: number;
  relevanceReason?: string;
}
```

图中只保留展示需要的信息。个人收藏夹名称可以作为用户当前任务的上下文，但不要让模型把它当成事实证据。

### 4.2 去重

按以下优先级生成 canonical key：

1. 知乎 `ContentID`。
2. 规范化 URL。
3. 标题加作者的 hash。

同一内容在搜索、收藏夹、关注流中重复出现时只进入模型一次，但保留来源标签：

```ts
metadata: { sourceMembership: ["zhihu-search", "personal-favorite"] }
```

### 4.3 相关性过滤

第一版不用再增加一个模型调用。使用确定性评分：

- 标题包含问题关键词：加分。
- 正文长度达到最低阈值：加分。
- 有明确判断词和因果词：加分。
- 纯广告、纯转发、纯情绪：减分。
- 与其他文档高度相似：减分。

保留评分前 8 篇，但必须保留至少 1 个不同作者或不同立场的来源，避免搜索结果同质化。

### 4.4 输入压缩

不要直接把每篇全文传给模型。为每篇文档构建：

```ts
type ModelSourceExcerpt = {
  citationId: string;
  title: string;
  author: string;
  url: string;
  excerpt: string;
  sourceType: SourceId;
};
```

`excerpt` 只保留：

- 标题
- 开头结论段
- 包含判断、条件、数字、因果关系的段落
- 结尾总结段

如果截断，必须在内部标记 `truncated: true`，Prompt 禁止模型把截断内容当成全文结论。

## 5. 第三阶段：观点对照实现

### 5.1 输入契约

新增：

```ts
type CompareSynthesisInput = {
  question: string;
  documents: ModelSourceExcerpt[];
  followedAuthorIds?: string[];
};
```

模型只负责输出：

- 标题
- 一句话总结
- 分组
- 节点 label/description
- 必须引用的 citation id
- 必要边

模型不能输出：

- Excalidraw 坐标
- 真实 URL
- 不在输入中的 citation
- 用户个人事实

### 5.2 观点 Prompt 规则

System Prompt 应固定包含：

```text
你正在生成知乎观点对照图。
只允许使用输入资料中的事实。
每个事实性节点至少引用一个 citationId。
不要为了填满画布生成“其他观点”“补充说明”“总结”等空泛节点。
不要强行构造正反两方。
如果观点真正对立，使用两个或多个阵营；如果是条件不同，按前提条件分组；如果高度一致，生成共识与少数异议。
每个节点 description 不超过 60 个中文字符。
最多 12 个节点，少于 6 个也可以，只要信息真实。
边只表示支持、反驳、条件限制或因果关系，最多 1 条出边和 1 条入边。
```

### 5.3 结果校验

在 `parseKnowledgeGraph` 后增加 `validateCompareGraph`：

- 节点有非空 label 和 description。
- 每个事实节点至少有一个合法 citation。
- citation 必须来自输入白名单。
- 分组 nodeIds 与节点 group 双向一致。
- edge 两端节点存在。
- 不允许 self-loop。
- 节点最多 12 个展示节点。
- 空泛 label 黑名单：`其他`、`补充`、`总结`、`相关观点` 等。
- 同组节点的 label 相似度过高时保留信息量更高者。

校验失败时，优先程序裁剪和修复；只有结构无法修复时才触发一次短修复调用。

## 6. 第四阶段：学习路线实现

### 6.1 Roadmap IR

当前如果继续复用 `KnowledgeGraph`，建议新增稳定 metadata：

```ts
metadata: {
  roadmapStage?: number;
  taskType?: "read" | "practice" | "reflect" | "build";
  prerequisiteNodeIds?: string[];
  validationTask?: string;
  masteryState?: "unknown" | "mastered" | "skipped" | "deep-dive";
}
```

不要把这些字段塞进 description，避免模型和渲染器无法区分任务与说明。

### 6.2 学习路线输入

```ts
type RoadmapSynthesisInput = {
  topic: string;
  goal: string;
  documents: ModelSourceExcerpt[];
  personalContext?: {
    savedCount: number;
    masteredNodeIds: string[];
    skippedNodeIds: string[];
  };
};
```

个人 context 只表达用户选择，不允许模型从收藏行为自动推断掌握程度。

### 6.3 路线 Prompt 规则

每个阶段必须输出：

- 阶段标题
- 当前阶段要解决的问题
- 1-3 个知识节点
- 至少一个知乎来源，若没有则明确标记缺来源
- 一个可执行任务
- 一个完成判定
- 前置阶段 ID

路线不要求固定 3/4/5 阶段。根据内容和目标生成 2-6 个阶段，空内容不得凑阶段。

### 6.4 路线校验

- 阶段序号连续。
- 不允许循环依赖。
- 每个非起始阶段的 prerequisite 必须存在。
- 每个阶段有 validationTask。
- 每个有事实描述的节点至少有 citation。
- 用户标记为 mastered 的节点默认不删除，只显示为已掌握或折叠。
- skipped 节点不能作为唯一前置依赖。

## 7. 第五阶段：模型调用优化

### 7.1 不立即更换 DeepSeek V4 Flash

先建立一个离线评测集：

- 10 个真实观点问题。
- 5 个学习路线目标。
- 每个问题保留真实知乎来源快照或脱敏 fixture。
- 固定 Prompt、输入顺序和输出预算。

每个模型记录：

- 首 token 时间。
- 完整响应时间。
- JSON 解析成功率。
- citation 覆盖率。
- 无意义节点数。
- 人工评分：事实、结构、可读性、行动性。

候选包括：

- 当前 DeepSeek V4 Flash。
- 知乎 `zhida-fast-1p5`。
- 可用的更强模型，仅用于困难样本对照。

### 7.2 调用策略

默认：

```text
预处理 -> 一次完整短输出 -> 程序校验 -> 成功即结束
```

失败：

```text
程序修复 -> 仍失败才短修复调用 -> 仍失败返回可理解错误
```

不要默认执行：

```text
规划模型 -> 检索模型 -> 骨架模型 -> 详情模型 -> 审查模型
```

这会让黑客松现场体验不可控。

### 7.3 真流式的边界

如果底层模型可以稳定输出 NDJSON 或结构化增量，可以使用：

```text
node_start
node_complete
edge_complete
synthesis_done
```

只有收到 `node_complete` 并通过 citation 校验后，才在画布增加节点。

如果模型只提供普通文本流，不要尝试解析半截 JSON。继续使用阶段 SSE，并在 UI 中显示真实阶段状态。

## 8. 第六阶段：看山助手 2.0

### 8.1 统一协议

保留旧协议作为内部兼容层，但新助手只使用统一 `AgentDecision`：

```ts
type AgentDecision =
  | {
      type: "apply";
      reply: string;
      changes: GraphChange[];
      risk: "low" | "medium";
    }
  | {
      type: "preview";
      reply: string;
      changes: GraphChange[];
      risk: "high";
      confirmation: string;
    }
  | { type: "answer"; reply: string }
  | { type: "clarify"; reply: string; questions: string[] };
```

### 8.2 语义化 GraphChange

新增文件建议：

`src/lib/agent/types.ts`

```ts
type GraphChange =
  | { type: "rename_graph"; title: string }
  | { type: "rename_node"; nodeId: string; label: string }
  | { type: "rewrite_node_description"; nodeId: string; description: string }
  | { type: "emphasize_node"; nodeId: string; level: Emphasis }
  | { type: "move_node"; nodeId: string; groupId: string | null }
  | { type: "remove_nodes"; nodeIds: string[]; reasons: string[] }
  | { type: "merge_nodes"; nodeIds: string[]; targetLabel: string; description: string }
  | { type: "rewrite_consensus"; items: string[] }
  | { type: "set_presentation"; patch: Partial<PresentationSpec> }
  | { type: "relayout"; scope: "local" | "all" };
```

模型不再直接输出任意 `Partial<KnowledgeNode>`。服务端把 `GraphChange` 转换为内部 patch。

### 8.3 Intent Router

新增：

`src/lib/agent/router.ts`

第一版使用规则加模型兜底：

- 标题、名字、改名：`rename_graph` 或 `rename_node`。
- 颜色、风格、好看、手绘：`set_presentation`。
- 重点、突出、高亮：`emphasize_node`。
- 精简、改短、改写：`rewrite_node_description` 或 `rewrite_consensus`。
- 删除、保留、弱、重复、合并：`preview`。
- 为什么、怎么看、核心分歧：`answer`。
- 代词不明确，如“它”“这个”：`clarify`。

规则无法确定时才调用模型分类，分类模型只输出：

```json
{"type":"answer|apply|preview|clarify","targetIds":["..."],"reason":"..."}
```

### 8.4 上下文构造

当前不应每次发送完整 graph 原文。默认构造：

```ts
type AgentContext = {
  graphVersion: string;
  title: string;
  summary: string;
  nodes: Array<{
    id: string;
    label: string;
    group?: string;
    description: string;
    emphasis?: string;
  }>;
  groups: Array<{ id: string; label: string; nodeIds: string[] }>;
  recentChanges: string[];
  selectedNodeIds?: string[];
};
```

仅当请求涉及重写内容时，为目标节点追加 citation title 和原文 excerpt。

### 8.5 风险策略

低风险直接执行：

- 改标题。
- 改颜色。
- 强调单个明确节点。
- 精简单个明确节点。

中风险先展示摘要：

- 批量改写。
- 移动分组。
- 局部重排。

高风险必须确认：

- 删除节点。
- 合并节点。
- 删除共识。
- 批量重写路线。

### 8.6 原子执行

在 `src/lib/agent/apply.ts` 中实现：

```ts
function validateChanges(graph: KnowledgeGraph, changes: GraphChange[]): ValidationResult;
function applyChangesAtomically(graph: KnowledgeGraph, changes: GraphChange[]): ApplyResult;
function classifyRisk(changes: GraphChange[]): Risk;
```

执行步骤：

1. clone 当前 graph。
2. 校验所有 nodeId、groupId、citation 和字段长度。
3. 在 clone 上依次应用。
4. 校验最终 graph 的 group、edge、citation 完整性。
5. 所有校验通过才返回新 graph。
6. 任何一步失败都返回原 graph，不允许半提交。

旧 `applyKnowledgeGraphOps` 可以保留给兼容测试，但新路由不直接调用。

### 8.7 `answer` 和 `clarify`

助手返回 `answer` 时：

- `graph` 不变。
- `changed=false`。
- 前端只追加助手消息。

助手返回 `clarify` 时：

- 不修改 graph。
- 显示最多两个具体问题。
- 例如“你说的‘第一个观点’是指左侧的‘考研优先’，还是按来源列表的第一篇？”

### 8.8 预览确认

API 拆成两个阶段：

```text
POST /api/agent/plan
  -> 返回 decision preview + baseGraphHash

POST /api/agent/commit
  -> 校验 confirm token + baseGraphHash
  -> 原子提交
```

确认 token 不需要包含敏感数据，只需服务端短期保存或签名：

```ts
{ planId, subject, baseGraphHash, expiresAt, changesHash }
```

commit 时必须重新校验当前 graph hash，防止用户在预览后手动修改导致旧计划覆盖新图。

### 8.9 版本冲突

页面维护：

```ts
type GraphEnvelope = {
  graph: GraphState;
  version: number;
  hash: string;
  source: "generated" | "agent" | "canvas";
};
```

每次：

- Agent 请求带 `baseHash`。
- 画布手动修改后递增 version。
- 服务端返回 `409 graph_changed` 时不覆盖当前图。
- UI 提示“画布刚刚发生变化，请基于最新版本再试一次”。

## 9. 第七阶段：画布局部重渲染

当前布局器需要区分三类变化：

```ts
type RenderScope =
  | { type: "text"; nodeIds: string[] }
  | { type: "style"; nodeIds?: string[] }
  | { type: "local-layout"; nodeIds: string[]; groupId?: string }
  | { type: "full-layout" };
```

处理规则：

- `rename_graph`：只更新标题元素。
- `rewrite_node_description`：只更新对应卡片文本，保留坐标。
- `set_emphasis`：只更新样式。
- `move_node`：重排目标分组，其他分组坐标保持。
- `remove_nodes`／`merge_nodes`：受影响分组局部重排。
- 明确 `relayout all`：才执行全图布局。

为画布元素增加稳定映射：

```ts
metadata: {
  graphNodeId: node.id;
  renderVersion: graphVersion;
}
```

不要通过元素数组位置推断节点对应关系。

## 10. 第八阶段：知乎 OAuth 个性化技术实现

### 10.1 数据适配层

新增：

- `src/lib/personal/favorites.ts`
- `src/lib/personal/following.ts`
- `src/lib/personal/profile.ts`
- `src/app/api/me/favorites/route.ts`
- `src/app/api/me/profile-context/route.ts`

服务端从 session 获取 OAuth token，调用知乎接口后只返回前端必要字段。token 不进入 React state、localStorage、缓存或日志。

### 10.2 收藏夹路线

流程：

```text
登录
  -> 获取收藏夹列表
  -> 用户选择收藏夹
  -> 获取收藏内容
  -> normalize SourceDocument
  -> 用户输入学习目标
  -> roadmap Harness
  -> 返回个人路线
```

API 设计：

```text
GET /api/me/favlists
GET /api/me/favlists/:token/contents
POST /api/generate/stream { mode: "roadmap", collectionToken, goal }
```

个人数据请求需要：

- session subject 校验。
- 短 TTL 缓存，key 包含 subject。
- token 过期返回重新授权，不回退到应用自身账号。
- 空收藏夹是正常状态，返回可选的搜索降级。

### 10.3 关注答主

来源文档标准化时加入：

```ts
metadata: { followedAuthor: true }
```

只允许服务器根据真实 followees 列表计算该字段。模型可以利用这个字段进行分组或说明，但不能把关注关系写成观点事实。

### 10.4 个人状态

第一版不需要数据库也可以使用 session 绑定的短期存储；如果需要跨设备持久化，再增加 `maps`、`learning_states` 表。

建议记录：

```ts
learning_states {
  subject_hash,
  graph_id,
  node_id,
  state: mastered | skipped | deep-dive,
  updated_at
}
```

不要存 OAuth token 到业务表。`subject_hash` 使用不可逆 hash 或内部用户 ID。

## 11. API 与错误设计

统一错误结构：

```ts
type ApiError = {
  code:
    | "invalid_request"
    | "not_authenticated"
    | "oauth_expired"
    | "quota_exhausted"
    | "model_timeout"
    | "invalid_model_output"
    | "graph_changed"
    | "confirmation_required";
  message: string;
  retryable: boolean;
  stage?: string;
};
```

不把底层模型原始错误直接展示给用户。服务端日志可以记录 request id、stage、耗时和错误类型，但不能记录 token、完整 prompt 或个人收藏内容。

## 12. 测试计划

### 12.1 单元测试

新增或扩展：

- `planner.compare.test.ts`
- `planner.roadmap.test.ts`
- `sources.dedupe.test.ts`
- `synthesizer.compare.test.ts`
- `synthesizer.roadmap.test.ts`
- `agent.router.test.ts`
- `agent.apply.test.ts`
- `agent.risk.test.ts`
- `agent.version.test.ts`

必须覆盖：

- 空来源。
- 重复来源。
- 未知 citation。
- 未知 node/group ID。
- 结构操作任一步失败时整组不提交。
- answer 不改变 graph。
- clarify 不改变 graph。
- 删除操作生成 preview。
- graph hash 冲突返回 409。
- 关注关系只来自服务端数据。

### 12.2 Harness 集成测试

使用固定 fixture，不依赖真实模型：

- 观点高度一致。
- 明确正反观点。
- 条件不同而非正反。
- 只有两篇低质量来源。
- 收藏内容与搜索内容重复。
- 用户已掌握第一阶段。
- 用户跳过中间阶段。

断言：

- 所有节点引用合法。
- 不出现空泛凑数节点。
- 路线无循环。
- 边无孤儿。
- 个人来源不会进入公共缓存。

### 12.3 API 测试

验证：

- 未登录访问个人接口返回 401。
- OAuth 过期返回明确错误。
- 不同用户缓存隔离。
- agent plan/commit 的 hash 冲突。
- preview 过期不能 commit。
- 原始 token 不出现在响应和日志。

### 12.4 浏览器 E2E

至少覆盖：

1. 未登录生成观点对照。
2. 未登录生成学习路线。
3. 登录后选择收藏夹并生成路线。
4. 关注答主高亮。
5. 助手改标题，节点坐标不变。
6. 助手删除节点，出现确认预览。
7. 助手回答问题，画布不变。
8. 用户手动移动节点后，助手改文字不重排整图。
9. 连续两次请求，旧响应不覆盖新图。
10. 引用链接点击打开真实知乎 URL。

## 13. 分阶段执行顺序

### Phase A：先做稳定性，预计最优先

1. 隐藏 `auto` 用户入口。
2. 将 compare/roadmap 计划拆开。
3. 收紧节点目标和来源预处理。
4. 增加双模式 fixture 和回归测试。
5. 确保旧 URL 和旧缓存兼容。

验收：两种模式各能稳定生成，测试和现有 lint/build 全绿。

### Phase B：先做助手高收益能力

1. 新增 `AgentDecision` 和 `GraphChange` 类型。
2. 实现 router：规则优先，模型兜底。
3. 实现 answer/clarify。
4. 实现原子 apply 和风险分类。
5. 删除/合并操作改为 preview。
6. 旧 patch 协议通过兼容层继续可用。

验收：低风险修改可靠；高风险修改不会未经确认；answer 不改变图。

### Phase C：修复画布体验

1. 加 graph hash/version。
2. 让文字和样式修改走局部更新。
3. 保存用户坐标。
4. 只对结构修改执行局部布局。
5. 增加手动编辑后 Agent 修改的 E2E。

验收：改标题和改描述不移动无关节点。

### Phase D：做知乎个性化主亮点

1. 验证收藏夹和收藏内容 API 的实际响应。
2. 做收藏夹列表和内容接口。
3. 将收藏内容适配为 SourceDocument。
4. 加学习目标输入。
5. 输出个人路线并返回知乎原文。
6. 加关注答主过滤。

验收：不同用户看到的来源和路线确实不同；无 token 泄露；数据失败有降级入口。

### Phase E：模型评测和最终打磨

1. 固定真实问题评测集。
2. 对比 Flash 与知乎直答快速模型。
3. 统计延迟、失败、引用覆盖和人工质量。
4. 只在有证据时替换默认模型。
5. 录制演示并执行提交清单。

## 14. 不建议现在做的事情

- 不要先把 DeepSeek 换掉再看效果。
- 不要继续增加更多图类型。
- 不要让模型直接输出 Excalidraw 坐标。
- 不要把完整知乎文章全部塞入每次助手请求。
- 不要把删除、合并默认设为直接执行。
- 不要从收藏行为自动推断“已掌握”。
- 不要用一个通用 Prompt 同时覆盖观点对照、学习路线和任意图编排。

## 15. 最终黑客松版本

如果时间不足，最终版本只交付下面的闭环：

```text
知乎登录
  -> 选择收藏夹或输入问题
  -> 观点对照 / 学习路线二选一
  -> 真实知乎来源和可点击引用
  -> 关注答主个性化高亮
  -> 看山助手安全修改
  -> 删除类操作先预览确认
  -> 导出或分享
```

这是比“支持很多图类型和一个不稳定的智能编排”更容易现场跑通、解释清楚和获得评委记忆点的技术路线。
