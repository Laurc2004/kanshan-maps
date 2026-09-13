<div align="center">

# 一图看山 · Kanshan Maps

**把一个问题下的多元回答，炼成一张可编辑、可追溯、可对话修改的手绘知识地图。**

[在线体验](https://kanshan.space) · [知乎黑客松 2026 · 校园新锐季](https://www.zhihu.com/hackathon) · 📚 知识炼金场赛道

</div>

---

## 一句话介绍

在知乎，一个有价值的问题下往往躺着几十个立场各异的回答。读透它们要花一小时，记住它们要花一周。**一图看山**把这个问题下的回答一键炼成一张手绘风格的「观点对照图」或「学习路线图」——共识与分歧一目了然，每个节点都能跳回原始回答，你还可以继续和 AI 对话修改这张图。

它不是又一个「文章转思维导图」工具：

| | 通用思维导图工具 | 一图看山 |
|---|---|---|
| 输入 | 单篇文章 | 一个问题下的 **N 个对立回答** |
| 核心 | 层级罗列 | 共识区 / 分歧区 / 阵营对照的结构化表达 |
| 可信度 | 模型自由发挥 | 每个节点强制绑定真实引用，校验不过不上图 |
| 交互 | 重新生成 | **对话式改图**：原子操作、实时预览、可回执 |
| 生态 | 无 | 知乎 OAuth / 热榜 / 搜索 / 关注流 / 收藏夹深度打通 |

## 核心能力

- 🔭 **观点对照图** — 输入问题，自动检索知乎回答，提取各方论点、证据与立场，生成共识区 + 分歧阵营的对照图。你关注的答主会被自动高亮。
- 🗺 **学习路线图** — 领域关键词 → 入门 / 进阶 / 避坑的泳道路径图，可以直接从你的知乎收藏夹生成。
- 📝 **文章摘要思维导图** — 粘贴知乎回答 / 文章链接，秒出中心主题 + 左右分支的摘要图。
- 🤖 **看山助手（对话改图）** — Agent 2.0：语义化 GraphChange 协议 + 风险分级 + 原子提交 + 预览确认。说「精简共识区」「换成手绘风」，画板实时更新并给出逐条操作回执。
- 🎨 **完全可编辑** — 画布基于 [Excalidraw](https://excalidraw.com/)，生成后可以自由拖改、换布局、切换视觉风格、导出高清 PNG。
- 👤 **我的看山** — 登录后集中管理生成的地图、收藏夹与关注内容。

## 与评审维度的对照

> 初审：AI 场景价值 40% · 创新度 25% · 完成度 25% · 产品体验与设计感 10%

**AI 场景价值（40%）** — 「一个问题、N 个立场」的可视化是只有知乎这类多元观点社区才成立的需求，不属于任何通用场景的平移。全链路生长在知乎开放生态上：OAuth 登录、搜索、热榜、关注流、收藏夹均走官方 API，每个观点节点可回溯到原回答。

**创新度（25%）** — 区别于红海的「文章转导图」，本项目做了三件不常见的事：① 多源观点对照与阵营化表达；② 图不是终点——Agent 以受约束的语义操作协议（而非自由文本）连续修改图表；③ 生成链路是可解释的 Harness 编排，每个阶段对用户可见（见下文架构）。

**完成度（25%）** — 生产环境已上线并完成真实 OAuth 闭环验证，152 项测试（146 通过 / 0 失败 / 6 OAuth 场景跳过）、TypeScript 零错误、ESLint 零错误、16 条路由全量构建通过。

**产品体验与设计感（10%）** — 三栏工作台（知乎上下文 / 画板 / AI 助手），知乎蓝 × 纸感米白视觉体系，SSE 流式出图（骨架先行、细节渐入），手绘风格画布 + 思维导图 / 对照表 / 泳道多种版式一键切换。

## 技术架构：Knowledge-Map Harness

生成链路没有采用「一个 Prompt 解决一切」，而是实现了一套受约束的多源编排引擎（**Harness**）：模型只负责规划与综合，**坐标、布局与校验全部由确定性代码完成**——模型不能伪造坐标，也不能伪造来源。

```text
问题输入 / 勾选回答 / 热榜入口 / 知乎链接
                │
                ▼
        ┌───────────────┐
        │ Intent Planner │  ← LLM 输出严格 JSON RunPlan（intent/queries/sources/budget/layout/style）
        └───────┬───────┘     schema 校验失败 → 规则降级
                ▼
       Validated RunPlan
                ▼
   ┌───────────────────────────┐
   │   Source Harness Executor  │  ← 有限步骤执行，预算硬约束，单源失败可降级
   │  zhihu-search │ global-search │ zhihu-knowledge │ picked │ hot-list
   └───────┬───────────────────┘
           ▼
   Normalize · Dedup · Relevance Filter · 转载去重
           ▼
   ┌───────────────────────────┐
   │  Two-phase Synthesizer     │  ← 阶段一：骨架（SSE 先行渲染）
   │  (统一 KnowledgeGraph IR)  │    阶段二：细节（渐进补齐）
   └───────┬───────────────────┘
           ▼
  Layout Selector ─┬─ Style Selector   ← 6 种确定性布局模板 + 参数化风格
           ▼       │    （知乎蓝 / 柔彩 / 单色研究 / 醒目海报 / 自然笔记）
      Scene Validator               ← 引用覆盖率 / 节点质量 / 无重叠 / 无裁切硬校验
           ▼
   Excalidraw Renderer（可编辑画布）
```

几个值得一提的工程设计：

- **模型不画图** — LLM 只产出统一 KnowledgeGraph IR（节点 / 边 / 分组 / 引用），坐标由确定性布局器计算。同类问题可得到结构迥异但均无重叠的图，彻底规避「模型生成坐标 = 抽奖」。
- **引用即契约** — 每个节点必须携带至少一条真实 citation，`Scene Validator` 校验引用覆盖率，不达标节点直接裁剪。卡片链接指向真实知乎 URL，模型无法编造来源。
- **两阶段流式综合** — 骨架（标题 / 分组 / 节点短语）先到先渲染，细节（观点描述）渐进补齐。单阶段模型输出从 ~4K token 降到 ~1.5K，首屏可视时间减半。
- **Agent 2.0 改图协议** — 语义化 GraphChange（add / merge / emphasize / set_style / relayout…）替代自由文本 patch；风险分级 + 原子提交 + 预览确认；结构变更触发受控重排，纯文字修改保留用户坐标（局部重渲染）。
- **预算与降级** — 知乎搜索 / 热榜 / 直答额度有限，Planner 强制预算裁剪；单数据源失败不拖垮整链，规则编排器作为 LLM 规划失败的兜底。
- **编排透明** — 每个阶段产生 HarnessEvent，经 SSE 实时展示当前正在「规划 → 检索 → 综合 → 布局 → 验证」的哪一步，不是黑盒转圈。

详细设计见 [`docs/superpowers/specs/2026-09-12-harness-orchestration-design.md`](docs/superpowers/specs/2026-09-12-harness-orchestration-design.md)。

## 技术栈

[Next.js 16](https://nextjs.org/)（App Router）· [React 19](https://react.dev/) · TypeScript · [Excalidraw](https://excalidraw.com/) · Tailwind CSS 4 · 知乎开放平台 API · OpenAI 兼容推理层

## 快速开始

```bash
git clone <本仓库地址>
cd kanshan-maps
npm install
cp .env.example .env   # 填入下方环境变量
npm run dev            # http://localhost:3000
```

### 环境变量

| 变量 | 说明 |
|---|---|
| `ZHIHU_ACCESS_SECRET` | 知乎黑客松开放平台密钥（[developer.zhihu.com](https://developer.zhihu.com/)） |
| `ZHIHU_APP_ID` / `ZHIHU_OAUTH_APP_KEY` | 黑客松 OAuth 应用凭证（活动页创建项目后分配） |
| `OAUTH_REDIRECT_URI` | OAuth 回调地址，须与活动页登记完全一致，如 `http://localhost:3000/api/auth/callback` |
| `OPENAI_COMPAT_BASEURL` / `OPENAI_COMPAT_API_KEY` / `OPENAI_COMPAT_MODEL` | OpenAI 兼容推理端点（Planner / Synthesizer 使用） |

> 未配置 OAuth 凭证时应用仍可运行（登录入口返回友好提示），生成链路不受影响。

## 项目结构

```text
src/
├── app/                    # Next.js App Router
│   ├── api/
│   │   ├── auth/           # 知乎 OAuth（state 防 CSRF · HMAC 签名会话 cookie）
│   │   ├── generate/       # SSE 流式生成（stream）+ 单次生成
│   │   ├── agent/          # 看山助手对话改图
│   │   └── me/             # 关注列表 / 收藏夹（登录态）
│   └── page.tsx            # 三栏工作台
├── components/             # SourcesPanel / AgentPanel / BoardControls / ProfileCenter …
└── lib/
    ├── harness/            # ★ Knowledge-Map Harness
    │   ├── planner.ts      #   Intent Planner（LLM 规划 + 规则降级）
    │   ├── executor.ts     #   有限步骤执行器（预算 / 并行检索 / 降级）
    │   ├── sources.ts      #   SourceAdapter 统一接口 + 规范化层
    │   ├── synthesizer.ts  #   两阶段综合 → KnowledgeGraph IR
    │   ├── layouts.ts      #   6 种确定性布局 + 参数化风格
    │   └── patch.ts        #   Agent 语义操作协议
    ├── agent/              # Agent 2.0（意图路由 / 风险分级 / 原子应用）
    ├── zhihu.ts            # 知乎 API 客户端（搜索/热榜/关注流/收藏夹/文章）
    └── session.ts          # HMAC 签名会话
```

## 测试与质量

```bash
npm run lint         # ESLint
npx tsc --noEmit     # 类型检查
npm test             # 单元 + 组件测试
npm run build        # 生产构建
```

当前基线：152 tests（146 pass / 0 fail / 6 OAuth 场景在有凭证环境跳过）· tsc 0 error · lint 0 error · 16 路由构建全过。Harness 各层（planner / executor / sources / synthesizer / layouts / patch / compat）均有独立回归测试，布局模板含「零重叠 / 零超宽」断言。

## 路线图

- [ ] Supabase 持久化 + 热图墙（社区共创的地图广场）
- [ ] 中文字体手绘感（Xiaolai 按需子集加载）
- [ ] 多人协作画板

## 许可与致谢

- 本项目为 [知乎黑客松 2026 · 校园新锐季](https://www.zhihu.com/hackathon) 参赛作品，赛道：📚 知识炼金场。
- 界面中的刘看山形象与知乎内容均通过官方开放平台 API 使用，仅限比赛期间使用。
- 感谢 [Excalidraw](https://excalidraw.com/) 提供的开源画布引擎。

<div align="center">

**一个问题，一图看山。** 🏔

</div>
