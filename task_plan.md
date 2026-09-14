# 一图看山（Kanshan Maps）— 知乎黑客松 2026·校园新锐季

> 把知乎问题下的多元回答，一键炼成一张可编辑的手绘知识地图（观点对照图），并支持 AI 连续对话修改。
> 仓库：~/Documents/code/kanshan-maps ｜ 赛道：📚 知识炼金场 ｜ 截止：2026-09-15 10:00

## Goal

知乎 OAuth 登录 → 输入问题/关键词 → 知乎搜索拉取 Top N 回答 → 直答 Agent 提取各方论点/证据/立场 → 生成 Excalidraw 手绘观点对照图（中心=问题，共识区+分歧区，节点可跳回原回答，高亮"我关注的答主"）→ 用户可继续编辑画板 / 与 AI Agent 连续对话修改图表并实时浏览效果 → 导出/分享。

### 评分对照（初审：AI场景价值40% / 创新25% / 完成度25% / 设计10%）
- 场景价值：只有知乎做得出的场景（一个问题 N 个立场的可视化），登录数计入人气奖
- 创新度：观点对照 ≠ 通用"文章转思维导图"红海；AI 对话改图强化"炼金"叙事
- 完成度：Next.js + @excalidraw/excalidraw 官方 React 组件，48h 内可交付

### Confirmed Scope
- P0 OAuth 登录 + 兴趣画像冷启动（关注流 → 直答归纳 → 推荐地图）
- P0 观点对照图生成（搜索 + 直答 + Excalidraw 画板，可编辑可导出）
- P0 AI Agent 对话修改图表（连续对话、实时预览、操作可解释）
- P0 关注答主高亮（关注列表 ∩ 回答作者）
- P1 学习路线图（领域关键词 → 入门/进阶/避坑路径图）
- P1 图上一键关注答主、分享带水印图
- 缓存层：直答 100 次/天、搜索 5000/天 → 应用层缓存 + 预生成热门问题

### Non-Goals（48h 内不做）
- 移动端 App、浏览器插件
- 多人协作画板
- 知乎故事/热榜深度玩法（热榜只做推荐入口，故事不做）
- 付费/账号体系（只有知乎 OAuth）

### Unresolved Decisions
- [ ] OAuth app_id/app_key：创建黑客松项目后由活动页分配 → 需先部署拿到固定域名再配回调
- [ ] 部署平台：默认 Vercel（用户偏好），确认项目名/域名
- [x] 直答 Agent 的 HTTP 调用方式：服务端代理已确认（Access Secret 在 .env，前端用 builtin/custom 引擎）
- [ ] 刘看山素材在 UI 中的具体出现位置（先做：空状态、加载中、Agent 面板头像）

## Phases

### Phase 1: 侦察与地基 — status: complete
- [x] 下载解压官方 skill 包到 docs/zhihu-skill/
- [x] 读 SKILL.md + hackathon.md
- [x] 读 hackathon-oauth.md / user-api.md / http-api.md / hackathon-content-api.md，接口细节写入 findings.md
- [x] 初始化 planning 文件 + git 基线 commit
- [x] 开发方式确认：Loop Engineering（最小闭环→逐步补齐→每步验证前后端联通→报错即修）

### Phase 2: 骨架与最小闭环 — status: complete
- [x] Next.js (App Router, TS) + Tailwind 脚手架
- [x] 嵌入 @excalidraw/excalidraw 画板 Demo 页跑通
- [x] /api/generate：搜索→提取→图 JSON→前端渲染 全链路验证（真实知乎数据）
- [x] .env.example + gitignored .env 结构
- [ ] Vercel 部署拿固定域名（OAuth 回调前提）→ 移至 Phase 5 前

### Phase 3: 产品化重构 — AI Agent 面板 + 专业 UI — status: complete
- [x] 三栏布局：左=知乎上下文面板（真实头像/点赞/已炼入标记）/ 中=Excalidraw 画板 / 右=AI Agent 对话面板
- [x] /api/agent：连续对话改图（graph 无状态回传，服务端校验 ops 后返回新 graph）
- [x] graph-patch.ts：操作语义层（add/update/remove/emphasize/set_consensus/add_consensus/rename/relayout）
- [x] 前端 Agent 状态机：对话历史 + 操作应用 + 实时 updateScene + 操作回执（✓/✗ 逐条）
- [x] UI 打磨：知乎蓝 #0066FF + 纸感米白 #FAFAF7、刘看山 GIF（空状态 hello / 生成中 working / Agent 头像 idle）
- [x] 修复样式问题（暗色变量污染、引擎面板重排、标题/语言元数据）
- [x] 修复 updateScene 注入丢失根因：excalidrawAPI 回调先于内部 _App 挂载 → 重试轮询直到元素进场景（已 E2E 复现修复）
- [x] E2E 验证：真实浏览器 生成（16 元素+10 素材卡）→ 对话"精简共识"（回复+回执+画板重渲染 17 元素）
- [x] lint 0 错 / build 通过

### Phase 4: 知乎账号打通 — status: complete（除真实凭证联调）
- [x] OAuth 登录流全链路：/api/auth/login（302+state 防 CSRF）→ /api/auth/callback（authorization_code 换 token，成功判断以含 access_token 为准）→ HMAC 签名会话 cookie（src/lib/session.ts，7 天 httpOnly）
- [x] /api/auth/me（登录态查询）/ /api/auth/logout（清 cookie）
- [x] /api/me/followees：关注列表分页拉取（50×4 页），30min 缓存，未登录 401
- [x] 前端：顶栏登录按钮/已登录态（关注 N 人）/ OAuth 错误参数友好提示条；登录后自动拉关注列表
- [x] 关注答主高亮：昵称归一化（去空格转小写）→ graphToScene 传 followedAuthors，拿到列表后自动重绘
- [x] 验证：session 编解码单测（roundtrip/篡改/垃圾输入全 PASS）；未配置凭证时 login 503 友好文案、followees 401、callback 无 code 重定向；UI 回归（错误提示条+URL 清理+登录按钮）；全链路 E2E 无回归；lint 0 错 build 通过
- [ ] 真实联调门：等黑客松活动页分配 ZHIHU_APP_ID/ZHIHU_APP_KEY + 部署拿固定域名后填 .env 实测（外部阻塞，非代码问题）

### Phase 5: 打磨与交付 — status: in_progress
- [x] Vercel 部署 + 固定域名：https://kanshan-maps.vercel.app（生产验证：生成 API 真实数据 4 立场 10 素材、UI 回归无 pageerror、登录态 API 正常）
- [x] 12 个环境变量上 Vercel（ZHIHU_ACCESS_SECRET + OPENAI_COMPAT_* × prod/preview/dev，敏感项 Encrypted）
- [ ] 拿到 ZHIHU_APP_ID/APP_KEY 后：填 Vercel 环境变量 + OAUTH_REDIRECT_URI=https://kanshan-maps.vercel.app/api/auth/callback（活动页登记须与此完全一致）→ 真实 OAuth 联调
- [ ] 演示视频 + 计划书（PDF）
- [ ] 提交前检查清单过一遍（hackathon.md「提交前检查」7 条）

### Phase 6: 体验与内容丰富化 — status: in_progress
- [ ] P0 首页热榜落地（不登录也有内容看）：/api/hot + 点击热榜问题直接生成图
- [ ] P0 SSE 流式生成：先推素材（SourcesPanel 立刻有内容）→ 再推 graph（画板落笔），状态分步可见
- [ ] P0 导出强化：导出 .excalidraw 文件按钮（评委现场可拖改导入）+ 水印（知乎来源 + 原帖链接已有）
- [ ] P0 favicon 换刘看山（GIF 抽帧生成 ico/png）
- [ ] P1 中文字体手绘感：fontFamily 3 被去重到 Excalifont 无中文回退 → 自注册"Xiaolai"/手写中文 woff2 回退链（官方 0.18 自带 Xiaolai 12MB 分包字体，按 metric 子集加载）
- [ ] P1 学习路线图模式：roadmap 类型 graph + /api/roadmap + 首页模式切换（对照图 / 路线图）
- [ ] P2 分享：导出 PNG（知乎水印）+ 复制分享文案（知乎想法格式）
- [ ] P2 Supabase 持久化：maps 表（question/graph/view_count/created_at），热图墙数据基础
- [ ] UI：减少刘看山 GIF 重复使用（空状态静态化 / 仅保留生成中+Agent 头像两处动图）

### Phase 7: 用户反馈修复轮（布局层叠 / Agent 改图失效 / 导出图片 / 列表扩容）— status: complete
背景：上一轮（1e1c38e）交付放射布局+缓存+去 Excalidraw 化后，用户实测发现 4+1 个问题。

- [x] T1 布局引擎重写：修 展示不全+层叠
  - 根因A（层叠主因）：Excalidraw 自由文本 autoResize 不换行，90 字中文摘要渲染成 ~1260px 宽的单行，横穿多张卡片
  - 根因B：放射坐标中间两张卡（246°/294°）中心距 ~358px < 卡宽 400px，几何上必然重叠
  - 根因C：卡片旋转 ±4° 让内部文本出框
  - 方案落地：wrapText() 按 CJK/ASCII 字宽预折行 + block() 按行数算精确高度 + 卡高动态计算 + 2×2 网格布局（观点图）/泳道（路线图）构造性防重叠 + 旋转 ±0.5°
- [x] T2 Agent 改图"失效"排查：curl 复现后端正常（ops 应用成功），E2E 证明前端回灌也通（改标题生效、删立场 37→30 元素）。用户感知"改不了"实为旧布局层叠导致视觉变化不可见；T1 重写后已可感知。顺手修挂载竞态（旧轮询在实例更换后停摆的隐患）
- [x] T3 顶栏按钮交换：素材按钮移到助手按钮左侧（与三栏位置对应）
- [x] T4 导出画板→导出图片：exportToBlob 导出 1600×900 @2x PNG（E2E 真实下载事件验证）
- [x] T5 列表扩容：热榜 20→30（API 上限 30，curl 确认返回 30）；知乎回答数已是 API 上限 10（docs：Count>10 截断）；tab 改名 知乎素材→知乎回答
- [x] T6 验证 + 提交：lint 0 错 / build 13 路由全过 / E2E 三项全绿（观点图 6 卡零重叠零超宽；路线图零重叠；Agent 改图 PASS + page errors 清零）/ 热榜 30 条 / 导出图片真实下载

### Phase 8: 用户反馈修复轮 2（导出不全 / 自选素材生成 / 路线图修复）— status: complete
- [x] T1 导出图片修复：getDimensions 按包围盒自适应（w*2,h*2,scale 2）+ exportPadding 32 → E2E 断言 PNG 2291×2002 完整覆盖 1080×937 内容；按钮改 Island 风格（ks-export-btn：白底/圆角10/轻阴影，复用 --color-surface-lowest）；Excalidraw Island 面板同步加边框+柔化阴影贴合站点
- [x] T2 自选素材生成：新流程「找回答」（/api/search 只搜不生成）→ 左栏勾选多篇 → 「生成所选」浮条直传 items 跳过服务端搜索（缓存键隔离 picked）；E2E：10 回答→勾3→生成"基于你选的 3 篇回答"
- [x] T3 学习路线修复：本地复现发现后端正常但链路 22-110s，根因 = Vercel Hobby 默认函数 10s 超时掐断 SSE → stream 路由加 export const maxDuration = 300；生产实测 23.2s 返回 graph 事件 ✅
- [x] T4 验证+交付：lint 0 错 / build 过（含新 /api/search）/ E2E 全绿 / commit e82fdc9 已推 / 生产部署 Ready + roadmap 实测通过

### Phase 9: 用户反馈修复轮 3（素材连续浏览 / 清空画布 / Agent 样式）— status: complete
- [x] T1 导出按钮贴到画布最右下角（bottom-3/right-3）
- [x] T2 自选文章生成后保留完整搜索结果，不再被生成接口返回的所选子集覆盖；缓存同步保存完整素材
- [x] T3 搜索接口与素材栏增加 offset/hasMore 分页、滚动近底自动加载和手动继续加载入口
- [x] T4 顶栏增加一键清空画布，重置 graph、问题、素材、Excalidraw 场景及本地/session 缓存
- [x] T5 看山助手增加 set_style 语义操作，支持 default / monochrome / pastel / bold 并由布局器真实换色
- [x] T6 项目治理：AGENTS.md 约束每轮多步骤迭代必须先使用 planning-with-files，并持续维护三份 planning 文件
- [x] T7 验证：npm run lint / npx tsc --noEmit / npm run build / git diff --check 全通过；本地 3001 首页与分页搜索 API 均返回 200

### Phase 10: Harness 多源编排架构设计 — status: in_progress
- [x] T1 需求确认：清空增加二次确认；移除无效的“加载更多”；生成链升级为多源、可编排、可验证的 Harness
- [x] T2 现状审计：当前生成链固定为知乎搜索 → 单次模型提炼 → viewpoint/roadmap 固定布局；Agent 仅支持 graph ops
- [x] T3 设计方案获用户确认：Intent → Source → Synthesis → Layout → Style → Validate → Render
- [x] T4 编写并自审正式设计文档：`docs/superpowers/specs/2026-09-12-harness-orchestration-design.md`
- [x] T5 用户复核设计文档后，使用 writing-plans 拆解实施计划：`docs/superpowers/plans/2026-09-12-harness-orchestration-implementation.md`
- [x] T1 实施：清空确认弹窗、移除搜索分页；提交 `680bcb9`
- [x] T2 实施：定义 Harness 契约和 Planner；规格修正提交 `70a5b05` / `dec3c96` / `c88abf1`，28/28 测试通过
- [x] T3 实施：建立 Source Adapter 与规范化层；同时去除画布右上角 Excalidraw 素材库入口；提交 `b3ad10f` + `5133594`
- [x] T4 实施：KnowledgeGraph Synthesizer 与引用校验；提交 `8818b13`，49 项 Harness 回归测试通过
- [x] T5 实施：Harness Executor 与 SSE 事件链；提交 `3f8730b`，57 项 Harness 测试通过
- [x] T6 实施：统一 IR 兼容层与前三种布局；提交 `f7a4a95` + `6f011f1`，70 项 Harness 测试通过
- [x] T7 实施：扩展布局与参数化风格；提交 `b402233` + `db5b07f`，78 项 Harness 测试通过
- [x] T8 实施：跨图类型 Agent Patch；提交 `22ea2a5`，89 项 Harness 测试通过
- [x] T9 实施：智能编排 UI 和混合来源；提交 `a9009dd`，Harness 与组件测试通过
- [x] T10 实施：全链路验证、推送并部署生产；`164a516` 已推送，生产部署 `dpl_9EqqhGqTSJfANxtr6nQ8LEQp1kK` READY
- [x] T11 实施：知乎 Hackathon OAuth 登录接入 — status: complete（2026-09-13 生产真实授权闭环验证通过）
  - [x] 下载并核验用户指定的 Hackathon Skill：官方 URL 包与 Downloads v260815 包 diff 确认后者为更新版（多 deployment-credentials.md + 凭证命名规范），以 v260815 为权威，存档 docs/zhihu-skill/zhihu-hackathon/（提交 388a6ca）
  - [x] 凭证命名对齐 Skill 规范：ZHIHU_APP_KEY → ZHIHU_OAUTH_APP_KEY（callback route + .env.example 本地未跟踪文件）；App Key 只进本地 .env / Vercel Encrypted，泄漏扫描 0 命中
  - [x] 本地 .env 填 ZHIHU_APP_ID / ZHIHU_OAUTH_APP_KEY / OAUTH_REDIRECT_URI=https://kanshan-maps.vercel.app/api/auth/callback
  - [x] Vercel 环境变量（prod/preview/dev ×3 + dev 普通 App Key）：Skill 三项核对通过（两 Secret sha256 前缀不同 6f6a3b5b≠689da02f、App Key 长度 32 非 App ID、命名不串位）
  - [x] 增加 6 项 OAuth 场景测试（未配置 503 / 307+state cookie / 缺 code / state 不匹配 / 换 token 失败 / 成功登录+me）：node --test 6/6 PASS（ZHIHU_TOKEN_URL 仅测试覆盖，默认官方端点）
  - [x] 部署：388a6ca 推送 + 生产 Ready；验证 /api/auth/login 307 → openapi.zhihu.com/authorize?app_id=436&redirect_uri=.../api/auth/callback ✅
  - [x] 真实授权联调（2026-09-13 16:06 生产日志）：GET /api/auth/login 307 → GET /api/auth/callback 307（无 token_exchange_failed）→ GET /api/auth/me 200 → GET /api/me/followees 200（会话有效、关注列表拉取成功）；活动页回调登记与代码完全一致（authorize 端点无非法回调报错）

### Phase 11: 编排步骤展示 + 综合失败修复 — status: complete
背景：用户登录后生成报错 `编排 · 出错 知乎回答 KnowledgeGraph title must not be empty`；且编排步骤只在顶部窄条闪现，用户要求步骤在看山助手面板可见。
- [x] T1 根因修正（比预想深一层）：synthesizer.parseKnowledgeGraph title 缺失回退用查询词（synthesizer.ts:69）；真正根因是 system prompt 未给 schema，builtin 模型（deepseek-v4-flash）自创 schema.org 结构导致 title/nodes 双双为空 → prompt 改为显式 JSON schema 契约（节点/边/分组/引用字段全定义），真实模型探测验证 parse OK。原任务描述：synthesizer.parseKnowledgeGraph 模型输出缺 title 时不再硬失败，回退用查询词（plan.queries[0]）作标题（只补元数据，不编造来源/事实）；同步更新 executor.validateGraph 同样回退；更新 synthesizer 测试（原 /title/i throw 断言改为回退断言）
- [x] T2 编排步骤在看山助手展示：AgentPanel 增加 progress prop（阶段+文档数+错误信息），生成期间在面板顶部显示分步进度（规划→检索→整理素材→综合→布局→验证→完成），出错时错误就地显示在助手面板（复用 harnessStageLabel），成功后进度卡片收起
- [x] T3 验证：synthesizer/AgentPanel 相关测试 + 全量回归（tsc/lint/测试）+ 本地生成真实问题无 title 空失败 + 提交部署

### Phase 12: 找回答独立性 + 编排详情展示 + 布局逻辑性 + Agent patch 加固 + 主题/视口修复 — status: complete
背景：用户反馈 4 项：①找回答不应影响画板/按钮 ②编排过程要看输入输出 ③智能编排图线交叉无逻辑 ④Agent 改图报 未知分组: undefined / reading 'layout'。
- [x] F1 找回答独立 searching 态：不再 set loading，画板/一键看山/输入框不变，只找回答按钮自己转圈
- [x] F2 编排步骤详情：HarnessStep 带 input/output 摘要（问题/关键词/素材数/图类型/节点数/标题），完成卡片保留 4 秒
- [x] F3 debate-grid 左右对立布局重写：组0=左侧、组1=右侧、其余/无组=下方共识区；阵营标签+虚线中轴分隔；边锚点按相对位置动态选择（水平/垂直主轴，消除穿卡直线）；每节点最多 1 出 1 入限流
- [x] F4 通用锚点+限流对所有布局生效（layouts.ts anchors()）
- [x] F5 synthesizer prompt：compare 必须输出对立阵营+共识分组（每组≤4节点、全部节点归属唯一分组、边尽量少）；实测 debate-grid 输出 支持考研3/支持就业3/共识2、8节点全有分组、4条边
- [x] F6 patch.ts 加固：缺 patch → "需要 patch 对象"；groupId undefined → "分组 ID 缺失（用 graph.groups 真实 id）"；agent prompt 注入节点/分组 ID 白名单；测试 10/10
- [x] F7 验证：layouts 15/15（含 debate-grid 阵营分侧+限流断言）、patch 10/10、全量回归、tsc/lint/build 全过；真实生成 debate-grid 三阵营 + roadmap 12 节点全通过；提交 087ebb7 部署生产
- [x] F8（用户新增5）路线图页面空白修复：scrollToContent 重试 8 次（大图一次适配不生效导致内容在视口外，导出按包围盒所以正常）
- [x] F9（用户新增6）Excalidraw 紫色→知乎蓝：theme="light" prop + CSS 变量覆盖（primary 系、选中态、checkbox、swatch）
- [x] F10（用户新增7）紫色未生效根修：Excalidraw 自带 index.css 用同特异性 .excalidraw 且打包后在我们后面（后定义赢），globals.css 覆盖被打回；改 .excalidraw.excalidraw 加倍特异性压过；补全 --color-selection/--color-surface-high/--color-brand-*/--color-surface-primary-container 等整组紫色变量；删除工具栏「更多工具」入口（App-toolbar__extra-tools-trigger）。实测 CSS 变量全变蓝、紫色像素扫描 0 命中、更多工具按钮 display:none；lint 0 err、build 过

### Phase 14: 智能编排提速 + 出图质量/链接修复 — status: complete
背景：用户反馈智能编排（auto/Harness）两大问题：①等待太久，要求流式出图 ②产出图大量无意义节点、样式难看、节点链接点不动。
根因（已定位）：
- 慢：search 10s → synthesize 单次非流式模型调用（12 文档 × 8000 字 ≈ 96KB 提示，60-90s）→ 一次性出整图；budget 上限太肥；OpenAI 客户端 timeout 90s。
- 无意义节点：synthesis prompt 只要求"2-4 分组"，没有节点数上限；图上限 24 节点。
- 链接点不动：卡片 link 被塞成 citation id（如 "zhihu-search:123"）而非 URL；且缺 onPointerDown 链接点击处理。
- 展示决策缺陷：rectangles 是原子元素，画板生成前一片空白直到最后。

- [x] H1 预算瘦身（最能提速）：docs 12→8、charsPerDoc 8000→2600（同步 sources normalizeBudget BUDGET_MAX 和 planner MAX 常量）、模型 timeout 90s→60s；compare/roadmap 之外默认 sources=["zhihu-search"] 不拉 global-search
- [x] H2 两阶段综合（流式感+防截断）：第一次模型调用只产骨架（title/summary/groups/每节点 label ≤20字 + citations），发 `graph-skeleton` SSE 事件；前端立刻落骨架卡片+标题；第二次调用填 description（≤60字）后发 `graph-detail` 事件更新画板文字。每阶段模型输出 token 从 ~4K 降到 ~1.5K，首屏可视时间减半
- [x] H3 节点质量硬约束：prompt 强制 nodes 6-12 个、每节点必须 ≥1 条真实 citation、description ≤60 字、禁止"其他/补充/总结"凑数节点；validateGraph 增加节点 citation 覆盖率检查（不足则降级裁剪凑数节点）；layouts 展示上限 24→12
- [x] H4 卡片链接修复：citation id → 真实 URL（citations 数组查表）；Excalidraw onPointerDown 命中 hit.element.link 时 window.open 新标签；卡片描述末行加"↗ 原文"提示（link 元素 Excalidraw 自带角标）
- [x] H5 验证：harness 全量测试 104/104 + tsc + lint 0 错 + build 过 + 本地 SSE 实测（"考研还是就业"：骨架 8 节点 desc 0/8 → 详情补齐 8/8；节点描述全部是有数字/具体论断的真观点；渲染器算出 8 卡全部带真实 zhihu.com URL、8 行 ↗ 原文、零超宽文本）
- 注意坑：工具回显会把 `apiKey: string` 打码成 `***`，看起来像文件损坏，实际 on-disk 完好，不要被误导去"修"
- 实施中发现两个真 bug 已修：骨架阶段 parseSkeleton 传空顶层 citations 导致节点引用被 validateCitations 清空（改为从节点 citation id 推导）；pruneFillerNodes 保底逻辑写反（cited.length===nodes.length 时反而去裁）

### Phase 15: 五项反馈修复（子代理并行）— status: complete
- [x] B1 收藏夹内容完整展示：ProfileCenter 列表容器 max-h-72 改为撑满面板剩余空间；openFavlist 加载后默认不勾选（去掉全选）
- [x] B2 顶栏独立「我的看山」胶囊入口（不再挂在已登录名字按钮上）
- [x] B3 去除关注 tab 及 prop 链路 及 followees prop 链路
- [x] B4 换色不变版式根修：legacy 渲染器元素 id 带随机后缀导致按 id 映射坐标全 miss → nid() 改确定性 id，changePalette 坐标映射生效
- [x] B5 SourceIndex 限宽不遮挡不与右下角画板控件重叠
- [x] B6 验证全绿 + E2E（入口可见/换色无错/无重叠）+ 1a9bf05 部署生产
（B1 → ProfileCenter.tsx；B2/B3/B5 → page.tsx+SourceIndex.tsx；B4 → excalidraw-layout.ts）

### Phase 14: 六项样式修复（子代理并行）— status: complete
- [ ] S1 收藏夹文章样式对齐知乎回答卡片（ProfileCenter favorites tab：头像/作者/标题/摘要/查看原文，同 SourcesPanel 结构）
- [ ] S2 个人中心入口核查（已有 ProfileCenter+顶栏入口；确认入口可见性，不明显则强化）
- [ ] S3 换颜色只变色调不变版式：changePalette 不再全量重排（保留旧元素坐标只换色），修 applyPalette/renderGraph 路径
- [ ] S4 画板控件（配色+保存图片）移到画板右下角；notice 提示不再挤压按钮导致文字堆叠
- [ ] S5 卡片标题/描述完整展示：wrap maxLines 增大（标题 3、描述 6）或按内容增高，卡高同步动态算
- [ ] S6 cluster-board（文章摘要）中央文字溢出卡片框修复（宽度计算或内边距）
- [ ] S7 验证：全量测试/lint/build + E2E 视觉检查 + 部署
（S1/S2 → ProfileCenter.tsx+page.tsx 左栏；S3/S4 → page.tsx+BoardControls.tsx；S5/S6 → harness/layouts.ts）

### Phase 13: 路线图页面空白根修 + 智能编排布局紧凑化 — status: complete
- [x] G1 E2E 复现：legacy「学习路线」模式九宫格全 0%（auto 正常 30%+），无 console 错误 → 逐层排查 scene 渲染器
- [x] G2 根因修复：roadmapToScene 里 `els.push({ ...headT, x, y })` 展开了 block() 的 {el,height} 而非 .el，产出无 type 非法元素 → Excalidraw 场景校验失败整板空白（导出走包围盒所以下载正常）。改 ...headT.el；全文件 grep 确认仅此一处；回归测试固化（元素必须全部有 type/id），node --test 动态副本法绕过无后缀 import
- [x] G3 布局紧凑化：radial-map 半径按卡片弧长贴合（周长容纳 n 卡）；concept-map 默认 cluster-board 分簇/紧凑两列；evidence-tree 补右侧双列显式分支；planner concept-map→cluster-board；synthesis prompt 所有任务强制 2-4 主题分组+标题直接回答问题
- [x] G4 验证：E2E legacy 路线图 0%→30%/27% 有内容、观点图回归正常；全量测试（layouts 15/15、planner、excalidraw-layout 回归 1/1）、tsc/lint/build 全绿；提交 27e476d 部署生产 Ready，生产 roadmap API 出图正常

## Phase 16: 详细技术实施方案 — status: complete
- [x] 将双模式 Harness、模型策略、知乎个性化、Agent 2.0 和局部重渲染拆成可执行技术阶段
- [x] 明确类型、API、缓存隔离、错误结构、测试和 E2E 验收标准
- [x] 方案文档：`docs/2026-09-13-detailed-technical-implementation-plan.md`

## Phase 15: 产品决策与 Agent 优化方案 — status: complete
- [x] 梳理并记录产品收缩方向：保留观点对照与学习路线，Harness 下沉为底层架构
- [x] 记录模型策略：先优化输入、调用次数和校验，再用真实样例对测模型
- [x] 记录知乎个性化方向：收藏夹到学习路线、关注答主对照、我的学习地图
- [x] 诊断看山助手：意图路由、双协议、过宽 patch、部分提交、无预览、全图重排和版本覆盖风险
- [x] 提出 Agent 2.0：apply/preview/answer/clarify、语义化变化、风险分级、原子提交、局部重渲染
- [x] 方案文档：`docs/2026-09-13-product-decision-and-agent-improvement-plan.md`

## Errors Encountered
| Excalidraw updateScene 被丢弃（setState on unmounted） | 1 | 回调后 setTimeout 300ms 再注入（已修） |
| Excalidraw 容器高度失控（canvas 顶到 2^25） | 1 | 显式像素高度 + contain:size（已修） |
| Excalidraw updateScene 静默丢失（重构后复发） | 2 | 根因：excalidrawAPI 回调先于内部 _App 挂载，固定 300ms 延迟不可靠 → 重试轮询（250ms×40）直到 getSceneElements>0 |
| Playwright chromium 版本不匹配 | 1 | npx playwright install chromium 重装 |
| vision_analyze 400（custom provider 不支持非流式图片请求） | 1 | 改用 Playwright 程序化 UI 检查（溢出/图片/布局/背景色断言） |
| curl localhost 打到旧 dev server | 1 | 旧进程占 3000，新 server 在 3001；以 process log 为准 |

## Phase 19: 摘要结构与工作区修复 — status: in_progress
- [x] 摘要改为中心主题 + 左右分支思维导图结构；观点对照/学习路线移除画布内来源脚注、作者和原帖提示，统一由底部来源索引展示。
- [x] 删除画布右下角旧“导出图片/保存图片”按钮；分享知乎展开菜单仅保留复制文案和系统分享。
- [x] 个人中心改为左侧栏，与素材栏互斥，收藏夹、地图和关注内容集中展示，移除顶部重复收藏夹入口。
- [x] Agent 视觉修改：版式/密度/布局变更强制全量重绘，文字修改保留坐标；补齐风格关键词和总结模式识别。
- [x] 验证：147 tests / 141 pass / 0 fail / 6 OAuth skips；tsc、lint、build、diff check 全通过。

## Phase 18: 知识资产与分享闭环 — status: in_progress
目标：修复看山助手缺少图数据，并上线观点对照/学习路线/文章总结、个人中心、知乎分享闭环。

### 执行顺序
1. 复现并修复 Agent 图数据丢失，补 compare/roadmap/summary 回归测试
2. 统一知识地图资产与来源链接展示规则
3. 增加受控布局/样式变化
4. 升级“我的看山”个人中心
5. 增加知乎回答/文章/收藏夹的文章总结地图
6. 增加“分享知乎”面板：复制文案、保存图片、系统分享及降级
7. 全量验证、部署生产、线上验收

### 已确认决策
- 总结内容第一版限定知乎回答、知乎文章和知乎收藏夹内容
- 分享入口采用 C：主按钮“分享知乎”，并提供“保存图片”“复制文案”快捷按钮
- 不模拟知乎网页自动发帖，使用系统分享/下载图片/复制文案的安全降级链路

### 验收标准
- 已有三类图时 Agent 不再误报缺少图数据；无图时仍给出正确提示
- 卡片可打开真实来源，底部有完整来源索引
- 同类图具有受控布局/风格变化且可继续编辑
- 登录用户可在“我的看山”浏览地图、收藏夹、关注内容
- 总结地图可生成、保存、修改、导出
- 分享面板三项能力在支持/不支持 Web Share API 的环境均可用
- `npm run lint`、`npx tsc --noEmit`、测试、`npm run build`、`git diff --check` 通过，生产部署 READY

### Phase 18 execution record
- [x] 18.1 Agent graph contract: backend normalization and helper regressions pass for legacy viewpoint/roadmap/KnowledgeGraph and malformed/no-graph inputs; route smoke returns 400 for missing graph and 200-compatible local generation path.
- [x] 18.2 Knowledge assets: helper source citation index/link safety pass; bottom source strip and page integration present.
- [x] 18.3 Controlled presentation: helper offers deterministic mode-safe layout conversion; page integration present and local browser mode controls load without page errors.
- [x] 18.4 My Kanshan: local helper has explicit local-only capability metadata, namespaced storage, and stable board IDs; UI/persistence wiring present. Authenticated cloud readback remains intentionally out of scope for local-only boards.
- [x] 18.5 Summary: stream route supports one-call source-grounded summary parsing with URL whitelist and summary-board graph; local implementation and route validation pass. Real summary-model browser generation remains limited by no deterministic browser automation profile in this session.
- [x] 18.6 Share: helper covers cited copy, safe filename, cancellation classification, clipboard/download/watermark primitives; panel integration present.
- [x] 18.7 Release: full Node runner, typecheck, lint, build, diff check, local production HTTP/API smoke, Playwright desktop/mobile UI smoke, commit/push, Vercel production deploy and public readback.

## Phase 24: 生成图/修改图样式重设计（Excalidraw 最佳实践）— status: in_progress
背景：用户反馈看山助手修改图与生成图仍有样式不美观问题，要求按 Excalidraw 最佳实践重新设计。

### 已确认设计决策
- 改动收敛在统一渲染器 harness/layouts.ts + presentation.ts；不改图数据结构、不改 Agent 协议。
- 保留三个用户指定版式的骨架（debate-grid 2×2+胶囊 / swimlane-roadmap 泳道 / summary 思维导图），只重做视觉细节。
- 评审链路：scripts/visual-probe.ts（元素→自绘 SVG→rsvg-convert PNG）+ vision 子代理评审，迭代到满意后再动代码。

### 任务
- [x] T1 基线评审：三种图各出一张 PNG，收集最影响美观的问题清单（7 项，记入 findings.md：最小卡高 280 导致大面积空白/胶囊文字截断/层级对比弱/连线全是直线/页眉折行难看/泳道高矮悬殊）
- [x] T2 卡片组件重设计：CARD_H 280→132 内容主导、PAD 20→18、标题 3 行→2 行、标题色 stroke→palette.title 深色提升层级、标题-正文间距 16→10
- [x] T3 箭头/连线重设计：arrow() 从 2 点直线改 3 点贝塞尔（bend 0.06）+ 颜色统一 palette.muted；debate 汇聚线保持 curveArrow 0.12
- [x] T4 标题/页眉排版：header 标题宽 420→900、优先单行（避免第二行一两个字）、summary 位置随行数动态
- [ ] T5 配色微调：本轮 palette 未改（zhihu-blue 四色 fills/strokes 本身协调，accent 黄与正文区分度够），仅卡片标题色改 palette.title
- [x] T6 各版式特有问题：debate 胶囊宽度自适应 320~520、文字 3 行完整显示不截断 + 完整居中；mindmap 根容器按行数椭圆/圆角矩形切换、宽 200~380 自适应、3 行完整显示；swimlane 泳道高度对齐最高一条
- [x] T7 回归：layouts 20/20、全量 165/165、tsc 0 错、lint 0 error、build 过；E2E 真实生成断言（6 卡 h=132、胶囊 320×72 完整未截断且居中、标题单行、箭头全 3 点、0 pageerror）全 PASS
- [ ] T8 提交推送 + 生产验证

## Phase 25: 样式重设计第 2 轮（debate 箭头重叠/共识长卡/页眉居中完整）— status: complete
背景：用户对 Phase 24 结果验收不通过，提出 3 项：
①观点对照汇聚箭头重叠压卡、单一黑色难看、结构没有逻辑性（左右对立没体现）
②共识应放在最下面、做成一张通栏长卡（不是多张小卡竖排）
③所有图顶部标题/描述不居中、文字多了被截断——要么 AI 缩短要么样式自适应

### 设计决策
- debate-grid 左右对立版式：组0=左列、组1=右列、列头立场标签、卡片→胶囊箭头按列换色（不再黑色）
- 箭头走线：新增 curveArrow3 显式控制点 3 点贝塞尔；起点取卡内侧边缘中点、控制点紧贴起点正上方（x 不变），弧线贴列间隙走廊垂直上升到顶再水平汇入胶囊同侧 1/4 处——贝塞尔头段切线垂直向上，全程不与本列任何卡相交（数学验证 + E2E 贝塞尔轨迹逐段采样断言零压卡）；单列特例（AI 只产 1 组）统一走右缘走廊、终点甩到卡右缘外侧 40px
- 「结构没有逻辑性」根因：compat.ts viewpointToKnowledgeGraph 把所有观点塞同一个 group="viewpoints"（单组无对立）→ 改 stanceGroup 奇偶交错分 stance-1/stance-2 两组（观点按支持度排序，交错即对立），knowledgeGraphToViewpoint 反转兼容 stance-* 前缀
- 共识合并渲染：底部通栏长卡（debate-consensus 横幅），多条共识编号横排，胶囊→共识一条绿色连线
- header 标题/描述居中（textAlign center、文本框中心对齐整图中心 x=590）；标题 32→28、宽 1100、最多 3 行完整显示不截断——「文字截断」用样式自适应，不动 Agent 提示词
- E2E 断言：贝塞尔轨迹逐段采样不与任何卡相交、箭头颜色 ≥2 色、共识通栏单卡、标题居中无 … 截断

### 任务
- [x] T1 debate-grid 按组对立分列 + 列头标签 + 箭头按列换色 + 列内侧走廊走线零压卡
- [x] T2 共识通栏长卡合并渲染
- [x] T3 header 居中 + 完整显示（28px/1100 宽/3 行）
- [x] T4 compat 观点分两组（stance-1/stance-2）——结构逻辑性的数据层修复
- [x] T5 测试断言同步 + 全量门 166/166 + E2E 真实生成 2 组对立/箭头零压卡/页眉居中全 PASS
- [x] T6 用户验收后提交部署（791de09 Phase 24 对话绑定 + 4675f69 Phase 24+25 样式重构，已推 origin/main，Vercel 生产 200）

## Phase 26: 观点对照去箭头 + 卡片文字全显示 — status: complete
背景：用户验收 Phase 25 后反馈：①观点对照干脆去掉箭头 ②卡片内文字要求完全展示清楚，在保证美观的前提下可以拓长拓宽卡片。
设计决策：箭头移除后归属表达靠列头立场标签 + 卡片按列分色（Phase 25 已落地）；唯一保留的箭头是胶囊→共识横幅的绿色连线。文字全显示走样式自适应：观点卡加宽 320→400（两列 400+400+140 间隙=940），标题/正文取消行数上限（fullText），卡高按完整内容撑开；不动 AI 提示词。
- [x] T1 移除 debate-link 汇聚箭头（含 curveArrow3 helper）；保留胶囊→共识绿色连线
- [x] T2 card/cardHeight 加 fullText 参数：debate 卡片标题/正文不截断，卡高按完整内容计算；positions debate 分支卡片加宽到 CARD_W_DEBATE=400
- [x] T3 测试断言同步：无汇聚箭头、卡宽 400、卡文字零省略号；全量 166/166、tsc、lint、build 全绿
- [x] T4 E2E 真实生成断言全 PASS（无箭头/卡宽 400/文字零截断/2 组对立/共识通栏/页眉居中）
- [x] T5 提交部署（89eff0e 已推 origin/main，Vercel 生产 200）

## Phase 24: 看山助手对话与图绑定 — status: complete
背景：用户反馈 生成新图/切换画板后，看山助手上一张图的对话还留在面板里；对话数据应与画板绑定，换图即换会话。

- [x] T1 新增 src/lib/agent-chat-store.ts：按 boardSession 存取 ChatMsg[]（sessionStorage，键含会话 id）+ historyFromMessages 重建 /api/agent history（≤8 条），损坏数据容错
- [x] T2 page.tsx 引入 boardSession（state+ref，ref 经 effect 同步过 lint 的 react-hooks 检查）：generate 开始 / openSavedBoard / clearBoard 各起新会话；BoardCache 增 sessionId，重启恢复时沿用 → 对话随画板一起回来
- [x] T3 AgentPanel 接 sessionId prop：会话切换即重载对应聊天记录（面板收起再展开、刷新页面均不丢）；换图瞬间在途请求的回复按 sentSession 丢弃，不写入新会话；save effect 跳过会话切换间隙避免旧消息写进新 key
- [x] T4 验证：新增 agent-chat-store.test.ts 5 用例；全量 171 tests（165 pass/0 fail/6 skip）· tsc 0 错 · lint 0 error（6 warnings 为既有）· build 16 路由 · Playwright E2E 三场景（刷新后对话随画板恢复 / 清空画布对话清空 / 新画板会话空不串扰）全 PASS、0 pageerror。generate 新图路径与 openSavedBoard 共用同一 setBoardSession 机制，未单独跑真实生成（需知乎 API 配额）。临时脚本 /tmp/e2e-chat-bind.cjs 验证后删除

## Phase 23: 摘要中心文字居中 + 看山助手超链接开关 — status: complete
背景：用户反馈 ①文章摘要中间椭圆里的文字不居中 ②跟看山助手说「去除超链接」却改了内容、始终去不掉。

- [x] T1 椭圆文字居中：evidence-root-text 原固定 +30/+35 偏移（换行/密度变化时偏上），改为文字块中心对齐椭圆中心 + textAlign center / verticalAlign middle
- [x] T2 超链接开关：新增 set_links 语义变更（types/apply/router/decide 四层 + 模型 prompt）。「去除/不要/删掉链接」优先路由到 style（不再误判成删节点改内容）；开关存 metadata.linksEnabled，渲染层 layouts.ts nodeLink 读它决定卡片是否带 link；citations 不动、底部来源索引保留；「恢复链接」可逆
- [x] T3 前端重绘判定：geometryChanged 增加监听 metadata.linksEnabled，开关变化强制全量重渲染
- [x] T4 验证：全量 166 tests（160 pass/0 fail/6 skip）· tsc 0 错 · lint 0 error · build 16 路由 · 真实 API 实测（去除→changed+linksEnabled=false+节点描述未变；恢复→linksEnabled=true）· E2E 真实画板（椭圆文字中心偏移 0、生成期 3 卡带链接、0 pageerror）

## Phase 22: 摘要思维导图几何根修 + Agent 版式切换修复 — status: complete
背景：用户反馈 ①文章摘要思维导图箭头重叠/压卡、中间卡片不垂直居中 ②看山助手无法修改结构/样式（说「换成思维导图」图不变）。

- [x] T1 箭头穿卡根修：思维导图分支箭头弃用通用 anchors()（对上下错位卡判垂直连线，从卡顶/底穿入），改强制水平连线——端点精确落在根与卡片的侧边缘中点（layouts.ts mindmapAnchor）
- [x] T2 根节点垂直居中根修：根 y 不再用「总卡高+⌈n/2⌉间距」近似公式（与 positions() 口径不一致导致漂移），改为从实际渲染 boxes 算左右列高、与较高列跨度中心精确对齐（实测 rootOffset=0）
- [x] T3 Agent 结构/样式失效根修：摘要图 kind 本就是 evidence-tree，旧规则「换成思维导图」只重设 presentation.layout（无操作）且没翻转 metadata.mode=summary → 新增 set_mode 语义变更（types/apply/router/decide 四层），规则+模型 prompt 双路径；「换回证据树」可还原
- [x] T4 前端重绘判定：page.tsx geometryChanged 增加监听 metadata.mode，版式开关变化强制全量重排（否则被「保留坐标」局部渲染吞掉）
- [x] T5 清理：删除上期遗留未跟踪的 src/app/palette-repro*.test.ts（失效 @ts-expect-error 一直卡 tsc/build）
- [x] T6 验证：全量 159 tests（153 pass/0 fail/6 skip）· tsc 0 错 · lint 0 error · build 16 路由 · 几何脚本（真实中文长文案）箭头穿卡 0/碰撞 0 · E2E 真实 UI 生成后画板断言（root 居中 0 偏移、6 箭头全贴侧缘、零穿卡零重叠、0 pageerror）· /api/agent 实测三场景（思维导图/黑白/还原证据树）全部 changed+正确生效

## Phase 20: 八项反馈修复轮（摘要思维导图 / 按钮入画板 / Agent 视觉 / 个人中心侧栏 / 去画布来源 / 知乎链接输入 / 版式修复）— status: in_progress
背景：Phase 19 未提交改动在树上的基础上，用户提出 8 项。分工：逻辑（glm 5.3=本会话模型）负责诊断+实现，样式细节可再派 kimi k3 子代理润色。
- [x] 0 只读诊断（glm 5.3 子代理 deleg_396d75ce 完成 6 项根因报告；k3 重复诊断已叫停）
- [x] 1 文章摘要长图 → evidence-tree 思维导图：左右对称分支+垂直居中修正+根节点居中（layouts.ts summary 分支重写）；顺手修 debate-grid 共识区与侧列重叠 bug
- [x] 2 底部「保存图片」按钮移除；「一键分享至知乎」+「保存图片」经 renderTopRightUI 嵌入 Excalidraw（新组件 BoardControls.tsx；SharePanel.tsx / PresentationControls.tsx 删除）
- [x] 3 看山助手视觉修改：presentation 变化字段扩展为 layout/density/hierarchy/palette/stroke 全量触发重渲染（page.tsx geometryChanged）；模型路径 CHANGE_INSTRUCTION 补 layout 选项（decide.ts）；router.ts 规则已含思维导图/蓝色分支
- [x] 4 顶部栏新增「个人中心」按钮（清空按钮左侧，图标+文字，登录后可用）；ProfileCenter 重写为 地图/收藏夹/关注 三 tab 左侧栏，与素材栏互斥
- [x] 5 画布内来源文字（Phase 19 已删 ↗原文/作者/脚注，本轮补 debate-grid 共识重叠修复）；底部 SourceIndex 保持唯一来源展示
- [x] 6 版式/颜色控件嵌入 Excalidraw renderTopRightUI（不再外层浮层，消除遮挡）；布局标签「证据树」→「思维导图」
- [x] 7 知乎链接直达：zhihu.ts 新增 isZhihuUrl/parseZhihuArticleHtml/fetchZhihuArticleByUrl；stream 路由识别 URL 强制 summary；输入框粘贴链接自动切摘要模式；新增 zhihu-url.test.ts 4 测试
  - ⚠️ 外部限制：知乎 WAF 对服务器端直抓 zhuanlan/zhihu.com 一律 403（本机 curl 同样 403，非代码问题）。抓取链路逻辑已就绪并有离线测试，浏览器端可访问的链接在无 WAF 环境（如本地 dev + 用户登录态 cookie 场景）可用；生产直抓需要知乎官方内容 API 支持按 URL 取文（黑客松 API 无此端点）或代理层
- [x] 8 验证：tsc 0 错 / 152 tests（146 pass 0 fail 6 OAuth skip）/ lint 0 error（4 warning 为既有）/ build 16 路由全过 / 本地 next start 首页 200 + URL 分支正确触发（假 ID 返回友好 403 错误事件）
- [ ] 9 样式细节 kimi k3 润色（BoardControls 视觉/ProfileCenter tab 打磨）+ E2E 浏览器冒烟（可选）
- [ ] 10 用户验收后提交

## Phase 21: 黑客松 README 重写 — status: complete
背景：用户要求按官方两份文档（参赛流程指南 + 开发者手册）重写 README，突出产品定位对评分维度的命中与 Harness 架构创新，作为代码仓库加分项。
- [x] 读官方文档：评审标准（AI场景价值40/创新25/完成度25/设计10）、交付清单（demo必交/计划书必交/代码仓库加分）
- [x] 读 task_plan/findings/progress + harness 设计文档，盘点真实功能与架构事实
- [x] 重写 README.md（一句话定位 + 与通用导图工具对照表、四维评分逐项对照、Harness ASCII 架构图 + 6 条工程设计亮点、技术栈、快速开始 + 环境变量、项目结构、测试基线、路线图、合规致谢）
- [x] 验证：docs 相对链接存在、域名统一 kanshan.space（线上 200）、测试数字与 Phase 20 记录一致（152/146/0/6、16 路由）

## Phase 27: 看山助手结构理解修复（增删节点/连线/分组容器）— status: in_progress
背景：用户反馈助手「只能加内容」，结构性需求全部失败：学习路线 3 点加第 4 点不行；一张大卡包住两张小卡不行；去除某点到某点的箭头不行。

### 根因诊断（代码实读确认）
1. GraphChange 契约根本没有 add_node——能删/合并/移动却不能新增（src/lib/agent/types.ts）
2. router.ts 没有「添加/新增/加上」意图正则 → 落到模型兜底，clarify 条件（低置信+无 targetIds→追问）直接吞掉「添加」这类本就无现有目标的请求
3. graph.edges 有数据但 GraphChange 无边操作；且渲染层 debate-grid/swimlane 跳过 graph.edges 画固定装饰箭头 → 去箭头请求（即使走到模型）产出非法 change 被校验拒绝，回复「没通过校验」
4. 分组只有 move_node 到已有组，没有新建分组；渲染层没有「分组容器」概念，只有泳道背景框（仅 swimlane 版式）
5. AgentContext 不给模型看 edges 和空 label 的分组 ID，模型无从操作连线

### 设计决策
- 新增 4 个 GraphChange：add_node（low）/ add_group（low）/ remove_edges（high，带理由确认）/ add_edge（medium）
- 空 label add_group（不指定 nodeIds）→ metadata.groupContainers 渲染为「包住成员卡的大圆角框+组标签」（大卡包小卡，跨版式生效）
- remove_edges 后把被删边记入 metadata.removedEdges 集合：debate/swimlane 的固定装饰箭头（lane-arrow / debate-consensus-link）按此集合隐藏，恢复连线可逆；数据型边本就只画 1 出 1 入限流内的子集，删除后剩余边自动递补渲染
- router 增加「添加/新增/加上/补充一条/再（加）一点」→ structure 意图；clarify 吞咽条件对 structure 放宽（structure 无需现有目标即可直达模型）
- decide prompt 补 4 个 change 类型 + edges 摘要 + 空 label 分组白名单（agent prompt 必须注入真实 ID 白名单防编造）
- 前端局部渲染保留：新节点 id 不在旧位置表里自然取新坐标（无需改动 page.tsx）

### 任务
- [x] T1 types/apply/decide 四层契约扩展（含 validate + risk 分级 + 原子应用 + 结构完整性复用现有检查）
- [x] T2 router 意图规则 + clarify 条件放宽 + 连线删除正则（「去掉/断开/删除 A到B 的箭头/连线」）
- [x] T3 layouts.ts：groupContainers 大框渲染（positions 后从成员 box 求包围盒+padding，元素置底 unshift）+ removedEdges 过滤装饰箭头 + graph.edges 渲染上限防蜘蛛网
- [x] T4 前端重绘判定补网：节点/边/分组数量变化、groupContainers 变化、removedEdges 变化全部触发全量重排（局部渲染保留坐标只用于纯文字/强调/改色，数量变化时旧坐标映射错位还不如全量重排）；「添加/移动/连线」话术加入 appliedLabels structural 正则
- [x] T5 测试：agent.test.ts +12 用例（新 change 校验/应用/路由/风险分级/装饰箭头恢复）；layouts.test.ts +4 用例（容器框零误报/被删箭头消失+递补/恢复可逆）
- [x] T6 验证门全绿：tsc 0 错 / lint 0 error（6 既有 warning）/ 190 tests（184 pass 0 fail 6 OAuth skip）/ build 过 / diff check 净；真实 API 实测五场景全过（路线加第4点：新增「工程化与部署」✅ / 大卡包小卡：wrap 容器包住 2 卡不动归属 ✅ / 去站间箭头：高风险 preview→commit 确认流 ✅ / 恢复箭头：lane 装饰箭头 add_edge 恢复、不污染 graph.edges ✅ / 连两张卡 ✅）；渲染层集成断言（新卡渲染/容器框包住成员/被删 lane 箭头隐藏/全元素 type 齐全）
- [ ] T7 提交推送（待用户验收）

### 实施中修的两个真 bug
- ADD_NODE_RE 的 `加一` 前缀误吞「把第一个立场标为重点」（EMPHASIZE 回归）→ 拆成 `加一(点|条|个|张)` 独立分支 + ADD_NODE_RE 让位 EMPHASIZE/RENAME
- add_edge 恢复数据边时只清 removedEdges 没补回 graph.edges（重渲染仍不画）→ 恢复时非装饰边补回 edges

## Phase 17: 双模式 Harness + Agent 2.0 + 个性化实施 — status: complete
- [x] A 双模式收缩（compare/roadmap，隐藏 auto）
- [x] B Agent 2.0（语义协议 + 原子提交 + 风险分级 + 预览确认）
- [x] C 局部重渲染（保留用户坐标）
- [x] D 收藏夹→学习路线（favlists/favlist-contents API + 前端入口）
- [x] A2 来源预处理（相关性过滤 + 转载去重）
- [x] E 全量验证（129 tests pass / lint clean / build pass / E2E 冒烟通过）
