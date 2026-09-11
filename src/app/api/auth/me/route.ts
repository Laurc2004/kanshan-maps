import { NextRequest, NextResponse } from "next/server";
import { decodeSession, SESSION_COOKIE } from "@/lib/session";

// 当前登录状态（前端轮询/启动时调用）
export async function GET(req: NextRequest) {
  const session = await decodeSession(req.cookies.get(SESSION_COOKIE)?.value);
  if (!session) return NextResponse.json({ loggedIn: false });
  return NextResponse.json({ loggedIn: true, name: session.name, avatar: session.avatar });
}
