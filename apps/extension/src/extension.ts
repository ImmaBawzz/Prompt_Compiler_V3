import * as vscode from 'vscode';
import { compilePromptBundle, createExportPlan, BrandProfile, PromptBrief } from '@prompt-compiler/core';
import { ArtifactExplorerProvider } from './artifactExplorer';
import { getStudioHtml } from './studioHtml';

const LAST_BRIEF_KEY = 'promptCompiler.lastBrief';
const LAST_PROFILE_KEY = 'promptCompiler.lastProfile';
const DEFAULT_HOSTED_API_BASE = 'http://localhost:8788';

const DEFAULT_BRIEF = {
  id: 'brief-local-example',
  title: 'Signal Bloom',
  concept: 'An emotional cinematic dance piece where memory turns into motion.',
  targets: ['suno', 'udio', 'flux', 'kling', 'youtube'],
  genres: ['dreamwave', 'euphoric hardstyle', 'cinematic electronic'],
  mood: ['uplifting', 'emotional', 'vast'],
  bpm: 148,
  key: 'G minor',
  imagery: ['glass horizon', 'cosmic dawn'],
  structure: ['intro', 'build', 'drop', 'break', 'final lift'],
  constraints: ['avoid generic EDM phrasing']
};

const DEFAULT_PROFILE = {
  id: 'profile-local-example',
  brandName: 'LJV',
  voice: 'poetic, exact, emotionally intense, not generic',
  signatureMotifs: ['cosmic scale', 'heart pressure', 'vast motion'],
  avoid: ['corporate filler', 'buzzword sludge']
};

type AccountPlan = 'free' | 'pro' | 'studio';

function entitlementsForPlan(plan: AccountPlan): string[] {
  if (plan === 'studio') {
    return ['free.local', 'pro.creator', 'studio.team'];
  }

  if (plan === 'pro') {
    return ['free.local', 'pro.creator'];
  }

  return ['free.local'];
}

function hostedApiBase(): string {
  return (vscode.workspace.getConfiguration('promptCompiler').get<string>('hostedApiBaseUrl') ?? DEFAULT_HOSTED_API_BASE).replace(/\/$/, '');
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const payload = (await response.json()) as T & { ok?: boolean; error?: { message?: string } };
  if (!response.ok || (payload.ok === false && payload.error?.message)) {
    const message = payload.error?.message ?? `Request failed with status ${response.status}`;
    throw new Error(message);
  }

  return payload;
}

async function resolveHostedSyncContext(): Promise<{
  accountId: string;
  workspaceId: string;
  plan: AccountPlan;
  mode: 'hosted';
  entitlements: string[];
} | null> {
  const selectedPlan = await vscode.window.showQuickPick(
    [
      { label: 'Pro', value: 'pro' as AccountPlan },
      { label: 'Studio', value: 'studio' as AccountPlan }
    ],
    {
    title: 'Hosted Sync Plan',
    placeHolder: 'Choose plan for hosted profile sync'
    }
  );

  if (!selectedPlan) {
    return null;
  }

  const plan = selectedPlan.value;

  const accountId = await vscode.window.showInputBox({
    title: 'Hosted Account ID',
    prompt: 'Enter hosted account ID for profile library sync',
    value: 'acct-local'
  });

  if (!accountId) {
    return null;
  }

  const workspaceId = await vscode.window.showInputBox({
    title: 'Hosted Workspace ID',
    prompt: 'Enter workspace scope for hosted profile sync',
    value: 'workspace-local'
  });

  if (!workspaceId) {
    return null;
  }

  return {
    accountId,
    workspaceId,
    plan,
    mode: 'hosted',
    entitlements: entitlementsForPlan(plan)
  };
}

export function activate(context: vscode.ExtensionContext): void {
  const artifactExplorer = new ArtifactExplorerProvider();

  context.subscriptions.push(
    vscode.window.registerTreeDataProvider('promptCompilerArtifacts', artifactExplorer),
    vscode.commands.registerCommand('promptCompiler.openStudio', () => {
      void openStudio(context, artifactExplorer);
    }),
    vscode.commands.registerCommand('promptCompiler.exportSampleBrief', async () => {
      const workspace = vscode.workspace.workspaceFolders?.[0];
      if (!workspace) {
        void vscode.window.showErrorMessage('Open a workspace first.');
        return;
      }

      const target = vscode.Uri.joinPath(workspace.uri, '.prompt-compiler', 'sample-brief.json');
      await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(workspace.uri, '.prompt-compiler'));
      await vscode.workspace.fs.writeFile(target, Buffer.from(JSON.stringify(DEFAULT_BRIEF, null, 2), 'utf8'));
      await vscode.window.showInformationMessage('Sample brief exported.', 'Open').then(async (choice) => {
        if (choice === 'Open') {
          const doc = await vscode.workspace.openTextDocument(target);
          await vscode.window.showTextDocument(doc);
        }
      });
    }),
    vscode.commands.registerCommand('promptCompiler.compileActiveJson', async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        void vscode.window.showErrorMessage('Open a JSON brief file first.');
        return;
      }

      const brief = JSON.parse(editor.document.getText()) as PromptBrief;
      const result = compilePromptBundle(brief, DEFAULT_PROFILE as BrandProfile, { includeGenericOutput: true });
      const doc = await vscode.workspace.openTextDocument({
        language: 'json',
        content: JSON.stringify(result, null, 2)
      });
      await vscode.window.showTextDocument(doc, { preview: false });
    }),
    vscode.commands.registerCommand('promptCompiler.refreshArtifacts', () => {
      artifactExplorer.refresh();
    }),
    vscode.commands.registerCommand('promptCompiler.revealLatestExportFolder', async () => {
      const folder = artifactExplorer.getLatestExportFolder();
      if (!folder) {
        void vscode.window.showInformationMessage('No export folder has been created yet.');
        return;
      }

      await vscode.commands.executeCommand('revealInExplorer', folder);
    }),
    vscode.commands.registerCommand('promptCompiler.syncPushProfileLibrary', async () => {
      try {
        const contextPayload = await resolveHostedSyncContext();
        if (!contextPayload) {
          return;
        }

        const rawProfile = context.workspaceState.get<string>(LAST_PROFILE_KEY);
        const profile = safeParseState<BrandProfile>(rawProfile) ?? (DEFAULT_PROFILE as BrandProfile);
        const payload = {
          ...contextPayload,
          profiles: [
            {
              ...profile,
              version: '1'
            }
          ]
        };

        const base = hostedApiBase();
        const result = await fetchJson<{ ok: true; result: { updatedAt: string } }>(`${base}/libraries/profile-assets`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        void vscode.window.showInformationMessage(`Hosted profile sync push succeeded at ${result.result.updatedAt}.`);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown hosted sync push error';
        void vscode.window.showErrorMessage(`Hosted profile sync push failed: ${message}`);
      }
    }),
    vscode.commands.registerCommand('promptCompiler.syncPullProfileLibrary', async () => {
      try {
        const contextPayload = await resolveHostedSyncContext();
        if (!contextPayload) {
          return;
        }

        const params = new URLSearchParams({
          accountId: contextPayload.accountId,
          workspaceId: contextPayload.workspaceId,
          plan: contextPayload.plan,
          mode: contextPayload.mode,
          entitlements: contextPayload.entitlements.join(',')
        });

        const base = hostedApiBase();
        const payload = await fetchJson<{ ok: true; result: unknown }>(`${base}/libraries/profile-assets?${params.toString()}`);
        const doc = await vscode.workspace.openTextDocument({
          language: 'json',
          content: JSON.stringify(payload.result, null, 2)
        });
        await vscode.window.showTextDocument(doc, { preview: false });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown hosted sync pull error';
        void vscode.window.showErrorMessage(`Hosted profile sync pull failed: ${message}`);
      }
    })
  );
}

function parseJsonOrThrow<T>(raw: string, label: string): T {
  try {
    return JSON.parse(raw) as T;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid JSON';
    throw new Error(`${label} JSON is invalid: ${message}`);
  }
}

function safeParseState<T>(raw: string | undefined): T | undefined {
  if (!raw) {
    return undefined;
  }

  try {
    return JSON.parse(raw) as T;
  } catch {
    return undefined;
  }
}

async function openStudio(context: vscode.ExtensionContext, artifactExplorer: ArtifactExplorerProvider): Promise<void> {
  const savedBrief = safeParseState<PromptBrief>(context.workspaceState.get<string>(LAST_BRIEF_KEY));
  const savedProfile = safeParseState<BrandProfile>(context.workspaceState.get<string>(LAST_PROFILE_KEY));

  const panel = vscode.window.createWebviewPanel(
    'promptCompilerStudio',
    'Prompt Studio',
    vscode.ViewColumn.One,
    {
      enableScripts: true,
      retainContextWhenHidden: true
    }
  );

  panel.webview.html = getStudioHtml(
    panel.webview,
    context.extensionUri,
    savedBrief ?? DEFAULT_BRIEF,
    savedProfile ?? DEFAULT_PROFILE
  );

  panel.webview.onDidReceiveMessage(async (message) => {
    if (message.type === 'compile') {
      try {
        await context.workspaceState.update(LAST_BRIEF_KEY, message.brief);
        await context.workspaceState.update(LAST_PROFILE_KEY, message.profile);

        const brief = parseJsonOrThrow<PromptBrief>(message.brief, 'Brief');
        const profile = parseJsonOrThrow<BrandProfile>(message.profile, 'Profile');
        const result = compilePromptBundle(brief, profile, { includeGenericOutput: true });
        panel.webview.postMessage({ type: 'compiled', payload: result });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown compile error';
        panel.webview.postMessage({ type: 'error', message: errorMessage });
      }
      return;
    }

    if (message.type === 'export') {
      try {
        const workspace = vscode.workspace.workspaceFolders?.[0];
        if (!workspace) {
          throw new Error('Open a workspace first.');
        }

        await context.workspaceState.update(LAST_BRIEF_KEY, message.brief);
        await context.workspaceState.update(LAST_PROFILE_KEY, message.profile);

        const brief = parseJsonOrThrow<PromptBrief>(message.brief, 'Brief');
        const profile = parseJsonOrThrow<BrandProfile>(message.profile, 'Profile');
        const bundle = compilePromptBundle(brief, profile, { includeGenericOutput: true });
        const files = createExportPlan(brief, profile, bundle);
        const writtenFiles: vscode.Uri[] = [];

        for (const file of files) {
          const segments = file.path.split('/');
          const fileName = segments.pop();
          if (!fileName) continue;
          const folderUri = vscode.Uri.joinPath(workspace.uri, ...segments);
          const target = vscode.Uri.joinPath(folderUri, fileName);
          await vscode.workspace.fs.createDirectory(folderUri);
          await vscode.workspace.fs.writeFile(target, Buffer.from(file.content, 'utf8'));
          writtenFiles.push(target);
        }

        const exportFolder = vscode.Uri.joinPath(workspace.uri, ...files[0].path.split('/').slice(0, -1));
        artifactExplorer.setArtifacts(writtenFiles, exportFolder);

        panel.webview.postMessage({ type: 'exported', count: files.length });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown export error';
        panel.webview.postMessage({ type: 'error', message: errorMessage });
      }
    }
  });
}

export function deactivate(): void {}
