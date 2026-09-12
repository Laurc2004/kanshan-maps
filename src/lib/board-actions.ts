// 纯函数契约：清空画布的确认动作 + 搜索请求参数。
// 让 UI 不再内嵌「清空逻辑」和「拼 URLSearchParams」，行为可单测。

export type ClearState = {
  graph: null;
  items: [];
  question: string;
  error: null;
  status: null;
  generating: boolean;
  boardMounted: boolean;
  restored: boolean;
};

// 未确认（false）→ null，调用方原样保留所有状态；确认（true）→ 返回全新初始状态快照。
export function requestClearBoard(confirmed: boolean): ClearState | null {
  if (!confirmed) return null;
  return {
    graph: null,
    items: [],
    question: "",
    error: null,
    status: null,
    generating: false,
    boardMounted: false,
    restored: false,
  };
}

// /api/search 请求参数：只包含 Query 和 Count（知乎单次搜索硬上限 10），永不携带 Offset。
export function searchRequest(query: string, count = 10): { Query: string; Count: number } {
  return {
    Query: query,
    Count: Math.min(Math.max(count, 1), 10),
  };
}