# Progress Log — kanshan-maps

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

