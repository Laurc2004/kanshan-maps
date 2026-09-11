"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import dynamic from "next/dynamic";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import "@excalidraw/excalidraw/index.css";
import type { ViewpointGraph } from "@/lib/viewpoints";
import type { SearchResultItem } from "@/lib/zhihu";
import AgentPanel from "@/components/AgentPanel";
import SourcesPanel from "@/components/SourcesPanel";

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

export default function Home() {
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [graph, setGraph] = useState<ViewpointGraph | null>(null);
  const [items, setItems] = useState<SearchResultItem[]>([]);
  const [showSources, setShowSources] = useState(true);
  const [showEngineCfg, setShowEngineCfg] = useState(false);
  const [engine, setEngine] = useState<Engine>({ id: "builtin" });
  const [me, setMe] = useState<{ loggedIn: boolean; name?: string }>({ loggedIn: false });
  const [followeeCount, setFolloweeCount] = useState(0);
  const [authNotice, setAuthNotice] = useState<string | null>(null);

  const apiRef = useRef<ExcalidrawImperativeAPI | null>(null);
  const pendingRef = useRef<unknown[] | null>(null);
  const [boardMounted, setBoardMounted] = useState(false);
  const followeesRef = useRef<Set<string>>(new Set());
  const graphRef = useRef<ViewpointGraph | null>(null);
  const renderGraphRef = useRef<(g: ViewpointGraph, f?: Set<string>) => void>(() => {});

  // 启动：读登录态 + 处理 OAuth 回调错误参数
  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => setMe(d))
      .catch(() => {});
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

  // 稳定引用：excalidrawAPI 回调不随 state 变化重建（避免重复挂载双实例）
  const onApiReady = useCallback((api: ExcalidrawImperativeAPI) => {
    apiRef.current = api;
    if (typeof window !== "undefined") (window as unknown as Record<string, unknown>).__excal = api;
    if (pendingRef.current) {
      const els = pendingRef.current;
      // 注意：这里不能只在回调后固定 setTimeout 注入。
      // excalidrawAPI 回调先于内部 _App 挂载（顺序取决于动态 chunk 加载时机），
      // 过早 updateScene 会命中 "setState on unmounted" 被静默丢弃（已复现）。
      // 改用重试轮询：直到元素真正出现在场景里才停。
      let tries = 0;
      const timer = setInterval(() => {
        tries += 1;
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

  const renderGraph = useCallback(async (g: ViewpointGraph, followed?: Set<string>) => {
    const { graphToScene } = await import("@/lib/excalidraw-layout");
    const elements = graphToScene(g, followed ?? followeesRef.current) as never[];
    if (apiRef.current) {
      apiRef.current.updateScene({ elements });
      setTimeout(
        () => apiRef.current?.scrollToContent(undefined, { fitToViewport: true, viewportZoomFactor: 0.85 }),
        100
      );
    } else {
      pendingRef.current = elements;
      setBoardMounted(true);
    }
  }, []);
  // renderGraphRef 只在 effect/事件里被读；同步赋值放 effect 里避免渲染期写 ref
  useEffect(() => {
    renderGraphRef.current = renderGraph;
  }, [renderGraph]);

  const generate = useCallback(async () => {
    if (!question.trim() || loading) return;
    setLoading(true);
    setError(null);
    setStatus("正在搜索知乎相关回答…");
    try {
      setStatus("正在分析各方观点立场…");
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, engine }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "生成失败");
      setStatus("正在绘制知识地图…");
      setGraph(data.graph);
      graphRef.current = data.graph;
      setItems(data.items ?? []);
      setShowSources(true);
      setBoardMounted(true);
      await renderGraph(data.graph);
      setStatus(data.cached ? "已生成（缓存）" : `已生成 · 基于 ${data.sources} 条知乎内容`);
      setTimeout(() => setStatus(null), 4000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "生成失败，请稍后重试");
      setStatus(null);
    } finally {
      setLoading(false);
    }
  }, [question, loading, engine, renderGraph]);

  // Agent 对话修改后的 graph 回灌画板
  const applyAgentGraph = useCallback(
    (g: ViewpointGraph) => {
      setGraph(g);
      graphRef.current = g;
      renderGraph(g);
    },
    [renderGraph]
  );

  return (
    <main className="flex h-screen flex-col bg-[#fafaf7]">
      {/* 顶栏 */}
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-[#e8e8e3] bg-white px-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/liukanshan/sway.gif" alt="刘看山" className="h-9 w-9" />
        <div className="leading-tight">
          <h1 className="text-[15px] font-bold text-[#1a1a1a]">一图看山</h1>
          <p className="hidden text-[11px] text-gray-400 sm:block">把知乎的百家之言，炼成一张看得懂的地图</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <div className="relative">
            <input
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && generate()}
              placeholder="输入一个有争议的问题，如：年轻人该不该买房"
              className="w-64 rounded-full border border-gray-200 bg-[#fafaf7] py-2 pl-4 pr-3 text-sm outline-none transition focus:border-[#0066ff]/60 focus:bg-white focus:shadow-sm sm:w-80"
              disabled={loading}
            />
          </div>
          <button
            onClick={generate}
            disabled={loading || !question.trim()}
            className="flex items-center gap-1.5 rounded-full bg-[#0066ff] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#0052cc] disabled:opacity-50"
          >
            {loading ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/liukanshan/working.gif" alt="" className="h-5 w-5" />
                炼图中…
              </>
            ) : (
              "一键看山"
            )}
          </button>
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
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/liukanshan/ball.gif" alt="" className="h-5 w-5" />
              知乎登录
            </a>
          )}
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
              { id: "builtin", label: "内置引擎（推荐）" },
              { id: "zhida", label: "知乎直答（官方）" },
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

      {/* 状态条 */}
      {(status || error) && (
        <div
          className={`shrink-0 px-5 py-1.5 text-xs ${
            error ? "bg-red-50 text-red-600" : "bg-[#f0f5ff] text-[#0066ff]"
          }`}
        >
          {error ?? status}
        </div>
      )}

      {/* 三栏工作区：显式像素高度 + contain，Excalidraw 高度才不会失控 */}
      <div className="flex min-h-0 flex-1">
        {showSources && <SourcesPanel items={items} graph={graph} onClose={() => setShowSources(false)} />}

        <div
          className="min-w-0 flex-1 [&_.excalidraw]:h-full [&_.excalidraw-wrapper]:h-full"
          style={{ contain: "size" }}
        >
          {boardMounted ? (
            <Excalidraw excalidrawAPI={onApiReady} viewModeEnabled={false} gridModeEnabled />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-5 text-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/liukanshan/hello.gif" alt="刘看山打招呼" className="h-32 w-32" />
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
                {["年轻人该不该买房", "考研还是就业", "AI会取代程序员吗"].map((s) => (
                  <button
                    key={s}
                    onClick={() => setQuestion(s)}
                    className="rounded-full border border-gray-200 bg-white px-3.5 py-1.5 text-xs text-gray-500 transition hover:border-[#0066ff]/50 hover:text-[#0066ff]"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <AgentPanel graph={graph} engine={engine} busy={loading} onApply={applyAgentGraph} />
      </div>
    </main>
  );
}
