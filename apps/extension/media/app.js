const vscode = acquireVsCodeApi();

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

  if (message.type === 'autoCompiled') {
    const r = message.payload;
    resultOutput.textContent = JSON.stringify(r?.refinedBundle ?? r?.bundle, null, 2);
    const warningCount = (r?.bundle?.diagnostics ?? []).filter((d) => d.level === 'warning').length;
    const hintCount = (r?.hints ?? []).length;
    setStatus(`Auto-compiled. Warnings: ${warningCount}. Hints: ${hintCount}.`);
    if (r?.derivedBrief) {
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

