import { query, type Options, type SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import { readFile, writeFile, mkdir, access } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { basename, resolve } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

export const DEFAULT_PROMPT = "Review utils.py for bugs that would cause crashes. Fix any issues you find.";
export const MODEL = process.env.CLAUDE_MODEL || "claude-sonnet-4-6";
export const WORKSPACE = fileURLToPath(new URL("../.runtime/bugfix-workspace/", import.meta.url));
export const TARGET = resolve(WORKSPACE, "utils.py");
const FIXTURE = new URL("../fixtures/utils.py", import.meta.url);
const execute = promisify(execFile);
export type Checks = { available: boolean; passed: number; total: number; cases: { label: string; passed: boolean; expected: unknown; actual?: unknown; error?: string }[]; error?: string };
export type LabEvent =
  | { type: "started"; text: string }
  | { type: "initialized"; model: string; tools: number }
  | { type: "answer"; text: string }
  | { type: "tool"; name: string; pattern: string }
  | { type: "result"; status: string; text: string; sessionId: string; costUsd: number; turns: number }
  | { type: "workspace"; stage: "before" | "after"; source: string; checks: Checks; changed: boolean }
  | { type: "error"; text: string };

export async function ensureWorkspace(reset = false) {
  await mkdir(WORKSPACE, { recursive: true });
  if (reset) await writeFile(TARGET, await readFile(FIXTURE));
  else { try { await access(TARGET); } catch { await writeFile(TARGET, await readFile(FIXTURE)); } }
}
export async function verifyFile(target = TARGET): Promise<Checks> {
  try {
    const script = fileURLToPath(new URL("../scripts/verify-utils.py", import.meta.url));
    const { stdout } = await execute(process.env.PYTHON_BIN || "python", ["-I", "-B", script, target], { timeout: 5000, maxBuffer: 200_000, windowsHide: true });
    return JSON.parse(stdout) as Checks;
  } catch {
    return { available: false, passed: 0, total: 4, cases: [], error: "Python checks could not run. Install Python 3.10+ or set PYTHON_BIN, then restart." };
  }
}
export async function workspaceState(reset = false) {
  await ensureWorkspace(reset);
  return { source: await readFile(TARGET, "utf8"), checks: await verifyFile() };
}
export async function baselineState() {
  return { source: await readFile(FIXTURE, "utf8"), checks: await verifyFile(fileURLToPath(FIXTURE)) };
}
export function toolPathAllowed(name: string, input: Record<string, unknown>): boolean {
  if (name === "Read" || name === "Edit") {
    return typeof input.file_path === "string" && resolve(WORKSPACE, input.file_path).toLowerCase() === TARGET.toLowerCase();
  }
  if (name === "Glob") {
    const pattern = String(input.pattern || "");
    return !pattern.includes("..") && !/^[\\/]|:/.test(pattern) && resolve(WORKSPACE, String(input.path || ".")).toLowerCase() === resolve(WORKSPACE).toLowerCase();
  }
  return false;
}
export function lessonOptions(abortController = new AbortController()): Options {
  return {
    model: MODEL, cwd: WORKSPACE,
    tools: ["Read", "Edit", "Glob"],
    allowedTools: ["Read", "Edit", "Glob"],
    permissionMode: "acceptEdits",
    systemPrompt: "You are a careful Python developer. Inspect and repair only utils.py in the current directory. Contract: calculate_average([]) returns 0; calculate_average([2,4,6]) returns 4; get_user_name(None) returns an empty string; get_user_name({'name':'Ada'}) returns 'ADA'. Preserve public function names. Make minimal defensive edits using Edit. No shell is available; do not claim you ran tests. The host verifies the file afterwards. Keep the final summary brief.",
    hooks: { PreToolUse: [{ hooks: [async (input) => {
      if (input.hook_event_name !== "PreToolUse") return {};
      if (toolPathAllowed(input.tool_name, input.tool_input as Record<string, unknown>)) return {};
      return { hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: "This lesson permits only Read/Edit on its utils.py and Glob in the demo directory." } };
    }] }] },
    settingSources: [], mcpServers: {}, plugins: [], persistSession: false,
    maxTurns: 12, maxBudgetUsd: 0.50, abortController,
  };
}
export function validatePrompt(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) throw new Error("Enter a prompt first.");
  if (value.trim().length > 2000) throw new Error("Keep the prompt under 2,000 characters.");
  return value.trim();
}
export function projectMessage(message: SDKMessage): LabEvent[] {
  if (message.type === "system" && message.subtype === "init") return [{ type: "initialized", model: message.model, tools: message.tools.length }];
  if (message.type === "assistant") {
    const events: LabEvent[] = [];
    for (const block of message.message.content) {
      if (block.type === "text") events.push({ type: "answer", text: block.text });
      if (block.type === "tool_use") {
        const input = block.input as { pattern?: string; file_path?: string };
        events.push({ type: "tool", name: block.name, pattern: input.file_path ? basename(input.file_path) : input.pattern || "" });
      }
    }
    return events;
  }
  if (message.type === "result") {
    const success = message.subtype === "success" && !message.is_error;
    return [{ type: "result", status: success ? "success" : message.subtype === "success" ? "error" : message.subtype,
      text: message.subtype === "success" ? message.result : message.errors.join("\n"), sessionId: message.session_id, costUsd: message.total_cost_usd, turns: message.num_turns }];
  }
  return [];
}
export async function runAgent(prompt: string, emit: (event: LabEvent) => void, abortController = new AbortController()) {
  const before = await workspaceState(true);
  if (!before.checks.available) throw new Error(before.checks.error);
  emit({ type: "workspace", stage: "before", ...before, changed: false });
  emit({ type: "started", text: "One query: inspect utils.py, repair its bugs, then verify the actual file." });
  let gotResult = false;
  const conversation = query({ prompt, options: lessonOptions(abortController) });
  try {
    for await (const message of conversation) {
      for (const event of projectMessage(message)) {
        if (event.type === "result") gotResult = true;
        emit(event);
      }
    }
    if (!gotResult && !abortController.signal.aborted) throw new Error("The SDK ended without a result message.");
  } finally {
    conversation.close();
    const after = await workspaceState();
    emit({ type: "workspace", stage: "after", ...after, changed: after.source !== before.source });
  }
}
