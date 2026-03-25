import * as vscode from "vscode";
import { getConfig, updateEditableSettings } from "../services/config";
import { listOllamaModels } from "../services/ollama";

type SettingsState = {
  baseUrl: string;
  model: string;
  groqApiKey: string;
  groqModel: string;
  geminiApiKey: string;
  geminiModel: string;
  openaiModel: string;
  systemPrompt: string;
  enableThinking: boolean;
  models: string[];
  error: string | null;
  resolvedBaseUrl: string | null;
};

type IncomingMessage =
  | { type: "ready" }
  | { type: "refreshModels"; baseUrl: string }
  | {
      type: "save";
      baseUrl: string;
      model: string;
      groqApiKey: string;
      groqModel: string;
      geminiApiKey: string;
      geminiModel: string;
      openaiModel: string;
      systemPrompt: string;
      enableThinking: boolean;
    };

type OutgoingMessage =
  | { type: "state"; payload: SettingsState }
  | { type: "saveResult"; ok: boolean; message: string };

export class SettingsPanel {
  private static currentPanel: SettingsPanel | undefined;

  public static createOrShow(extensionUri: vscode.Uri): void {
    const column = vscode.window.activeTextEditor?.viewColumn;

    if (SettingsPanel.currentPanel) {
      SettingsPanel.currentPanel.panel.reveal(column);
      void SettingsPanel.currentPanel.pushState();
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      "ollamacommit.settings",
      "Ollama Commit Settings",
      column ?? vscode.ViewColumn.One,
      {
        enableScripts: true,
      }
    );

    SettingsPanel.currentPanel = new SettingsPanel(panel, extensionUri);
  }

  private readonly panel: vscode.WebviewPanel;
  private readonly extensionUri: vscode.Uri;
  private readonly disposables: vscode.Disposable[] = [];

  private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
    this.panel = panel;
    this.extensionUri = extensionUri;
    this.panel.webview.html = this.getHtml(this.panel.webview);

    this.panel.onDidDispose(() => {
      SettingsPanel.currentPanel = undefined;
      this.dispose();
    }, null, this.disposables);

    this.panel.webview.onDidReceiveMessage((message: IncomingMessage) => {
      void this.handleMessage(message);
    }, null, this.disposables);
  }

  public dispose(): void {
    while (this.disposables.length > 0) {
      const disposable = this.disposables.pop();
      disposable?.dispose();
    }
  }

  private async handleMessage(message: IncomingMessage): Promise<void> {
    if (message.type === "ready") {
      await this.pushState();
      return;
    }

    if (message.type === "refreshModels") {
      await this.pushState(message.baseUrl);
      return;
    }

    if (message.type === "save") {
      await this.panel.webview.postMessage({
        type: "saveResult",
        ok: true,
        message: "Saving in background...",
      } satisfies OutgoingMessage);

      void (async () => {
        try {
          await updateEditableSettings({
            baseUrl: message.baseUrl.trim(),
            model: message.model.trim(),
            groqApiKey: message.groqApiKey.trim(),
            groqModel: message.groqModel.trim(),
            geminiApiKey: message.geminiApiKey.trim(),
            geminiModel: message.geminiModel.trim(),
            openaiModel: message.openaiModel.trim(),
            systemPrompt: message.systemPrompt.trim(),
            enableThinking: message.enableThinking,
          });

          await this.panel.webview.postMessage({
            type: "saveResult",
            ok: true,
            message: "Settings saved.",
          } satisfies OutgoingMessage);

          await this.pushState(message.baseUrl);
        } catch (error) {
          const saveError = error instanceof Error ? error.message : String(error);

          await this.panel.webview.postMessage({
            type: "saveResult",
            ok: false,
            message: saveError,
          } satisfies OutgoingMessage);
        }
      })();

      return;
    }
  }

  private async pushState(baseUrlOverride?: string): Promise<void> {
    const config = getConfig();
    const baseUrl = (baseUrlOverride ?? config.baseUrl).trim();

    let models: string[] = [];
    let error: string | null = null;
    let resolvedBaseUrl: string | null = null;

    try {
      const result = await listOllamaModels(baseUrl);
      models = result.models;
      resolvedBaseUrl = result.resolvedBaseUrl;
    } catch (panelError) {
      error = panelError instanceof Error ? panelError.message : String(panelError);
    }

    const state: SettingsState = {
      baseUrl,
      model: config.model,
      groqApiKey: config.groqApiKey,
      groqModel: config.groqModel,
      geminiApiKey: config.geminiApiKey,
      geminiModel: config.geminiModel,
      openaiModel: config.openaiModel,
      systemPrompt: config.systemPrompt,
      enableThinking: config.enableThinking,
      models,
      error,
      resolvedBaseUrl,
    };

    await this.panel.webview.postMessage({
      type: "state",
      payload: state,
    } satisfies OutgoingMessage);
  }

  private getHtml(webview: vscode.Webview): string {
    const nonce = getNonce();

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta
    http-equiv="Content-Security-Policy"
    content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';"
  />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Ollama Commit Settings</title>
  <style>
    :root {
      color-scheme: light dark;
    }

    body {
      font-family: var(--vscode-font-family);
      color: var(--vscode-foreground);
      background: linear-gradient(160deg, var(--vscode-editor-background) 0%, color-mix(in srgb, var(--vscode-editor-background) 82%, var(--vscode-button-background) 18%) 100%);
      margin: 0;
      padding: 24px;
    }

    .shell {
      max-width: 880px;
      margin: 0 auto;
      display: grid;
      gap: 20px;
    }

    .hero {
      border: 1px solid var(--vscode-panel-border);
      background: color-mix(in srgb, var(--vscode-editor-background) 88%, var(--vscode-button-background) 12%);
      border-radius: 18px;
      padding: 24px;
      box-shadow: 0 18px 40px rgba(0, 0, 0, 0.16);
    }

    h1 {
      font-size: 28px;
      margin: 0 0 8px;
    }

    p {
      margin: 0;
      line-height: 1.5;
      opacity: 0.9;
    }

    .card {
      border: 1px solid var(--vscode-panel-border);
      border-radius: 18px;
      background: var(--vscode-editor-background);
      padding: 20px;
      display: grid;
      gap: 16px;
    }

    .field {
      display: grid;
      gap: 8px;
    }

    .field-row {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 12px;
      align-items: end;
    }

    label {
      font-weight: 600;
      letter-spacing: 0.01em;
    }

    input, select, textarea, button {
      font: inherit;
    }

    input, select, textarea {
      width: 100%;
      box-sizing: border-box;
      border: 1px solid var(--vscode-input-border, var(--vscode-panel-border));
      border-radius: 12px;
      color: var(--vscode-input-foreground);
      background: var(--vscode-input-background);
      padding: 11px 14px;
    }

    textarea {
      min-height: 220px;
      resize: vertical;
      line-height: 1.5;
    }

    .checkbox-row {
      display: flex;
      align-items: flex-start;
      gap: 12px;
      padding: 14px 16px;
      border: 1px solid var(--vscode-input-border, var(--vscode-panel-border));
      border-radius: 12px;
      background: var(--vscode-input-background);
    }

    .checkbox-row input[type="checkbox"] {
      width: 16px;
      height: 16px;
      margin: 2px 0 0;
      padding: 0;
      flex: none;
    }

    .checkbox-copy {
      display: grid;
      gap: 4px;
    }

    .checkbox-copy label {
      margin: 0;
    }

    .hint {
      font-size: 12px;
      opacity: 0.75;
    }

    .actions {
      display: flex;
      gap: 12px;
      justify-content: flex-end;
      flex-wrap: wrap;
    }

    button {
      border: none;
      border-radius: 999px;
      padding: 10px 16px;
      cursor: pointer;
    }

    .secondary {
      background: var(--vscode-button-secondaryBackground, var(--vscode-dropdown-background));
      color: var(--vscode-button-secondaryForeground, var(--vscode-foreground));
    }

    .primary {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
    }

    .status {
      min-height: 20px;
      font-size: 13px;
    }

    .status.error {
      color: var(--vscode-errorForeground);
    }

    .status.ok {
      color: var(--vscode-testing-iconPassed);
    }

    @media (max-width: 720px) {
      body {
        padding: 16px;
      }

      .field-row {
        grid-template-columns: 1fr;
      }

      .actions {
        justify-content: stretch;
      }

      .actions button {
        width: 100%;
      }
    }
  </style>
</head>
<body>
  <main class="shell">
    <section class="hero">
      <h1>Ollama Commit Settings</h1>
      <p>Try Ollama first, then fall back to Groq and Gemini when Ollama is unavailable.</p>
    </section>

    <section class="card">
      <div class="field">
        <label for="baseUrl">Ollama Base URL</label>
        <div class="field-row">
          <input id="baseUrl" type="text" placeholder="http://127.0.0.1:11434" />
          <button id="refreshButton" class="secondary" type="button">Refresh Models</button>
        </div>
        <div class="hint">The model list is loaded from <code>/api/tags</code>.</div>
      </div>

      <div class="field">
        <label for="modelSelect">Model</label>
        <select id="modelSelect"></select>
        <input id="modelInput" type="text" placeholder="Type a model name, for example qwen2.5-coder:7b" />
        <div class="hint">Pick from the detected models or type a custom model name manually.</div>
      </div>

      <div class="field">
        <label for="groqApiKey">Groq API Key</label>
        <input id="groqApiKey" type="password" placeholder="Optional fallback key" />
        <div class="hint">Used only if Ollama cannot be reached.</div>
      </div>

      <div class="field">
        <label for="groqModel">Groq Model</label>
        <input id="groqModel" type="text" placeholder="openai/gpt-oss-20b" />
      </div>

      <div class="field">
        <label for="geminiApiKey">Gemini API Key</label>
        <input id="geminiApiKey" type="password" placeholder="Optional fallback key" />
        <div class="hint">Used after Groq if Ollama is unavailable or Groq fails.</div>
      </div>

      <div class="field">
        <label for="geminiModel">Gemini Model</label>
        <input id="geminiModel" type="text" placeholder="gemini-2.0-flash-lite" />
      </div>

      <div class="field">
        <label for="openaiModel">Codex/OpenAI Fallback Model</label>
        <input id="openaiModel" type="text" placeholder="gpt-5-mini" />
        <div class="hint">Used last, only when a local Codex login exposes an OpenAI API key through <code>~/.codex/auth.json</code> or <code>OPENAI_API_KEY</code>.</div>
      </div>

      <div class="field">
        <label for="systemPrompt">System Prompt</label>
        <textarea id="systemPrompt" placeholder="Describe how the assistant should write commit messages"></textarea>
      </div>

      <div class="field">
        <div class="checkbox-row">
          <input id="enableThinking" type="checkbox" />
          <div class="checkbox-copy">
            <label for="enableThinking">Enable Thinking</label>
            <div class="hint">Allow models that support reasoning/thinking mode to use it internally before returning the final commit message.</div>
          </div>
        </div>
      </div>

      <div id="status" class="status"></div>

      <div class="actions">
        <button id="saveButton" class="primary" type="button">Save Settings</button>
      </div>
    </section>
  </main>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const baseUrlInput = document.getElementById("baseUrl");
    const modelSelect = document.getElementById("modelSelect");
    const modelInput = document.getElementById("modelInput");
    const groqApiKeyInput = document.getElementById("groqApiKey");
    const groqModelInput = document.getElementById("groqModel");
    const geminiApiKeyInput = document.getElementById("geminiApiKey");
    const geminiModelInput = document.getElementById("geminiModel");
    const openaiModelInput = document.getElementById("openaiModel");
    const systemPromptInput = document.getElementById("systemPrompt");
    const enableThinkingInput = document.getElementById("enableThinking");
    const status = document.getElementById("status");
    const refreshButton = document.getElementById("refreshButton");
    const saveButton = document.getElementById("saveButton");

    function setBusy(isBusy) {
      refreshButton.disabled = isBusy;
      saveButton.disabled = isBusy;
    }

    function setStatus(message, kind) {
      status.textContent = message || "";
      status.className = kind ? "status " + kind : "status";
    }

    function syncModelInput() {
      if (modelSelect.value) {
        modelInput.value = modelSelect.value;
      }
    }

    function setModels(models, currentModel) {
      modelSelect.innerHTML = "";

      const placeholder = document.createElement("option");
      placeholder.value = "";
      placeholder.textContent = models.length ? "Choose a detected model" : "No models detected";
      modelSelect.appendChild(placeholder);

      for (const model of models) {
        const option = document.createElement("option");
        option.value = model;
        option.textContent = model;
        if (model === currentModel) {
          option.selected = true;
        }
        modelSelect.appendChild(option);
      }

      if (models.includes(currentModel)) {
        modelSelect.value = currentModel;
      }
    }

    window.addEventListener("message", (event) => {
      const { type, payload, ok, message } = event.data;

      if (type === "saveResult") {
        setBusy(false);
        setStatus(message || (ok ? "Settings saved." : "Failed to save settings."), ok ? "ok" : "error");
        return;
      }

      if (type !== "state") {
        return;
      }

      setBusy(false);
      baseUrlInput.value = payload.baseUrl || "";
      systemPromptInput.value = payload.systemPrompt || "";
      enableThinkingInput.checked = Boolean(payload.enableThinking);
      modelInput.value = payload.model || "";
      groqApiKeyInput.value = payload.groqApiKey || "";
      groqModelInput.value = payload.groqModel || "";
      geminiApiKeyInput.value = payload.geminiApiKey || "";
      geminiModelInput.value = payload.geminiModel || "";
      openaiModelInput.value = payload.openaiModel || "";
      setModels(payload.models || [], payload.model || "");

      if (payload.error) {
        setStatus(payload.error, "error");
      } else if (payload.resolvedBaseUrl && payload.resolvedBaseUrl !== payload.baseUrl) {
        setStatus("Connected through " + payload.resolvedBaseUrl + " while keeping your saved URL unchanged.", "ok");
      } else if ((payload.models || []).length > 0) {
        setStatus("Models loaded from Ollama. Fallback order: Groq, Gemini, then Codex/OpenAI.", "ok");
      } else {
        setStatus("");
      }
    });

    refreshButton.addEventListener("click", () => {
      setBusy(true);
      setStatus("Loading models...", "");
      vscode.postMessage({
        type: "refreshModels",
        baseUrl: baseUrlInput.value
      });
    });

    saveButton.addEventListener("click", () => {
      setStatus("Saving in background...", "");
      vscode.postMessage({
        type: "save",
        baseUrl: baseUrlInput.value,
        model: modelInput.value,
        groqApiKey: groqApiKeyInput.value,
        groqModel: groqModelInput.value,
        geminiApiKey: geminiApiKeyInput.value,
        geminiModel: geminiModelInput.value,
        openaiModel: openaiModelInput.value,
        systemPrompt: systemPromptInput.value,
        enableThinking: enableThinkingInput.checked
      });
    });

    modelSelect.addEventListener("change", syncModelInput);

    vscode.postMessage({ type: "ready" });
  </script>
</body>
</html>`;
  }
}

function getNonce(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let nonce = "";

  for (let index = 0; index < 32; index += 1) {
    nonce += chars.charAt(Math.floor(Math.random() * chars.length));
  }

  return nonce;
}
