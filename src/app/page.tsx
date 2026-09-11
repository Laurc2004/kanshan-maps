"use client";

import { useState, useCallback, useRef } from "react";
import dynamic from "next/dynamic";

const Excalidraw = dynamic(() => import("@excalidraw/excalidraw").then((m) => m.Excalidraw), {
  ssr: false,
  loading: () => <div className="flex h-full items-center justify-center text-gray-400">画板加载中…</div>,
});

import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import "@excalidraw/excalidraw/index.css";

export default function Home() {
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [excal, setExcal] = useState<ExcalidrawImperativeAPI | null>(null);
  const pendingRef = useRef<any[] | null>(null);
  const [renderTick, setRenderTick] = useState(0); // 触发画板区域挂载
  const apiRef = useRef<ExcalidrawImperativeAPI | null>(null);
  const [showEngineCfg, setShowEngineCfg] = useState(false);
  const [engine, setEngine] = useState<{ id: string; baseURL?: string; apiKey?: string; model?: string }>({ id: "builtin" });

  // 稳定引用：excalidrawAPI 回调不随 state 变化重建（避免重复挂载双实例）
  const onApiReady = useCallback((api: ExcalidrawImperativeAPI) => {
    apiRef.current = api;
    setExcal(api);
    if (typeof window !== "undefined") (window as any).__excal = api; // debug/E2E hook
    if (pendingRef.current) {
      const els = pendingRef.current;
      pendingRef.current = null;
      // 关键：excalidrawAPI 回调触发时内部 App 可能尚未挂载（过早 updateScene 会触发
      // "setState on unmounted component" 且被丢弃），延后到下一轮事件循环再注入
      setTimeout(() => {
        api.updateScene({ elements: els });
        api.scrollToContent(undefined, { fitToViewport: true, viewportZoomFactor: 0.85 });
      }, 300);
    }
  }, []);

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
      const { graphToScene } = await import("@/lib/excalidraw-layout");
      const elements = graphToScene(data.graph) as any;
      if (apiRef.current) {
        apiRef.current.updateScene({ elements });
        setTimeout(() => apiRef.current?.scrollToContent(undefined, { fitToViewport: true, viewportZoomFactor: 0.85 }), 100);
      } else {
        pendingRef.current = elements; // 组件未挂载，先存起来
        setRenderTick((t) => t + 1);
      }
      setStatus(data.cached ? "已生成（缓存）" : `已生成 · 基于 ${data.sources} 条知乎内容`);
      setTimeout(() => setStatus(null), 4000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "生成失败，请稍后重试");
      setStatus(null);
    } finally {
      setLoading(false);
    }
  }, [question, loading, excal]);

  return (
    <main className="flex h-screen flex-col bg-[#faf9f6]">
      <header className="flex items-center gap-3 border-b border-gray-200 bg-white px-5 py-3">
        <span className="text-2xl">🏔️</span>
        <h1 className="text-lg font-bold">一图看山</h1>
        <span className="hidden text-sm text-gray-400 sm:inline">把知乎回答炼成一张可编辑的知识地图</span>
        <div className="ml-auto flex items-center gap-2">
          <input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && generate()}
            placeholder="输入一个有争议的问题，如：年轻人该不该买房"
            className="w-72 rounded-lg border border-gray-300 bg-gray-50 px-3 py-1.5 text-sm outline-none focus:border-blue-400 focus:bg-white"
            disabled={loading}
          />
          <button
            onClick={generate}
            disabled={loading || !question.trim()}
            className="rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? "炼图中…" : "一键看山"}
          </button>
          <button
            onClick={() => setShowEngineCfg((v) => !v)}
            title="转换引擎设置"
            className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm text-gray-500 hover:border-blue-300 hover:text-blue-500"
          >
            ⚙️
          </button>
        </div>
      </header>

      {showEngineCfg && (
        <div className="border-b border-gray-200 bg-white px-5 py-3 text-sm">
          <div className="mb-2 font-medium">转换引擎（把知乎内容炼成画板的大模型）</div>
          <div className="mb-3 flex flex-wrap gap-2">
            {[
              { id: "builtin", label: "内置 deepseek-v4-flash（推荐）" },
              { id: "zhida", label: "知乎直答（官方）" },
              { id: "custom", label: "自定义 OpenAI 兼容" },
            ].map((e) => (
              <button
                key={e.id}
                onClick={() => setEngine((prev) => ({ ...prev, id: e.id }))}
                className={`rounded-full border px-3 py-1 ${
                  engine.id === e.id ? "border-blue-500 bg-blue-50 text-blue-600" : "border-gray-200 text-gray-500 hover:border-blue-300"
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
                className="rounded border border-gray-300 px-2 py-1 text-xs"
              />
              <input
                value={engine.apiKey ?? ""}
                onChange={(e) => setEngine((p) => ({ ...p, apiKey: e.target.value }))}
                placeholder="API Key（仅本次会话使用，不存储）"
                type="password"
                className="rounded border border-gray-300 px-2 py-1 text-xs"
              />
              <input
                value={engine.model ?? ""}
                onChange={(e) => setEngine((p) => ({ ...p, model: e.target.value }))}
                placeholder="模型名，如 deepseek-v4-flash"
                className="rounded border border-gray-300 px-2 py-1 text-xs"
              />
            </div>
          )}
          <p className="mt-2 text-xs text-gray-400">
            自定义引擎的 Key 只在生成时经服务端转发给对应端点，不落盘、不进缓存；内置引擎使用官方比赛配额，结果按问题缓存 6 小时。
          </p>
        </div>
      )}

      {(status || error) && (
        <div className={`px-5 py-2 text-sm ${error ? "bg-red-50 text-red-600" : "bg-blue-50 text-blue-600"}`}>
          {error ?? status}
        </div>
      )}

      {/* 显式像素高度：flex 子项嵌套下 Excalidraw 容器高度计算会失控（canvas 高度顶到 2^25 上限） */}
      <div className="h-[calc(100vh-61px)] min-h-0 flex-1 [&_.excalidraw]:h-full [&_.excalidraw-wrapper]:h-full" style={{ contain: "size" }}>
        {renderTick > 0 ? (
          <Excalidraw excalidrawAPI={onApiReady} viewModeEnabled={false} gridModeEnabled />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-6 text-center">
            <div className="text-7xl">🏔️</div>
            <div>
              <h2 className="mb-2 text-2xl font-bold">看山是山，看山不是山，看山还是山</h2>
              <p className="text-gray-500">
                输入一个问题，自动抓取知乎高赞回答，提炼各方立场与论据，
                <br />
                生成一张可以自由编辑的手绘观点对照图
              </p>
            </div>
            <div className="flex gap-2 text-sm text-gray-400">
              {["年轻人该不该买房", "考研还是就业", "AI会取代程序员吗"].map((s) => (
                <button
                  key={s}
                  onClick={() => setQuestion(s)}
                  className="rounded-full border border-gray-200 px-3 py-1 hover:border-blue-300 hover:text-blue-500"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
