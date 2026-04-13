const vscode = acquireVsCodeApi();
// @ts-check

const briefInput = document.getElementById('briefInput');
const profileInput = document.getElementById('profileInput');
const resultOutput = document.getElementById('resultOutput');
const statusOutput = document.getElementById('statusOutput');
const refinementsSection = document.getElementById('refinementsSection');
const hintsList = document.getElementById('hintsList');
const refineBtn = document.getElementById('refineBtn');
const autoPromptInput = document.getElementById('autoPromptInput');
const autoCompileBtn = document.getElementById('autoCompileBtn');
const autoRefineCheck = document.getElementById('autoRefineCheck');

let currentHints = [];
let streamAbortController = null;
const streamPanel = document.getElementById('streamPanel');
const streamExecBtn = document.getElementById('streamExecBtn');
const streamAbortBtn = document.getElementById('streamAbortBtn');
const streamLog = document.getElementById('streamLog');

const saved = vscode.getState();
if (saved) {
  if (typeof saved.brief === 'string') {
    briefInput.value = saved.brief;
  }
  if (typeof saved.profile === 'string') {
    profileInput.value = saved.profile;
  }
  if (typeof saved.result === 'string') {
    resultOutput.textContent = saved.result;
  }
  if (typeof saved.status === 'string') {
    statusOutput.textContent = saved.status;
  }
}

function persistState() {
  vscode.setState({
    brief: briefInput.value,
    profile: profileInput.value,
    result: resultOutput.textContent,
    status: statusOutput.textContent
  });
}

function setStatus(message) {
  statusOutput.textContent = message;
}

function showHints(hints) {
  currentHints = hints;
  hintsList.innerHTML = '';
  if (!hints || hints.length === 0) {
    refinementsSection.style.display = 'none';
    return;
  }
  hints.forEach((hint) => {
    const li = document.createElement('li');
    li.textContent = `[${hint.type}]${hint.note ? ' — ' + hint.note : ''}`;
    hintsList.appendChild(li);
  });
  refinementsSection.style.display = '';
}

briefInput.addEventListener('input', persistState);
profileInput.addEventListener('input', persistState);

document.getElementById('compileBtn').addEventListener('click', () => {
  setStatus('Compiling...');
  showHints([]);
  persistState();
  vscode.postMessage({
    type: 'compile',
    brief: briefInput.value,
    profile: profileInput.value
  });
});

document.getElementById('exportBtn').addEventListener('click', () => {
  setStatus('Exporting bundle...');
  persistState();
  vscode.postMessage({
    type: 'export',
    brief: briefInput.value,
    profile: profileInput.value
  });
});

refineBtn.addEventListener('click', () => {
  if (!currentHints || currentHints.length === 0) return;
  setStatus('Refining with hints...');
  persistState();
  vscode.postMessage({
// P29-1: Show stream panel once user has interacted with compile/export.
function revealStreamPanel() {
  if (streamPanel) {
    streamPanel.style.display = '';
  }
}

// P29-1: Append a log entry to the stream log list.
function appendStreamLog(text, className) {
  if (!streamLog) return;
  const li = document.createElement('li');
  li.textContent = text;
  if (className) li.className = className;
  streamLog.appendChild(li);
  li.scrollIntoView({ block: 'nearest' });
}

if (streamExecBtn) {
  streamExecBtn.addEventListener('click', () => {
    if (streamLog) streamLog.innerHTML = '';
    appendStreamLog('Connecting…', 'stream-pending');
    if (streamAbortBtn) streamAbortBtn.style.display = '';
    streamAbortController = new AbortController();
    vscode.postMessage({
      type: 'streamExecute',
      brief: briefInput ? briefInput.value : '',
      profile: profileInput ? profileInput.value : '',
      signal: null // AbortController lives in extension context
    });
  });
}

if (streamAbortBtn) {
  streamAbortBtn.addEventListener('click', () => {
    vscode.postMessage({ type: 'streamAbort' });
    if (streamAbortBtn) streamAbortBtn.style.display = 'none';
    appendStreamLog('Aborted by user.', 'stream-error');
  });
}
    type: 'refine',
    brief: briefInput.value,
    profile: profileInput.value,
    hints: currentHints
  });
});

autoCompileBtn.addEventListener('click', () => {
  const prompt = autoPromptInput.value.trim();
  if (!prompt) {
    setStatus('Enter a prompt before running Auto Compile.');
    return;
  }
  setStatus('Auto-compiling from prompt…');
  showHints([]);
  persistState();
  vscode.postMessage({
    type: 'autoCompile',
    prompt,
    autoRefine: autoRefineCheck ? autoRefineCheck.checked : false
  });
});

window.addEventListener('message', (event) => {
  const message = event.data;

  if (message.type === 'compiled') {
    resultOutput.textContent = JSON.stringify(message.payload, null, 2);
    const warningCount = message.payload?.diagnostics?.filter((item) => item.level === 'warning').length || 0;
    setStatus(`Compiled successfully. Warnings: ${warningCount}.`);
    persistState();
  }
    revealStreamPanel();

  if (message.type === 'autoCompiled') {
    const r = message.payload;
    resultOutput.textContent = JSON.stringify(r?.refinedBundle ?? r?.bundle, null, 2);
    const warningCount = (r?.bundle?.diagnostics ?? []).filter((d) => d.level === 'warning').length;
    const hintCount = (r?.hints ?? []).length;
    setStatus(`Auto-compiled. Warnings: ${warningCount}. Hints: ${hintCount}.`);
    if (r?.derivedBrief) {
  // P29-1: Stream Execute progress events from extension.
  if (message.type === 'streamProgress') {
    const stage = (message.data && message.data.stage) ? String(message.data.stage) : String(message.event || '');
    appendStreamLog(`[${message.event || 'progress'}] ${stage}`, 'stream-progress');
  }

  if (message.type === 'streamCompleted') {
    if (streamAbortBtn) streamAbortBtn.style.display = 'none';
    const telemetry = message.data && message.data.telemetry;
    const summary = telemetry
      ? `provider=${telemetry.provider} latency=${telemetry.latencyMs ?? '—'}ms tokens=${telemetry.estimatedTokens ?? '—'}`
      : 'completed';
    appendStreamLog(`Completed. ${summary}`, 'stream-done');
    setStatus('Stream Execute completed.');
  }

  if (message.type === 'streamError') {
    if (streamAbortBtn) streamAbortBtn.style.display = 'none';
    appendStreamLog(`Error: ${message.message}`, 'stream-error');
    setStatus('Stream Execute failed.');
  }
      briefInput.value = JSON.stringify(r.derivedBrief, null, 2);
    }
    showHints(r?.hints ?? []);
    persistState();
  }

  if (message.type === 'hints') {
    showHints(message.hints || []);
  }

  if (message.type === 'exported') {
    resultOutput.textContent = `Exported ${message.count} files successfully.`;
    setStatus('Export completed. Artifact Explorer updated.');
    persistState();
  }

  if (message.type === 'error') {
    resultOutput.textContent = `Error: ${message.message}`;
    setStatus('Action failed. Fix the input and retry.');
    persistState();
  }
});

