import OpenAI from "openai";

// 转换引擎：可插拔的大模型后端
// - 内置默认：api.openai-next.com / deepseek-v4-flash（OpenAI 兼容）
// - 比赛叙事：知乎直答 zhida-fast-1p5
// - 用户自定义：任意 OpenAI 兼容 baseURL + apiKey + model

export type EngineId = "builtin" | "zhida" | "custom";

export type EngineConfig = {
  id: EngineId;
  label: string;
  baseURL?: string; // custom 必填
  apiKey?: string; // custom 必填；builtin/zhida 服务端注入
  model?: string; // custom 可选
};

// 服务端内置引擎（key 走环境变量，绝不下发前端）
export function builtinEngines() {
  return {
    builtin: {
      baseURL: process.env.OPENAI_COMPAT_BASEURL || "https://api.openai-next.com/v1",
      apiKey: process.env.OPENAI_COMPAT_API_KEY || "",
      model: process.env.OPENAI_COMPAT_MODEL || "deepseek-v4-pro",
    },
    // zhida 不走 OpenAI SDK，由 zhihu.ts 的 zhida() 处理
  };
}

export async function chatComplete(cfg: { baseURL: string; apiKey: string; model: string }, messages: { role: string; content: string }[]): Promise<string> {
  const client = new OpenAI({ baseURL: cfg.baseURL, apiKey: cfg.apiKey, maxRetries: 1, timeout: 90_000 });
  const res = await client.chat.completions.create({
    model: cfg.model,
    messages: messages as OpenAI.Chat.Completions.ChatCompletionMessageParam[],
    stream: false,
  });
  const content = res.choices?.[0]?.message?.content;
  if (!content) throw new Error("模型返回为空");
  return content;
}
