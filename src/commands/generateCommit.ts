import * as vscode from "vscode";
import { getConfig } from "../services/config";
import { getStagedDiff, getWorkingTreeDiff, stageAllChanges } from "../services/git";
import { generateCommitMessage } from "../services/ollama";

type GitExtensionApi = {
  getAPI(version: 1): GitApi;
};

type GitApi = {
  repositories: GitRepository[];
};

type GitRepository = {
  rootUri: vscode.Uri;
  inputBox: {
    value: string;
  };
};

export async function runGenerateCommit() {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];

  if (!workspaceFolder) {
    vscode.window.showErrorMessage("No workspace folder found");
    return;
  }

  const cwd = workspaceFolder.uri.fsPath;
  const config = getConfig();

  const diff = await resolveDiff(cwd);
  if (!diff) {
    return;
  }

  const trimmedDiff = diff.slice(0, config.maxDiffChars);

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: "Generating commit message...",
      cancellable: false
    },
    async () => {
      const result = await generateCommitMessage({
        baseUrl: config.baseUrl,
        model: config.model,
        groqApiKey: config.groqApiKey,
        groqModel: config.groqModel,
        geminiApiKey: config.geminiApiKey,
        geminiModel: config.geminiModel,
        openaiModel: config.openaiModel,
        codexPath: config.codexPath,
        systemPrompt: config.systemPrompt,
        enableThinking: config.enableThinking,
        diff: trimmedDiff,
        temperature: config.temperature,
        cwd
      });

      const { message, provider, model } = result;

      const insertedIntoInput = await tryInsertCommitMessage(workspaceFolder.uri, message);

      if (!insertedIntoInput || config.copyToClipboard) {
        await vscode.env.clipboard.writeText(message);
      }

      if (insertedIntoInput) {
        await vscode.commands.executeCommand("workbench.view.scm");
        vscode.window.setStatusBarMessage(
          `Ollama Commit filled the Source Control commit message using ${provider} (${model})`,
          5000
        );
        return;
      }

      const action = await vscode.window.showWarningMessage(
        "Could not insert into the Source Control input box. The commit message was copied to the clipboard.",
        "Preview"
      );

      if (action === "Preview") {
        await showCommitMessagePreview(message);
      }
    }
  );
}

async function resolveDiff(cwd: string): Promise<string | null> {
  const stagedDiff = await getStagedDiff(cwd);
  if (stagedDiff) {
    return stagedDiff;
  }

  const workingTreeDiff = await getWorkingTreeDiff(cwd);
  if (!workingTreeDiff) {
    vscode.window.showWarningMessage("No changes found");
    return null;
  }

  const action = await vscode.window.showWarningMessage(
    "No staged changes found",
    { modal: true },
    "Stage All and Generate",
    "Use Unstaged Changes"
  );

  if (action === "Stage All and Generate") {
    await stageAllChanges(cwd);
    return getStagedDiff(cwd);
  }

  if (action === "Use Unstaged Changes") {
    return workingTreeDiff;
  }

  return null;
}

async function tryInsertCommitMessage(workspaceUri: vscode.Uri, message: string): Promise<boolean> {
  const insertedWithGitApi = await tryInsertWithGitExtension(workspaceUri, message);
  if (insertedWithGitApi) {
    return true;
  }

  const scm = vscode.scm;
  if (scm.inputBox) {
    scm.inputBox.value = message;
    return true;
  }

  return false;
}

async function tryInsertWithGitExtension(workspaceUri: vscode.Uri, message: string): Promise<boolean> {
  const gitExtension = vscode.extensions.getExtension<GitExtensionApi>("vscode.git");
  if (!gitExtension) {
    return false;
  }

  const gitApi = gitExtension.isActive
    ? gitExtension.exports.getAPI(1)
    : (await gitExtension.activate()).getAPI(1);

  const repository = pickRepository(gitApi.repositories, workspaceUri);
  if (!repository) {
    return false;
  }

  repository.inputBox.value = message;
  return true;
}

function pickRepository(repositories: GitRepository[], workspaceUri: vscode.Uri): GitRepository | undefined {
  const workspacePath = workspaceUri.fsPath;

  return repositories
    .filter((repository) => workspacePath.startsWith(repository.rootUri.fsPath))
    .sort((left, right) => right.rootUri.fsPath.length - left.rootUri.fsPath.length)[0];
}

async function showCommitMessagePreview(message: string): Promise<void> {
  const document = await vscode.workspace.openTextDocument({
    content: message,
    language: "plaintext",
  });

  await vscode.window.showTextDocument(document, {
    preview: true,
    viewColumn: vscode.ViewColumn.Beside,
  });
}
