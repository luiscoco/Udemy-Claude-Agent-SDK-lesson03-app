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
