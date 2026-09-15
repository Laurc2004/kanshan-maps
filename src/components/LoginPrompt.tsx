"use client";

// 未登录引导弹窗：点击生成/找回答/看山助手等核心功能时弹出，引导知乎登录
// 纯前端控制（基于 /api/auth/me 的登录态），拦截交互不拦截浏览
export default function LoginPrompt({
  feature,
  onClose,
}: {
  feature?: string; // 触发来源，如「生成知识地图」「看山助手」
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="mx-4 w-full max-w-sm rounded-2xl border border-[#e8e8e3] bg-white p-6 text-center shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/liukanshan/hello.gif" alt="刘看山" className="mx-auto mb-3 h-20 w-20" />
        <h3 className="mb-1.5 text-[15px] font-bold text-[#1a1a1a]">登录后体验完整功能</h3>
        <p className="mb-5 text-xs leading-5 text-gray-500">
          {feature ? `「${feature}」需要知乎登录。` : "这个功能需要知乎登录。"}
          <br />
          登录后还能解锁：关注答主高亮、收藏夹一键生成、我的看山
        </p>
        <a
          href="/api/auth/login"
          className="mb-2.5 flex w-full items-center justify-center gap-1.5 rounded-full bg-[#0066ff] py-2 text-sm font-medium text-white transition hover:bg-[#0052cc]"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M15 3h4a2 2 0 012 2v14a2 2 0 01-2 2h-4M10 17l5-5-5-5M15 12H3" />
          </svg>
          使用知乎账号登录
        </a>
        <button
          onClick={onClose}
          className="w-full rounded-full py-1.5 text-xs text-gray-400 transition hover:text-gray-600"
        >
          先随便看看
        </button>
      </div>
    </div>
  );
}
