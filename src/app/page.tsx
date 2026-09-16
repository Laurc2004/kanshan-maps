"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import dynamic from "next/dynamic";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import "@excalidraw/excalidraw/index.css";
import type { ViewpointGraph } from "@/lib/viewpoints";
import type { RoadmapGraph } from "@/lib/roadmap";
import type { KnowledgeGraph } from "@/lib/harness/types";
import type { HarnessEventType, SourceDocument } from "@/lib/harness/types";
import type { SearchResultItem } from "@/lib/zhihu";
import AgentPanel, { type HarnessProgress, type HarnessStep } from "@/components/AgentPanel";
import SourcesPanel, { type HotItem } from "@/components/SourcesPanel";
import { requestClearBoard } from "@/lib/board-actions";
import HarnessStatus from "@/components/HarnessStatus";
import SourceIndex from "@/components/SourceIndex";
import { BoardControls } from "@/components/BoardControls";
import ProfileCenter from "@/components/ProfileCenter";
import LoginPrompt from "@/components/LoginPrompt";
import { collectKnowledgeSources } from "@/lib/knowledge-assets";
import { applyPalette, recolorElements } from "@/lib/presentation-controls";
import { deleteBoard, listSavedBoards, saveBoard, type SavedBoard } from "@/lib/local-library";
import { newBoardSessionId } from "@/lib/agent-chat-store";
import { addWatermark } from "@/lib/share";
import type { PaletteId } from "@/lib/harness/types";

const Excalidraw = dynamic(() => import("@excalidraw/excalidraw").then((m) => m.Excalidraw), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/liukanshan/working.gif" alt="加载中" className="h-24 w-24" />
    </div>
  ),
});

type Engine = { id: string; baseURL?: string; apiKey?: string; model?: string };
// 用户可见的两种模式；旧值 auto/viewpoint 通过 normalizeUserMode 兼容映射
type Mode = "compare" | "roadmap" | "summary";
export function normalizeUserMode(value: unknown): Mode {
  if (value === "roadmap") return "roadmap";
  if (value === "summary") return "summary";
  return "compare"; // auto/viewpoint/compare/未知值 → compare
}

// 本地缓存：graph 结构化数据（localStorage），画板元素序列化体积大放 sessionStorage
const BOARD_KEY = "kanshan.board.v1";
const ELEMENTS_KEY = "kanshan.elements.v1";
type GraphState = ViewpointGraph | RoadmapGraph | KnowledgeGraph;
type BoardCache = {
  graph: GraphState;
  mode: Mode;
  question: string;
  items?: unknown[];
  savedAt: number;
  sessionId?: string; // 画板会话标识：恢复画板时看山助手对话跟着回来
};

export default function Home() {
  const [question, setQuestion] = useState("");
  const [mode, setMode] = useState<Mode>("compare");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [graph, setGraph] = useState<GraphState | null>(null);
  const [graphMode, setGraphMode] = useState<Mode>("compare"); // 当前画板上的图类型
  const [items, setItems] = useState<SearchResultItem[]>([]);
  const [sourceDocuments, setSourceDocuments] = useState<SourceDocument[]>([]);
  const [harnessEvent, setHarnessEvent] = useState<HarnessEventType | null>(null);
  const [harnessProgress, setHarnessProgress] = useState<HarnessProgress | null>(null);
  const [searching, setSearching] = useState(false); // 找回答独立加载态：不影响画板/生成按钮
  const [showSources, setShowSources] = useState(true);
  const [showEngineCfg, setShowEngineCfg] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [engine, setEngine] = useState<Engine>({ id: "builtin" });
  const [hotItems, setHotItems] = useState<HotItem[]>([]);
  const [pendingClear, setPendingClear] = useState(false); // 清空画布确认弹窗
  const [me, setMe] = useState<{ loggedIn: boolean; name?: string }>({ loggedIn: false });
  const [meLoaded, setMeLoaded] = useState(false); // /api/auth/me 返回前不弹登录墙（防已登录用户被闪弹）
  const [followeeCount, setFolloweeCount] = useState(0);
  const [savedBoards, setSavedBoards] = useState<SavedBoard[]>([]);
  const [activeFavlist, setActiveFavlist] = useState<{ urlToken: number; title: string; description: string } | null>(null);
  const [favlistItems, setFavlistItems] = useState<SearchResultItem[]>([]);
  const [selectedFavlistIds, setSelectedFavlistIds] = useState<Set<string>>(new Set());
  const [authNotice, setAuthNotice] = useState<string | null>(null);

  const apiRef = useRef<ExcalidrawImperativeAPI | null>(null);
  const pendingRef = useRef<unknown[] | null>(null);
  const currentBoardIdRef = useRef<string | null>(null); // P30：当前画板对应的「我的看山」收藏夹 id（自动回写用）
  const [boardMounted, setBoardMounted] = useState(false);
  const followeesRef = useRef<Set<string>>(new Set());
  const graphRef = useRef<GraphState | null>(null);
  const renderGraphRef = useRef<(g: GraphState, f?: Set<string>, m?: Mode) => void>(() => {});
  const [showAgent, setShowAgent] = useState(true); // 右栏可收缩
  const [pendingHot, setPendingHot] = useState<string | null>(null); // 热榜确认弹窗
  const [generating, setGenerating] = useState(false); // 画板生成中遮罩
  const [restored, setRestored] = useState(false); // 是否从缓存恢复
  // 看山助手会话标识：每张图一个会话，对话与图绑定（生成新图/切换画板都会换新 id）
  const [boardSession, setBoardSession] = useState(() => newBoardSessionId());
  const boardSessionRef = useRef(boardSession);
  useEffect(() => {
    boardSessionRef.current = boardSession;
  }, [boardSession]);


  // 启动：读登录态 + 处理 OAuth 回调错误参数 + 拉热榜
  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => {
        setMe(d);
        setMeLoaded(true);
      })
      .catch(() => setMeLoaded(true)); // 网络异常也结束加载态，不闪弹登录墙
    fetch("/api/hot")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => setHotItems(d.items ?? []))
      .catch(() => {});
    // 恢复上次画板（问题 4：下次打开还有缓存）
    // 微任务里 setState，绕开 effect 内同步 setState 告警（同 authError 处理）
    queueMicrotask(() => {
      try {
        setSavedBoards(listSavedBoards(localStorage));
        const raw = localStorage.getItem(BOARD_KEY);
        if (!raw) return;
        const cache = JSON.parse(raw) as BoardCache;
        const g = cache.graph as { viewpoints?: unknown[]; stages?: unknown[]; nodes?: unknown[]; presentation?: unknown } | null;
        if (!cache.graph || !(Array.isArray(g?.viewpoints) || Array.isArray(g?.stages) || (Array.isArray(g?.nodes) && g.presentation))) return;
        setGraph(cache.graph);
        graphRef.current = cache.graph;
        setGraphMode(normalizeUserMode(cache.mode));
        if (cache.question) setQuestion(cache.question);
        if (Array.isArray(cache.items)) setItems(cache.items as SearchResultItem[]);
        // 恢复画板时沿用原会话 id：看山助手对话跟着画板一起回来
        if (cache.sessionId) setBoardSession(cache.sessionId);
        setBoardMounted(true);
        setRestored(true);
      } catch {
        /* 缓存损坏则忽略 */
      }
    });
    const sp = new URLSearchParams(window.location.search);
    const authError = sp.get("auth_error");
    if (authError) {
      const map: Record<string, string> = {
        missing_code: "知乎登录未完成（未拿到授权码）",
        state_mismatch: "登录状态校验失败，请重试",
        server_not_configured: "服务端未配置知乎应用凭证",
        token_exchange_failed: "授权码换 Token 失败，请重试",
        network: "网络异常，登录失败",
      };
      // 微任务里 setState，避免 effect 内同步 setState 触发级联渲染告警
      queueMicrotask(() => setAuthNotice(map[authError] ?? "登录失败"));
      window.history.replaceState({}, "", "/");
      setTimeout(() => setAuthNotice(null), 6000);
    }
  }, []);

  // 登录后拉关注列表（答主高亮的数据源）；拿到后若已有图则重绘高亮
  useEffect(() => {
    if (!me.loggedIn) return;
    fetch("/api/me/followees")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => {
        // 昵称归一化：去空格转小写，匹配搜索结果的 AuthorName
        const names = new Set<string>(
          (d.names ?? []).map((n: string) => n.replace(/\s+/g, "").toLowerCase())
        );
        followeesRef.current = names;
        setFolloweeCount(names.size);
        if (graphRef.current) renderGraphRef.current(graphRef.current, names);
      })
      .catch(() => {});
  }, [me.loggedIn]);

  // 收藏夹（个人学习路线入口）：登录后拉取，roadmap 模式下展示
  const [favlists, setFavlists] = useState<{ urlToken: number; title: string; description: string }[]>([]);
  const [favlistLoading, setFavlistLoading] = useState(false);
  // 收藏夹生成的待处理素材（state 落定后由 generate 消费）
  const [pendingItems, setPendingItems] = useState<SearchResultItem[] | null>(null);
  useEffect(() => {
    if (!me.loggedIn) return;
    fetch("/api/me/favlists")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => setFavlists(d.items ?? []))
      .catch(() => {});
  }, [me.loggedIn]);

  // 用收藏夹内容生成学习路线：素材 = 收藏夹内的回答/文章
  // 稳定引用：excalidrawAPI 回调不随 state 变化重建（避免重复挂载双实例）
  const onApiReady = useCallback((api: ExcalidrawImperativeAPI) => {
    apiRef.current = api;
    if (typeof window !== "undefined") (window as unknown as Record<string, unknown>).__excal = api;
    // 优先恢复上次保存的画板元素（含用户手动调整）
    let cachedEls: unknown[] | null = null;
    try {
      const raw = sessionStorage.getItem(ELEMENTS_KEY);
      if (raw) cachedEls = JSON.parse(raw);
    } catch {
      /* ignore */
    }
    const els = cachedEls ?? pendingRef.current;
    if (els) {
      // 注意：这里不能只在回调后固定 setTimeout 注入。
      // excalidrawAPI 回调先于内部 _App 挂载（顺序取决于动态 chunk 加载时机），
      // 过早 updateScene 会命中 "setState on unmounted" 被静默丢弃（已复现）。
      // 改用重试轮询：直到元素真正出现在场景里才停。
      let tries = 0;
      const timer = setInterval(() => {
        tries += 1;
        // 防挂载竞态：实例被换掉（generate 断开引用）就停止旧轮询
        if (apiRef.current !== api) {
          clearInterval(timer);
          return;
        }
        if (!els || tries > 40) {
          clearInterval(timer);
          if (tries > 40) console.error("[kanshan] updateScene 注入失败（重试超时）");
          pendingRef.current = null;
          return;
        }
        api.updateScene({ elements: els as never });
        if (api.getSceneElements().length > 0) {
          clearInterval(timer);
          pendingRef.current = null;
          api.scrollToContent(undefined, { fitToViewport: true, viewportZoomFactor: 0.85 });
        }
      }, 250);
    }
  }, []);

  // 画板状态持久化：graph 放 localStorage，元素快照放 sessionStorage（体积大、跨会话不必保真）
  const persistBoard = useCallback((g: GraphState, m: Mode, q: string, its?: SearchResultItem[]) => {
    try {
      const cache: BoardCache = { graph: g, mode: m, question: q, items: its, savedAt: Date.now(), sessionId: boardSessionRef.current };
      localStorage.setItem(BOARD_KEY, JSON.stringify(cache));
    } catch {
      /* 配额满则忽略 */
    }
  }, []);
  // P30：自动回写「我的看山」——助手改图/换色后当前画板对应的收藏夹快照同步覆盖，
  // 解决「我的看山点开还是生成时的旧版」
  const syncLibraryBoard = useCallback((g: GraphState, m: Mode, title: string) => {
    const id = currentBoardIdRef.current;
    if (!id) return;
    try {
      setSavedBoards(saveBoard(localStorage, { id, title, mode: m === "roadmap" ? "roadmap" : "compare", graph: g, savedAt: Date.now() }));
    } catch {
      /* 存储异常忽略，不影响画板 */
    }
  }, []);
  const persistElements = useCallback(() => {
    try {
      const els = apiRef.current?.getSceneElements() ?? [];
      if (els.length > 0) sessionStorage.setItem(ELEMENTS_KEY, JSON.stringify(els));
    } catch {
      /* ignore */
    }
  }, []);

  const renderGraph = useCallback(async (g: GraphState, followed?: Set<string>, m: Mode = "compare") => {
    const layout = await import("@/lib/excalidraw-layout");
    // 全站一种图结构（KnowledgeGraph）+ 一套渲染器：生成/Agent/缓存出口均已归一
    const elements = layout.adaptiveGraphToScene(g, followed ?? followeesRef.current) as never[];
    // 新图覆盖旧缓存元素
    try {
      sessionStorage.removeItem(ELEMENTS_KEY);
    } catch {
      /* ignore */
    }
    if (apiRef.current) {
      apiRef.current.updateScene({ elements });
      // 大图（路线图多列）时 100ms 一次 scrollToContent 可能没生效，重试直到视口适配
      let fitTries = 0;
      const fit = () => {
        fitTries += 1;
        const api = apiRef.current;
        if (!api) return;
        api.scrollToContent(undefined, { fitToViewport: true, viewportZoomFactor: 0.85 });
        if (fitTries < 8) setTimeout(fit, 150);
      };
      setTimeout(fit, 100);
    } else {
      pendingRef.current = elements;
      setBoardMounted(true);
    }
  }, []);
  // renderGraphRef 只在 effect/事件里被读；同步赋值放 effect 里避免渲染期写 ref
  useEffect(() => {
    renderGraphRef.current = renderGraph;
  }, [renderGraph]);

  // 关闭/切走页面前保存画板元素（含用户手动调整）
  useEffect(() => {
    const onHide = () => persistElements();
    window.addEventListener("beforeunload", onHide);
    document.addEventListener("visibilitychange", onHide);
    return () => {
      window.removeEventListener("beforeunload", onHide);
      document.removeEventListener("visibilitychange", onHide);
    };
  }, [persistElements]);

  // 缓存恢复提示：几秒后自动消失
  useEffect(() => {
    if (restored) {
      const t = setTimeout(() => setRestored(false), 5000);
      return () => clearTimeout(t);
    }
  }, [restored]);

  const generate = useCallback(
    async (picked?: SearchResultItem[]) => {
      if (!question.trim() || loading) return;
      setLoading(true);
      setGenerating(true); // 画板进入生成态
      setBoardMounted(false); // 清空旧画板，全屏显示生成态
      apiRef.current = null; // 断开旧 Excalidraw 实例
      // 新图 = 新会话：看山助手旧图对话不带到新图上
      const nextSession = newBoardSessionId();
      boardSessionRef.current = nextSession;
      setBoardSession(nextSession);
      setError(null);
      setStatus("正在连接看山工作台…");
      setHarnessEvent("planning");
      setHarnessProgress({ stage: "planning", steps: [] });
      setSourceDocuments([]);
      try {
        // SSE 流式：素材先到（SourcesPanel 立刻有内容），骨架卡片先到（画板立刻落笔），正文详情后补
        // picked：用户自选回答直传，跳过服务端搜索
        const res = await fetch("/api/generate/stream", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ question, engine, mode, items: picked }),
        });
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "生成失败");
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let streamedItems = picked ?? [];
      let buf = "";
      let done = false;
      while (!done) {
        const { value, done: readerDone } = await reader.read();
        done = readerDone;
        buf += decoder.decode(value ?? new Uint8Array(), { stream: !done });
        // SSE 事件以双换行分隔
        const events = buf.split("\n\n");
        buf = events.pop() ?? "";
        for (const block of events) {
          const evMatch = block.match(/^event: (\w+)/m);
          const dataMatch = block.match(/^data: ([\s\S]*)$/m);
          if (!evMatch || !dataMatch) continue;
          const event = evMatch[1];
          const data = JSON.parse(dataMatch[1]);
          if (event === "status") {
            setStatus(data.text);
          } else if (["planning", "searching", "synthesizing", "laying_out", "validating"].includes(event)) {
            setHarnessEvent(event as HarnessEventType);
            setHarnessProgress((prev: HarnessProgress | null) => {
              // 每步带输入/输出摘要，让用户看得见 harness 在做什么
              let step: HarnessStep | null = null;
              if (event === "planning") {
                step = { label: "规划编排方案", input: `问题「${question}」`, output: data.plan ? `图类型 ${data.plan.layout ?? "auto"} · 数据源 ${(data.plan.sources ?? []).join("/")}` : undefined };
              } else if (event === "searching") {
                step = { label: "检索内容", input: `关键词 ${(data.queries ?? []).join("、") || question}`, output: data.supplementary ? "补充检索一轮" : undefined };
              } else if (event === "synthesizing") {
                step = { label: "综合提炼观点", input: `${data.documents ?? "?"} 篇素材`, output: "提炼节点、立场与引用" };
              } else if (event === "laying_out") {
                step = { label: "布局画板", input: `布局 ${data.layout ?? ""}`, output: "计算卡片位置防重叠" };
              } else if (event === "validating") {
                step = { label: "验证结果", output: `${data.nodes ?? "?"} 个节点 · ${data.edges ?? "?"} 条关系` };
              }
              const steps = step ? [...(prev?.steps ?? []), step] : (prev?.steps ?? []);
              const seen = new Set<string>();
              const deduped = steps.filter((s) => (seen.has(s.label) ? false : (seen.add(s.label), true)));
              return { stage: event as HarnessProgress["stage"], steps: deduped };
            });
          } else if (event === "sources") {
            // 自选生成时保留完整搜索结果，避免只剩被选中的几篇。
            if (!picked) {
              const received = data.items ?? [];
              streamedItems = received.map((item: Record<string, unknown>) =>
                item.sourceType
                  ? {
                      Title: String(item.title ?? "（无标题）"),
                      ContentType: String((item.metadata as Record<string, unknown> | undefined)?.contentType ?? ""),
                      ContentID: String(item.id ?? item.url ?? ""),
                      ContentText: String(item.text ?? ""),
                      Url: String(item.url ?? ""),
                      VoteUpCount: Number(item.score ?? 0),
                      AuthorName: String(item.author ?? ""),
                    }
                  : item
              ) as SearchResultItem[];
              setItems(streamedItems);
            }
            setSourceDocuments((data.documents ?? data.items ?? []) as SourceDocument[]);
            setHarnessEvent("sources");
            setHarnessProgress((prev: HarnessProgress | null) => {
              const docs = (data.documents ?? data.items ?? []) as { title?: string; sourceType?: string }[];
              const count = docs.length;
              // 展示前几条素材标题，让用户看到检索到的内容
              const head = docs.slice(0, 3).map((d) => (d.title ?? "").slice(0, 18)).filter(Boolean).join("、");
              const step: HarnessStep = { label: "整理素材", output: `${count} 条${head ? ` · 如 ${head}${count > 3 ? " 等" : ""}` : ""}` };
              return { stage: "sources", steps: [...(prev?.steps ?? []), step] };
            });
            setShowSources(true);
          } else if (event === "graph-skeleton") {
            // 骨架先到：卡片+标题立刻落画板（流式出图第一阶段）
            setGraph(data.graph);
            graphRef.current = data.graph;
            setGraphMode(normalizeUserMode(data.mode));
            setHarnessEvent("synthesizing");
            setHarnessProgress((prev: HarnessProgress | null) => {
              const g = data.graph as { title?: string; nodes?: unknown[] } | undefined;
              const step: HarnessStep = { label: "骨架落板", output: g?.title ? `「${String(g.title).slice(0, 20)}」· ${g?.nodes?.length ?? "?"} 张卡片` : "卡片已落画板" };
              return { stage: "synthesizing", steps: [...(prev?.steps ?? []), step] };
            });
            setBoardMounted(true);
            await renderGraph(data.graph, undefined, normalizeUserMode(data.mode));
          } else if (event === "graph-detail") {
            // 详情后补：正文填充进已落卡片
            setGraph(data.graph);
            graphRef.current = data.graph;
            setHarnessProgress((prev: HarnessProgress | null) => {
              const step: HarnessStep = { label: "补全论据", output: "卡片正文已填充" };
              return { stage: "laying_out", steps: [...(prev?.steps ?? []), step] };
            });
            await renderGraph(data.graph, undefined, normalizeUserMode(data.mode));
          } else if (event === "graph") {
            // 第二步：图落画板
            setGraph(data.graph);
            graphRef.current = data.graph;
            const finalMode = normalizeUserMode(data.mode);
            setGraphMode(finalMode);
            setHarnessEvent("graph");
            setHarnessProgress((prev: HarnessProgress | null) => {
              const g = data.graph as { title?: string; nodes?: unknown[] } | undefined;
              const step: HarnessStep = { label: "生成完成", output: g?.title ? `「${String(g.title).slice(0, 20)}」· ${g.nodes?.length ?? "?"} 个节点已落画板` : "图已落画板" };
              return { stage: "graph", steps: [...(prev?.steps ?? []), step] };
            });
            // 成功后进度卡片保留 4 秒再收起，让用户看清每步做了什么
            setTimeout(() => setHarnessProgress(null), 4000);
            setBoardMounted(true);
            await renderGraph(data.graph, undefined, finalMode);
            persistBoard(data.graph, finalMode, question, streamedItems);
            const boardTitle = "question" in data.graph ? data.graph.question : "topic" in data.graph ? data.graph.topic : data.graph.title;
            const boardId = `${finalMode}:${boardTitle}`;
            currentBoardIdRef.current = boardId; // P30：记录收藏夹 id，助手改图后自动回写
            setSavedBoards(saveBoard(localStorage, { id: boardId, title: boardTitle, mode: finalMode === "roadmap" ? "roadmap" : "compare", graph: data.graph, savedAt: Date.now() }));
            setStatus(
              data.cached
                ? "已生成（缓存）"
                : picked
                  ? `已生成 · 基于你选的 ${picked.length} 篇回答`
                  : `已生成 · 基于 ${data.sources} 条知乎内容`
            );
            setTimeout(() => setStatus(null), 4000);
          } else if (event === "error") {
            setHarnessEvent("error");
            setHarnessProgress((prev: HarnessProgress | null) => ({
              stage: "error",
              steps: prev?.steps ?? [],
              error: data.error || "生成失败，请稍后重试",
            }));
            throw new Error(data.error || "生成失败");
          }
        }
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : "生成失败，请稍后重试";
      setError(message);
      setHarnessProgress((prev: HarnessProgress | null) => ({
        stage: "error",
        steps: prev?.steps ?? [],
        error: message,
      }));
      setStatus(null);
    } finally {
      setLoading(false);
      setGenerating(false);
    }
    },
    [question, loading, engine, mode, renderGraph, persistBoard]
  );

  // 收藏夹生成：question/mode/pendingItems 落定后自动触发
  useEffect(() => {
    if (!pendingItems || loading) return;
    const items = pendingItems;
    // 异步消费避免 effect 内同步 setState 级联渲染
    const t = setTimeout(() => {
      setPendingItems(null);
      generate(items);
    }, 0);
    return () => clearTimeout(t);
  }, [pendingItems, question, mode, loading, generate]);

  // 只找回答不生成（自选素材流程第一步）：独立 searching 态，画板和生成按钮保持不变
  const findAnswers = useCallback(async () => {
    if (!question.trim() || searching) return;
    setSearching(true);
    setStatus("正在搜索知乎回答…");
    try {
      const res = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "搜索失败");
      if (!data.items?.length) throw new Error("知乎上没有找到相关内容，换个问法试试");
      setItems(data.items);
      setShowSources(true);
      setStatus(`找到 ${data.items.length} 篇回答，勾选后点「生成所选」`);
      setTimeout(() => setStatus(null), 5000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "搜索失败，请稍后重试");
      setStatus(null);
    } finally {
      setSearching(false);
    }
  }, [question, searching]);

  const clearBoard = useCallback(() => {
    const reset = requestClearBoard(true);
    if (!reset) return;
    apiRef.current?.updateScene({ elements: [] });
    apiRef.current = null;
    pendingRef.current = null;
    graphRef.current = null;
    // 清空画布 = 新会话：助手对话一并清空
    const nextSession = newBoardSessionId();
    boardSessionRef.current = nextSession;
    setBoardSession(nextSession);
    setGraph(reset.graph);
    setItems(reset.items);
    setQuestion(reset.question);
    setStatus(reset.status);
    setError(reset.error);
    setGenerating(reset.generating);
    setBoardMounted(reset.boardMounted);
    setRestored(reset.restored);
    setPendingClear(false);
    currentBoardIdRef.current = null; // P30：清空后与收藏夹快照解绑，新图修改不再回写旧收藏
    try {
      localStorage.removeItem(BOARD_KEY);
      sessionStorage.removeItem(ELEMENTS_KEY);
    } catch {
      /* ignore */
    }
  }, []);

  // 左栏「生成所选」：用户勾选的回答直传生成
  const generateSelected = useCallback(
    (selected: SearchResultItem[]) => {
      if (selected.length === 0 || loading) return;
      generate(selected);
    },
    [generate, loading]
  );

  const openFavlist = useCallback(async (favlist: { urlToken: number; title: string; description: string }) => {
    if (favlistLoading) return;
    setActiveFavlist(favlist); setFavlistLoading(true); setError(null);
    try {
      const response = await fetch(`/api/me/favlist-contents?urlToken=${favlist.urlToken}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "收藏夹内容获取失败");
      const next = (data.items ?? []) as SearchResultItem[];
      setFavlistItems(next); setSelectedFavlistIds(new Set());
    } catch (cause) { setError(cause instanceof Error ? cause.message : "收藏夹读取失败"); setFavlistItems([]); setSelectedFavlistIds(new Set()); }
    finally { setFavlistLoading(false); }
  }, [favlistLoading]);

  const generateFavlistSelection = useCallback((nextMode: "compare" | "roadmap" | "summary") => {
    if (!activeFavlist) return;
    const picked = favlistItems.filter((item) => selectedFavlistIds.has(item.ContentID));
    if (!picked.length) return;
    const label = nextMode === "summary" ? "摘要" : nextMode === "roadmap" ? "学习路线" : "观点对照";
    setQuestion(`收藏夹「${activeFavlist.title}」${label}`); setMode(nextMode); setPendingItems(picked); setShowProfile(false);
  }, [activeFavlist, favlistItems, selectedFavlistIds]);
  const openSavedBoard = useCallback((board: SavedBoard) => {
    const restoredGraph = board.graph as GraphState;
    const restoredMode: Mode = board.mode === "roadmap" ? "roadmap" : "presentation" in restoredGraph && restoredGraph.kind === "cluster-board" ? "summary" : "compare";
    // 切换画板 = 切换会话：每张保存的图独立会话 id，回到同一张图时对话还在
    const nextSession = newBoardSessionId();
    boardSessionRef.current = nextSession;
    setBoardSession(nextSession);
    currentBoardIdRef.current = board.id; // P30：当前画板对应收藏夹 id，后续助手修改自动回写这份
    setGraph(restoredGraph); graphRef.current = restoredGraph; setGraphMode(restoredMode); setMode(restoredMode); setQuestion(board.title); setBoardMounted(true); setShowProfile(false); renderGraph(restoredGraph, undefined, restoredMode); persistBoard(restoredGraph, restoredMode, board.title);
  }, [persistBoard, renderGraph]);
  const changePalette = useCallback((palette: PaletteId) => {
    if (!graph) return;
    try {
      // 换色 = 只改颜色：直接在场景元素上按颜色值映射，不重渲染、不动结构/坐标/id，
      // 用户手动排版原样保留（重渲染会切换渲染器导致结构全变，已踩坑）
      const sceneEls = (apiRef.current?.getSceneElements() ?? []) as unknown as Record<string, unknown>[];
      if (sceneEls.length > 0) {
        apiRef.current?.updateScene({ elements: recolorElements(sceneEls, palette) as never });
      }
      // graph 只更新调色板标记（不动节点结构），供下次持久化/保存画板使用
      const next = "presentation" in graph
        ? { ...graph, presentation: { ...graph.presentation, palette } }
        : (() => { try { return applyPalette(graph, palette); } catch { return graph; } })();
      setGraph(next);
      graphRef.current = next;
      const boardTitle = "question" in next ? String(next.question) : "nodes" in next ? String(next.title) : String((next as unknown as { topic?: string; title?: string }).topic ?? "看山图");
      persistBoard(next, graphMode, boardTitle, items);
      syncLibraryBoard(next, graphMode, boardTitle); // P30：换色也回写收藏夹
    }
    catch (cause) { setError(cause instanceof Error ? cause.message : "配色切换失败"); }
  }, [graph, graphMode, items, persistBoard, syncLibraryBoard]);

  // 热榜点击：弹窗确认后生成
  const pickHot = useCallback((title: string) => {
    setPendingHot(title);
  }, []);
  const confirmHot = useCallback(() => {
    if (!pendingHot) return;
    setQuestion(pendingHot);
    setPendingHot(null);
    // 等 state 生效后触发
    setTimeout(() => {
      const btn = document.querySelector<HTMLButtonElement>('header button[data-role="generate"]');
      btn?.click();
    }, 0);
  }, [pendingHot]);

  // 画板导出 PNG（带水印）：供画板内嵌的保存图片按钮使用
  const makePng = useCallback(async () => {
    const els = apiRef.current?.getSceneElements() ?? [];
    const { exportToBlob } = await import("@excalidraw/excalidraw");
    const blob = await exportToBlob({ elements: els, appState: { exportWithDarkMode: false, exportBackground: true }, files: apiRef.current?.getFiles?.(), exportPadding: 32, getDimensions: (w: number, h: number) => ({ width: w * 2, height: h * 2, scale: 2 }) });
    return addWatermark(blob);
  }, []);

  // Agent 对话修改后的 graph 回灌画板（按当前图类型选布局器）
  // appliedLabels 用于局部渲染决策：纯文字/强调类修改保留用户坐标，结构类才整体重排
  const applyAgentGraph = useCallback(
    (g: GraphState, appliedLabels?: string[]) => {
      const previous = graphRef.current;
      const nextMode: Mode = "stages" in g ? "roadmap" : graphMode;
      // presentation 任一视觉字段（版式/密度/层级/调色/线条）或 metadata.mode（思维导图开关）
      // 或 metadata.linksEnabled（超链接开关）变化都视为几何/属性变化，必须全量重渲染
      // （只换色换字才保留用户坐标）
      const geometryChanged =
        ("presentation" in g &&
          (!previous ||
            !("presentation" in previous) ||
            (["layout", "density", "hierarchy", "palette", "stroke"] as const).some(
              (key) => JSON.stringify(g.presentation[key as keyof typeof g.presentation]) !== JSON.stringify(previous.presentation[key as keyof typeof previous.presentation])
            ))) ||
        ("nodes" in g &&
          ((g as KnowledgeGraph).metadata?.mode !==
            (previous && "nodes" in previous ? (previous as KnowledgeGraph).metadata?.mode : undefined) ||
            (g as KnowledgeGraph).metadata?.linksEnabled !==
              (previous && "nodes" in previous ? (previous as KnowledgeGraph).metadata?.linksEnabled : undefined) ||
            // 结构数量变化（增删卡片/连线/分组容器）必须全量重排：
            // 局部渲染把旧坐标映射给同 id 元素，容器大框/新卡片会按错位的包围盒画出来
            (g as KnowledgeGraph).nodes.length !==
              (previous && "nodes" in previous ? (previous as KnowledgeGraph).nodes.length : -1) ||
            (g as KnowledgeGraph).edges.length !==
              (previous && "nodes" in previous ? (previous as KnowledgeGraph).edges.length : -1) ||
            (g as KnowledgeGraph).groups.length !==
              (previous && "nodes" in previous ? (previous as KnowledgeGraph).groups.length : -1) ||
            JSON.stringify((g as KnowledgeGraph).metadata?.removedEdges) !==
              JSON.stringify(previous && "nodes" in previous ? (previous as KnowledgeGraph).metadata?.removedEdges : undefined) ||
            JSON.stringify((g as KnowledgeGraph).metadata?.groupContainers) !==
              JSON.stringify(previous && "nodes" in previous ? (previous as KnowledgeGraph).metadata?.groupContainers : undefined) ||
            // P30 微调：间距系数/单卡偏移/单卡样式变化 → 卡片几何/样式变化，必须全量重渲染
            // （局部渲染按 id 映射旧坐标会把偏移吃掉、样式覆盖不生效）
            (g as KnowledgeGraph).metadata?.spacingScale !==
              (previous && "nodes" in previous ? (previous as KnowledgeGraph).metadata?.spacingScale : undefined) ||
            JSON.stringify((g as KnowledgeGraph).metadata?.elementOffsets) !==
              JSON.stringify(previous && "nodes" in previous ? (previous as KnowledgeGraph).metadata?.elementOffsets : undefined) ||
            JSON.stringify((g as KnowledgeGraph).nodes.map((n) => n.metadata?.styleOverrides)) !==
              JSON.stringify(previous && "nodes" in previous ? (previous as KnowledgeGraph).nodes.map((n) => n.metadata?.styleOverrides) : undefined) ||
            // 分组归属变化（add_group 移动成员/move_node）也触发全量重排
            JSON.stringify((g as KnowledgeGraph).groups.map((grp) => grp.nodeIds)) !==
              JSON.stringify(previous && "nodes" in previous ? (previous as KnowledgeGraph).groups.map((grp) => grp.nodeIds) : [])));
      setGraph(g);
      graphRef.current = g;
      setGraphMode(nextMode);
      const labels = (appliedLabels ?? []).join(" ");
      // 局部安全：标题/强调/风格/精简描述 不影响布局 → 保留用户手动排版
      // 结构变化（删除/合并/移动/重排）→ 全量重排防重叠
      // 结构性修改或视觉参数变化必须整体重排；文字修改沿用用户坐标
      const structural =
        /删除|合并|移动|移出|重排|重新布局|新增|补充|连线|箭头|包住|圈|分组|左移|右移|上移|下移|回到默认位置|间距/.test(labels) ||
        geometryChanged ||
        appliedLabels === undefined;
      if (!structural && apiRef.current) {
        // 只更新文字/样式：同一套渲染器重生成元素，按 id 保留旧坐标
        (async () => {
          const layout = await import("@/lib/excalidraw-layout");
          const fresh = layout.adaptiveGraphToScene(g, followeesRef.current) as { id?: string; x?: number; y?: number }[];
          const old = (apiRef.current?.getSceneElements() ?? []) as unknown as { id?: string; x?: number; y?: number }[];
          const oldPos = new Map(old.map((el) => [el.id, { x: el.x, y: el.y }]));
          const merged = fresh.map((el) => {
            const pos = el.id ? oldPos.get(el.id) : undefined;
            return pos ? { ...el, x: pos.x, y: pos.y } : el;
          });
          apiRef.current?.updateScene({ elements: merged as never });
          persistBoard(g, nextMode, "question" in g ? g.question : "nodes" in g ? g.title : g.topic);
          syncLibraryBoard(g, nextMode, "question" in g ? g.question : "nodes" in g ? g.title : g.topic); // P30：回写收藏夹
        })();
        return;
      }
      renderGraph(g, undefined, nextMode);
      persistBoard(g, nextMode, "question" in g ? g.question : "nodes" in g ? g.title : g.topic);
      syncLibraryBoard(g, nextMode, "question" in g ? g.question : "nodes" in g ? g.title : g.topic); // P30：回写收藏夹
    },
    [renderGraph, persistBoard, syncLibraryBoard, graphMode]
  );

  return (
    <main className="flex h-screen flex-col bg-[#fafaf7]">
      {/* 顶栏：两行布局，搜索框独占一行不被挤压 */}
      <header className="shrink-0 border-b border-[#e8e8e3] bg-white">
        <div className="flex h-12 items-center gap-3 px-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/liukanshan/static-sway.png" alt="刘看山" className="h-8 w-8" />
          <div className="leading-tight">
            <h1 className="text-[15px] font-bold text-[#1a1a1a]">一图看山</h1>
          </div>
          <div className="ml-auto flex items-center gap-2">
            {/* 模式切换 */}
            <div className="flex rounded-full border border-gray-200 bg-[#fafaf7] p-0.5 text-xs">
              {(
                [
                  { id: "compare", label: "观点对照" },
                  { id: "roadmap", label: "学习路线" },
                  { id: "summary", label: "文章摘要" },
                ] as const
              ).map((m) => (
                <button
                  key={m.id}
                  onClick={() => setMode(m.id)}
                  className={`rounded-full px-3 py-1 transition ${
                    mode === m.id ? "bg-[#0066ff] text-white" : "text-gray-500 hover:text-[#0066ff]"
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
            <button
              onClick={() => setShowSources((v) => !v)}
              title={showSources ? "隐藏素材栏" : "显示素材栏"}
              className={`rounded-full border p-2 transition ${
                showSources
                  ? "border-[#0066ff]/30 bg-[#f0f5ff] text-[#0066ff]"
                  : "border-gray-200 text-gray-400 hover:border-[#0066ff]/30 hover:text-[#0066ff]"
              }`}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M4 6h16M4 12h10M4 18h7" />
              </svg>
            </button>
            <button
              onClick={() => setShowAgent((v) => !v)}
              title={showAgent ? "隐藏看山助手" : "显示看山助手"}
              className={`rounded-full border p-2 transition ${
                showAgent
                  ? "border-[#0066ff]/30 bg-[#f0f5ff] text-[#0066ff]"
                  : "border-gray-200 text-gray-400 hover:border-[#0066ff]/30 hover:text-[#0066ff]"
              }`}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M8 10h.01M12 10h.01M16 10h.01M21 12a9 9 0 01-9 9 9 9 0 01-4-.8L3 21l1-3.2A9 9 0 1121 12z" />
              </svg>
            </button>
            <button
              onClick={() => {
                if (!me.loggedIn) {
                  window.location.href = "/api/auth/login";
                  return;
                }
                setShowProfile((v) => !v);
              }}
              title={me.loggedIn ? "我的看山（收藏夹 / 本机地图）" : "我的看山（知乎登录后可用收藏夹）"}
              className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs transition ${
                showProfile
                  ? "border-[#0066ff]/30 bg-[#f0f5ff] text-[#0066ff]"
                  : "border-gray-200 text-gray-500 hover:border-[#0066ff]/30 hover:text-[#0066ff]"
              }`}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
              我的看山
            </button>
            <button
              onClick={() => setPendingClear(true)}
              disabled={loading || !graph}
              title="清空画布并回到初始状态"
              className="rounded-full border border-gray-200 p-2 text-gray-400 transition hover:border-red-200 hover:bg-red-50 hover:text-red-500 disabled:cursor-not-allowed disabled:opacity-30"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v5M14 11v5" />
              </svg>
            </button>
            <button
              onClick={() => setShowEngineCfg((v) => !v)}
              title="转换引擎设置"
              className={`rounded-full border p-2 transition ${
                showEngineCfg
                  ? "border-[#0066ff]/30 bg-[#f0f5ff] text-[#0066ff]"
                  : "border-gray-200 text-gray-400 hover:border-[#0066ff]/30 hover:text-[#0066ff]"
              }`}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 11-4 0v-.09a1.65 1.65 0 00-1-1.51 1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06A1.65 1.65 0 004.6 15a1.65 1.65 0 00-1.51-1H3a2 2 0 110-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06A1.65 1.65 0 009 4.6a1.65 1.65 0 001-1.51V3a2 2 0 114 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06A1.65 1.65 0 0019.4 9c.14.31.22.65.22 1V10a2 2 0 01-2 2" />
              </svg>
            </button>
            {me.loggedIn ? (
              <div className="flex items-center gap-1.5 rounded-full border border-[#0066ff]/20 bg-[#f0f5ff] py-1 pl-1 pr-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/liukanshan/idle.gif" alt="" className="h-6 w-6" />
                <span className="text-xs font-medium text-[#0066ff]">
                  {me.name ?? "已登录"}
                  {followeeCount > 0 && <span className="ml-1 text-[10px] font-normal text-gray-400">关注{followeeCount}人</span>}
                </span>
                <button
                  onClick={() =>
                    fetch("/api/auth/logout", { method: "POST" }).then(() => {
                      setMe({ loggedIn: false });
                      followeesRef.current = new Set();
                      setFolloweeCount(0);
                      setShowProfile(false);
                    })
                  }
                  className="text-[10px] text-gray-400 hover:text-gray-600"
                  title="退出登录"
                >
                  退出
                </button>
              </div>
            ) : (
              <a
                href="/api/auth/login"
                className="flex items-center gap-1.5 rounded-full border border-gray-200 px-3 py-1.5 text-xs text-gray-500 transition hover:border-[#0066ff]/50 hover:text-[#0066ff]"
                title="知乎登录后，地图上会高亮你关注的答主"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M15 3h4a2 2 0 012 2v14a2 2 0 01-2 2h-4M10 17l5-5-5-5M15 12H3" />
                </svg>
                知乎登录
              </a>
            )}
          </div>
        </div>
        {/* 第二行：搜索 + 生成按钮，搜索框占满剩余宽度 */}
        <div className="flex items-center gap-2 border-t border-[#f0f0ec] px-4 py-2">
          <input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && generate()}
            placeholder={
              mode === "roadmap"
                ? "输入学习目标或领域，如：我想做出一个能用的 Agent"
                : mode === "summary"
                  ? "输入主题，先找回答并勾选要总结的文章"
                  : "输入有争议的问题，如：年轻人该不该买房"
            }
            className="min-w-0 flex-1 rounded-full border border-gray-200 bg-[#fafaf7] py-2 pl-4 pr-3 text-sm outline-none transition focus:border-[#0066ff]/60 focus:bg-white focus:shadow-sm"
            disabled={loading}
          />
          <button
            onClick={findAnswers}
            disabled={searching || loading || !question.trim()}
            className="flex shrink-0 items-center gap-1 rounded-full border border-gray-200 bg-white px-3.5 py-2 text-sm text-gray-500 transition hover:border-[#0066ff]/50 hover:text-[#0066ff] disabled:opacity-50"
            title="只搜索知乎回答，自己挑素材再生成"
          >
            {searching ? (
              <>
                <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <circle cx="12" cy="12" r="10" opacity="0.25" />
                  <path d="M12 2a10 10 0 0110 10" />
                </svg>
                找回答中…
              </>
            ) : (
              <>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="11" cy="11" r="7" />
                  <path d="M21 21l-4.35-4.35" />
                </svg>
                找回答
              </>
            )}
          </button>
          <button
            onClick={() => generate()}
            data-role="generate"
            disabled={loading || !question.trim()}
            title="根据问题和已选回答一键生成看山图"
            className="flex shrink-0 items-center gap-1.5 rounded-full bg-[#0066ff] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#0052cc] disabled:opacity-50"
          >
            {loading ? (
              <>
                <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <circle cx="12" cy="12" r="10" opacity="0.25" />
                  <path d="M12 2a10 10 0 0110 10" />
                </svg>
                炼图中…
              </>
            ) : (
              "一键看山"
            )}
          </button>
        </div>
      </header>

      {/* OAuth 回调错误提示 */}
      {authNotice && (
        <div className="shrink-0 bg-amber-50 px-5 py-1.5 text-xs text-amber-700">{authNotice}</div>
      )}

      {/* 引擎设置（可折叠） */}
      {showEngineCfg && (
        <div className="shrink-0 border-b border-[#e8e8e3] bg-white px-5 py-3 text-sm">
          <div className="mb-2 text-xs font-medium text-gray-500">转换引擎（把知乎内容炼成画板的大模型）</div>
          <div className="mb-2 flex flex-wrap gap-2">
            {[
              { id: "builtin", label: "内置 deepseek-v4-flash（推荐）" },
              { id: "custom", label: "自定义 OpenAI 兼容" },
            ].map((e) => (
              <button
                key={e.id}
                onClick={() => setEngine((prev) => ({ ...prev, id: e.id }))}
                className={`rounded-full border px-3 py-1 text-xs transition ${
                  engine.id === e.id
                    ? "border-[#0066ff] bg-[#f0f5ff] text-[#0066ff]"
                    : "border-gray-200 text-gray-500 hover:border-[#0066ff]/40"
                }`}
              >
                {e.label}
              </button>
            ))}
          </div>
          {engine.id === "custom" && (
            <div className="grid gap-2 sm:grid-cols-3">
              <input
                value={engine.baseURL ?? ""}
                onChange={(e) => setEngine((p) => ({ ...p, baseURL: e.target.value }))}
                placeholder="Base URL，如 https://api.openai-next.com/v1"
                className="rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs outline-none focus:border-[#0066ff]/50"
              />
              <input
                value={engine.apiKey ?? ""}
                onChange={(e) => setEngine((p) => ({ ...p, apiKey: e.target.value }))}
                placeholder="API Key（仅本次会话，不存储）"
                type="password"
                className="rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs outline-none focus:border-[#0066ff]/50"
              />
              <input
                value={engine.model ?? ""}
                onChange={(e) => setEngine((p) => ({ ...p, model: e.target.value }))}
                placeholder="模型名"
                className="rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs outline-none focus:border-[#0066ff]/50"
              />
            </div>
          )}
          <p className="mt-1.5 text-[10px] text-gray-400">
            自定义 Key 只在生成时经服务端转发，不落盘不进缓存；内置引擎结果按问题缓存 6 小时。
          </p>
        </div>
      )}

      <HarnessStatus event={harnessEvent} documents={sourceDocuments} />
      {/* 状态条 */}
      {(status || error || restored) && (
        <div
          className={`flex shrink-0 items-center gap-2 px-5 py-1.5 text-xs ${
            error ? "bg-red-50 text-red-600" : "bg-[#f0f5ff] text-[#0066ff]"
          }`}
        >
          {!error && (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src="/liukanshan/working.gif" alt="" className="h-4 w-4" />
          )}
          {error ?? status ?? "已恢复上次生成的画板"}
        </div>
      )}

      {/* 三栏工作区：显式像素高度 + contain，Excalidraw 高度才不会失控 */}
      <div className="flex min-h-0 flex-1">
        {/* 左栏：展开=面板；收起=细条（点击细条重新展开），与右栏交互一致 */}
        {showProfile && me.loggedIn ? (
      <ProfileCenter name={me.name} boards={savedBoards} favlists={favlists} busy={loading} favlistLoading={favlistLoading} activeFavlist={activeFavlist} favlistItems={favlistItems} selectedIds={selectedFavlistIds} onClose={() => setShowProfile(false)} onOpenBoard={openSavedBoard} onDeleteBoard={(id) => setSavedBoards(deleteBoard(localStorage, id))} onOpenFavlist={openFavlist} onToggleItem={(id) => setSelectedFavlistIds((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; })} onGenerateFavlist={generateFavlistSelection} />
        ) : showSources ? (
          <SourcesPanel
            items={items}
            graph={graph && "question" in graph ? graph : null}
            graphMode={graphMode === "roadmap" ? "roadmap" : "viewpoint"}
            documents={sourceDocuments}
            hotItems={hotItems}
            onPickHot={pickHot}
            onGenerateSelected={generateSelected}
            onClose={() => setShowSources(false)}
          />
        ) : (
          <button
            onClick={() => setShowSources(true)}
            title="展开素材栏"
            className="flex w-10 shrink-0 flex-col items-center justify-center gap-2 border-r border-[#e8e8e3] bg-white text-gray-400 transition hover:bg-[#f0f5ff] hover:text-[#0066ff]"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 18l6-6-6-6" />
            </svg>
            <span className="text-[10px] [writing-mode:vertical-rl]">素材</span>
          </button>
        )}

        <div
          className="relative min-w-0 flex-1 [&_.excalidraw]:h-full [&_.excalidraw-wrapper]:h-full"
          style={{ contain: "size" }}
        >
          {boardMounted ? (
            <>
              <Excalidraw
                excalidrawAPI={onApiReady}
                viewModeEnabled={false}
                langCode="zh-CN"
                theme="light"
                onPointerDown={(_tool, pointerDownState) => {
                  // 卡片链接点击：hit 元素带 link 时新标签打开原文
                  const hit = pointerDownState.hit.element;
                  const link = hit?.link;
                  if (link && /^https?:\/\//.test(link)) window.open(link, "_blank", "noopener,noreferrer");
                }}
                UIOptions={{
                  canvasActions: {
                    loadScene: false,
                    export: false,
                    saveToActiveFile: false,
                    saveAsImage: false,
                    clearCanvas: false,
                    changeViewBackgroundColor: false,
                    toggleTheme: false,
                  },
                  tools: {
                    image: false,
                  },
                }}
              />
              {/* 生成中遮罩：盖在旧图上 */}
              {generating && (
                <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-5 bg-white/85 backdrop-blur-sm">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/liukanshan/working.gif" alt="生成中" className="h-28 w-28" />
                  <div className="flex flex-col items-center gap-3">
                    <p className="text-sm font-medium text-[#1a1a1a]">刘看山正在为你炼图…</p>
                    <div className="h-1 w-48 overflow-hidden rounded-full bg-[#e8e8e3]">
                      <div className="h-full w-1/3 rounded-full bg-[#0066ff]" style={{ animation: "shimmer 1.2s ease-in-out infinite" }} />
                    </div>
                    <p className="max-w-xs text-center text-xs leading-5 text-gray-500">
                      正在抓取知乎高赞回答，提炼各方立场与论据
                    </p>
                  </div>
                </div>
              )}
              {/* S4：画板控件悬浮右下角（配色 + 保存图片），不挤占 Excalidraw 原生 UI */}
              {graph && (
                <div className="absolute bottom-3 right-3 z-30">
                  <BoardControls graph={graph} busy={loading} makePng={makePng} onPaletteChange={changePalette} />
                </div>
              )}
              {/* 画板来源索引：链接只在非编辑手势下打开 */}
              {graph && <SourceIndex sources={collectKnowledgeSources(graph, items)} />}
            </>
          ) : (
            <div className="relative flex h-full flex-col items-center justify-center gap-6 text-center">
              {/* 生成中：working.gif + 进度条 + 状态文案 */}
              {generating ? (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/liukanshan/working.gif" alt="生成中" className="h-32 w-32" />
                  <div className="flex flex-col items-center gap-3">
                    <p className="text-sm font-medium text-[#1a1a1a]">刘看山正在为你炼图…</p>
                    <div className="h-1 w-48 overflow-hidden rounded-full bg-[#e8e8e3]">
                      <div className="h-full w-1/3 rounded-full bg-[#0066ff]" style={{ animation: "shimmer 1.2s ease-in-out infinite" }} />
                    </div>
                    <p className="max-w-xs text-xs leading-5 text-gray-500">
                      正在抓取知乎高赞回答，提炼各方立场与论据
                    </p>
                  </div>
                </>
              ) : (
                <>
                  {/* 单张 hello 动图，无框无阴影 */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/liukanshan/hello.gif" alt="" className="h-36 w-36" />
                  <div>
                    <h2 className="mb-2 text-2xl font-bold text-[#1a1a1a]">
                      看山是山，看山不是山，看山还是山
                    </h2>
                    <p className="text-sm leading-6 text-gray-500">
                      输入一个问题，自动抓取知乎高赞回答，提炼各方立场与论据
                      <br />
                      生成一张可以和 AI 一起打磨的手绘观点对照图
                    </p>
                  </div>
                  <div className="flex flex-wrap justify-center gap-2 text-sm">
                    {(mode === "roadmap"
                      ? ["我想做出一个能用的 Agent", "前端入门", "数据分析"]
                      : ["年轻人该不该买房", "考研还是就业", "AI会取代程序员吗"]
                    ).map((s) => (
                      <button
                        key={s}
                        onClick={() => setQuestion(s)}
                        className="rounded-full border border-gray-200 bg-white px-3.5 py-1.5 text-xs text-gray-500 transition hover:border-[#0066ff]/50 hover:text-[#0066ff]"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {showAgent && (
          <AgentPanel
            graph={graph}
            engine={engine}
            busy={loading}
            onApply={applyAgentGraph}
            onClose={() => setShowAgent(false)}
            progress={harnessProgress}
            sessionId={boardSession}
          />
        )}
        {!showAgent && (
          <button
            onClick={() => setShowAgent(true)}
            title="展开看山助手"
            className="flex w-10 shrink-0 flex-col items-center justify-center gap-2 border-l border-[#e8e8e3] bg-white text-gray-400 transition hover:bg-[#f0f5ff] hover:text-[#0066ff]"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 18l6-6-6-6" />
            </svg>
            <span className="text-[10px] [writing-mode:vertical-rl]">助手</span>
          </button>
        )}
      </div>
      {/* 强制登录墙：未登录用户进入页面即弹出，登录前不可关闭（me 加载完成前不闪弹） */}
      {meLoaded && !me.loggedIn && <LoginPrompt />}
      {/* 热榜确认弹窗 */}
      {pendingHot && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm"
          onClick={() => setPendingHot(null)}
        >
          <div
            className="mx-4 w-full max-w-sm rounded-2xl border border-[#e8e8e3] bg-white p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center gap-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/liukanshan/idle.gif" alt="" className="h-8 w-8" />
              <h3 className="text-sm font-semibold text-[#1a1a1a]">生成观点对照图</h3>
            </div>
            <p className="mb-1 text-xs leading-5 text-gray-600">
              确定要为这条热榜生成一张观点对照图吗？
            </p>
            <p className="mb-4 line-clamp-2 rounded-lg bg-[#fafaf7] px-3 py-2 text-xs font-medium leading-5 text-[#1a1a1a]">
              {pendingHot}
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setPendingHot(null)}
                className="rounded-full border border-gray-200 px-4 py-1.5 text-xs text-gray-500 transition hover:bg-gray-50"
              >
                取消
              </button>
              <button
                onClick={confirmHot}
                className="rounded-full bg-[#0066ff] px-4 py-1.5 text-xs font-medium text-white transition hover:bg-[#0052cc]"
              >
                确定生成
              </button>
            </div>
          </div>
        </div>
      )}
      {/* 清空画布确认弹窗：取消只关闭弹窗，状态原样保留；确认才执行完整清空 */}
      {pendingClear && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm"
          onClick={() => setPendingClear(false)}
        >
          <div
            className="mx-4 w-full max-w-sm rounded-2xl border border-[#e8e8e3] bg-white p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center gap-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/liukanshan/idle.gif" alt="" className="h-8 w-8" />
              <h3 className="text-sm font-semibold text-[#1a1a1a]">清空画布</h3>
            </div>
            <p className="mb-1 text-xs leading-5 text-gray-600">确定要清空当前画布吗？</p>
            <p className="mb-4 text-xs leading-5 text-gray-600">画布上的图、素材列表和本地缓存都会被清除，此操作不可撤销。</p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setPendingClear(false)}
                className="rounded-full border border-gray-200 px-4 py-1.5 text-xs text-gray-500 transition hover:bg-gray-50"
              >
                取消
              </button>
              <button
                onClick={clearBoard}
                className="rounded-full bg-red-500 px-4 py-1.5 text-xs font-medium text-white transition hover:bg-red-600"
              >
                确认清空
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
