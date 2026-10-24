const $ = (id) => document.getElementById(id);
let running = false;
let finalResult = false;
const addEvent = (type, detail) => {
    const row = document.createElement("li");
    const label = document.createElement("strong");
    label.textContent = type;
    const body = document.createElement("span");
    body.textContent = detail;
    row.append(label, body);
    $("events").append(row);
};
function showWorkspace(data) {
    const id = data.stage === "after" ? "after" : "before";
    $(id).textContent = data.source;
    Prism.highlightElement($(id));
    $(id + "-checks").textContent = `${data.checks.passed}/${data.checks.total} checks passed`;
    if (id === "after") {
        $("verdict").textContent = data.checks.available && data.checks.passed === data.checks.total && data.changed ? "Verified fix" : "Not verified";
        $("checks").replaceChildren();
        for (const item of data.checks.cases) {
            const li = document.createElement("li");
            li.textContent = `${item.passed ? "PASS" : "FAIL"} · ${item.label}`;
            $("checks").append(li);
        }
    }
}
async function configure() {
    const config = await (await fetch("/api/config")).json();
    $("prompt").value = config.defaultPrompt;
    $("model").textContent = config.model;
    showWorkspace({ stage: "before", ...config.workspace });
    $("configuration").textContent = config.ready ? "API key configured on the server" : "Setup needed: add your API key in .env";
    $("run").disabled = !config.ready;
}
$("form").addEventListener("submit", async (event) => {
    event.preventDefault();
    if (running)
        return;
    running = true;
    finalResult = false;
    $("run").disabled = true;
    $("answer").textContent = "";
    $("events").replaceChildren();
    $("status").textContent = "Running";
    $("cost").textContent = "—";
    $("turns").textContent = "—";
    $("session").textContent = "—";
    $("after").textContent = "The repaired file will appear after the run.";
    $("verdict").textContent = "Waiting";
    $("after-checks").textContent = "Not checked";
    $("checks").replaceChildren();
    let answer = "";
    try {
        const response = await fetch("/api/query", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt: $("prompt").value }) });
        if (!response.ok)
            throw new Error(await response.text());
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        const consume = (line) => {
            if (!line.trim())
                return;
            const data = JSON.parse(line);
            if (data.type === "workspace") {
                showWorkspace(data);
            }
            else if (data.type === "answer") {
                answer += (answer ? "\n\n" : "") + data.text;
                $("answer").textContent = answer;
            }
            else if (data.type === "result") {
                finalResult = true;
                $("status").textContent = data.status === "success" ? "Success" : data.status;
                $("cost").textContent = "$" + data.costUsd.toFixed(4);
                $("turns").textContent = String(data.turns);
                $("session").textContent = data.sessionId;
                if (!answer || data.status !== "success")
                    $("answer").textContent = data.text;
            }
            else if (data.type === "error") {
                $("status").textContent = "Error";
                $("answer").textContent = data.text;
            }
            addEvent(data.type, data.type === "initialized" ? `${data.model} · ${data.tools} tools` : data.type === "tool" ? `${data.name} · ${data.pattern}` : data.type === "result" ? `${data.status} · final SDK result` : data.type === "answer" ? "Assistant text received" : data.type === "workspace" ? `${data.stage} · ${data.checks.passed}/${data.checks.total} checks passed` : data.text || "");
        };
        for (;;) {
            const { done, value } = await reader.read();
            buffer += decoder.decode(value, { stream: !done });
            let at;
            while ((at = buffer.indexOf("\n")) !== -1) {
                consume(buffer.slice(0, at));
                buffer = buffer.slice(at + 1);
            }
            if (done) {
                if (buffer.trim())
                    consume(buffer);
                break;
            }
        }
        if (!finalResult && $("status").textContent !== "Error")
            throw new Error("The stream ended without a final result. Inspect the event list.");
    }
    catch (error) {
        $("status").textContent = "Error";
        $("answer").textContent = error instanceof Error ? error.message : "The run failed.";
    }
    finally {
        running = false;
        $("run").disabled = false;
    }
});
configure().catch(() => { $("configuration").textContent = "Cannot reach the local server. Restart npm start."; });
export {};
