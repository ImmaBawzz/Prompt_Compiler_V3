const vscode = acquireVsCodeApi();

const briefInput = document.getElementById('briefInput');
const profileInput = document.getElementById('profileInput');
const resultOutput = document.getElementById('resultOutput');
const statusOutput = document.getElementById('statusOutput');

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

briefInput.addEventListener('input', persistState);
profileInput.addEventListener('input', persistState);

document.getElementById('compileBtn').addEventListener('click', () => {
  setStatus('Compiling...');
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

window.addEventListener('message', (event) => {
  const message = event.data;

  if (message.type === 'compiled') {
    resultOutput.textContent = JSON.stringify(message.payload, null, 2);
    const warningCount = message.payload?.diagnostics?.filter((item) => item.level === 'warning').length || 0;
    setStatus(`Compiled successfully. Warnings: ${warningCount}.`);
    persistState();
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
