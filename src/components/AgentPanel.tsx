"use client";

import { useEffect, useRef, useState } from "react";
import type { ViewpointGraph } from "@/lib/viewpoints";
import type { KnowledgeGraph } from "@/lib/harness/types";
import type { RoadmapGraph } from "@/lib/roadmap";
import { historyFromMessages, loadChat, saveChat } from "@/lib/agent-chat-store";

type AgentGraph = ViewpointGraph | RoadmapGraph | KnowledgeGraph;

export type ChatMsg = {
  role: "user" | "assistant";
  content: string;
  detail?: string[]; // 应用成功的操作描述
  failed?: string[];
  questions?: string[]; // clarify 追问
  // preview：待用户确认的结构修改
  preview?: { planId: string; confirmation: string };
  ts: number;
};

// 编排单步记录：阶段 + 做什么 + 输入/输出摘要
export type HarnessStep = {
  label: string; // 中文步骤名
  input?: string; // 该步的输入摘要
  output?: string; // 该步的输出摘要
};

// 看山助手面板里的编排进度（阶段 + 分步输入输出 + 出错信息）
export type HarnessProgress = {
  stage: "planning" | "searching" | "sources" | "synthesizing" | "laying_out" | "validating" | "graph" | "error";
  steps: HarnessStep[];
  error?: string; // stage=error 时的失败原因
};

// 右栏：AI Agent 连续对话面板
// sessionId = 画板会话标识：生成新图/切换画板会换新 id，面板据此重载对应会话的聊天记录，
// 对话数据与图绑定，换图不残留旧对话。
export default function AgentPanel({
  graph,
  engine,
  busy,
  onApply,
  onClose,
  progress,
  sessionId,
}: {
  graph: AgentGraph | null;
  engine: { id: string; baseURL?: string; apiKey?: string; model?: string };
  busy: boolean; // 外层正在生成图时禁用
  onApply: (g: AgentGraph, appliedLabels?: string[]) => void;
  onClose: () => void;
  progress?: HarnessProgress | null;
  sessionId: string;
}) {
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const historyRef = useRef<{ role: string; content: string }[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);
  const graphRef = useRef<AgentGraph | null>(null);
  graphRef.current = graph;
  const sessionRef = useRef(sessionId);
  useEffect(() => {
    sessionRef.current = sessionId;
  }, [sessionId]);

  // 会话切换（换图）即重载该画板的聊天记录；history 同步重建
  const loadedRef = useRef<{ session: string; messages: ChatMsg[] }>({ session: sessionId, messages: [] });
  useEffect(() => {
    const restored = loadChat(sessionId);
    loadedRef.current = { session: sessionId, messages: restored };
    setMessages(restored);
    historyRef.current = historyFromMessages(restored);
  }, [sessionId]);

  // 对话变化即落盘到当前会话
  useEffect(() => {
    // 会话切换瞬间 messages 还是旧会话的数据（load 尚未落定），这次渲染跳过写盘避免串会话
    if (loadedRef.current.session !== sessionId) return;
    if (messages.length === 0 || loadedRef.current.messages === messages) return;
    saveChat(sessionId, messages);
  }, [messages, sessionId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, thinking]);

  const send = async (preset?: string) => {
    const text = (preset ?? input).trim();
    const g = graphRef.current;
    if (!text || thinking || busy) return;
    // 没有图时不报服务器错误，直接在对话里友好提示
    if (!g) {
      setMessages((m) => [
        ...m,
        { role: "user", content: text, ts: Date.now() },
        { role: "assistant", content: "画板上还没有图。先在上方输入问题点「一键看山」，图出来后我就能帮你改了。", ts: Date.now() },
      ]);
      if (!preset) setInput("");
      return;
    }
    if (!preset) setInput("");
    const sentSession = sessionRef.current; // 记录发起时的会话：换图后旧图回复不写入新会话
    setMessages((m) => [...m, { role: "user", content: text, ts: Date.now() }]);
    historyRef.current.push({ role: "user", content: text });
    setThinking(true);
    try {
      const res = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, graph: g, history: historyRef.current.slice(-8), engine }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "助手开小差了");
      if (sessionRef.current !== sentSession) return; // 期间已换图：丢弃旧图回复
      historyRef.current.push({ role: "assistant", content: data.reply });
      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          content: data.reply,
          detail: data.applied,
          failed: data.failed,
          questions: data.questions,
          preview: data.decisionType === "preview" && data.planId
            ? { planId: data.planId, confirmation: data.confirmation ?? "确认执行这组修改吗？" }
            : undefined,
          ts: Date.now(),
        },
      ]);
      if (data.changed) onApply(data.graph, Array.isArray(data.applied) ? data.applied : []);
    } catch (e) {
      setMessages((m) => [
        ...m,
        { role: "assistant", content: e instanceof Error ? e.message : "网络异常，请重试", ts: Date.now() },
      ]);
    } finally {
      setThinking(false);
    }
  };

  const suggestions = ["把第一个立场标为重点", "共识再精简一点", "标题改成更抓眼球的", "这张图的核心分歧是什么"];

  // 确认执行 preview 中的结构修改
  const confirmPreview = async (planId: string, msgIndex: number) => {
    const g = graphRef.current;
    if (!g || thinking) return;
    const sentSession = sessionRef.current; // 换图后旧图确认结果不写入新会话
    setThinking(true);
    try {
      const res = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "commit", planId, graph: g, engine }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "执行失败");
      if (sessionRef.current !== sentSession) return; // 期间已换图：丢弃旧图执行结果
      setMessages((m) => {
        const next = [...m];
        next[msgIndex] = { ...next[msgIndex], preview: undefined };
        return [
          ...next,
          { role: "assistant", content: data.reply, detail: data.applied, failed: data.failed, ts: Date.now() },
        ];
      });
      if (data.changed) onApply(data.graph, Array.isArray(data.applied) ? data.applied : []);
    } catch (e) {
      setMessages((m) => [
        ...m,
        { role: "assistant", content: e instanceof Error ? e.message : "执行失败，请重试", ts: Date.now() },
      ]);
    } finally {
      setThinking(false);
    }
  };

  const cancelPreview = (msgIndex: number) => {
    setMessages((m) => {
      const next = [...m];
      next[msgIndex] = { ...next[msgIndex], preview: undefined };
      return next;
    });
  };

  return (
    <aside className="flex h-full w-80 flex-col border-l border-[#e8e8e3] bg-white">
      <div className="flex items-center gap-2 border-b border-[#e8e8e3] px-4 py-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/liukanshan/idle.gif" alt="刘看山" className="h-7 w-7" />
        <div className="flex-1">
          <h2 className="text-sm font-semibold text-[#1a1a1a]">看山助手</h2>
          <p className="text-[10px] text-gray-400">连续对话，实时改图</p>
        </div>
        <button
          onClick={onClose}
          className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          title="收起面板"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M9 18l6-6-6-6" />
          </svg>
        </button>
      </div>

      <div className="thin-scroll flex-1 overflow-y-auto p-3">
        {progress && (
          <div
            className={`mb-3 rounded-2xl border px-3 py-2.5 text-xs ${
              progress.stage === "error"
                ? "border-red-200 bg-red-50"
                : "border-[#c7d8fe] bg-[#f0f5ff]"
            }`}
            role="status"
            aria-label={progress.stage === "error" ? "编排出错" : "编排进行中"}
          >
            <div className="flex items-center gap-2">
              {progress.stage === "error" ? (
                <span className="text-sm">⚠️</span>
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img src="/liukanshan/working.gif" alt="生成中" className="h-5 w-5" />
              )}
              <span className={`font-medium ${progress.stage === "error" ? "text-red-600" : "text-[#0066ff]"}`}>
                {progress.stage === "error" ? "编排失败" : "正在编排"}
              </span>
            </div>
            {progress.steps.length > 0 && (
              <ul className="mt-2 space-y-1.5 text-[11px] leading-4 text-gray-600">
                {progress.steps.map((s, i) => (
                  <li key={i} className="flex items-start gap-1.5">
                    <span className={`mt-0.5 ${progress.stage === "error" && i === progress.steps.length - 1 ? "text-red-500" : "text-emerald-500"}`}>
                      {progress.stage === "error" && i === progress.steps.length - 1 ? "✗" : "✓"}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-[#1a1a1a]">{s.label}</p>
                      {s.input && <p className="break-all text-gray-400">输入 {s.input}</p>}
                      {s.output && <p className="break-all text-gray-400">输出 {s.output}</p>}
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {progress.stage === "error" && progress.error && (
              <p className="mt-2 rounded-lg bg-white/70 px-2 py-1.5 text-[11px] leading-4 text-red-600">{progress.error}</p>
            )}
          </div>
        )}
        {messages.length === 0 && (
          <div className="flex flex-col items-center gap-3 pt-10 text-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/liukanshan/static-sleepy.png" alt="刘看山" className="h-24 w-24" />
            <p className="px-4 text-xs leading-5 text-gray-500">
              图生成后，可以直接让我改：
              <br />
              调立场、改标题、精简共识、突出重点…
            </p>
            <div className="flex flex-wrap justify-center gap-1.5 px-3">
              {suggestions.map((s) => (
                <button
                  key={s}
                  onClick={() => setInput(s)}
                  className="rounded-full border border-gray-200 px-2.5 py-1 text-[11px] text-gray-500 transition hover:border-[#0066ff]/50 hover:text-[#0066ff]"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`mb-3 flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[85%] rounded-2xl px-3 py-2 text-xs leading-5 ${
                m.role === "user"
                  ? "rounded-br-sm bg-[#0066ff] text-white"
                  : "rounded-bl-sm bg-[#f4f4f1] text-[#1a1a1a]"
              }`}
            >
              <p>{m.content}</p>
              {m.questions && m.questions.length > 0 && (
                <ul className="mt-1.5 space-y-1 border-t border-black/5 pt-1.5 text-[11px] text-gray-600">
                  {m.questions.map((q, j) => (
                    <li key={j}>🤔 {q}</li>
                  ))}
                </ul>
              )}
              {m.preview && (
                <div className="mt-2 rounded-xl border border-amber-200 bg-amber-50 p-2.5">
                  <p className="mb-2 text-[11px] leading-4 text-amber-800">{m.preview.confirmation}</p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => confirmPreview(m.preview!.planId, i)}
                      disabled={thinking}
                      className="rounded-full bg-[#0066ff] px-3 py-1 text-[11px] font-medium text-white transition hover:bg-[#0052cc] disabled:opacity-40"
                    >
                      确认执行
                    </button>
                    <button
                      onClick={() => cancelPreview(i)}
                      className="rounded-full border border-gray-200 bg-white px-3 py-1 text-[11px] text-gray-500 transition hover:bg-gray-50"
                    >
                      取消
                    </button>
                  </div>
                </div>
              )}
              {m.detail && m.detail.length > 0 && (
                <ul className="mt-1.5 space-y-0.5 border-t border-black/5 pt-1.5 text-[10px] text-gray-500">
                  {m.detail.map((d, j) => (
                    <li key={j}>✓ {d}</li>
                  ))}
                  {m.failed?.map((d, j) => (
                    <li key={`f${j}`} className="text-amber-600">✗ {d}</li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        ))}
        {thinking && (
          <div className="mb-3 flex items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/liukanshan/working.gif" alt="思考中" className="h-8 w-8" />
            <span className="text-xs text-gray-400">看山思考中…</span>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="border-t border-[#e8e8e3] p-3">
        {!graph && (
          <p className="mb-2 text-center text-[10px] text-gray-400">先在上方输入问题，生成第一张地图</p>
        )}
        <div className="flex items-end gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                send();
              }
            }}
            placeholder={graph ? "说说想怎么改这张图…" : "等图生成后就能对话了（也可以先点上方建议试试）"}
            disabled={thinking || busy}
            rows={2}
            className="thin-scroll flex-1 resize-none rounded-xl border border-gray-200 bg-[#fafaf7] px-3 py-2 text-xs leading-5 outline-none transition focus:border-[#0066ff]/50 focus:bg-white disabled:opacity-50"
          />
          <button
            onClick={() => send()}
            disabled={!input.trim() || thinking || busy}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#0066ff] text-white transition hover:bg-[#0052cc] disabled:opacity-40"
            title="发送"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <path d="M12 19V5M5 12l7-7 7 7" />
            </svg>
          </button>
        </div>
      </div>
    </aside>
  );
}
