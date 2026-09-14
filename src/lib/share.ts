import type { GraphLike } from "./knowledge-assets.ts";
import { collectKnowledgeSources, graphTitle } from "./knowledge-assets.ts";

export function shareText(graph: GraphLike): string {
  const sources = collectKnowledgeSources(graph);
  const lines = sources.slice(0, 8).map((s, i) => `[${i + 1}] ${s.title} ${s.url}`);
  return `我用「一图看山」整理了：${graphTitle(graph)}\n\n${lines.join("\n")}\n\n来源：知乎 · 内容请以原文为准`;
}

export function safeFilename(title: string): string {
  return (title.replace(/[\\/:*?"<>|\u0000-\u001f]/g, "-").replace(/\s+/g, " ").trim().slice(0, 48) || "kanshan-map") + ".png";
}

export function isShareCancellation(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

export async function copyText(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text);
  const area = document.createElement("textarea");
  area.value = text;
  area.style.position = "fixed";
  area.style.opacity = "0";
  document.body.appendChild(area);
  area.select();
  document.execCommand("copy");
  area.remove();
}

export function downloadBlob(blob: Blob, filename: string): void {
  const href = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = href;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(href), 1000);
}

export async function addWatermark(blob: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height + 96;
  const ctx = canvas.getContext("2d");
  if (!ctx) return blob;
  ctx.fillStyle = "#fafaf7";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0);
  ctx.fillStyle = "#0066ff";
  ctx.font = "600 28px sans-serif";
  ctx.fillText("一图看山 kanshan.space · 来源知乎", 32, bitmap.height + 58);
  return new Promise((resolve) => canvas.toBlob((value) => resolve(value ?? blob), "image/png"));
}
