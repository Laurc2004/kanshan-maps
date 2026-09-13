## 2026-09-13：详细技术方案

- 已写入 `docs/2026-09-13-detailed-technical-implementation-plan.md`。
- 文档覆盖双模式 Harness、来源预处理、模型调用、知乎个性化、Agent 2.0、原子 patch、预览确认、graph version、局部渲染、测试和分阶段实施。
- 本轮只完成方案文档，没有修改业务代码。


## Session 8 — 2026-09-12（Phase 10: Harness 架构设计）— in_progress
- 用户批准总体方向：Intent → Source → Synthesis → Layout → Style → Validate → Render
- 已完成并自审设计稿：`docs/superpowers/specs/2026-09-12-harness-orchestration-design.md`
- 设计采用“受约束 Planner + 确定性执行器”，包含多源 Adapter、统一 KnowledgeGraph IR、6 类布局模板、风格参数、引用校验和有限调用预算
- 同一设计明确：清空增加产品内确认弹窗；删除不可靠的知乎搜索分页交互
- 外部限制：飞书文档抓取 403，本地 Chrome 登录数据不可读取；设计只使用仓库内官方知乎文档与用户明确列出的能力，未冒充读取原文
- 当前门：Task 2 契约修正已完成，`PresentationSpec.layout` 缺口已确认存在并补齐（`c88abf1`）；28/28 测试、tsc、lint、diff 检查通过；Task 3 增加去除画布右上角素材库入口后开始实施
- Task 3 首次子代理使用已统一后的 `glm-5.3-flash`，但 600 秒超时；已检查留下的 `zhihu.ts`、`sources.ts`、`sources.test.ts`，分页移除和素材库 CSS 尚未全部收尾，重新派发修复任务
- Task 3 代码质量审查：无 critical；要求修复 AbortSignal 未贯通、collectSources 负预算、知识 work_id 规范化校验；另补 malformed item、timeout、预算和取消传播测试
- Task 3 最终审查未通过：collectSources 未接收外部 AbortSignal；跨源 ContentID 因 source 前缀无法去重；malformed 搜索项可生成 undefined 字段；知识详情失败未记录错误。已进入最后修正。
- Task 3 加固完成：`5133594` 修复外部取消、跨源 ContentID 去重、malformed 输入隔离和知识错误记录；最终复核 PASS，44/44 Harness 测试、16/16 加固复核测试、tsc、lint、diff 检查通过。
- 用户新增 Task 11：接入知乎 Hackathon OAuth 登录；指定 Skill 下载地址未能自动提取内容，OAuth 凭据需按安全边界使用，App Key 不写入仓库或 planning 文件。
- 当前开始 Task 4：实现多源资料到统一 KnowledgeGraph IR 的综合器、引用白名单校验和结构修复；继续使用 `gpt-5.6-sol` 子代理。
- Task 4 完成：`8818b13` 新增 KnowledgeGraph Synthesizer；实现 JSON 解析、节点 ID 修复、悬空边清理、citation 白名单、数量限制和数据-only Prompt；49/49 Harness 测试、tsc、lint、build、diff 检查通过。首次 Prompt 测试失败后确认是测试错误地只检查 user message，修正测试而未弱化安全 Prompt。
- 当前门：进入 Task 5，准备把 Planner、Source Adapter、Synthesizer 串入有限步骤的 SSE Executor。
- Task 5 完成：`3f8730b` 新增有限步骤 `runHarness`，支持并行来源收集、部分失败、最多一次补充查询、模型预算、AbortSignal 和 `mode=auto` SSE；保留 viewpoint/roadmap 兼容路径；57/57 Harness 测试、tsc、lint、build、diff 检查通过。
- 当前门：进入 Task 6，统一 IR 兼容层与多布局。
- Task 6 首次子代理超时；已留下 `compat.ts`、`layouts.ts`、对应测试及 `page.tsx`/`excalidraw-layout.ts` 修改，尚未提交，正在先验证部分实现和兼容旧路径。
- Task 6 审查发现需修复：布局 element ID 的 safeId 可能碰撞；legacy graph 转 IR 依赖未持久化 sidecar 且超过 8 个节点会丢失；完整 LayoutKind 暂时只有前三种实现。已暂停后续任务，先修复重要问题。
- Task 6 第二次复核发现：Hash 使用 `charCodeAt(0)` 处理非 BMP 字符时仍可能只取相同 high surrogate，😀/😁 等不同 ID 会碰撞；已要求改为按 UTF-16 code unit 或完整 code point 稳定哈希，并补测试。
- Task 6 加固完成：`6f011f1` 改为按 UTF-16 code unit 稳定哈希并新增非 BMP ID 回归；legacy 大数据 graph 经 JSON 序列化后无损还原；70/70 Harness 测试、tsc、lint、build、diff 检查通过。Task 6 关闭。
- 当前门：进入 Task 7，补齐 swimlane-roadmap / cluster-board / evidence-tree 和参数化风格。
- Task 7 最终审查未通过：evidence-tree 只有根椭圆，没有根到子节点的层级连线和相对布局；`resolvePresentation` 在缺少 presentation 时没有正确使用 `RunPlan.style`。已进入修复。
- Task 7 修复完成：`db5b07f` 增加 evidence-tree 根到每个 child 的语义连线并修正 child 布局；`RunPlan.style` 在无 presentation 时正确作为 palette 回退；78/78 Harness 测试、tsc、lint、build、diff 检查通过。
- 当前门：进入 Task 8，统一跨图类型 Agent Patch。
- Task 8 完成：`22ea2a5` 新增 KnowledgeGraph 受限 Patch 协议，支持节点/分组/强调/标题/呈现参数/reset/no-op；校验未知引用并保留 legacy ViewpointGraph；Agent 修改后走 adaptive render + persistence；89/89 Harness 测试、tsc、lint、build、diff 检查通过。
- 当前门：进入 Task 9，智能编排 UI 和混合来源展示。
- Task 9 完成：`a9009dd` 将默认生成模式设为 auto，同时保留 viewpoint/roadmap；页面消费 Harness SSE 阶段并展示 `HarnessStatus`；来源面板显示混合来源类型；保留自选生成、热榜、清空确认、导出、素材库隐藏和无分页；91 项测试、tsc、lint、build、diff 检查通过。
- 当前门：进入 Task 10，全链路验证、推送并部署生产。
- Task 10 开始：本地 `main` 比 `origin/main` ahead 15，Vercel CLI 已登录；先执行完整自动化与本地浏览器全链路验收，再提交 planning 文件、推送和生产部署。
- Task 10 完成：97 项测试通过；tsc、lint、build、diff check 通过；本地 `3003` 首页、`/api/auth/me`、`/api/search` 返回 200，首页无“加载更多回答”；planning/spec 已提交为 `164a516` 并推送，远程 main 与本地一致；Vercel 生产部署 `dpl_9EqqhGqTSJfANxtr6nQd8LEQp1kK` READY，线上首页与 `/api/auth/me` 均返回 200。
- 当前门：Task 11 OAuth 真实凭据联调与 Skill 初始化仍待处理；OAuth 未完成前不宣称全项目完全收尾。

## Session 7 — 2026-09-12（Phase 9: 用户反馈修复轮 3）— complete
- 补齐上一轮遗漏的规划记录：导出位置、搜索结果保留、继续加载、清空画布、Agent 样式修改均已实现
- 项目治理：更新 `AGENTS.md`，明确每次多步骤迭代必须先使用 `planning-with-files`，并维护 `task_plan.md` / `findings.md` / `progress.md`
- 验证：`npm run lint`、`npx tsc --noEmit`、`npm run build`、`git diff --check` 全通过；开发服务器实际端口为 3001，首页和 `/api/search` 均返回 200

## Session 6 — 2026-09-12（Phase 8: 反馈修复轮 2）— complete
- 用户反馈 3 项：①导出图片不全 + 按钮要贴 Excalidraw 风格 ②支持自选多篇回答生成 ③学习路线生成不出
- T3 根因：路线图链路 22-110s，Vercel Hobby 函数默认 10s 超时掐断 SSE（本地 dev 无此限制所以此前 E2E 全绿没暴露）；maxDuration=300 修复，生产实测 23.2s 出图
- T1：导出改包围盒自适应 2x（E2E：PNG 2291×2002 ≥ 内容 1080×937×1.9）；按钮 Island 化（复用 Excalidraw surface 变量）
- T2：找回答（/api/search）→ 勾选 → 生成所选（items 直传，缓存键隔离）；E2E 全流程绿
- 注意坑：exportToBlob 的 getDimensions 在给 maxWidthOrHeight 时会被忽略；scale 要配合 width/height 手动翻倍才是真 2x
- 交付：commit e82fdc9 推送，生产部署 Ready，roadmap 生产实测通过

## Session 5 — 2026-09-12（Phase 7: 用户反馈修复轮）— complete
- 上轮交付（commit 1e1c38e，已推 GitHub Laurc2004/kanshan-maps + Vercel 生产 kanshan-maps.vercel.app，Git 集成已连）
- 用户反馈 5 项：①顶栏左右栏按钮位置交换 ②导出画板→导出图片 ③图展示不全/层叠 ④列表只显示 20 条 + 知乎素材→知乎回答 ⑤看山助手仍改不了图
- T1 布局引擎 v2：层叠三条根因（autoResize 不换行/放射坐标重叠/旋转出框）→ wrapText 预折行 + 动态卡高 + 网格布局；E2E 断言 6 卡零重叠
- T2 Agent 改图：后端 curl 正常 + 前端 E2E 内容比对 PASS（之前按元素数断言是误报，改标题本来就不变数量）；真实原因是旧布局层叠让变化不可见；补修挂载竞态守卫（apiRef.current !== api 停旧轮询）
- T3 素材/助手按钮顺序交换；T4 exportToBlob PNG（E2E 真实下载 前端入门.png）；T5 热榜 30 条（curl 确认）+ tab 改名知乎回答（搜索上限 10 条是知乎 API 硬限制）
- 验证：lint 0 错 / build 13 路由 / E2E 三项全绿 page errors 清零 / 热榜 30 / 导出下载真实事件
- 待提交：git commit + push → Vercel 自动部署

## Session 1 — 2026-09-11
- 产品定位讨论定稿：「一图看山」知识炼金场赛道，观点对照图 + OAuth 登录 + 关注答主高亮
- 创建仓库 ~/Documents/code/kanshan-maps（git init -b main）
- 下载官方 skill 包 → docs/zhihu-skill/（zhihu 0.5.3-beta）
- 已读：SKILL.md（CLI 能力总览）、hackathon.md（赛程/OAuth/提交检查）
- 创建 task_plan.md / findings.md / progress.md
- 待办：读 4 份 API reference → git 基线 commit

## Session 1 (续) — 2026-09-11
- 读完 hackathon-oauth.md / user-api.md / http-api.md / hackathon-content-api.md，要点回填 findings.md
- Phase 1 complete；git commit 计划中
- 关键发现：zhihu_search Count 上限 10；直答模型 zhida-fast-1p5；OAuth 回调参数为 authorization_code；答主高亮只能按昵称匹配

## Session 3 (续) — 2026-09-11（Phase 5: Vercel 部署）
- vercel link 创建项目 liurc2004/kanshan-maps；12 个环境变量（sensitive 不支持 development 环境，dev 用普通方式添加）
- vercel deploy --prod → 固定域名 https://kanshan-maps.vercel.app 上线
- 生产验证：/api/generate 真实数据（"考研还是就业" 4 立场 10 素材）；/api/auth/me 正常；OAuth 未配置时友好 503；Playwright UI 回归全过（三栏/图片/背景色/登录按钮，无 pageerror）
- 待办：ZHIHU_APP_ID/APP_KEY 分配后填 Vercel 环境变量 + OAUTH_REDIRECT_URI（须与活动页登记一致）→ 真实 OAuth 联调

## Session 3 — 2026-09-11（Phase 4: 知乎账号打通）
- AGENTS.md 重写再次被权限拦截（用户未响应 approval 弹窗）→ 放弃直接写，项目约定继续维护在 task_plan/findings/progress
- 新增 src/lib/session.ts：HMAC-SHA256 签名 cookie 会话（WebCrypto，无状态，7 天过期）；单测 roundtrip/篡改/垃圾/空 全 PASS
- 新增路由：/api/auth/login（302 authorize + state cookie）、/api/auth/callback（换 token + 写会话 + 5 种失败重定向）、/api/auth/me、/api/auth/logout、/api/me/followees（分页 50×4、30min 缓存、未登录 401）
- 前端：顶栏登录按钮（ball.gif）↔ 已登录态（idle.gif + 关注人数 + 退出）；auth_error 参数 → 琥珀色提示条 + URL 清理
- 关注高亮链路：登录 → 拉 followees → 昵称归一化 → followeesRef → graphToScene(g, followed) ★ 高亮重绘
- 修复 React 19 lint 新规：渲染期写 ref（followeesRef.current = followees）→ 事件/effect 内赋值；effect 内同步 setState → queueMicrotask
- 验证：lint 0 错；build 11 路由全过；OAuth 降级行为（503 友好文案/401/307 重定向）；UI 回归无 pageerror；E2E 生成+对话改图无回归
- 遗留真实联调门：ZHIHU_APP_ID/APP_KEY 未分配（外部阻塞），.env.example 已加占位

## Session 2 — 2026-09-11（产品化重构）
- 用户反馈：原始需求未跑通感 + 样式问题；新需求：Agent 连续对话改图 + 专业 UI + 刘看山素材
- 现状盘点：/api/generate 真实数据链路其实是通的（curl 验证 "AI会取代程序员吗" 返回 2 共识+3 立场+真实链接）；样式问题确认（globals.css 暗色变量污染）
- 素材处理：两个 zip 解压 → public/liukanshan/（6 个透明 GIF 改名 idle/hello/sway/working/sleepy/ball + 3 张三视图 jpg 留档）
- 新增 src/lib/graph-patch.ts（Agent ops 语义层，8 种操作，applyOps 逐条回执）
- 新增 src/app/api/agent/route.ts（graph 无状态回传，服务端 applyOps 校验后返回新 graph）
- 新增 src/components/SourcesPanel.tsx（真实作者头像/点赞数/已炼入标记，item 里实际有 AuthorAvatar/AuthorSignature 字段，findings 已更正）
- 新增 src/components/AgentPanel.tsx（气泡对话、Enter 发送、建议 chips、working.gif 思考态、逐条操作回执）
- 重写 page.tsx 三栏工作台；globals.css 去暗色；layout.tsx 中文 metadata
- 关键 bug：重构后 updateScene 注入 100% 丢失（excalidrawAPI 回调早于 _App 挂载）→ 重试轮询修复，E2E 复现确认
- 验证：lint 0 错；build 通过；E2E（真实浏览器）生成 16 元素+10 素材卡 → 对话"把共识精简成一句话" → 回复+✓回执+画板重渲染 17 元素
- 验证命令记录：npm run lint / npm run build / node /tmp/ui-check.js（结构断言）/ node /tmp/e2e.js（全流程）
- 注：vision_analyze 在当前 custom provider 下 400（要 stream=true），UI 检查走 Playwright 断言替代
- AGENTS.md 重写被权限拦截（approval timeout），待用户确认后补写（当前文件仍只有 nextjs 自动块）


## Session 9 — 2026-09-13（Phase 10 / T11: OAuth 真实凭证接入）— complete
- 用户提供 App ID/App Key 与 Skill 下载地址；官方 URL 包(79,913B)与 Downloads v260815 包 diff 确认后者为更新版（多 deployment-credentials.md 与凭证命名规范），以 v260815 为权威存档 docs/zhihu-skill/zhihu-hackathon/
- 凭证安全边界执行：App Key 只写本地 .env + Vercel Encrypted（dev 环境不支持 sensitive 按既有经验普通添加）；代码/.env.example（本地未跟踪）/planning/日志泄漏扫描 0 命中
- 代码变更：ZHIHU_APP_KEY → ZHIHU_OAUTH_APP_KEY（对齐 Skill 命名规范防串位）；ZHIHU_TOKEN_URL 测试专用覆盖（默认官方端点）
- 测试：新增 oauth-scenarios.test.ts 六场景（node --test 真实 HTTP 打 next start 双实例 3001 配置/3002 空覆盖）6/6 PASS；tsc/lint/harness 回归全过
- 部署：388a6ca 推送；生产 Ready；验证 /api/auth/login 307 → openapi.zhihu.com/authorize?app_id=436&redirect_uri=https://kanshan-maps.vercel.app/api/auth/callback ✅
- 遗留门：真实授权联调需用户本人在 https://kanshan-maps.vercel.app 点击登录并确认知乎授权页（Skill 明确 Agent 不代点）
- 用户已在活动页登记回调（2026-09-13）；curl 验证 openapi.zhihu.com/authorize 对 app_id=436 + redirect_uri=kanshan-maps.vercel.app/api/auth/callback 返回 302 到正常登录页（未报回调非法）→ 登记生效确认
- T11 关闭：用户本人完成知乎授权（16:06 生产日志 login 307 → callback 307 → me 200 → followees 200），OAuth 真实闭环全绿；Phase 10 全部 11 个任务完成


## Session 10 — 2026-09-13（Phase 11: 编排步骤展示 + 综合失败修复）— complete
- 用户报错 `编排 · 出错 知乎回答 KnowledgeGraph title must not be empty`；要求编排步骤在看山助手面板展示
- 根因链：title 回退只是表层；curl 探测 builtin 模型发现 system prompt 无 schema 时模型自创 schema.org JSON（nodes/title 为空）→ 显式 schema prompt 修复
- AgentPanel 新增 HarnessProgress 卡片：分步 ✓ 列表（规划→检索→整理素材→综合→布局→验证）+ 出错时红色卡片就地显示错误
- 验证：synthesizer 5/5、全量回归、tsc、lint 0 错、build 过；本地 SSE 真实问题全链路 8 事件出图（9 节点/8 边/10 引用）；生产部署 d25d937 后 SSE 实测 graph 事件正常（标题正常）

## Session 11 — 2026-09-13（Phase 12: 六项反馈修复）— complete
- F1 找回答独立 searching 态（不动 loading，画板/生成按钮不变）；F2 编排步骤带输入/输出摘要展示在看山助手
- F3/F4 布局逻辑性重做：debate-grid 左右对立+共识区+阵营标签+中轴虚线；全部布局边锚点动态选择+每节点1出1入限流（消除蜘蛛网）
- F5 compare prompt 强制阵营分组（实测：支持考研3/支持就业3/共识2，8节点全分组，4边）
- F6 Agent patch 加固：缺 patch/undefined groupId 友好错误 + ID 白名单注入 prompt（修复 未知分组: undefined / reading 'layout'）
- F8 路线图空白：scrollToContent 重试 8 次；F9 Excalidraw 紫→知乎蓝（theme=light + CSS 变量）
- 验证：layouts 15/15、patch 10/10、全量测试、tsc/lint/build 全绿；真实 debate-grid/roadmap 生成通过；087ebb7 已部署生产

## Session 13 — 2026-09-13（Phase 14: 智能编排提速 + 出图质量/链接修复）— 待提交
- 用户反馈 2 项：①智能编排等待太久，要求流式出图 ②产出图无意义节点多、样式差、节点链接点不动
- H1 提速（预算）：docs 12→8、charsPerDoc 8000→2600（planner MAX + sources BUDGET_MAX 同步）、OpenAI timeout 90s→60s
- H2 提速（两阶段综合）：synthesizeSkeleton（只产骨架：title/groups/labels ≤20字 + 引用，新增 graph-skeleton SSE 事件）→ synthesizeDetails（填 ≤60 字正文，graph-detail 事件）；executor 先推骨架事件让前端立刻落卡片，正文后补；注入式 dependencies.synthesize 兼容旧测试
- H3 质量：prompt 强制 6-12 节点 + 每节点 ≥1 真实引用 + 禁凑数节点；pruneFillerNodes 裁无引用节点并清其边/分组；layouts 展示上限 24→12
- H4 链接：layouts 里 node.citations[0]（内部 id）→ citations 查表得真实 URL；卡片加"↗ 原文"提示行；page.tsx Excalidraw onPointerDown 命中 link 元素 window.open 新标签
- 修复实施中两 bug：骨架顶层 citations 空导致节点引用被校验清空（改从节点 id 推导）；pruneFillerNodes 保底条件写反
- 验证：104/104 测试（新增 4 项：两阶段事件顺序/骨架留空详情补齐/凑数裁剪/骨架 prompt 硬约束）、tsc、lint 0 错、build 全路由、本地 SSE 实测"考研还是就业"（骨架 8 节点先到 desc 0/8 → 详情 8/8；8 卡全带真实知乎 URL + ↗ 原文行、零超宽文本）
- 坑：工具回显打码 apiKey:string → *** 是显示层行为，文件完好，勿当 bug 修
- 待办（已完成）：commit 90ff8ec 已推送，生产部署后实测 SSE 事件链完整（planning→searching→sources→synthesizing→graph-skeleton→synthesizing→graph-detail→laying_out→validating→graph→done），首页 200

## Session 12 — 2026-09-13（Phase 13: 路线图空白根修 + 布局紧凑化）— complete
- E2E 复现路线图空白：legacy 模式 canvas 九宫格全 0%，无报错；根因是 roadmapToScene 展开 block() 返回值而非 .el（无 type 非法元素炸场景），导出走包围盒所以正常 —— 与用户症状完全吻合
- 布局：radial-map 半径改弧长贴合（原 8 节点半径 1280px 巨圈）；concept-map→cluster-board 分簇；evidence-tree 显式右列；prompt 强制所有任务 2-4 分组、以问题为导向
- E2E 验证：路线图 0%→30%+ 有内容、观点图回归 OK；全量测试/tsc/lint/build 绿
- 27e476d 推送 + 生产部署 Ready；含 globals.css 知乎蓝主题（用户改动一并上线）

## 2026-09-13 Phase A~E 实施完成

- Phase A（ff411a2）：用户入口收缩为观点对照/学习路线双模式，Planner 意图专用化，旧 auto/viewpoint 兼容映射
- Phase B（7b9d5f8）：Agent 2.0 — GraphChange 语义协议、规则优先 router、answer/clarify、原子提交、风险分级、preview+commit 两段式（src/lib/agent/）
- Phase C（1f9fc19）：文字/样式类修改保留用户坐标局部重渲染，结构类才全量重排
- Phase D（4752467）：收藏夹→学习路线。/api/me/favlists + /api/me/favlist-contents（token 尾段隔离缓存），roadmap 模式显示收藏夹入口
- Phase A2（c73c807）：来源预处理 — 相关性过滤（关键词+滑动窗口兜底）、内容指纹转载去重
- 验证：129 tests / 123 pass / 0 fail / 6 skip（既有）；lint 0 error；tsc clean；next build 通过
- E2E 冒烟（本地 dev）：/ 200；/api/auth/me 正常；favlists 401 未登录拦截正常；Agent answer 路径走模型成功；emphasize 规则路径 8ms 直改；remove 高风险返回 preview+planId；commit 执行后节点被删除；重复 commit 被拒

## 2026-09-13 修复：回退到成熟单调用链路 + 收藏夹 bug 修复 + 个人中心

- 问题1：Phase A 把 compare/roadmap 从成熟单次调用链路切到 Harness 多阶段编排（骨架→补详情两次 LLM + planner 额外调用），导致生成变慢、样式/质量下降。
  修复：resolveGenerationPath 回退 compare→legacy-viewpoint、roadmap→legacy-roadmap，Harness 仅保留 direct API 实验用途（d147656）。
- 问题2：收藏夹"编排失败 Cannot read properties of undefined (reading 'replace')" — favlist-contents 返回小写字段与 SearchResultItem 大写字段不匹配。
  修复：favlist-contents API 直接返回 SearchResultItem 结构（大写字段），与 generate(picked) 管线对齐。
- 新增：个人中心面板（登录后点用户名展开），展示收藏夹列表（一键生成路线）+ 关注的人说明。
- 验证：129 tests / 123 pass / 0 fail；lint 0 error；tsc clean；build 通过。
- 部署：kanshan-maps-ccqrvx628-liurc2004.vercel.app ● READY (Production)
