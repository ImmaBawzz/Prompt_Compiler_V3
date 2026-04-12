import * as path from 'node:path';
import * as vscode from 'vscode';

class ArtifactItem extends vscode.TreeItem {
  constructor(public readonly uri: vscode.Uri) {
    super(path.basename(uri.fsPath), vscode.TreeItemCollapsibleState.None);
    this.description = vscode.workspace.asRelativePath(uri);
    this.resourceUri = uri;
    this.contextValue = 'promptCompiler.artifact';
    this.command = {
      command: 'vscode.open',
      title: 'Open Artifact',
      arguments: [uri]
    };
  }
}

class EmptyStateItem extends vscode.TreeItem {
  constructor() {
    super('No exported artifacts yet', vscode.TreeItemCollapsibleState.None);
    this.description = 'Run Export Bundle from Prompt Studio.';
    this.contextValue = 'promptCompiler.emptyArtifacts';
  }
}

export class ArtifactExplorerProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
  private readonly onDidChangeTreeDataEmitter = new vscode.EventEmitter<vscode.TreeItem | undefined | void>();
  readonly onDidChangeTreeData = this.onDidChangeTreeDataEmitter.event;
  private artifactUris: vscode.Uri[] = [];
  private latestExportFolder: vscode.Uri | undefined;

  getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(): vscode.ProviderResult<vscode.TreeItem[]> {
    if (this.artifactUris.length === 0) {
      return [new EmptyStateItem()];
    }

    return this.artifactUris
      .slice()
      .sort((left, right) => left.fsPath.localeCompare(right.fsPath))
      .map((uri) => new ArtifactItem(uri));
  }

  setArtifacts(artifactUris: vscode.Uri[], exportFolder: vscode.Uri): void {
    this.artifactUris = artifactUris;
    this.latestExportFolder = exportFolder;
    this.onDidChangeTreeDataEmitter.fire();
  }

  addArtifact(artifactUri: vscode.Uri): void {
    if (!this.artifactUris.some((existing) => existing.fsPath === artifactUri.fsPath)) {
      this.artifactUris.push(artifactUri);
    }

    this.onDidChangeTreeDataEmitter.fire();
  }

  refresh(): void {
    this.onDidChangeTreeDataEmitter.fire();
  }

  getLatestExportFolder(): vscode.Uri | undefined {
    return this.latestExportFolder;
  }
}
