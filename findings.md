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

### 关键设计影响
- ⚠️ 答主高亮匹配难题：搜索 Item 只有 AuthorName（昵称），followees 有 Fullname+UrlToken → 只能按昵称字符串匹配，需做归一化（去空格/大小写）
- ⚠️ 直答额度是开发者级总量 100/天（非每用户）→ 生成结果必须缓存（问题→图 JSON），预生成热门问题，演示用预生成数据
- Excalidraw 方案定稿：官方 npm @excalidraw/excalidraw 嵌入（excalidraw-cn 已 3 年未更新，仅借鉴其中文字体注册思路）
