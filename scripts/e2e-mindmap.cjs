// E2E：摘要思维导图视觉验证（经 window.__excal 读真实场景元素做几何断言）
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { chromium } = require("/Users/lijia/Documents/code/bitget-hackathon-infra/node_modules/playwright");
const BASE = "http://localhost:3005";

(async () => {
  const browser = await chromium.launch({
    executablePath: `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-mac-arm64/chrome-headless-shell`,
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));

  // 内置引擎真实生成一张摘要图（绕过知乎搜索：直传素材）
  const items = [1, 2, 3].map((i) => ({
    Title: `副业经验回答${i}`,
    ContentType: "answer",
    ContentID: `a${i}`,
    ContentText: `关于副业，我的核心观点是：${["先从已有技能接单变现，三个月内看到现金流，比从零学新技能风险低", "内容账号前期几乎零收入，要持续更新半年以上，适合当长线资产", "警惕以培训费加盟费为名的割韭菜项目，识别方法是看对方是否靠你交钱盈利"][i - 1]}。补充细节：记账复盘、先保主业、精细化运营都很重要。`,
    Url: `https://www.zhihu.com/answer/${i}`,
    VoteUpCount: 100 * i,
    AuthorName: `答主${i}`,
  }));

  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector('header button[data-role="generate"]', { timeout: 30000 });

  // 切到文章摘要模式
  await page.click('header button:has-text("文章摘要")');
  // 直接调 stream 接口生成（picked 直传，跳过知乎搜索）
  const sse = await page.evaluate(async (its) => {
    const res = await fetch("/api/generate/stream", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question: "普通人副业搞钱要点", engine: { id: "builtin" }, mode: "summary", items: its }),
    });
    const text = await res.text();
    const events = [];
    for (const block of text.split("\n\n")) {
      const ev = block.match(/^event: (\w+)/m)?.[1];
      const data = block.match(/^data: ([\s\S]*)$/m)?.[1];
      if (ev) events.push({ event: ev, data: data ? JSON.parse(data) : null });
    }
    return events;
  }, items);
  const graphEvent = sse.find((e) => e.event === "graph");
  console.log("[gen] events:", sse.map((e) => e.event).join(" → "));
  if (!graphEvent) { console.log("GEN FAIL", JSON.stringify(sse.slice(-2))); process.exitCode = 1; await browser.close(); return; }
  const g = graphEvent.data.graph;
  console.log("[gen] graph:", g.nodes.length, "nodes | kind:", g.kind, "| layout:", g.presentation?.layout, "| mode:", g.metadata?.mode);

  // 通过 window.__excal 直接注入场景（与 renderGraph 同一渲染器，走页面真实代码路径）
  await page.evaluate(async (graph) => {
    const layout = await import("/_next/static/chunks/src_lib_excalidraw-layout_ts.js").catch(() => null);
    // 动态 chunk 名不稳定，退而求其次：触发页面自己的渲染——把 graph 写进缓存再 reload
    localStorage.setItem("kanshan.board.v1", JSON.stringify({ graph, mode: "summary", question: graph.title, savedAt: Date.now() }));
  }, g);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForTimeout(3000);
  const dbg = await page.evaluate(() => ({
    hasExcal: !!window.__excal,
    sceneCount: window.__excal ? window.__excal.getSceneElements().length : -1,
    cached: !!localStorage.getItem("kanshan.board.v1"),
    canvasCount: document.querySelectorAll("canvas").length,
  }));
  console.log("[debug]", JSON.stringify(dbg));
  // 恢复路径依赖 sessionStorage 元素快照（跨 reload 已清空）——用页面真实渲染器补齐：
  // 从 __excal 空场景 + localStorage graph 出发，调用页面同一渲染管线结果注入
  await page.evaluate(async () => {
    const cache = JSON.parse(localStorage.getItem("kanshan.board.v1"));
    if (!cache || (window.__excal?.getSceneElements().length ?? 0) > 0) return;
    // 找 Next 动态 chunk 里的布局模块：从已加载 script 里推（chunk 名带 hash，遍历 webpack chunk cache 不可靠）
    // 稳定方案：调用页面暴露的渲染 —— 页面在 restored 状态下会 setBoardMounted(true) 且 renderGraph 在缓存恢复 effect 里触发
    // 若场景仍空（元素快照丢失），直接经 fetch 重放 graph 事件的路径代价高；这里用 graph 数据重建最小场景验证几何：
    window.__cachedGraph = cache.graph;
  });
  // 若恢复后场景为空（无元素快照可恢复），改为验证「生成即渲染」路径：触发页面内 generate 流程太重，
  // 直接用 renderer 单测已覆盖几何；此处用局部注入复算页面场景：
  const sceneCheck = await page.evaluate(async () => {
    const api = window.__excal;
    if (api.getSceneElements().length > 0) return { source: "restored" };
    const g = window.__cachedGraph;
    if (!g) return { source: "none" };
    // 手动经页面动态 import 同一模块（Next dev 下 src 经 webpack 暴露路径不稳定）——
    // 改用 fetch 页面的 API：POST /api/agent 的 answer 路径会回显 graph，但渲染器在客户端。
    // 最简稳定方案：直接用服务端同版布局函数（tsx 经 node 已单测覆盖）；页面端只验证非空场景。
    return { source: "fallback-needed" };
  });
  console.log("[scene-source]", JSON.stringify(sceneCheck));
  if (sceneCheck.source !== "restored") {
    // 页面恢复路径在没有元素快照时不重渲染 —— 这是既有行为（Phase 19 起 persistElements 存 sessionStorage）。
    // E2E 改走「真实生成→画板直接出图」路径：点生成按钮走完整 UI 流程
    console.log("[e2e] fallback: driving real UI generation");
    // 拦截 stream 请求注入 picked items（跳过知乎搜索），用真实 UI 流程生成
    await page.route("**/api/generate/stream", async (route) => {
      const req = route.request().postDataJSON();
      const res = await route.fetch({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        postData: JSON.stringify({ ...req, items }),
      });
      await route.fulfill({ response: res });
    });
    await page.click('header button:has-text("文章摘要")');
    await page.fill("header input >> nth=0", "普通人副业搞钱要点");
    await page.click('header button[data-role="generate"]');
    await page.waitForFunction(() => window.__excal && window.__excal.getSceneElements().length > 0, { timeout: 120000 });
  }
  await page.waitForTimeout(2500); // scrollToContent 重试稳定

  const report = await page.evaluate(() => {
    const api = (window).__excal;
    const els = api.getSceneElements();
    const root = els.find((e) => e.id === "evidence-root");
    const cards = els.filter((e) => e.type === "rectangle" && String(e.id).startsWith("node-"));
    const arrows = els.filter((e) => e.type === "arrow" && e.startNodeId === "evidence-root");
    if (!root) return { fail: "no root element", count: els.length };
    const left = cards.filter((c) => c.x < root.x);
    const right = cards.filter((c) => c.x > root.x);
    const spanOf = (arr) => arr.length ? Math.max(...arr.map((c) => c.y + c.height)) - Math.min(...arr.map((c) => c.y)) : 0;
    const centerOf = (arr) => arr.length ? (Math.min(...arr.map((c) => c.y)) + Math.max(...arr.map((c) => c.y + c.height))) / 2 : null;
    const leftC = centerOf(left), rightC = centerOf(right);
    // 较高列的跨度中心 = maxCol 中心（positions 已把短列向它补齐），根必须对齐它
    const tallerC = spanOf(left) >= spanOf(right) ? leftC : rightC;
    const rootCy = root.y + root.height / 2;
    // 箭头穿卡检测（采样）
    const segHits = (p1, p2, card) => {
      for (let t = 0.02; t <= 0.98; t += 0.02) {
        const x = p1.x + (p2.x - p1.x) * t, y = p1.y + (p2.y - p1.y) * t;
        if (x > card.x + 1 && x < card.x + card.width - 1 && y > card.y + 1 && y < card.y + card.height - 1) return true;
      }
      return false;
    };
    let pierce = 0;
    for (const a of arrows) {
      const p1 = { x: a.x + a.points[0][0], y: a.y + a.points[0][1] };
      const p2 = { x: a.x + a.points[1][0], y: a.y + a.points[1][1] };
      for (const c of cards) if (segHits(p1, p2, c)) { pierce++; break; }
    }
    // 卡片碰撞
    let overlap = 0;
    const rects = [...cards, root];
    for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) {
      const A = rects[i], B = rects[j];
      const ix = Math.max(0, Math.min(A.x + A.width, B.x + B.width) - Math.max(A.x, B.x));
      const iy = Math.max(0, Math.min(A.y + A.height, B.y + B.height) - Math.max(A.y, B.y));
      if (ix * iy > 100) overlap++;
    }
    // 箭头端点贴侧缘检查
    let badAnchor = 0;
    for (const a of arrows) {
      const end = { x: a.x + a.points[1][0], y: a.y + a.points[1][1] };
      const card = cards.find((c) => Math.abs(end.y - (c.y + c.height / 2)) < 0.01 && (end.x === c.x || end.x === c.x + c.width));
      if (!card) badAnchor++;
    }
    return {
      cards: cards.length, arrows: arrows.length,
      leftC, rightC, rootCy, tallerC,
      rootOffset: tallerC === null ? null : Math.abs(rootCy - tallerC),
      pierce, overlap, badAnchor,
    };
  });
  console.log("[board]", JSON.stringify(report, null, 1));
  // 精确断言：根垂直中心 = 较高分支列的跨度中心（容差 1px）
  const pass =
    report.pierce === 0 &&
    report.overlap === 0 &&
    report.badAnchor === 0 &&
    report.cards > 0 &&
    report.arrows === report.cards &&
    report.rootOffset !== null && report.rootOffset <= 1;
  console.log("[board] pierce:", report.pierce, "overlap:", report.overlap, "badAnchor:", report.badAnchor, "pageerrors:", errors.length);
  if (!pass || errors.length > 0) { console.log("BOARD FAIL"); process.exitCode = 1; }
  else console.log("BOARD PASS");
  await browser.close();
})();
