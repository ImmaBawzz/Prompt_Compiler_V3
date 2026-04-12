import * as vscode from 'vscode';

export function getStudioHtml(
  webview: vscode.Webview,
  extensionUri: vscode.Uri,
  defaultBrief: unknown,
  defaultProfile: unknown
): string {
  const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'app.js'));
  const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'app.css'));
  const nonce = String(Date.now());

  return `<!DOCTYPE html>
  <html lang="en">
    <head>
      <meta charset="UTF-8" />
      <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <link rel="stylesheet" href="${styleUri}" />
      <title>Prompt Studio</title>
    </head>
    <body>
      <div class="shell">
        <header>
          <h1>Prompt Studio</h1>
          <p>Compile one brief into multi-target outputs.</p>
        </header>

        <section class="grid">
          <div class="panel">
            <h2>Brief JSON</h2>
            <textarea id="briefInput">${escapeHtml(JSON.stringify(defaultBrief, null, 2))}</textarea>
          </div>
          <div class="panel">
            <h2>Brand Profile JSON</h2>
            <textarea id="profileInput">${escapeHtml(JSON.stringify(defaultProfile, null, 2))}</textarea>
          </div>
        </section>

        <section class="actions">
          <button id="compileBtn">Compile</button>
          <button id="exportBtn">Export Bundle</button>
        </section>

        <section class="status">
          <span id="statusOutput">Ready.</span>
        </section>

        <section class="panel">
          <h2>Result</h2>
          <pre id="resultOutput">Press Compile to generate outputs.</pre>
        </section>
      </div>
      <script nonce="${nonce}" src="${scriptUri}"></script>
    </body>
  </html>`;
}

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
