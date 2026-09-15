"use client";

// 强制登录墙：未登录用户进入页面即弹出，登录前不可关闭（无关闭按钮、点遮罩不关闭）
// 纯前端控制（基于 /api/auth/me 的登录态）
export default function LoginPrompt() {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[#fafaf7]/95 backdrop-blur-sm">
      <div className="mx-4 w-full max-w-sm rounded-2xl border border-[#e8e8e3] bg-white p-6 text-center shadow-xl">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/liukanshan/hello.gif" alt="刘看山" className="mx-auto mb-3 h-24 w-24" />
        <h3 className="mb-1.5 text-base font-bold text-[#1a1a1a]">登录后体验一图看山</h3>
        <p className="mb-1 text-xs leading-5 text-gray-500">
          一键把知乎高赞回答炼成手绘知识地图
          <br />
          还能和 AI 助手连续对话打磨图表
        </p>
        <p className="mb-5 text-[11px] leading-4 text-gray-400">
          登录即解锁：观点对照 / 学习路线 / 文章摘要 · 关注答主高亮 · 收藏夹生成 · 我的看山
        </p>
        <a
          href="/api/auth/login"
          className="flex w-full items-center justify-center gap-1.5 rounded-full bg-[#0066ff] py-2.5 text-sm font-medium text-white transition hover:bg-[#0052cc]"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M15 3h4a2 2 0 012 2v14a2 2 0 01-2 2h-4M10 17l5-5-5-5M15 12H3" />
          </svg>
          使用知乎账号登录
        </a>
      </div>
    </div>
  );
}
