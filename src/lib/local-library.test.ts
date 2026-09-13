import test from "node:test";
import assert from "node:assert/strict";
import { deleteBoard, libraryCapabilities, listSavedBoards, saveBoard, savedBoardKey, stableBoardId } from "./local-library.ts";

function memory() {
  const values = new Map<string, string>();
  return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, next: string) => { values.set(key, next); } };
}

test("upserts and deletes local boards", () => {
  const storage = memory();
  saveBoard(storage as never, { id: "a", title: "A", mode: "compare", graph: {}, savedAt: 1 });
  saveBoard(storage as never, { id: "a", title: "A2", mode: "roadmap", graph: {}, savedAt: 2 });
  assert.deepEqual(listSavedBoards(storage as never).map((b) => b.title), ["A2"]);
  assert.equal(deleteBoard(storage as never, "a").length, 0);
});

test("ignores corrupt local data and caps the library", () => {
  const storage = memory();
  storage.setItem("x", "nope");
  assert.deepEqual(listSavedBoards(storage as never), []);
  for (let i = 0; i < 25; i++) saveBoard(storage as never, { id: String(i), title: String(i), mode: "compare", graph: {}, savedAt: i });
  assert.equal(listSavedBoards(storage as never).length, 20);
});

test("isolates local assets by stable account namespace", () => {
  const storage = memory();
  saveBoard(storage as never, { id: "a", title: "A", mode: "compare", graph: {}, savedAt: 1 }, "user:42");
  assert.equal(listSavedBoards(storage as never, "user:42").length, 1);
  assert.equal(listSavedBoards(storage as never, "user:43").length, 0);
  assert.equal(savedBoardKey("user:42"), "kanshan.library.v1:user_42");
  assert.equal(stableBoardId("user:42", "compare", "同一主题"), stableBoardId("user:42", "compare", "同一主题"));
  assert.notEqual(stableBoardId("user:42", "compare", "同一主题"), stableBoardId("user:43", "compare", "同一主题"));
  assert.deepEqual(libraryCapabilities, { localOnly: true, cloudSync: false, serverPersistence: false });
});
