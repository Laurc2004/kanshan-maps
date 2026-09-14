import type { ChatMsg } from "@/components/AgentPanel";

// 看山助手对话与画板会话绑定：
// 每次生成新图/切换画板都开启新的 boardSession，聊天记录按 session 存 sessionStorage，
// 换图即换会话，旧图对话不残留；恢复画板时对话随画板一起回来。

const KEY_PREFIX = "kanshan.agent-chat.v1";
const MAX_MESSAGES = 200;

function storageKey(sessionId: string): string {
  const safe = sessionId.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80);
  return `${KEY_PREFIX}:${safe}`;
}

function isChatMsg(value: unknown): value is ChatMsg {
  if (!value || typeof value !== "object") return false;
  const v = value as Partial<ChatMsg>;
  return v.role === "user" || v.role === "assistant"
    ? typeof v.content === "string" && typeof v.ts === "number"
    : false;
}

export function newBoardSessionId(): string {
  return `s-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function loadChat(sessionId: string): ChatMsg[] {
  try {
    const raw = sessionStorage.getItem(storageKey(sessionId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isChatMsg).slice(-MAX_MESSAGES);
  } catch {
    return [];
  }
}

export function saveChat(sessionId: string, messages: ChatMsg[]): void {
  try {
    // 空会话直接清掉，不留脏 key
    if (messages.length === 0) {
      sessionStorage.removeItem(storageKey(sessionId));
      return;
    }
    sessionStorage.setItem(storageKey(sessionId), JSON.stringify(messages.slice(-MAX_MESSAGES)));
  } catch {
    /* 存储满/被禁用：聊天是锦上添花，不因此打断功能 */
  }
}

// 对话恢复时重建发给 /api/agent 的 history（与 AgentPanel.historyRef 同口径：最多 8 条）
export function historyFromMessages(messages: ChatMsg[]): { role: string; content: string }[] {
  return messages
    .filter((m) => typeof m.content === "string" && m.content.length > 0)
    .map((m) => ({ role: m.role, content: m.content }))
    .slice(-8);
}
