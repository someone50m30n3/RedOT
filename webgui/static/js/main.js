// REDoT Operator Console - JS Logic
// Handles dynamic form creation, module execution, output streaming

const API = "/api";
const terminal = document.getElementById("terminalOutput");
const moduleSelect = document.getElementById("moduleSelect");
const paramForm = document.getElementById("inputs");
const agentSelect = document.getElementById("agentSelect");
const historyPanel = document.getElementById("historyLog");

let socket = null;

// INIT
window.onload = () => {
  loadModules();
  document.getElementById("runBtn").addEventListener("click", runModule);
  document.getElementById("clearBtn").addEventListener("click", () => terminal.textContent = "");
  document.getElementById("downloadBtn").addEventListener("click", downloadLog);
  moduleSelect.addEventListener("change", buildFormInputs);
};

// Load available modules from backend
function loadModules() {
  fetch(`${API}/modules`)
    .then(res => res.json())
    .then(modules => {
      moduleSelect.innerHTML = "";
      modules.forEach(mod => {
        const opt = document.createElement("option");
        opt.value = mod.path;
        opt.textContent = mod.name;
        opt.dataset.inputs = JSON.stringify(mod.inputs || []);
        moduleSelect.appendChild(opt);
      });
      buildFormInputs();
    });
}

// Dynamically create input fields for selected module
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

// Run module and start output stream
function runModule() {
  const selected = moduleSelect.options[moduleSelect.selectedIndex];
  const path = selected.value;

  const inputs = {};
  const fields = paramForm.querySelectorAll("input");
  fields.forEach(input => {
    if (input.value.trim() !== "") {
      inputs[input.name] = input.value;
    }
  });

  fetch(`${API}/run`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path, inputs })
  })
  .then(res => res.json())
  .then(data => {
    const execId = data.exec_id;
    terminal.textContent = "";
    appendToHistory(selected.textContent, inputs);
    connectWebSocket(execId);
  });
}

// Connect to WebSocket for live output
function connectWebSocket(execId) {
  if (socket) socket.close();

  const wsUrl = `ws://${window.location.hostname}:8765/ws/${execId}`;
  socket = new WebSocket(wsUrl);

  socket.onmessage = (event) => {
    terminal.textContent += event.data;
    terminal.scrollTop = terminal.scrollHeight;
  };

  socket.onerror = () => {
    terminal.textContent += "\n[!] WebSocket error.";
  };

  socket.onclose = () => {
    console.log("WebSocket closed.");
  };
}

// Append command to history panel
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

// Export log contents
function downloadLog() {
  const blob = new Blob([terminal.textContent], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "redot_log.txt";
  a.click();
  URL.revokeObjectURL(url);
}
