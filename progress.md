## Session 24 — 2026-09-14（知乎黑客松提交物料包）— in_progress
- 用户确认视觉方向（知乎蓝 + 纸感米白 + 手绘知识地图 + 刘看山）；图片生成 gpt-image-2 服务端 502（unknown provider for model gpt-5.4-mini，为上游路由错误），用户指示图片暂缓。
- 计划书第一版被用户否掉（不能突出重点），按用户要求以 README 为基础重写：保留对比表、评审维度对照、Harness 架构图、190 测试等硬数据，新增「一分钟看懂」「评委三分钟体验路径」等抓眼球结构 → `~/Desktop/一图看山-知乎黑客松提交包/一图看山-产品说明计划书.md`
- 新增快速上手与架构说明（30 秒上手 / 生成后操作表 / 架构一图流 / 三个关键设计 / 代码导览 / 本地运行 / 已知边界）与项目简介（一句话 + 短版/口语版/技术版 + 关键词）。
- 待办：图片生成服务恢复后补封面图与 ICON。

## Session 23 — 2026-09-14（看山助手对话与画板会话绑定）— complete
- 根因：AgentPanel 的 messages/history 全是组件内 state，不与任何画板标识关联 → 换图/切画板/清空后旧对话残留。
- 方案：boardSession（每图一会话）贯穿 page → AgentPanel；聊天按会话 id 存 sessionStorage；BOARD_CACHE 增 sessionId，刷新/重启恢复画板时对话跟着回来。
- 细节：换图瞬间在途 /api/agent 回复按 sentSession 丢弃（防串会话）；save effect 跳过会话切换间隙（防旧消息写进新 key）；ref 同步走 useEffect 过 react-hooks lint。
- 验证：agent-chat-store.test.ts 5 用例新增；全量 171 tests（165 pass/0 fail/6 skip）；tsc 0 错；lint 0 error（6 warnings 既有）；build 16 路由；Playwright E2E（dev:3005）三场景全 PASS + 0 pageerror（对话随画板恢复 / 清空后清空 / 新会话不串扰）。generate 新图路径未跑真实生成（知乎 API 配额），与 openSavedBoard 共用同一 setBoardSession 机制。
- 待用户验收后提交。

## Session 22 — 2026-09-14（摘要椭圆文字居中 + 助手超链接开关）— complete
- 椭圆文字居中：evidence-root-text 从固定 +30/+35 偏移改为「文字块中心==椭圆中心」+ textAlign center / verticalAlign middle，折行/密度变化不漂。
- 超链接开关：「去除超链接」原路由进 structure/model 被误当删改内容；新增 set_links 语义变更（metadata.linksEnabled，可逆），LINK_OFF_RE 路由优先级提到删除规则之前；渲染层 nodeLink 读开关（layouts.ts，该文件经并行会话的 renderer 统一重构后已含同名改动，此处为合流）；citations/底部来源索引不动。
- geometryChanged 增加 metadata.linksEnabled 监听。
- 验证命令与结果：
  - `node --test --experimental-strip-types $(find src -name '*.test.ts'|sort)` → 166 tests / 160 pass / 0 fail / 6 skipped（新增椭圆居中×2、linksEnabled strip/restore、set_links 路由×4/应用/校验用例）
  - `npx tsc --noEmit` → 0 错；`npm run lint` → 0 error（6 warnings，src 存留 5 + /tmp 检查脚本 1，后者不入库）
  - `npm run build` → 16 路由通过
  - 真实 API（dev:3005）：「去除超链接」→ changed:true、applied「已去除…（底部来源索引仍保留）」、linksEnabled:false、节点数与描述不变；「恢复链接」→ linksEnabled:true
  - E2E 真实画板（scripts/e2e-mindmap.cjs + /tmp/e2e-links.cjs）：椭圆文字中心偏移 0（root 660,580 == text 660,580）、生成期 3 卡带链接、箭头穿卡/卡片重叠 0、0 pageerror
  - /tmp/e2e-links.cjs、/tmp/agent-link-check.mjs 为临时验证脚本，验证后删除，不入库
- 部署：commit 待提交 → push + vercel --prod → kanshan.space

## 2026-09-13：详细技术方案

- 已写入 `docs/2026-09-13-detailed-technical-implementation-plan.md`。
- 文档覆盖双模式 Harness、来源预处理、模型调用、知乎个性化、Agent 2.0、原子 patch、预览确认、graph version、局部渲染、测试和分阶段实施。
- 本轮只完成方案文档，没有修改业务代码。

## Session 18 — 2026-09-13（知识资产与分享闭环）— complete
- Read the approved Phase 18 scope, tracked planning files, repository rules, current graph/Agent/layout/profile/API code, official user API reference, and installed Next client-component guidance.
- Confirmed working tree contains only the parent-owned Phase 18 addition to `task_plan.md`; implementation will proceed serially in this same worker.
- First implementation gate: reproduce the graph contract at `/api/agent`, then add a boundary normalizer and focused regression tests before UI work.
- Verification repair: `src/lib/harness/compat.ts` now converts citation IDs back to real URLs for roadmap round-trips; this fixed two pre-existing compatibility regressions in the full Node runner.
- Added focused summary parser tests (single source-grounded prompt, URL-backed points only, malformed/source-free rejection) and strengthened local-library tests for account namespaces/capabilities/stable IDs.
- Focused verification passed: `node --test --experimental-strip-types src/lib/summary.test.ts src/lib/local-library.test.ts src/lib/harness/compat.test.ts src/lib/graph-contract.test.ts src/lib/knowledge-assets.test.ts src/lib/presentation-controls.test.ts src/lib/share.test.ts` = 22/22; `npx tsc --noEmit` passed; `npm run lint` passed with 5 existing warnings; `git diff --check` passed.
- Full runner initially found two roadmap citation round-trip failures; the compatibility fix resolved them. Final canonical Node runner: `node --test --experimental-strip-types $(rg --files src | rg '\.test\.ts$' | sort)` = 147 tests / 141 pass / 0 fail / 6 OAuth integration skips.
- Final quality gates: `npm run lint -- --quiet`, `npx tsc --noEmit`, `npm run build`, and `git diff --check` all exited 0; production build emitted 16 routes.
- Local production HTTP/API smoke on `127.0.0.1:3218`: homepage 200, auth/me 200 logged-out, unauthenticated favlists 401, Agent missing graph 400, stream missing question 400.
- Real configured model smoke: compare query `考研还是就业` returned HTTP 200 SSE with 10 real Zhihu sources, a four-viewpoint graph, and `done`; no fake upstream fixture was used.
- Playwright Chromium smoke at desktop 1440×1000 and iPhone 13 viewport loaded compare/roadmap/summary controls and Agent UI with zero page errors. Hermes real-profile browser was unavailable because its Chrome profile databases were locked, so authenticated profile-only UI and a fully automated summary/share click chain were not claimed.
- Production deploy: `npx vercel --prod --yes` completed with `readyState: READY`, deployment `dpl_21AxwiqtAQddV8Fs8Ebw2xgc8rYh`, deployment URL `https://kanshan-maps-dljspkvkc-liurc2004.vercel.app`, and alias `https://kanshan-maps.vercel.app`.
- Public readback: canonical homepage 200 with title `一图看山 — 把知乎回答炼成知识地图`; `/api/auth/me` returns `{"loggedIn":false}`; unauthenticated `/api/me/favlists` returns 401 with `未登录`.
- Vercel build emitted peer-dependency warnings for Excalidraw's Radix React 16-18 peer range, but build completed and deployment reached READY.


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

## Session 22 — 2026-09-14（Phase 24: 生成图/修改图样式重设计 Excalidraw 最佳实践）— 待提交
- 基线评审：visual-probe.ts（新增，元素→自绘 SVG→rsvg PNG）出三种图，几何分析定位 7 项问题；本机 vision_analyze 400（stream 限制）、3 个评审子代理撞同一堵墙超时 1 个，改用 SVG 坐标逐元素核对完成评审
- 实施（全部在 harness/layouts.ts，图结构/Agent 协议未动）：
  - 卡片：CARD_H 最小 280→132（内容主导，消灭大面积空白）、PAD 20→18、标题 3 行→2 行、标题色 stroke→palette.title 提升层级、标题-正文间距 16→10
  - 箭头：arrow() 2 点直线→3 点贝塞尔（bend 0.06，roundness type 2）+ 颜色统一 palette.muted；debate 汇聚线保持 curveArrow 0.12
  - 页眉：标题宽 420→900 优先单行（修「第二行只剩一两个字」），summary 位置随行数动态
  - debate 胶囊：宽自适应 320~520（按问题文字宽）、文字 3 行完整显示不截断、fixedWidth + 双居中
  - mindmap 根容器：宽 200~380 自适应、3 行完整显示、单行椭圆/多行圆角矩形切换
  - swimlane：泳道高度对齐最高一条（等高彩色列，不再 1080/720/360 高矮悬殊）
- 验证：layouts 20/20（修一处断言：箭头 points 3 点解构）、全量 165 tests 0 fail、tsc 0 错、lint 0 error、build 过；E2E 真实生成（dev 3005）：28 元素、6 卡 h=132、胶囊 320×72 文字完整未截断且居中、标题单行、6 箭头全 3 点、0 pageerror，7 项断言全 PASS
- 待办：提交推送 + 生产部署验证

## Session 21 — 2026-09-14（Phase 22: 摘要思维导图几何根修 + Agent 版式切换）— complete
- 用户反馈：摘要思维导图箭头重叠/压卡、中心卡不垂直居中；看山助手改不了结构/样式
- 根因：①思维导图分支箭头走通用 anchors()，上下错位卡被判垂直连线从卡顶穿入 ②根 y 用近似公式与 positions() 口径不一致 ③「换成思维导图」只重设 presentation.layout（摘要图本来就是 evidence-tree，无操作），没翻转 metadata.mode=summary ④geometryChanged 没监听 metadata.mode，版式切换被局部渲染吞掉
- 修复：mindmapAnchor 强制水平连线贴侧缘中点；根 y 从实际 boxes 算列高精确对齐较高列中心；新增 set_mode 变更（types/apply/router/decide + 模型 prompt）；geometryChanged 加 metadata.mode 监听；清理 palette-repro 探针（失效 ts-expect-error 卡 build）
- 验证：159 tests（153/0/6）· tsc 0 错 · lint 0 error · build 16 路由 · 几何脚本穿卡 0/碰撞 0 · E2E 真实 UI 生成画板断言（rootOffset=0、6 箭头贴侧缘、零穿卡、0 pageerror）· /api/agent 实测三场景全生效

## Session 20 — 2026-09-14（Phase 20: 八项反馈修复轮）— 待用户验收
- 诊断：glm 5.3 子代理只读报告 6 项根因；树上 Phase 19 未提交改动已覆盖部分诉求（画布来源文字、摘要 evidence-tree 雏形）
- 实施：摘要思维导图左右对称分支+根居中；debate-grid 共识区重叠修复；分享/保存/版式/颜色四控件统一嵌入 Excalidraw renderTopRightUI（新 BoardControls.tsx，删 SharePanel/PresentationControls）；Agent 视觉变化判定扩至 palette/stroke + 模型 prompt 补 layout；顶栏新增个人中心入口 + ProfileCenter 三 tab 重写；知乎 URL 直达（isZhihuUrl/parseZhihuArticleHtml/fetchZhihuArticleByUrl + stream 分支 + 输入框自动切模式）
- 验证：npx tsc --noEmit 0 错；node --test 全量 152 tests / 146 pass / 0 fail / 6 skip（新增 summary 思维导图布局 + zhihu-url 4 项）；npm run lint 0 error（4 warning 均为既有 docs/与 router.ts ctx 未用）；npm run build 16 路由全过；本地 next start 3218 首页 200；URL 分支冒烟：假文章 ID → 友好错误事件「知乎返回 403，暂时读不了这个链接」
- 外部限制（如实记录）：知乎 WAF 对服务器端直抓内容页一律 403（curl 直测同样 403，zhuanlan 与 api/v4 都被拦）。链接解析/summary 管线代码与离线测试就绪；生产可用性取决于能否经官方 API 或带登录态环境取正文
- 终端探测命令两次被审批拦截，未重试；生产部署与提交等用户验收后进行

## Session 20 续 — 2026-09-14（域名切换 + Phase 20 上线）— complete
- 域名 kanshan.space：本地 .env、Vercel 三环境 OAUTH_REDIRECT_URI（remove+add 重置）、README 全部切换；旧域 kanshan-maps.vercel.app 仍 200（Vercel 自动 alias 保留）
- 提交 76cbb8c（17 文件，+571/-251）推送 origin/phase18-release
- 生产部署：dpl → kanshan-maps-7h5hcc61p-liurc2004.vercel.app readyState READY
- 生产验收：kanshan.space 200 + 标题正确；/api/auth/login 307 → authorize 且 redirect_uri 已是 kanshan.space/api/auth/callback（与知乎活动页登记一致）；/api/auth/me 200；热榜 API 正常返回；URL 直达分支在生产生效（假 ID → 友好 403 错误事件，符合预期）
- 注意：本轮 OAuth 环境变量重置后，真实登录联调需用户在新域名点一次知乎授权确认闭环

## Session 20 续2 — 2026-09-14（kimi-k3 样式审查应用 + 二次上线）— complete
- kimi-k3 只读审查返回 20 条建议；筛选应用 14 条（其余为过度设计或与现有约定冲突被否）：Island 包装画板控件、appearance-none 自定义 chevron 的样式化 select、控件统一 h-7、深色 toast 反馈、Profile tab 改素材栏同款胶囊、图标收起钮、收藏夹 chip 截断、空态两级文案、9px 字号修正、顶栏个人中心未登录隐藏并去文字（与用户胶囊不再重复）
- 未采纳：#5 小屏隐藏文字（renderTopRightUI 自身有响应式）、#19 移除用户胶囊入口（保留双入口）、#4 全局 font 覆盖（font-family: inherit 已足够）
- 验证：tsc 0 错 / 152 tests 0 fail / lint 0 error / build 16 路由过
- 提交 0547f81 推送；生产部署 READY；kanshan.space 200、OAuth redirect_uri 指向新域名

## Session 20 续3 — 2026-09-14（移除知乎链接抓取功能）— complete
- 用户决策：链接解析存在版权风险，整链路移除
- 删除：zhihu.ts 的 isZhihuUrl/parseZhihuArticleHtml/fetchZhihuArticleByUrl；stream 路由 URL 分支；输入框粘贴自动切摘要逻辑与 placeholder 提示；zhihu-url.test.ts
- 验证：tsc 0 错 / 148 tests（142 pass 0 fail 6 skip）/ lint 0 error / build 过
- 提交 5074819 推送；生产 READY；线上实测：粘贴链接不再走抓取分支，回到正常关键词搜索链路（sources 事件正常返回）

## Session 20 续4 — 2026-09-14（画板控件简化）— complete
- 用户三项决策：①版式切换渲染不稳定 → 整个移除（applyPresentation → applyPalette，layout 锁定为图自身 kind）②「一键分享至知乎」按钮删除，只留「保存图片」（不再挤在一块）③颜色下拉改为自定义 dropdown（色板圆点+chevron+选中勾，点击外部/Esc 关闭），非原生 select
- 验证：tsc 0 错 / 149 tests（143 pass 0 fail 6 skip）/ lint 0 error / build 过
- 提交 bf2c4a4 推送；生产 READY；kanshan.space 200

## Session 14 — 2026-09-14（Phase 15: 五项反馈修复）— complete
- B1 收藏夹列表去 max-h-72 完整展示；打开收藏夹不再全选
- B2 顶栏独立「我的看山」入口；名字标签纯展示
- B3 个人中心去除关注 tab
- B4 换色变版式根因：legacy 渲染器 nid() 含 Date.now() 随机后缀，changePalette 按 id 映射坐标全 miss；改确定性 id（scope#seq+内容哈希+稳定 seed），回归测试断言两次渲染 id 逐元素相等
- B5 SourceIndex max-w min(62vw,100%-16rem) 不与右下控件重叠
- 验证：全量测试/tsc/lint/build 绿 + E2E（我的看山入口可见、换色无页面错误、来源索引与控件 no-overlap）；1a9bf05 已部署生产

## Session 15 — 2026-09-14（收藏夹固定生成底栏）— complete
- 收藏夹操作区从列表尾部改为面板固定底栏（shrink-0 border-t，不随列表滚动），单个「生成 · 已选 N 篇」按钮
- 点击弹 GenerateModeDialog 三选一：观点对照 / 学习路线 / 文章摘要（新支持 compare 模式从收藏夹生成）
- 验证：tsc/lint/build 绿；E2E 主流程生成无回归（登录态交互由编译保证）；1aed96c 已部署生产

## Session 23 — 2026-09-14（Phase 25: 生成图样式第 2 轮）— 待验收
- 用户验收 Phase 24 不通过：①汇聚箭头重叠压卡/单一黑色/结构乱 ②共识要做成最下面一张通栏长卡 ③所有图页眉标题描述不居中且截断
- layouts.ts：新增 curveArrow3 显式控制点 3 点贝塞尔；debate 箭头起点取卡内侧边缘中点、控制点紧贴正上方，弧线贴列间隙走廊垂直上升到顶再汇入胶囊同侧 1/4 处；按列换色（蓝/橙）；单列特例统一走右缘+终点甩卡右缘外 40px（E2E 贝塞尔轨迹逐段采样断言零压卡）
- compat.ts：viewpointToKnowledgeGraph 不再把所有观点塞同一 group——stanceGroup 奇偶交错分 stance-1/stance-2 两组形成左右对立（这是「结构没有逻辑性」的数据层根因）；knowledgeGraphToViewpoint 反转兼容 stance-* 前缀
- layouts.ts：共识合并渲染成底部通栏长卡（多条编号横排）+ 胶囊→共识一条绿色连线；立场列头标签（debate-stance-N）
- layouts.ts header：标题/描述居中（textAlign center、文本框中心对齐 x=590）、28px/1100 宽/3 行完整显示不截断
- 验证：全量 166/166（layouts 21 + compat roundtrip 适配新分组）/ tsc 0 / lint 0 error / E2E 真实生成 2 组对立、箭头零压卡、页眉居中完整全 PASS
- 待办：用户验收 → 提交推送 + 生产部署

## Session 24 — 2026-09-14（Phase 26: 观点对照去箭头 + 卡片文字全显示）— 待部署
- 用户反馈：观点对照干脆去掉箭头；卡片内文字要完全展示清楚，可拓长拓宽卡片
- layouts.ts：移除 debate-link 汇聚箭头（含 curveArrow3 helper），只保留胶囊→共识横幅绿色连线；归属表达靠列头立场标签+按列分色
- layouts.ts：card/cardHeight 加 fullText 参数——debate 卡片标题/正文取消行数上限、卡高按完整内容撑开；positions debate 分支卡片加宽 320→400（两列+140 间隙=940）
- 验证：全量 166/166、tsc 0、lint 0 error、build 过；E2E 真实生成断言全 PASS（无箭头/卡宽 400/卡文字零截断/2 组对立/共识通栏/页眉居中）

## Session 25 — 2026-09-14（刘看山常驻动图改静态 + 轻微漂浮）— deployed
- 用户反馈：左上角 logo gif 要换静态图；中间（空状态 hello）和右边（助手空状态 sway）两张常驻 gif 视觉疲劳
- magick 抽首帧生成 static-sway/static-hello/static-idle.png（320×320 透明，原图为黑白卡通，灰度 PNG 无损）
- page.tsx：header logo sway.gif→static-sway.png；画板空状态 hello.gif→static-hello.png；AgentPanel.tsx 空状态 sway.gif→static-sway.png，两处大图加 animate-[float-soft_4s_ease-in-out_infinite]
- globals.css 新增 float-soft keyframes（translateY -6px 缓慢漂浮，存在感远低于动图）
- 保留：working.gif（生成中 loading，非长期显示）、idle.gif（登录态/弹窗小图标）
- 验证：tsc 0 / lint 0 error / build 过；6fea11d 已部署生产（curl 200 + 首页 HTML 含 static-*.png）

## 2026-09-14 Phase 27: 看山助手结构理解修复（增删节点/连线/分组容器）
- 诊断：GraphChange 无 add_node/add_group/add_edge/remove_edges；router 无新增意图正则且 clarify 条件吞掉无目标的新增请求；debate/swimlane 装饰箭头不走 graph.edges 无法被任何操作触及；AgentContext 不给模型看 edges
- 改动：agent/types.ts +4 GraphChange；apply.ts validate+risk+apply（add_node 确定性 ID、add_group 空 label=容器分组入 metadata.groupContainers、remove_edges 记 metadata.removedEdges 支持装饰 ID、add_edge 恢复可逆）；router.ts +ADD_NODE/EDGE_OFF/EDGE_ON/EDGE_RESTORE/CONTAINER 正则 + clarify 吞咽条件放宽 + 分类器 prompt；decide.ts CHANGE_INSTRUCTION 补 4 类型 + edges/容器分组白名单注入 + 高风险预览摘要补 remove_edges；layouts.ts 容器大框渲染（包围盒+虚线置底）+ removedEdges 过滤三类箭头（数据边/lane-arrow/debate-consensus-link/evidence-root-edge）+ 限流递补；page.tsx geometryChanged 补节点/边/分组数量+removedEdges+groupContainers+分组归属变化全量重排 + structural 话术正则扩充
- 验证：tsc 0 错；lint 0 error（6 既有 warning）；node --test 190 tests（184 pass / 0 fail / 6 OAuth skip）；npm run build 过；git diff --check 净
- 真实 API 实测（本地 next start + builtin 引擎）：①「学习路线只生成了三点，再加第四点：工程化与部署」→ 新增节点成功 ②「大卡片包住 HTML/CSS 和 JS 核心」→ wrap 容器包住 2 卡、stage 归属不变 ③「去掉第一站到第二站的箭头」→ preview 确认→commit→removedEdges=['lane-0→lane-1'] ④「恢复箭头」→ add_edge lane 装饰恢复、removedEdges 清空、graph.edges 无污染 ⑤「把 React 和工程化连起来」→ add_edge 成功 ⑥模糊「再补充一点」→ 模型产真实内容「版本控制（Git）」非占位 ⑦move_node 回归正常
- 渲染层集成断言：新卡渲染、容器框包住成员卡、被删 lane 箭头隐藏、全元素 type/id 齐全
- 修的 bug：ADD_NODE_RE「加一」误吞「把第一个立场标为重点」→ 拆独立分支+让位规则；add_edge 恢复数据边不补回 edges → 已修
- 待办：用户验收后提交推送
- 交付：commit 24d9060 已推 origin/main；vercel deploy --prod → dpl_687nUN7wU2SyxdU6WFu4y4uNBaoX，kanshan.space / kanshan-maps.vercel.app 均 200
