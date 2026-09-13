# Findings — 一图看山（kanshan-maps）

## 赛事关键事实
- 提交窗口：2026-09-13 10:00 → 09-15 10:00，逾期不补；报名 09-13 00:00 关闭
- 必交：可运行线上 Demo + 产品说明计划书（初审重点）；选交加分：代码仓库 + 演示视频
- 初审权重：AI场景价值 40% / 创新度 25% / 完成度 25% / 设计感 10%
- 人气奖 = 项目广场(9.13-9.23)点赞+登录使用量+评论 → OAuth 登录数重要，9.13 后尽早占位发布
- OAuth：创建黑客松项目后活动页分配 app_id/app_key；回调地址必须在活动页登记且与 redirect_uri 完全一致 → 先部署拿域名
- 提交前 7 条检查在 docs/zhihu-skill/zhihu/references/hackathon.md 底部，凭证不得进仓库/前端/日志

## API 额度（黑客松文档口径，两份文档不一致：wiki 版搜索 5000/天、手册版 1000/天，以实际响应为准）
| 能力 | 端点 | 额度 |
|---|---|---|
| 热榜 | GET /api/v1/content/hot_list | 100/天 |
| 直答 Agent | POST /v1/chat/completions | 100/天 ⚠️ 核心瓶颈 |
| 知乎搜索 | GET /api/v1/content/zhihu_search | 1000~5000/天 |
| 全网搜索 | GET api/v1/content/global_search | 1000~5000/天 |
| 关注流 | GET /openapi/feed/following | OAuth 用户级 |
| 关注/粉丝列表 | GET /openapi/user/following, /followers | OAuth 用户级 |
| 知乎故事/知识 | 见 hackathon-content-api.md | 赛事专用 |

## 设计决策
- 产品名「一图看山」；仓库 kanshan-maps；Excalidraw 叙事定位为"手绘知识画板（开源画布引擎）"，不主打海外 IP
- 核心图结构：中心=问题；左/下=分歧区（各答主立场+论据，节点带原文链接）；上/右=共识区；高亮=登录用户关注的答主
- 冷启动绕额度：预生成热门问题地图 + 应用层缓存（问题→图 JSON 落库/落盘）
- 刘看山素材包（三视图/动态 zip）可用于 UI 点缀，待下载

## API 协议要点（已读官方 skill 文档确认）

### OAuth 登录流（hackathon-oauth.md）
1. 发起：`GET https://openapi.zhihu.com/authorize?redirect_uri={uri}&app_id={id}&response_type=code`（可带 state）
2. 回调主参数是 `authorization_code`（兼容 `code`），无授权码即停止
3. 换 Token：`POST https://openapi.zhihu.com/access_token`，form-urlencoded：`app_id / app_key / grant_type=authorization_code / redirect_uri / code=<authorization_code>`
   ⚠️ 表单字段名是 `code` 不是 `authorization_code`；成功判断以响应含 `access_token` 为准（业务码可能是 20000）
4. 代表用户调数据 API 三件套 Header：`Authorization: Bearer <Access Secret>` + `X-OAuth-Token: <oauth_token>` + `X-Request-Timestamp: <秒级>`
   ⚠️ App Key 不能出现在任何数据请求里；Token 过期不回退到本人账号

### 用户数据 API（user-api.md，base https://developer.zhihu.com）
- `GET /api/v1/user/contents`：ContentType=all/answer/article/zvideo/pin/question，Limit≤50
- `GET /api/v1/user/followees`：FolloweeItem = Fullname / UrlToken / Url / AvatarUrl / Headline / FollowerCount（Limit≤50，Offset 分页）
- 收藏：/user/favlists → /user/favlist_contents（FavlistUrlToken）；/user/collections 近期收藏
- 错误码：0 成功 / 10001 参数 / 20001 鉴权 / 30001 频率 / 30002 配额 / 90001 内部
- 协议待确认：无 scope/refresh/revoke 协议 → Token 过期只能重走授权

### 内容 API（http-api.md）
- zhihu_search：GET，Count ⚠️最大 10（单次搜索最多 10 条，观点对照图素材上限即 10）
- global_search：GET，Count 最大 20，支持 Filter 高级语法（host/publish_time，AND/OR）
- hot_list：GET，Limit 最大 30，仅问题+文章
- 直答：`POST https://developer.zhihu.com/v1/chat/completions`，仅支持 model/messages/stream 三字段
  - 模型：zhida-fast-1p5（快，用于结构化提取）/ zhida-thinking-1p5 / zhida-agent
  - 支持 stream=true（SSE，含 : keep-alive 心跳）；OpenAI 兼容响应结构
- quota：GET /api/v1/quota 可查当日剩余额度（不消耗额度）→ 可做运维监控

### 黑客松内容接口（hackathon-content-api.md，无需鉴权）
- 故事/知识 列表+详情：`https://api.zhihu.com/km-indep-home/hackathon/v2/{story|knowledge}/{list|<work_id>}`
- 知识接口可用于"学习路线图"场景的补充素材（P1）

## 追加发现：Phase 14（智能编排提速与质量）
- 流式出图不能靠 Excalidraw 元素级流式（每张卡是原子元素），体验上靠两阶段综合：骨架事件先落卡片+标题，详情事件后补正文。
- 骨架阶段输出不带顶层 citations 数组，必须先按节点 citation id 推导 citations 再走 validateCitations，否则节点引用会被白名单清空。
- 卡片 link 必须存真实 URL 而不是内部 citation id；Excalidraw link 元素的点击要用 onPointerDown 的 hit.element.link 自己 window.open（hit.element 是 PointerDownState 内置字段，0.18 类型里可用）。
- Harness 预算收紧到 docs 8 / charsPerDoc 2600 / timeout 60s 后，实测 8 节点图的节点正文全部是有具体论断的真观点，凑数节点消失；charsPerDoc 太长只会让模型慢且产水货。
- 工具回显把 `apiKey: string` 打码为 `***`（凭据保护误判），文件 on-disk 完好，不要当成损坏去修。

## 追加发现：Phase 10
- Harness 契约必须严格以批准设计为准：intent 是 compare/roadmap/timeline/concept-map/argument-map/summary-board，source 是按优先级的数组，layout 仅使用 6 个确定性模板。
- Task 2 首次实现虽然 17 项测试全绿，但测试编码了错误词汇，说明“测试通过”不能替代规格审查；进入 Adapter 前必须先修正类型契约。
- Task 3 子代理超时后保留了部分未提交实现；必须先检查工作区和现有测试，再进行定向收尾，不能重复覆盖或丢弃已完成代码。
- Task 3 审查发现：仅用 Promise 超时会停止等待但不会取消底层请求；Source Adapter 必须贯通 AbortSignal，collectSources 还需在执行边界重新规范化预算和校验知识 work_id。
- Task 3 最终审查补充：主收集 API 也必须接受外部 AbortSignal；跨来源去重应使用 ContentID 元数据而不是带 source 前缀的内部 ID；malformed 输入需被拒绝并留下错误记录。
- Task 3 最终复核确认四项加固均通过；仓库没有 `npm test` script，使用 Node 原生 test runner 验证，不能把不存在的 npm test 当作失败。
- OAuth 新任务：用户提供了知乎 Hackathon App ID/App Key；App Key 属于敏感凭据，只能注入本地或 Vercel Sensitive 环境变量，禁止写入源码、日志、planning 文件和提交。用户指定的 Skill ZIP 当前提示 `no content extracted`，需下载后核验压缩包并以官方 Skill 内容为准。
- Task 4 执行边界：Synthesizer 必须以 SourceDocument 集合作为唯一事实输入，citation URL/id 不在输入白名单时剔除；结构修复只能补稳定 ID 和删除悬空 edge，不能编造来源。
- Task 4 验证发现：安全 Prompt 放在 system message，测试必须检查全部 messages；只检查 user message 会产生假失败，不能因此降低 data-only 边界。
- Task 5 约束：`mode=auto` 走 Harness，旧 `viewpoint`/`roadmap` 保持兼容；SSE 直接转发 Harness 阶段事件，缓存 key 必须包含 Harness 模式和引擎配置。
- Task 6 中间状态：统一 IR 布局实现必须同时满足 Excalidraw 元素字段完整、碰撞无重叠和旧 graph 兼容；超时后的未提交代码不得直接视为完成。
- Task 6 审查发现：element ID 不能只依赖清洗后的 node ID，必须加入原始 ID 的确定性 hash；兼容转换不能依赖运行时 sidecar 保存被截断的旧 graph，统一 IR 必须自包含可还原数据。
- Task 6 复核补充：JavaScript `for...of` 得到 Unicode code point，但 `charCodeAt(0)` 只取 high surrogate；稳定 ID hash 必须按完整 code point 或 UTF-16 code unit 遍历，避免非 BMP 节点 ID 碰撞。
- Task 6 最终方案：节点/graph `metadata` 保存兼容所需字段，统一 IR 经 JSON 序列化后仍可还原；元素 ID 使用清洗片段 + 完整 UTF-16 哈希，覆盖 ASCII 截断和非 BMP 两类碰撞。
- Task 7 审查发现：布局测试必须验证语义而不只是“有元素/不碰撞”；evidence-tree 要断言根节点到 child 的连线和层级位置，presentation 缺省时要断言 plan.style 生效。
- Task 7 最终实现：evidence-tree 语义由根节点到每个 child 的显式箭头保证；布局测试同时验证 child 相对 root 的位置和连线数量，避免仅凭元素数量误判。
- Task 8 约束：Agent 只能输出 KnowledgeGraph 受限 Patch，不能输出 Excalidraw 坐标或直接改 citations；legacy graph 保留旧 graph-patch 路径，统一 graph 修改后必须重新走 adaptive render。
- Task 9 UI：Harness 阶段事件通过独立 `HarnessStatus` 组件映射为中文标签；来源文档通过 `sourceType` 映射为知乎回答/全网搜索/知乎知识/自选资料/热榜/直答，避免将混合来源误显示为单一知乎结果。

## 产品化重构（Phase 3）设计决策 — 2026-09-11

### 产品定位再思考
- 一句话：「问题观点的可视化炼金工作台」—— 不是一次性的"生成图"工具，而是用户与 AI 一起打磨观点地图的工作台
- 核心体验闭环：生成（搜索+提取）→ 对话修改（Agent）→ 手动精修（Excalidraw）→ 导出分享
- AI Agent 的差异化：对"图"做操作而不是对"文本"做改写，每次操作可解释（"我把 X 立场标为重点"）

### UI 布局（桌面优先）
- 三栏：左=知乎上下文（原始回答列表、答主、可点链接）/ 中=Excalidraw 画板（主舞台）/ 右=AI Agent 对话
- 移动端降级：画板全屏，左右面板为抽屉
- 设计基调：知乎蓝 #0066FF 为强调色，纸感米白背景 #FAFAF7，手绘字体（Excalidraw fontFamily 3 = 手写体）
- 刘看山素材用法：空状态=hello.gif、生成中=working.gif、Agent 头像=idle.gif、无结果=sleepy.gif

### Agent 改图语义层（graph-patch.ts）
- Agent 不直接生成 Excalidraw 元素，而是输出操作序列（JSON ops），前端应用后重新布局
- 操作类型：add_viewpoint / update_viewpoint / remove_viewpoint / emphasize_viewpoint / set_consensus / add_note / relayout
- 好处：可解释、可撤销（ops 快照）、防幻觉（操作落在真实 graph 节点上）
- graph 在请求 body 中回传，服务端无状态（避免会话存储）

### 已验证事实
- /api/generate 全链路真实数据验证通过（2026-09-11）："AI会取代程序员吗" 返回 2 共识 + 3+ 立场，含真实作者名与链接
- 页面 dev 渲染 OK（curl 200）
- 样式问题：globals.css 有暗色 media query 会把背景刷成 #0a0a0a 与组件硬编码亮色冲突 → 需移除

