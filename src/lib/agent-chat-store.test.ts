import test from "node:test";
import assert from "node:assert/strict";

// node --test 无法直接解析 @/ 别名，这里内联 ChatMsg 的最小形状（agent-chat-store 只依赖类型，
// 运行时仅访问 role/content/ts/length 等字段，用结构等价对象测试存取逻辑）。
const { historyFromMessages, loadChat, newBoardSessionId, saveChat } = await import("./agent-chat-store.ts");

// sessionStorage 在 node 测试环境不存在：agent-chat-store 必须容错（load 返回 []、save 不抛）
// —— 与浏览器行为的差异（真正落盘）由 E2E 覆盖，这里锁定“不炸”契约。

test("newBoardSessionId returns fresh unique ids", () => {
  const a = newBoardSessionId();
  const b = newBoardSessionId();
  assert.match(a, /^s-/);
  assert.notEqual(a, b);
});

test("loadChat tolerates missing sessionStorage (node env)", () => {
  assert.deepEqual(loadChat("s-1"), []);
});

test("saveChat does not throw without sessionStorage", () => {
  assert.doesNotThrow(() => saveChat("s-1", []));
  assert.doesNotThrow(() => saveChat("s-1", [{ role: "user", content: "hi", ts: 1 }]));
});

test("historyFromMessages maps roles/content and caps at 8", () => {
  const msgs = Array.from({ length: 10 }, (_, i) => ({
    role: i % 2 === 0 ? ("user" as const) : ("assistant" as const),
    content: `m${i}`,
    ts: i,
  }));
  const history = historyFromMessages(msgs);
  assert.equal(history.length, 8);
  assert.deepEqual(history[0], { role: "user", content: "m2" }); // 最早两条被裁掉
  assert.deepEqual(history[7], { role: "assistant", content: "m9" });
});

test("historyFromMessages drops empty content", () => {
  const history = historyFromMessages([
    { role: "user", content: "", ts: 1 },
    { role: "assistant", content: "ok", ts: 2 },
  ]);
  assert.deepEqual(history, [{ role: "assistant", content: "ok" }]);
});
