import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "一图看山 — 把知乎回答炼成知识地图",
  description: "输入一个问题，提炼知乎各方观点，生成可编辑的手绘观点对照图，和 AI 一起打磨。",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="zh-CN"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {/* Excalidraw 字体资源路径：Xiaolai/Excalifont 从本地 public 服务，不依赖 esm.sh CDN */}
        <script
          dangerouslySetInnerHTML={{
            __html: `window.EXCALIDRAW_ASSET_PATH = "/excalidraw-assets/";`,
          }}
        />
        {children}
      </body>
    </html>
  );
}
