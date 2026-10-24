import { test } from "node:test";
import assert from "node:assert/strict";
import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import { resolve } from "node:path";
import { lessonOptions, projectMessage, toolPathAllowed, verifyFile, validatePrompt, WORKSPACE, TARGET } from "./agent.js";

test("validate the prompt before starting a runtime", () => {
  assert.equal(validatePrompt("  Hello  "), "Hello");
  for (const value of [null, " ", "x".repeat(2001)]) assert.throws(() => validatePrompt(value));
});
test("assistant text is evidence, not a completion signal", () => {
  const message = { type: "assistant", message: { content: [{ type: "text", text: "Hello" }, { type: "tool_use", name: "Glob", input: { pattern: "**/*" } }] } } as SDKMessage;
  assert.deepEqual(projectMessage(message), [{ type: "answer", text: "Hello" }, { type: "tool", name: "Glob", pattern: "**/*" }]);
});

test("bug fixing enables only the lesson tools and acceptEdits", () => {
  const options = lessonOptions();
  assert.equal(options.cwd, WORKSPACE);
  assert.deepEqual(options.tools, ["Read", "Edit", "Glob"]);
  assert.deepEqual(options.allowedTools, ["Read", "Edit", "Glob"]);
  assert.equal(options.permissionMode, "acceptEdits");
  assert.ok(options.maxTurns! > 1, "A tool round trip needs room for a final answer");
});

test("the path guard rejects edits and reads outside the demo target", () => {
  assert.ok(toolPathAllowed("Edit", { file_path: TARGET }));
  assert.ok(toolPathAllowed("Read", { file_path: "utils.py" }));
  assert.ok(toolPathAllowed("Glob", { pattern: "*.py" }));
  assert.equal(toolPathAllowed("Edit", { file_path: "../other.py" }), false);
  assert.equal(toolPathAllowed("Read", { file_path: resolve(".env") }), false);
  assert.equal(toolPathAllowed("Glob", { pattern: "../**/*" }), false);
  assert.equal(toolPathAllowed("Glob", { pattern: "*.py", path: ".." }), false);
  assert.equal(toolPathAllowed("Bash", { command: "python utils.py" }), false);
});

test("independent Python checks catch the two bugs and accept a corrected control", async () => {
  const before = await verifyFile(resolve("fixtures/utils.py"));
  assert.equal(before.available, true);
  assert.equal(before.passed, 2);
  assert.deepEqual(before.cases.filter((item) => !item.passed).map((item) => item.error), ["ZeroDivisionError", "TypeError"]);
  const after = await verifyFile(resolve("fixtures/fixed-utils.py"));
  assert.equal(after.available, true);
  assert.equal(after.passed, 4);
});
test("an SDK error flag must not become a successful run", () => {
  const result = { type: "result", subtype: "success", is_error: true, result: "API error", session_id: "test", total_cost_usd: 0, num_turns: 1 } as SDKMessage;
  assert.equal(projectMessage(result)[0].type, "result");
  assert.equal((projectMessage(result)[0] as { status: string }).status, "error");
});
test("keep turn-limit outcomes distinct from success", () => {
  const result = { type: "result", subtype: "error_max_turns", errors: ["Turn limit reached"], session_id: "test", total_cost_usd: 0.001, num_turns: 1 } as SDKMessage;
  const [event] = projectMessage(result);
  assert.ok(event.type === "result");
  assert.equal(event.status, "error_max_turns");
  assert.equal(event.text, "Turn limit reached");
});
