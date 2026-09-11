# 一图看山（Kanshan Maps）— 知乎黑客松 2026·校园新锐季

> 把知乎问题下的多元回答，一键炼成一张可编辑的手绘知识地图（观点对照图）。
> 仓库：~/Documents/code/kanshan-maps ｜ 赛道：📚 知识炼金场 ｜ 截止：2026-09-15 10:00

## Goal

知乎 OAuth 登录 → 输入问题/关键词 → 知乎搜索拉取 Top N 回答 → 直答 Agent 提取各方论点/证据/立场 → 生成 Excalidraw 手绘观点对照图（中心=问题，共识区+分歧区，节点可跳回原回答，高亮"我关注的答主"）→ 用户可继续编辑画板 → 导出/分享。

### 评分对照（初审：AI场景价值40% / 创新25% / 完成度25% / 设计10%）
- 场景价值：只有知乎做得出的场景（一个问题 N 个立场的可视化），登录数计入人气奖
- 创新度：观点对照 ≠ 通用"文章转思维导图"红海
- 完成度：Next.js + @excalidraw/excalidraw 官方 React 组件，48h 内可交付

### Confirmed Scope
- P0 OAuth 登录 + 兴趣画像冷启动（关注流 → 直答归纳 → 推荐地图）
- P0 观点对照图生成（搜索 + 直答 + Excalidraw 画板，可编辑可导出）
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
- [ ] 直答 Agent 的 HTTP 调用方式：走服务端代理（Access Secret 在后端），等读 http-api.md 确认

## Phases

### Phase 1: 侦察与地基 — status: complete
- [x] 下载解压官方 skill 包到 docs/zhihu-skill/
- [x] 读 SKILL.md + hackathon.md
- [x] 读 hackathon-oauth.md / user-api.md / http-api.md / hackathon-content-api.md，接口细节写入 findings.md
- [x] 初始化 planning 文件 + git 基线 commit
- [x] 开发方式确认：Loop Engineering（最小闭环→逐步补齐→每步验证前后端联通→报错即修）

### Phase 2: 骨架与部署 — status: pending
- [ ] Next.js (App Router, TS) + Tailwind 脚手架
- [ ] 嵌入 @excalidraw/excalidraw 画板 Demo 页跑通
- [ ] Vercel 部署拿固定域名（OAuth 回调前提）
- [ ] .env.example + gitignored .env 结构

### Phase 3: 知乎 API 接入 — status: pending
- [ ] OAuth 登录流（app_id/app_key 分配后）
- [ ] 服务端代理：搜索 / 直答 / 关注流 / 关注列表（缓存 + 降级）
- [ ] 预生成热门问题地图脚本（绕额度限制）

### Phase 4: 核心玩法 — status: pending
- [ ] 观点对照图生成管线（搜索→直答提取→Excalidraw JSON 布局）
- [ ] 共识区/分歧区布局算法 + 答主高亮
- [ ] 兴趣画像冷启动页
- [ ] 编辑/导出/分享

### Phase 5: 打磨与交付 — status: pending
- [ ] UI 打磨（刘看山元素、手绘风格统一）
- [ ] 演示视频 + 计划书（PDF）
- [ ] 提交前检查清单过一遍（hackathon.md「提交前检查」7 条）

## Errors Encountered
| Error | Attempt | Resolution |
|-------|---------|------------|
| (none yet) | | |
