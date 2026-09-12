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

### Phase 8: 用户反馈修复轮 2（导出不全 / 自选素材生成 / 路线图修复）— status: in_progress
- [ ] T1 导出图片修复：当前 getDimensions 固定 1600×900 会裁掉超界内容 → 改为按元素包围盒自适应导出（exportPadding 留边，2x 缩放）；按钮样式改为 Excalidraw Island 风格（白底/圆角8/轻阴影）；Excalidraw 主题进一步贴合站点（纸感背景/字体/圆角）
- [ ] T2 自选素材生成：知乎回答卡支持多选（checkbox）+「生成所选」；新增"找回答"入口（只搜索不生成）→ 用户先挑回答再生成；/api/generate/stream 接受 items 直传跳过搜索
- [ ] T3 学习路线生成不出：先 curl 新关键词复现（排除缓存误判），定位 stream 路由/roadmap 解析/前端模式传递哪一环，修复并 E2E 验证
- [ ] T4 lint/build/E2E 全绿 + 提交推送（Vercel 自动部署）

## Errors Encountered
| Error | Attempt | Resolution |
|-------|---------|------------|
| Excalidraw updateScene 被丢弃（setState on unmounted） | 1 | 回调后 setTimeout 300ms 再注入（已修） |
| Excalidraw 容器高度失控（canvas 顶到 2^25） | 1 | 显式像素高度 + contain:size（已修） |
| Excalidraw updateScene 静默丢失（重构后复发） | 2 | 根因：excalidrawAPI 回调先于内部 _App 挂载，固定 300ms 延迟不可靠 → 重试轮询（250ms×40）直到 getSceneElements>0 |
| Playwright chromium 版本不匹配 | 1 | npx playwright install chromium 重装 |
| vision_analyze 400（custom provider 不支持非流式图片请求） | 1 | 改用 Playwright 程序化 UI 检查（溢出/图片/布局/背景色断言） |
| curl localhost 打到旧 dev server | 1 | 旧进程占 3000，新 server 在 3001；以 process log 为准 |
