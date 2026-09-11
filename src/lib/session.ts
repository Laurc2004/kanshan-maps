// 知乎 OAuth 会话管理：HMAC 签名 cookie，服务端无状态
// cookie 值 = base64url(JSON payload) + "." + HMAC-SHA256 签名
// payload 只含 oauth_token + 昵称/头像 + 过期时间，不含 app_key

const COOKIE_NAME = "ks_session";
const TTL_S = 60 * 60 * 24 * 7; // 7 天

export type Session = {
  t: string; // zhihu oauth token
  name?: string;
  avatar?: string;
  exp: number; // 秒级时间戳
};

function getKey() {
  const secret = process.env.ZHIHU_ACCESS_SECRET ?? "";
  return new TextEncoder().encode(secret);
}

function b64url(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = "";
  bytes.forEach((b) => (s += String.fromCharCode(b)));
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function unb64url(s: string): Uint8Array {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function sign(data: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", getKey(), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  return b64url(sig);
}

export async function encodeSession(token: string, name?: string, avatar?: string): Promise<string> {
  const payload: Session = { t: token, name, avatar, exp: Math.floor(Date.now() / 1000) + TTL_S };
  const body = b64url(new TextEncoder().encode(JSON.stringify(payload)));
  return `${body}.${await sign(body)}`;
}

export async function decodeSession(cookie: string | undefined): Promise<Session | null> {
  if (!cookie) return null;
  const dot = cookie.lastIndexOf(".");
  if (dot === -1) return null;
  const body = cookie.slice(0, dot);
  const sig = cookie.slice(dot + 1);
  if ((await sign(body)) !== sig) return null;
  try {
    const payload = JSON.parse(new TextDecoder().decode(unb64url(body))) as Session;
    if (!payload.t || payload.exp < Date.now() / 1000) return null;
    return payload;
  } catch {
    return null;
  }
}

export const SESSION_COOKIE = COOKIE_NAME;
export const SESSION_MAX_AGE = TTL_S;
