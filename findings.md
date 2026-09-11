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

## 待确认（读 references 后回填）
- [ ] hackathon-oauth.md：授权端点/Token 交换参数/scope
- [ ] user-api.md：OAuth 用户数据鉴权组合（token 换数据的方式）
- [ ] http-api.md：直答/搜索服务端调用的签名（Access Secret 鉴权细节）
- [ ] hackathon-content-api.md：知识接口是否可用于学习路线图场景
