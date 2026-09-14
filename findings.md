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

## 追加发现：Phase 24 基线评审（生成图样式问题清单，经元素几何分析确认）

统一渲染器三种图的基线几何分析（scripts/visual-probe.ts 出 SVG 逐元素核对）发现以下影响美观的问题，按严重度排序：

1. **卡片内容稀疏、大量空白**：card() 最小高 280px，但典型内容（1 行标题+2 行正文）只占 ~105px，卡内空白 ~175px。三张图所有卡全顶着 280px 最小高，图变得又高又空（compare 图 880×1670 里超过一半是空白）。卡高应由内容主导，最小高压到 ~130px。
2. **胶囊/椭圆文字被截断**：debate 胶囊 qW=300 固定、文字只给 2 行（长问题标题被「…」截断），而页面大标题反而给 420 宽 2 行 32px。中心问题才是主角，应该完整显示。mindmap 椭圆同样 280 宽 2 行截断。
3. **层级对比不足**：卡标题 20px vs 正文 14px，行高都是 1.25，标题与正文间还有 16px 间距，视觉上标题不突出。正文 #343a40 与标题（彩色 stroke）对比弱。
4. **连线全是直线**（arrow() 2 点）：evidence-tree 思维导图 6 条分支全是直线从椭圆侧缘水平发出，生硬；debate 汇聚线用了曲线但 bend 方向只对左/右区分，远卡（底部共识）连线过长穿过整个画布。
5. **页眉标题折行难看**：header() 标题宽 420 折 2 行，长标题第二行只有一两个字（"…的四种立场"），应该加宽到与图内容同宽或至少 600。
6. **泳道框高低悬殊**：swimlane 4 条泳道高 1080/720/720/360，视觉不平衡（节点数不均时无解，但可以让泳道高度对齐到最高泳道，或者接受现状）。
7. 注意坑：本机 vision_analyze 400（provider 要 stream=true），子代理也撞墙超时——视觉评审走「元素几何分析」代替，SVG 坐标逐元素核对即可发现版式问题。

### 修复落地（同 Phase）
- CARD_H 最小值 280→132；TITLE_MAX_LINES 3→2；标题色 stroke→palette.title；arrow() 改 3 点贝塞尔 bend 0.06 + palette.muted；header 标题宽 900 优先单行。
- debate 胶囊宽自适应 320~520、3 行完整显示、文字完整居中（fixedWidth + 双居中，同 evidence-root-text 手法）。
- mindmap 根容器宽 200~380 自适应、3 行、单行椭圆/多行圆角矩形；swimlane 泳道高度对齐最高一条（先建 laneBoxes 再统一 height = maxLaneBottom - y）。
- 测试断言里箭头 points 解构要从 [start, end] 改为首尾点（3 点贝塞尔会让 points.length===3）。

## 追加发现：Phase 23（椭圆文字居中 + 超链接开关）
- Excalidraw 自由文本元素要靠「文字块中心 == 容器中心」手动对齐；固定偏移量在折行数/字号变化时必偏。容器内居中还需 textAlign:center + verticalAlign:middle。
- 卡片超链接是渲染属性（layouts.ts nodeLink），不是图内容：用户说「去除链接」绝不能删节点/改描述。开关记 metadata.linksEnabled，citations 保留，底部来源索引不受影响。
- 规则路由优先级：「去掉/删掉链接」会同时命中删除/改写正则，LINK_OFF_RE 必须放在 STRUCTURE_RE 判定之前。

## 追加发现：Phase 22（摘要思维导图几何 + Agent 版式切换）
- 思维导图（evidence-tree + metadata.mode=summary）的分支箭头不能用通用 anchors()：根在两列中间，对上下错位卡 |dy|>|dx| 会判成垂直连线从卡顶穿入。思维导图必须强制水平连线、端点贴侧缘中点。
- 根节点垂直居中必须与 positions() 共用同一口径（colTop + 每列实际卡高累计 + gap），不能用「总卡高 + ⌈n/2⌉−1 间距」近似公式——左右列卡数/卡高不均时近似值必然漂移。
- 摘要图的「思维导图」版式由 metadata.mode=summary 决定而不是 presentation.layout（layout 本来就是 evidence-tree）：Agent 切版式必须翻转 metadata.mode，只改 layout 是无操作。
- 前端「保留坐标」局部渲染的豁免条件必须不含 metadata.mode 变化；geometryChanged 要同时监听 presentation 五字段 + metadata.mode。
- 摘要模式看图速查：kind=cluster-board（生成时），presentation.layout=evidence-tree（展示版式），metadata.mode=summary（思维导图开关）——三者各管一段，容易混淆。

## 追加发现：Phase 14（智能编排提速与质量）
- 流式出图不能靠 Excalidraw 元素级流式（每张卡是原子元素），体验上靠两阶段综合：骨架事件先落卡片+标题，详情事件后补正文。
- 骨架阶段输出不带顶层 citations 数组，必须先按节点 citation id 推导 citations 再走 validateCitations，否则节点引用会被白名单清空。
- 卡片 link 必须存真实 URL 而不是内部 citation id；Excalidraw link 元素的点击要用 onPointerDown 的 hit.element.link 自己 window.open（hit.element 是 PointerDownState 内置字段，0.18 类型里可用）。
- Harness 预算收紧到 docs 8 / charsPerDoc 2600 / timeout 60s 后，实测 8 节点图的节点正文全部是有具体论断的真观点，凑数节点消失；charsPerDoc 太长只会让模型慢且产水货。
- 工具回显把 `apiKey: *** 打码为 `***`（凭据保护误判），文件 on-disk 完好，不要当成损坏去修。

## Phase 18 implementation findings
- The page state accepts three graph representations, while `/api/agent` must validate and convert them before Agent 2.0. The contract fix belongs at the route boundary, not in the panel UI, so legacy compare and roadmap requests cannot be rejected as missing graph data.
- `KnowledgeGraph.citations` currently contains citation IDs while legacy graphs contain URLs. Rendering must resolve IDs to URLs and preserve a source index in the canvas/export metadata; never put an internal citation ID in an Excalidraw link.
- Existing board persistence is browser `localStorage`/`sessionStorage`, not cloud storage. Any My Kanshan UI must label this explicitly and must not imply server persistence.
- Official user API documentation confirms followees, favlists, and favlist contents; it does not establish a dynamic follow/like mutation API. The implementation will provide read-only followed-content highlighting and link-out actions only.
- Unified IR stores citation IDs on nodes, so reverse compatibility must resolve those IDs through `graph.citations` before reconstructing legacy roadmap/viewpoint source URLs; returning IDs as URLs silently corrupts legacy Agent input.
- Summary generation is implemented only in `/api/generate/stream` for now: it uses one model call and accepts only HTTP(S) source URLs referenced by valid `sourceIndexes`; the non-stream `/api/generate` route has no summary mode contract and remains unmodified.
- Local-library storage is explicitly device/local-only and namespace-scoped. Namespace sanitization is for key isolation, not authentication; callers must derive the namespace from their authenticated session and must not treat local storage as server persistence.

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


## 提交物料包发现（Phase 28）
- 计划书应以现有 README、已验证的 Harness 架构和知乎 Hackathon 评分维度为事实基础，不写入任何凭据。
- 视觉统一方向已获用户确认：知乎蓝、纸感米白、手绘知识地图、刘看山；封面 16:9，ICON 正方形。
- 交付目录按用户偏好放在 `~/Desktop/一图看山-知乎黑客松提交包/`；图片需在生成后实际检查格式、尺寸和文件大小。

## Phase 27 发现（2026-09-14）
- 看山助手「只能加内容」的根因是五层缺失叠加，不是单一 bug：①GraphChange 契约无 add 系操作 ②router 无新增意图正则 ③clarify 吞咽条件（低置信+无 targetIds）把新增请求（本就无现有目标）拦成追问 ④渲染层装饰箭头（lane-arrow/debate-consensus-link/evidence-root-edge）不来自 graph.edges，任何边操作都碰不到它们 ⑤AgentContext 不给模型 edges 和空 label 分组，模型无从操作
- 装饰连线的可操作化方案：remove_edges 把 "fromId→toId" 记入 metadata.removedEdges，渲染层三类箭头（数据边/lane-N→lane-N+1/question→debate-consensus/evidence-root→节点）统一查该集合隐藏；add_edge 同 key 恢复可逆。lane 删除时派生记录 lane-arrow-N 一并登记/清除
- 大卡片容器方案：add_group label="" → wrap-N 分组 + metadata.groupContainers 登记；渲染层按成员卡包围盒画虚线大框 unshift 置底，不动成员 node.group（泳道/立场归属不变），布局零位移
- 前端局部渲染坐标保留的边界：节点/边/分组数量或归属变化时按 id 映射旧坐标会错位（容器框按错包围盒画出）→ geometryChanged 必须监听数量+归属+removedEdges+groupContainers，这些变化全部走全量重排
- 意图正则教训：「加一」这种宽前缀会吞掉「把第一个立场标为重点」（加一…个），新增意图必须让位 EMPHASIZE/RENAME 且拆「加一(点|条|个|张)」独立分支
