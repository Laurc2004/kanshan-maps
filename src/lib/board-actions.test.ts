import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { requestClearBoard, searchRequest, type ClearState } from "./board-actions.ts";

void describe("clear confirmation contract", () => {
  void it("returns null when clear is not confirmed — no state change", () => {
    const result = requestClearBoard(false);
    assert.equal(result, null, "未确认时不得产生清理动作");
  });

  void it("returns a full fresh initial state when confirmed", () => {
    const state = requestClearBoard(true) as ClearState;
    assert.equal(state.graph, null);
    assert.deepEqual(state.items, []);
    assert.equal(state.question, "");
    assert.equal(state.error, null);
    assert.equal(state.status, null);
    assert.equal(state.generating, false);
    assert.equal(state.boardMounted, false);
    assert.equal(state.restored, false);
  });

  void it("returns a fresh object each confirmed call (no shared mutation)", () => {
    const a = requestClearBoard(true);
    const b = requestClearBoard(true);
    assert.notEqual(a, b);
  });
});

void describe("search request params contract", () => {
  void it("contains only Query and Count — never Offset", () => {
    const params = searchRequest("年轻人该不该买房");
    assert.equal(params.Query, "年轻人该不该买房");
    assert.equal(params.Count, 10);
    assert.deepEqual(Object.keys(params).sort(), ["Count", "Query"], "不得包含 Offset");
  });

  void it("clamps Count to the Zhihu hard limit of 10", () => {
    assert.equal(searchRequest("q", 99).Count, 10);
    assert.equal(searchRequest("q", 5).Count, 5);
    assert.equal(searchRequest("q", 0).Count, 1);
  });

  void it("defaults Count to 10 when omitted", () => {
    assert.equal(searchRequest("q").Count, 10);
  });
});