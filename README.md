# Claude Agent SDK · Lesson 03 · Quickstart bug-fixing agent

Based on the supplied Lesson03_Quickstart_Bug_Fixing_Agent.pptx. The TypeScript SDK host repairs the exact Python example from the slides. Five student pages use the same course style, large fonts, coloured snippets and UML workflow.

## What you will learn

- Read the actual Python file: The starting utils.py matches the presentation: empty numbers divide by zero and a None user cannot be indexed.
- Describe the repair with a prompt: query() starts one SDK workflow. The prompt describes the goal; the model chooses the tool requests.
- Separate availability and approval: tools enables only Read, Edit and Glob. allowedTools pre-approves them; permissionMode acceptEdits approves editing operations.
- Watch real tool execution: The SDK reads and edits a disposable utils.py copy. The host does not send a prewritten patch or implement a manual tool loop.
- Print selected messages: Observe assistant text, tool names and the final SDK result. These are progress and outcome signals, not a hidden reasoning trace.
- Verify changes independently: Compare before/after code and four host-run Python checks. SDK success alone does not prove the repair is correct.

## Configure and run

Requirements: Node.js 24+, npm, Python 3.10+, and a model-accessible API key. Git Bash may be required on Windows. Keep optional npm dependencies enabled.

```powershell
git clone https://github.com/luiscoco/Udemy-Claude-Agent-SDK-lesson03-app.git
cd .\Udemy-Claude-Agent-SDK-lesson03-app
npm ci
if (!(Test-Path .env)) { Copy-Item .env.example .env }
notepad .env
npm start
```

Original workspace: use `cd .\agent-sdk\lesson03-bug-fixing` from presentations instead of cloning. Open http://127.0.0.1:3103 and keep the terminal open. Ctrl+C stops it. Restart after .env edits. If this app already owns the port, a second start prints the existing URL; for another service stop it or change PORT.

```dotenv
ANTHROPIC_API_KEY=your_api_key
CLAUDE_MODEL=claude-sonnet-4-6
PORT=3103
PYTHON_BIN=python
```

On Windows, if needed, set `CLAUDE_CODE_GIT_BASH_PATH=C:/Program Files/Git/bin/bash.exe`. PYTHON_BIN selects the interpreter for the host checks. The web and sample:env scripts explicitly load an optional .env file; the SDK itself does not load it. A key already set in the shell takes precedence. No Managed Agents resource IDs are required.

Same-shell terminal sample:

```powershell
$env:ANTHROPIC_API_KEY = "your_api_key"
npm run sample
```

Or use `npm run sample:env` for explicit local-file loading. Starting the web host performs no model request. Each repair may incur API charges.

## Follow the lab

1. Inspect the default prompt and original buggy source. Two normal checks pass; two edge cases fail.
2. Click Fix utils.py once. The host restores a disposable buggy copy, then calls the real SDK.
3. Observe Read/Edit tool calls; Glob is also available but its use is model-dependent.
4. Wait for the final SDK result and the independent host checks.
5. Compare before/after source. A verified fix requires changed code and all four checks passing.

The explicit classroom contract is average([])=0, average([2,4,6])=4, name(None)="", and name({name:"Ada"})="ADA". Other APIs may legitimately choose exceptions; this lab specifies return values so verification is reproducible.

The original fixture is immutable during agent runs. The actual edit remains at .runtime/bugfix-workspace/utils.py until the next run resets it. The test runner lives outside that directory. The control fixed fixture is only for offline tests; it is never copied into a real agent run.

## How the app was built

### 01. Start with the two crash bugs

This is the presentation’s exact starting file. The normal calls work; the empty-list and None-user cases crash. The fixture stays unchanged while each run resets a separate working copy.

Source: [fixtures/utils.py](fixtures/utils.py)

```python
def calculate_average(numbers):
    total = 0
    for num in numbers:
        total += num
    return total / len(numbers)


def get_user_name(user):
    return user["name"].upper()

```

### 02. Reset only the disposable working copy

Every submitted run copies the buggy fixture to .runtime/bugfix-workspace/utils.py. The app never replaces its fixture with a prewritten fix. This makes classroom repetitions comparable.

Source: [src/agent.ts](src/agent.ts)

```typescript
export async function ensureWorkspace(reset = false) {
  await mkdir(WORKSPACE, { recursive: true });
  if (reset) await writeFile(TARGET, await readFile(FIXTURE));
  else { try { await access(TARGET); } catch { await writeFile(TARGET, await readFile(FIXTURE)); } }
}
```

### 03. Choose tools and edit approvals

tools sets availability; allowedTools sets automatic approvals. acceptEdits is the lesson’s edit permission mode. Additional path checks limit this host’s file operations to the one demo target. No Bash or external search is enabled.

Source: [src/agent.ts](src/agent.ts)

```typescript
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
```

### 04. Call query and consume its messages

One query object can contain repeated model/tool interactions. The host forwards selected evidence and waits for a final result; finally closes the query and reads the resulting file.

Source: [src/agent.ts](src/agent.ts)

```typescript
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
```

### 05. Separate assistant text from the final result

Assistant messages can contain text and tool requests. A successful final outcome requires success subtype with no error flag. A tool request alone is not proof that an edit was applied.

Source: [src/agent.ts](src/agent.ts)

```typescript
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
```

### 06. Run independent Python regression checks

The test runner lives outside the agent working directory. It checks two ordinary calls and the two edge cases. This app chooses 0 for an empty average and an empty string for a missing user; those are explicit classroom contracts, not the only possible API design.

Source: [scripts/verify-utils.py](scripts/verify-utils.py)

```python
"""Trusted host regression checks; lives outside the agent working directory."""
import contextlib,importlib.util,io,json,sys

cases=[]
with contextlib.redirect_stdout(io.StringIO()):
 try:
  spec=importlib.util.spec_from_file_location('student_utils',sys.argv[1])
  module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
  tests=[('Average: ordinary list','calculate_average',[2,4,6],4),
         ('Average: empty list','calculate_average',[],0),
         ('Name: ordinary user','get_user_name',{'name':'Ada'},'ADA'),
         ('Name: missing user','get_user_name',None,'')]
  for label,name,arg,expected in tests:
   try:
    actual=getattr(module,name)(arg)
    cases.append(dict(label=label,expected=expected,actual=actual,passed=actual==expected))
   except Exception as error:
    cases.append(dict(label=label,expected=expected,error=type(error).__name__,passed=False))
 except Exception as error:
  cases=[dict(label='Import repaired utils.py',expected='valid Python module',error=type(error).__name__,passed=False)]
print(json.dumps(dict(available=True,passed=sum(c['passed'] for c in cases),total=4,cases=cases),default=str))

```

### 07. Print tool activity and verification evidence

The terminal prints SDK progress and the independent check count. It exits unsuccessfully if the file did not change or the post-run checks did not all pass. The web page shows both kinds of evidence separately.

Source: [src/sample.ts](src/sample.ts)

```typescript
import { DEFAULT_PROMPT, runAgent } from "./agent.js";

if (!process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY.startsWith("your_")) {
  console.error("Set ANTHROPIC_API_KEY in this shell first, or use npm run sample:env.");
  process.exit(1);
}
await runAgent(DEFAULT_PROMPT, (event) => {
  if (event.type === "tool") console.log(`Tool: ${event.name} · ${event.pattern}`);
  if (event.type === "answer") console.log(event.text);
  if (event.type === "result") {
    console.log(`SDK: ${event.status} · Turns: ${event.turns}`);
    if (event.status !== "success") process.exitCode = 1;
  }
  if (event.type === "workspace") {
    console.log(`${event.stage}: ${event.checks.passed}/${event.checks.total} checks passed`);
    if (event.stage === "after") {
      console.log(`File changed: ${event.changed}`);
      if (!event.changed || !event.checks.available || event.checks.passed !== event.checks.total) process.exitCode = 1;
    }
  }
});

```

## Exercises and scope

Try docstrings or type hints while preserving the behaviour checks. For a read-only reviewer remove Edit from tools and request a report; an unchanged file should not be labelled a verified repair. The slides discuss Bash, WebSearch and other extensions. They are not enabled here; update tool availability and the demo guard deliberately if extending the sample.

`tools` sets availability; `allowedTools` sets pre-approval. acceptEdits controls editing approvals. The app enables only Read, Edit and Glob, restricts their paths with a PreToolUse hook, clears filesystem settings and configures no MCP servers or plugins. A working directory and path guard are not an operating-system sandbox. This is a trusted local classroom host, not a multi-user deployment. The SDK has a 12-turn / $0.50 lesson limit; displayed cost is an estimate, not a billing guarantee. The host cancels on connection close or after 180 seconds.

The UI displays assistant text, not hidden chain-of-thought. SDK success and Python regression success remain separate evidence.

## Maintenance and repository contents

```powershell
npm test
npm run build:client
python scripts/build-pages.py
```

All five pages, styles, mascot, Python/TypeScript syntax highlighting, UML SVG, fixtures, tests and lockfile are bundled. The page generator needs no sibling lesson. Real .env, runtime files, node_modules, videos, audio and teaching-material stay local and are ignored by Git. The supplied presentation and generated PowerPoint are not uploaded.

## References

- [Official Agent SDK bug-fixing quickstart](https://code.claude.com/docs/en/agent-sdk/quickstart)
- [SDK permissions and tool approval](https://code.claude.com/docs/en/agent-sdk/permissions)


## Code at every UML workflow step

Every numbered architecture step includes a syntax-coloured source excerpt, its filename and line range, and an explanation connecting the code to that step. scripts/workflow-snippets.py extracts the excerpts from the shipped source on regeneration. SDK-managed operations show the real configuration or observation boundary, with the distinction explained.
