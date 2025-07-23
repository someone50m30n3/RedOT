// REDoT Operator Console - Execution Logic (No WebSocket)
const API = "/api";
const terminal = document.getElementById("terminalOutput");
const moduleSelect = document.getElementById("moduleSelect");
const paramForm = document.getElementById("inputs");
const agentSelect = document.getElementById("agentSelect");
const historyPanel = document.getElementById("historyLog");

let currentExecId = null;
let pollingInterval = null;

window.onload = () => {
  loadModules();
  document.getElementById("runBtn").addEventListener("click", runModule);
  document.getElementById("clearBtn").addEventListener("click", () => terminal.textContent = "");
  document.getElementById("downloadBtn").addEventListener("click", downloadLog);
  moduleSelect.addEventListener("change", buildFormInputs);
};

// Load modules from backend
async function loadModules() {
  const res = await fetch(`${API}/modules`);
  const modules = await res.json();

  moduleSelect.innerHTML = "";
  modules.forEach(mod => {
    const opt = document.createElement("option");
    opt.value = mod.path;
    opt.textContent = mod.name;
    opt.dataset.inputs = JSON.stringify(mod.inputs || []);
    moduleSelect.appendChild(opt);
  });

  buildFormInputs();
}

// Generate input fields from module metadata
function buildFormInputs() {
  const selected = moduleSelect.options[moduleSelect.selectedIndex];
  const inputs = JSON.parse(selected.dataset.inputs || "[]");
  paramForm.innerHTML = "";

  inputs.forEach(input => {
    const label = document.createElement("label");
    label.className = "param-label";
    label.textContent = `--${input.name}`;

    const field = document.createElement("input");
    field.type = input.type === "number" ? "number" : "text";
    field.name = input.name;
    field.placeholder = input.description || "";

    paramForm.appendChild(label);
    paramForm.appendChild(field);
  });
}

// Run selected module
async function runModule() {
  const selected = moduleSelect.options[moduleSelect.selectedIndex];
  const path = selected.value;

  const inputs = {};
  const fields = paramForm.querySelectorAll("input");
  fields.forEach(input => {
    if (input.value.trim() !== "") {
      inputs[input.name] = input.value;
    }
  });

  const res = await fetch(`${API}/run`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path, inputs })
  });

  const data = await res.json();
  currentExecId = data.exec_id;
  terminal.textContent = "";
  appendToHistory(selected.textContent, inputs);

  startPollingOutput(currentExecId);
}

// Poll output log until command is complete
function startPollingOutput(execId) {
  clearInterval(pollingInterval);

  pollingInterval = setInterval(async () => {
    try {
      const res = await fetch(`${API}/output/${execId}`);
      const data = await res.json();

      if (data.log) {
        terminal.textContent = data.log;
        terminal.scrollTop = terminal.scrollHeight;
      }

      if (data.log && data.log.includes("return code") || data.log.includes("completed") || data.log.includes("exited")) {
        clearInterval(pollingInterval);
      }

    } catch (err) {
      clearInterval(pollingInterval);
      terminal.textContent += "\n[!] Output polling failed.";
    }
  }, 2000);
}

// Add to command history
function appendToHistory(name, inputs) {
  const entry = document.createElement("div");
  entry.className = "history-entry";

  const meta = document.createElement("div");
  meta.className = "history-meta";
  meta.innerHTML = `<span class="command-name">${name}</span><br/><span class="command-target">${Object.values(inputs).join(" ")}</span>`;

  const time = document.createElement("div");
  time.className = "history-time";
  time.textContent = new Date().toLocaleTimeString();

  entry.appendChild(meta);
  entry.appendChild(time);
  historyPanel.prepend(entry);
}

// Download log as TXT
function downloadLog() {
  const blob = new Blob([terminal.textContent], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "redot_log.txt";
  a.click();
  URL.revokeObjectURL(url);
}
