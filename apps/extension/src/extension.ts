import * as vscode from 'vscode';
import * as path from 'node:path';
import { compilePromptBundle, createExportPlan, deriveRefinementHints, refinePromptBundle, autoCompile, BrandProfile, PromptBrief, RefinementHint, generateEntitlementUXMessage, HostedFeatureKey } from '@prompt-compiler/core';
import { ArtifactExplorerProvider } from './artifactExplorer';
import { AccountPlan, entitlementsForPlan, safeParseState } from './hostedSync';
import { parseStoredReviewArtifact, reviewArtifactName } from './reviewFiles';
import { getStudioHtml } from './studioHtml';

const LAST_BRIEF_KEY = 'promptCompiler.lastBrief';
const LAST_PROFILE_KEY = 'promptCompiler.lastProfile';
const LAST_REVIEW_ACCOUNT_KEY = 'promptCompiler.lastReviewAccount';
const LAST_REVIEW_WORKSPACE_KEY = 'promptCompiler.lastReviewWorkspace';
const DEFAULT_HOSTED_API_BASE = 'http://localhost:8787';

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

function hostedApiBase(): string {
  return (vscode.workspace.getConfiguration('promptCompiler').get<string>('hostedApiBaseUrl') ?? DEFAULT_HOSTED_API_BASE).replace(/\/$/, '');
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const payload = (await response.json()) as T & { ok?: boolean; error?: { message?: string; featureKey?: string } };

  // P23: Check for entitlement errors and generate UX-friendly messages.
  if (
    !response.ok &&
    payload.error &&
    response.status === 403 &&
    (payload.error as { featureKey?: string }).featureKey
  ) {
    const featureKey = (payload.error as { featureKey?: string }).featureKey as HostedFeatureKey;
    const uxMsg = generateEntitlementUXMessage(featureKey, undefined);
    const action = await vscode.window.showErrorMessage(
      uxMsg.message,
      uxMsg.actionLabel ?? 'Upgrade'
    );
    if (action && uxMsg.upgradeUrl) {
      vscode.env.openExternal(vscode.Uri.parse(uxMsg.upgradeUrl));
    }
    throw new Error(uxMsg.title);
  }

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
    vscode.commands.registerCommand('promptCompiler.sendToProvider', async (item?: { resourceUri?: vscode.Uri; uri?: vscode.Uri }) => {
      try {
        const workspace = vscode.workspace.workspaceFolders?.[0];
        if (!workspace) {
          throw new Error('Open a workspace first.');
        }

        const selectedUri = item?.resourceUri ?? item?.uri;
        const exportFolder =
          inferExportFolderFromArtifact(selectedUri) ??
          artifactExplorer.getLatestExportFolder();

        if (!exportFolder) {
          throw new Error('No export folder found. Export a bundle first or run this command from an artifact item.');
        }

        const compiledUri = vscode.Uri.joinPath(exportFolder, 'compiled.json');
        const compiledRaw = await vscode.workspace.fs.readFile(compiledUri);
        const bundle = JSON.parse(Buffer.from(compiledRaw).toString('utf8')) as {
          briefId: string;
          profileId: string;
          outputs: Array<{ target: string; content: string }>;
        };

        if (!Array.isArray(bundle.outputs) || bundle.outputs.length === 0) {
          throw new Error('compiled.json has no outputs to execute.');
        }

        const selectedOutputPick = await vscode.window.showQuickPick(
          bundle.outputs.map((output) => ({
            label: output.target,
            description: `${output.content.slice(0, 80).replace(/\s+/g, ' ')}${output.content.length > 80 ? '...' : ''}`,
            output
          })),
          {
            title: 'Send to Provider',
            placeHolder: 'Select compiled output target to send'
          }
        );

        if (!selectedOutputPick) {
          return;
        }

        const providerMode = await vscode.window.showQuickPick(
          [
            { label: 'Dry Run (no external call)', value: 'dry-run' as const },
            { label: 'OpenAI-Compatible API', value: 'openai-compatible' as const }
          ],
          {
            title: 'Provider Mode',
            placeHolder: 'Choose provider execution mode'
          }
        );

        if (!providerMode) {
          return;
        }

        const provider = await resolveProviderTarget(providerMode.value);
        if (!provider) {
          return;
        }

        // P25-5: Optional execution policy configuration.
        const policyChoice = await vscode.window.showQuickPick(
          [
            { label: 'Use default policy', description: 'No timeout/retry overrides', value: 'default' as const },
            { label: 'Configure policy', description: 'Set timeout, retries, and retry delay', value: 'configure' as const }
          ],
          { title: 'Execution Policy', placeHolder: 'Choose execution policy' }
        );
        if (!policyChoice) {
          return;
        }

        let executionPolicy: { timeoutMs?: number; maxRetries?: number; retryDelayMs?: number } | undefined;
        if (policyChoice.value === 'configure') {
          const timeoutInput = await vscode.window.showInputBox({
            title: 'Execution Policy — Timeout',
            prompt: 'Request timeout per attempt in milliseconds (leave blank for default 30000)',
            placeHolder: '30000',
            validateInput: (v) => (v && !/^\d+$/.test(v) ? 'Must be a positive integer' : null)
          });
          if (timeoutInput === undefined) return;

          const retriesInput = await vscode.window.showInputBox({
            title: 'Execution Policy — Max Retries',
            prompt: 'Number of retries after first failed attempt (leave blank for default 0)',
            placeHolder: '0',
            validateInput: (v) => (v && !/^\d+$/.test(v) ? 'Must be a non-negative integer' : null)
          });
          if (retriesInput === undefined) return;

          const retryDelayInput = await vscode.window.showInputBox({
            title: 'Execution Policy — Retry Delay',
            prompt: 'Delay between retry attempts in milliseconds (leave blank for default 250)',
            placeHolder: '250',
            validateInput: (v) => (v && !/^\d+$/.test(v) ? 'Must be a non-negative integer' : null)
          });
          if (retryDelayInput === undefined) return;

          const policy: { timeoutMs?: number; maxRetries?: number; retryDelayMs?: number } = {};
          if (timeoutInput) policy.timeoutMs = Number(timeoutInput);
          if (retriesInput) policy.maxRetries = Number(retriesInput);
          if (retryDelayInput) policy.retryDelayMs = Number(retryDelayInput);
          if (Object.keys(policy).length > 0) executionPolicy = policy;
        }

        const bundleId = path.basename(exportFolder.fsPath);
        const requestPayload: {
          content: string;
          target: string;
          bundleId: string;
          profileId: string;
          provider: {
            id: string;
            type: 'dry-run' | 'openai-compatible';
            baseUrl?: string;
            model?: string;
            apiKey?: string;
          };
          policy?: { timeoutMs?: number; maxRetries?: number; retryDelayMs?: number };
          plan?: 'studio';
          mode?: 'hosted';
          entitlements?: string[];
        } = {
          content: selectedOutputPick.output.content,
          target: selectedOutputPick.output.target,
          bundleId,
          profileId: bundle.profileId,
          provider,
          ...(executionPolicy ? { policy: executionPolicy } : {})
        };

        if (provider.type === 'openai-compatible') {
          requestPayload.plan = 'studio';
          requestPayload.mode = 'hosted';
          requestPayload.entitlements = ['free.local', 'pro.creator', 'studio.team', 'credits.compute'];
        }

        const base = hostedApiBase();
        const executionResponse = await fetchJson<{ ok: true; result: unknown }>(`${base}/execute`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestPayload)
        });

        const executionsFolder = vscode.Uri.joinPath(exportFolder, 'executions');
        await vscode.workspace.fs.createDirectory(executionsFolder);

        const executedAt =
          typeof (executionResponse.result as { executedAt?: unknown }).executedAt === 'string'
            ? String((executionResponse.result as { executedAt: string }).executedAt)
            : new Date().toISOString();
        const executionFile = vscode.Uri.joinPath(
          executionsFolder,
          `execution-${selectedOutputPick.output.target}-${executedAt.replace(/[:.]/g, '-')}.json`
        );

        const persisted = {
          request: {
            target: selectedOutputPick.output.target,
            bundleId,
            profileId: bundle.profileId,
            provider,
            ...(executionPolicy ? { policy: executionPolicy } : {})
          },
          result: executionResponse.result
        };
        await vscode.workspace.fs.writeFile(executionFile, Buffer.from(`${JSON.stringify(persisted, null, 2)}\n`, 'utf8'));

        artifactExplorer.addArtifact(executionFile);
        void vscode.window.showInformationMessage(`Execution complete for target '${selectedOutputPick.output.target}'. Result saved to executions folder.`);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown provider execution error';
        void vscode.window.showErrorMessage(`Send to Provider failed: ${message}`);
      }
    }),
    vscode.commands.registerCommand('promptCompiler.publishBundle', async (item?: { resourceUri?: vscode.Uri; uri?: vscode.Uri }) => {
      try {
        const workspace = vscode.workspace.workspaceFolders?.[0];
        if (!workspace) {
          throw new Error('Open a workspace first.');
        }

        const selectedUri = item?.resourceUri ?? item?.uri;
        const exportFolder =
          inferExportFolderFromArtifact(selectedUri) ??
          artifactExplorer.getLatestExportFolder();

        if (!exportFolder) {
          throw new Error('No export folder found. Export a bundle first or run this command from an artifact item.');
        }

        const compiledUri = vscode.Uri.joinPath(exportFolder, 'compiled.json');
        const compiledRaw = await vscode.workspace.fs.readFile(compiledUri);
        const bundle = JSON.parse(Buffer.from(compiledRaw).toString('utf8')) as {
          briefId: string;
          profileId: string;
        };

        const publishMode = await vscode.window.showQuickPick(
          [
            { label: 'Dry Run Publish', value: 'dry-run' as const },
            { label: 'Signed Webhook Publish', value: 'webhook' as const }
          ],
          {
            title: 'Publish Bundle',
            placeHolder: 'Choose publish destination type'
          }
        );

        if (!publishMode) {
          return;
        }

        let target: {
          id: string;
          kind: 'dry-run' | 'webhook';
          url?: string;
          secret?: string;
        };

        if (publishMode.value === 'dry-run') {
          target = { id: 'local-dry-run-publish', kind: 'dry-run' };
        } else {
          const url = await vscode.window.showInputBox({
            title: 'Publish Webhook URL',
            prompt: 'Destination webhook URL for publish dispatch'
          });
          if (!url) {
            return;
          }

          const secret = await vscode.window.showInputBox({
            title: 'Publish Webhook Secret (Optional)',
            prompt: 'Optional HMAC secret for signed publish payload',
            password: true,
            ignoreFocusOut: true
          });

          target = {
            id: 'webhook-publish-target',
            kind: 'webhook',
            url,
            ...(secret ? { secret } : {})
          };
        }

        const bundleId = path.basename(exportFolder.fsPath);
        let reviewContext: { accountId: string; workspaceId: string } | null = null;

        if (publishMode.value === 'webhook') {
          reviewContext = await resolveReviewContext(context, exportFolder, bundleId);
          if (!reviewContext) {
            return;
          }
        }

        const publishPayload = {
          bundleId,
          profileId: bundle.profileId,
          workspaceId: reviewContext?.workspaceId,
          target,
          publishPayload: {
            source: 'vscode-extension',
            exportFolder: vscode.workspace.asRelativePath(exportFolder)
          },
          plan: publishMode.value === 'dry-run' ? undefined : 'studio',
          mode: publishMode.value === 'dry-run' ? undefined : 'hosted',
          entitlements:
            publishMode.value === 'dry-run'
              ? undefined
              : ['free.local', 'pro.creator', 'studio.team']
        };

        const base = hostedApiBase();
        const publishResponse = await fetchJson<{ ok: true; result: { jobId: string; status: string; updatedAt: string } }>(`${base}/publish/jobs`, {
          method: 'POST',
          headers: reviewHeaders(reviewContext),
          body: JSON.stringify(publishPayload)
        });

        const publishFolder = vscode.Uri.joinPath(exportFolder, 'publish-jobs');
        await vscode.workspace.fs.createDirectory(publishFolder);
        const publishFile = vscode.Uri.joinPath(publishFolder, `publish-${publishResponse.result.jobId}.json`);
        await vscode.workspace.fs.writeFile(
          publishFile,
          Buffer.from(
            `${JSON.stringify(
              {
                request: publishPayload,
                result: publishResponse.result
              },
              null,
              2
            )}\n`,
            'utf8'
          )
        );

        artifactExplorer.addArtifact(publishFile);

        if (reviewContext) {
          await refreshReviewArtifact(base, exportFolder, bundleId, reviewContext, artifactExplorer);
        }

        void vscode.window.showInformationMessage(`Publish job '${publishResponse.result.jobId}' created with status '${publishResponse.result.status}'.`);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown publish error';
        void vscode.window.showErrorMessage(`Publish Bundle failed: ${message}`);
      }
    }),
    vscode.commands.registerCommand('promptCompiler.startBundleReview', async (item?: { resourceUri?: vscode.Uri; uri?: vscode.Uri }) => {
      try {
        const exportFolder = resolveExportFolderFromItem(item, artifactExplorer);
        if (!exportFolder) {
          throw new Error('No export folder found. Export a bundle first or run this command from an artifact item.');
        }

        const bundleId = path.basename(exportFolder.fsPath);
        const reviewContext = await resolveReviewContext(context, exportFolder, bundleId);
        if (!reviewContext) {
          return;
        }

        const requiredApprovalsRaw = await vscode.window.showInputBox({
          title: 'Required Approvals',
          prompt: 'Number of approvals required before live publish',
          value: '1',
          validateInput: (value) => (/^[1-9]\d*$/.test(value.trim()) ? undefined : 'Enter an integer greater than or equal to 1.')
        });
        if (!requiredApprovalsRaw) {
          return;
        }

        const base = hostedApiBase();
        await fetchJson<{ ok: true; result: unknown }>(`${base}/reviews/bundles`, {
          method: 'POST',
          headers: reviewHeaders(reviewContext),
          body: JSON.stringify({
            bundleId,
            workspaceId: reviewContext.workspaceId,
            requiredApprovals: Number(requiredApprovalsRaw)
          })
        });

        const submitResponse = await fetchJson<{ ok: true; result: unknown }>(`${base}/reviews/bundles/${encodeURIComponent(bundleId)}/submit`, {
          method: 'POST',
          headers: reviewHeaders(reviewContext),
          body: JSON.stringify({ workspaceId: reviewContext.workspaceId })
        });

        await persistReviewArtifact(exportFolder, bundleId, submitResponse.result, artifactExplorer);
        void vscode.window.showInformationMessage(`Bundle review started for '${bundleId}'.`);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown review start error';
        void vscode.window.showErrorMessage(`Start Bundle Review failed: ${message}`);
      }
    }),
    vscode.commands.registerCommand('promptCompiler.showBundleReviewStatus', async (item?: { resourceUri?: vscode.Uri; uri?: vscode.Uri }) => {
      try {
        const exportFolder = resolveExportFolderFromItem(item, artifactExplorer);
        if (!exportFolder) {
          throw new Error('No export folder found. Export a bundle first or run this command from an artifact item.');
        }

        const bundleId = path.basename(exportFolder.fsPath);
        const reviewContext = await resolveReviewContext(context, exportFolder, bundleId);
        if (!reviewContext) {
          return;
        }

        const review = await refreshReviewArtifact(hostedApiBase(), exportFolder, bundleId, reviewContext, artifactExplorer);
        void vscode.window.showInformationMessage(`Bundle '${bundleId}' review status: ${String((review as { status?: string }).status ?? 'unknown')}.`);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown review status error';
        void vscode.window.showErrorMessage(`Show Bundle Review Status failed: ${message}`);
      }
    }),
    vscode.commands.registerCommand('promptCompiler.addBundleReviewComment', async (item?: { resourceUri?: vscode.Uri; uri?: vscode.Uri }) => {
      try {
        const exportFolder = resolveExportFolderFromItem(item, artifactExplorer);
        if (!exportFolder) {
          throw new Error('No export folder found. Export a bundle first or run this command from an artifact item.');
        }

        const bundleId = path.basename(exportFolder.fsPath);
        const reviewContext = await resolveReviewContext(context, exportFolder, bundleId);
        if (!reviewContext) {
          return;
        }

        const message = await vscode.window.showInputBox({
          title: 'Review Comment',
          prompt: 'Comment to append to the bundle review trail'
        });
        if (!message) {
          return;
        }

        const base = hostedApiBase();
        const response = await fetchJson<{ ok: true; result: unknown }>(`${base}/reviews/bundles/${encodeURIComponent(bundleId)}/comments`, {
          method: 'POST',
          headers: reviewHeaders(reviewContext),
          body: JSON.stringify({ workspaceId: reviewContext.workspaceId, message })
        });

        await persistReviewArtifact(exportFolder, bundleId, response.result, artifactExplorer);
        void vscode.window.showInformationMessage(`Review comment added to '${bundleId}'.`);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown review comment error';
        void vscode.window.showErrorMessage(`Add Bundle Review Comment failed: ${message}`);
      }
    }),
    vscode.commands.registerCommand('promptCompiler.reviewBundleDecision', async (item?: { resourceUri?: vscode.Uri; uri?: vscode.Uri }) => {
      try {
        const exportFolder = resolveExportFolderFromItem(item, artifactExplorer);
        if (!exportFolder) {
          throw new Error('No export folder found. Export a bundle first or run this command from an artifact item.');
        }

        const bundleId = path.basename(exportFolder.fsPath);
        const reviewContext = await resolveReviewContext(context, exportFolder, bundleId);
        if (!reviewContext) {
          return;
        }

        const decisionPick = await vscode.window.showQuickPick(
          [
            { label: 'Approve Bundle', value: 'approve' as const },
            { label: 'Request Changes', value: 'request_changes' as const }
          ],
          {
            title: 'Review Decision',
            placeHolder: 'Choose approval decision'
          }
        );
        if (!decisionPick) {
          return;
        }

        const comment = await vscode.window.showInputBox({
          title: 'Decision Comment (Optional)',
          prompt: 'Optional rationale for this approval decision'
        });

        const base = hostedApiBase();
        const response = await fetchJson<{ ok: true; result: unknown }>(`${base}/reviews/bundles/${encodeURIComponent(bundleId)}/decisions`, {
          method: 'POST',
          headers: reviewHeaders(reviewContext),
          body: JSON.stringify({
            workspaceId: reviewContext.workspaceId,
            decision: decisionPick.value,
            ...(comment ? { comment } : {})
          })
        });

        await persistReviewArtifact(exportFolder, bundleId, response.result, artifactExplorer);
        void vscode.window.showInformationMessage(`Bundle '${bundleId}' decision recorded: ${decisionPick.value}.`);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown review decision error';
        void vscode.window.showErrorMessage(`Review Bundle Decision failed: ${message}`);
      }
    }),
    vscode.commands.registerCommand('promptCompiler.showFeedbackAggregate', async (item?: { resourceUri?: vscode.Uri; uri?: vscode.Uri }) => {
      try {
        const workspace = vscode.workspace.workspaceFolders?.[0];
        if (!workspace) {
          throw new Error('Open a workspace first.');
        }

        const selectedUri = item?.resourceUri ?? item?.uri;
        const exportFolder =
          inferExportFolderFromArtifact(selectedUri) ??
          artifactExplorer.getLatestExportFolder();

        if (!exportFolder) {
          throw new Error('No export folder found. Export a bundle first or run this command from an artifact item.');
        }

        const compiledUri = vscode.Uri.joinPath(exportFolder, 'compiled.json');
        const compiledRaw = await vscode.workspace.fs.readFile(compiledUri);
        const bundle = JSON.parse(Buffer.from(compiledRaw).toString('utf8')) as {
          profileId: string;
        };

        const base = hostedApiBase();
        const aggregate = await fetchJson<{ ok: true; result: unknown }>(
          `${base}/feedback/aggregate?profileId=${encodeURIComponent(bundle.profileId)}`
        );

        const feedbackFolder = vscode.Uri.joinPath(exportFolder, 'feedback');
        await vscode.workspace.fs.createDirectory(feedbackFolder);
        const feedbackFile = vscode.Uri.joinPath(feedbackFolder, `aggregate-${bundle.profileId}.json`);
        await vscode.workspace.fs.writeFile(feedbackFile, Buffer.from(`${JSON.stringify(aggregate.result, null, 2)}\n`, 'utf8'));

        artifactExplorer.addArtifact(feedbackFile);
        void vscode.window.showInformationMessage(`Feedback aggregate loaded for profile '${bundle.profileId}'.`);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown feedback aggregate error';
        void vscode.window.showErrorMessage(`Show Feedback Aggregate failed: ${message}`);
      }
    }),
    // P30-5: Show learning timeline for a profiled bundle.
    vscode.commands.registerCommand('promptCompiler.showLearningTimeline', async (item?: { resourceUri?: vscode.Uri; uri?: vscode.Uri }) => {
      try {
        const workspace = vscode.workspace.workspaceFolders?.[0];
        if (!workspace) {
          throw new Error('Open a workspace first.');
        }

        const selectedUri = item?.resourceUri ?? item?.uri;
        const exportFolder =
          inferExportFolderFromArtifact(selectedUri) ??
          artifactExplorer.getLatestExportFolder();

        if (!exportFolder) {
          throw new Error('No export folder found. Export a bundle first or run this command from an artifact item.');
        }

        const compiledUri = vscode.Uri.joinPath(exportFolder, 'compiled.json');
        const compiledRaw = await vscode.workspace.fs.readFile(compiledUri);
        const bundle = JSON.parse(Buffer.from(compiledRaw).toString('utf8')) as {
          profileId: string;
        };

        const base = hostedApiBase();
        const timeline = await fetchJson<{ ok: true; result: unknown }>(
          `${base}/learning/timeline?profileId=${encodeURIComponent(bundle.profileId)}`
        );

        const feedbackFolder = vscode.Uri.joinPath(exportFolder, 'feedback');
        await vscode.workspace.fs.createDirectory(feedbackFolder);
        const timelineFile = vscode.Uri.joinPath(feedbackFolder, `learning-timeline-${bundle.profileId}.json`);
        await vscode.workspace.fs.writeFile(timelineFile, Buffer.from(`${JSON.stringify(timeline.result, null, 2)}\n`, 'utf8'));

        artifactExplorer.addArtifact(timelineFile);
        void vscode.window.showInformationMessage(`Learning timeline loaded for profile '${bundle.profileId}'.`);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown learning timeline error';
        void vscode.window.showErrorMessage(`Show Learning Timeline failed: ${message}`);
      }
    }),
    vscode.commands.registerCommand('promptCompiler.browseMarketplace', async () => {
      try {
        const workspace = vscode.workspace.workspaceFolders?.[0];
        if (!workspace) {
          throw new Error('Open a workspace first.');
        }

        const base = hostedApiBase();
        const listingsResponse = await fetchJson<{
          ok: true;
          result: {
            listings: Array<{
              listingId: string;
              listingType: string;
              displayName: string;
              installCount?: number;
              version?: string;
            }>;
          };
        }>(`${base}/marketplace/listings`);

        const listingPick = await vscode.window.showQuickPick(
          listingsResponse.result.listings.map((listing) => ({
            label: listing.displayName,
            description: `${listing.listingType} · installs ${listing.installCount ?? 0} · v${listing.version ?? '1.0.0'}`,
            listing
          })),
          {
            title: 'Browse Marketplace',
            placeHolder: 'Select a marketplace listing to install'
          }
        );

        if (!listingPick) {
          return;
        }

        const accountId = await vscode.window.showInputBox({
          title: 'Marketplace Account ID',
          prompt: 'Account ID used for marketplace install',
          value: 'acct-local'
        });
        if (!accountId) {
          return;
        }

        const workspaceId = await vscode.window.showInputBox({
          title: 'Marketplace Workspace ID',
          prompt: 'Workspace scope for installed listing',
          value: 'workspace-local'
        });
        if (!workspaceId) {
          return;
        }

        const installResponse = await fetchJson<{ ok: true; result: unknown }>(`${base}/marketplace/install`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            listingId: listingPick.listing.listingId,
            accountId,
            workspaceId
          })
        });

        const exportFolder = artifactExplorer.getLatestExportFolder();
        const artifactRoot = exportFolder ?? vscode.Uri.joinPath(workspace.uri, '.prompt-compiler', 'marketplace');
        const installFolder = vscode.Uri.joinPath(artifactRoot, 'marketplace-installs');
        await vscode.workspace.fs.createDirectory(installFolder);
        const installFile = vscode.Uri.joinPath(installFolder, `install-${listingPick.listing.listingId}.json`);
        await vscode.workspace.fs.writeFile(installFile, Buffer.from(`${JSON.stringify(installResponse.result, null, 2)}\n`, 'utf8'));

        artifactExplorer.addArtifact(installFile);
        void vscode.window.showInformationMessage(`Installed marketplace listing '${listingPick.listing.displayName}'.`);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown marketplace browse error';
        void vscode.window.showErrorMessage(`Browse Marketplace failed: ${message}`);
      }
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

        const hints = deriveRefinementHints(result);
        if (hints.length > 0) {
          panel.webview.postMessage({ type: 'hints', hints });
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown compile error';
        panel.webview.postMessage({ type: 'error', message: errorMessage });
      }
      return;
    }

    if (message.type === 'refine') {
      try {
        await context.workspaceState.update(LAST_BRIEF_KEY, message.brief);
        await context.workspaceState.update(LAST_PROFILE_KEY, message.profile);

        const brief = parseJsonOrThrow<PromptBrief>(message.brief, 'Brief');
        const profile = parseJsonOrThrow<BrandProfile>(message.profile, 'Profile');
        const hints = Array.isArray(message.hints) ? (message.hints as RefinementHint[]) : [];
        const result = refinePromptBundle(brief, profile, { hints });
        panel.webview.postMessage({ type: 'compiled', payload: result });

        // Derive next-round hints from refined bundle.
        const nextHints = deriveRefinementHints(result);
        panel.webview.postMessage({ type: 'hints', hints: nextHints });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown refine error';
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

    if (message.type === 'autoCompile') {
      try {
        const prompt = typeof message.prompt === 'string' ? message.prompt.trim() : '';
        if (!prompt) {
          panel.webview.postMessage({ type: 'error', message: 'Auto Compile requires a non-empty prompt.' });
          return;
        }
        const result = autoCompile({ prompt, autoRefine: Boolean(message.autoRefine) });
        panel.webview.postMessage({ type: 'autoCompiled', payload: result });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown auto-compile error';
        panel.webview.postMessage({ type: 'error', message: errorMessage });
      }
    }

    // P29-1: Live streaming execution via SSE — dry-run provider, streams progress events to webview.
    if (message.type === 'streamExecute') {
      // Capture panel reference to use inside the async closure.
      const livePanel = panel;
      void (async () => {
        try {
          const brief = parseJsonOrThrow<PromptBrief>(message.brief, 'Brief');
          const profile = parseJsonOrThrow<BrandProfile>(message.profile, 'Profile');
          const bundle = compilePromptBundle(brief, profile, { includeGenericOutput: true });

          const selectedOutput = bundle.outputs[0];
          if (!selectedOutput) {
            livePanel.webview.postMessage({ type: 'streamError', message: 'No compiled output found.' });
            return;
          }

          const bundleId = `${bundle.briefId}-${bundle.generatedAt.replace(/[:.]/g, '-')}`;
          const base = hostedApiBase();

          const response = await fetch(`${base}/execute/stream`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              content: selectedOutput.content,
              target: selectedOutput.target,
              bundleId,
              profileId: bundle.profileId,
              provider: { id: 'dry-run-studio', type: 'dry-run' }
            })
          });

          if (!response.ok || !response.body) {
            livePanel.webview.postMessage({ type: 'streamError', message: `HTTP ${response.status}` });
            return;
          }

          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let buffer = '';

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            // SSE events are delimited by double newline.
            const blocks = buffer.split('\n\n');
            buffer = blocks.pop() ?? '';
            for (const block of blocks) {
              let eventName = '';
              let dataStr = '';
              for (const line of block.split('\n')) {
                if (line.startsWith('event: ')) eventName = line.slice(7).trim();
                else if (line.startsWith('data: ')) dataStr = line.slice(6);
              }
              if (!dataStr) continue;
              let data: unknown;
              try { data = JSON.parse(dataStr); } catch { continue; }
              if (eventName === 'completed') {
                livePanel.webview.postMessage({ type: 'streamCompleted', data });
              } else {
                livePanel.webview.postMessage({ type: 'streamProgress', event: eventName, data });
              }
            }
          }
        } catch (err) {
          const errorMessage = err instanceof Error ? err.message : 'Unknown stream execute error';
          panel.webview.postMessage({ type: 'streamError', message: errorMessage });
        }
      })();
    }
  });
}

function resolveExportFolderFromItem(
  item: { resourceUri?: vscode.Uri; uri?: vscode.Uri } | undefined,
  artifactExplorer: ArtifactExplorerProvider
): vscode.Uri | undefined {
  const selectedUri = item?.resourceUri ?? item?.uri;
  return inferExportFolderFromArtifact(selectedUri) ?? artifactExplorer.getLatestExportFolder();
}

function reviewHeaders(contextPayload: { accountId: string; workspaceId: string } | null): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    ...(contextPayload
      ? {
          'x-account-id': contextPayload.accountId,
          'x-workspace-id': contextPayload.workspaceId
        }
      : {})
  };
}

async function resolveReviewContext(
  context: vscode.ExtensionContext,
  exportFolder: vscode.Uri,
  bundleId: string
): Promise<{ accountId: string; workspaceId: string } | null> {
  const storedReview = await readStoredReviewArtifact(exportFolder, bundleId);
  const lastAccountId = context.workspaceState.get<string>(LAST_REVIEW_ACCOUNT_KEY) ?? 'acct-owner';
  const lastWorkspaceId =
    storedReview?.workspaceId ?? context.workspaceState.get<string>(LAST_REVIEW_WORKSPACE_KEY) ?? 'workspace-local';

  const accountId = await vscode.window.showInputBox({
    title: 'Review Account ID',
    prompt: 'Account identity used for workspace review actions',
    value: lastAccountId
  });
  if (!accountId) {
    return null;
  }

  const workspaceId = await vscode.window.showInputBox({
    title: 'Review Workspace ID',
    prompt: 'Workspace scope for this bundle review',
    value: lastWorkspaceId
  });
  if (!workspaceId) {
    return null;
  }

  await context.workspaceState.update(LAST_REVIEW_ACCOUNT_KEY, accountId);
  await context.workspaceState.update(LAST_REVIEW_WORKSPACE_KEY, workspaceId);
  return { accountId, workspaceId };
}

function reviewArtifactUri(exportFolder: vscode.Uri, bundleId: string): vscode.Uri {
  return vscode.Uri.joinPath(exportFolder, 'reviews', reviewArtifactName(bundleId));
}

async function readStoredReviewArtifact(
  exportFolder: vscode.Uri,
  bundleId: string
): Promise<{ workspaceId?: string; status?: string } | undefined> {
  try {
    const raw = await vscode.workspace.fs.readFile(reviewArtifactUri(exportFolder, bundleId));
    return parseStoredReviewArtifact(Buffer.from(raw).toString('utf8'));
  } catch {
    return undefined;
  }
}

async function persistReviewArtifact(
  exportFolder: vscode.Uri,
  bundleId: string,
  reviewPayload: unknown,
  artifactExplorer: ArtifactExplorerProvider
): Promise<vscode.Uri> {
  const target = reviewArtifactUri(exportFolder, bundleId);
  await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(exportFolder, 'reviews'));
  await vscode.workspace.fs.writeFile(target, Buffer.from(`${JSON.stringify(reviewPayload, null, 2)}\n`, 'utf8'));
  artifactExplorer.addArtifact(target);
  return target;
}

async function refreshReviewArtifact(
  baseUrl: string,
  exportFolder: vscode.Uri,
  bundleId: string,
  reviewContext: { accountId: string; workspaceId: string },
  artifactExplorer: ArtifactExplorerProvider
): Promise<unknown> {
  const response = await fetchJson<{ ok: true; result: unknown }>(
    `${baseUrl}/reviews/bundles/${encodeURIComponent(bundleId)}?workspaceId=${encodeURIComponent(reviewContext.workspaceId)}`,
    {
      headers: reviewHeaders(reviewContext)
    }
  );
  await persistReviewArtifact(exportFolder, bundleId, response.result, artifactExplorer);
  return response.result;
}

function inferExportFolderFromArtifact(artifactUri: vscode.Uri | undefined): vscode.Uri | undefined {
  if (!artifactUri) {
    return undefined;
  }

  const marker = `${path.sep}.prompt-compiler${path.sep}exports${path.sep}`;
  const fsPath = artifactUri.fsPath;
  const markerIndex = fsPath.indexOf(marker);
  if (markerIndex === -1) {
    return undefined;
  }

  const afterMarker = fsPath.slice(markerIndex + marker.length);
  const folderName = afterMarker.split(path.sep)[0];
  if (!folderName) {
    return undefined;
  }

  const workspacePrefix = fsPath.slice(0, markerIndex);
  return vscode.Uri.file(path.join(workspacePrefix, '.prompt-compiler', 'exports', folderName));
}

async function resolveProviderTarget(mode: 'dry-run' | 'openai-compatible'): Promise<{
  id: string;
  type: 'dry-run' | 'openai-compatible';
  baseUrl?: string;
  model?: string;
  apiKey?: string;
} | null> {
  if (mode === 'dry-run') {
    return {
      id: 'local-dry-run',
      type: 'dry-run'
    };
  }

  const baseUrl = await vscode.window.showInputBox({
    title: 'Provider Base URL',
    prompt: 'OpenAI-compatible API base URL',
    value: 'https://api.openai.com/v1'
  });
  if (!baseUrl) {
    return null;
  }

  const model = await vscode.window.showInputBox({
    title: 'Provider Model',
    prompt: 'Model name to execute',
    value: 'gpt-4o-mini'
  });
  if (!model) {
    return null;
  }

  const apiKey = await vscode.window.showInputBox({
    title: 'Provider API Key',
    prompt: 'Bearer API key for provider call',
    password: true,
    ignoreFocusOut: true
  });
  if (!apiKey) {
    return null;
  }

  return {
    id: 'openai-compatible-provider',
    type: 'openai-compatible',
    baseUrl,
    model,
    apiKey
  };
}

export function deactivate(): void {}
