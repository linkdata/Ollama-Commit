import * as vscode from "vscode";

export const defaultSystemPrompt =
  [
    "You are an assistant that writes concise, clear, professional git commit messages based on staged diff.",
    "Prefer conventional commits.",
    "Do not output any thinking, reasoning, analysis, or XML-style thinking tags.",
    "Return only the final commit message.",
  ].join("\n");

export type OllamaCommitConfig = {
  baseUrl: string;
  model: string;
  groqApiKey: string;
  groqModel: string;
  geminiApiKey: string;
  geminiModel: string;
  openaiModel: string;
  codexPath: string;
  claudePath: string;
  claudeModel: string;
  systemPrompt: string;
  enableThinking: boolean;
  ollamaUnavailableCooldownMs: number;
  maxDiffChars: number;
  temperature: number;
  copyToClipboard: boolean;
};

export function getConfig(): OllamaCommitConfig {
  const config = vscode.workspace.getConfiguration("ollamacommit");

  return {
    baseUrl: config.get<string>("baseUrl", "http://127.0.0.1:11434"),
    model: config.get<string>("model", "qwen2.5-coder:7b"),
    groqApiKey: config.get<string>("groqApiKey", ""),
    groqModel: config.get<string>("groqModel", "openai/gpt-oss-20b"),
    geminiApiKey: config.get<string>("geminiApiKey", ""),
    geminiModel: config.get<string>("geminiModel", "gemini-2.0-flash-lite"),
    openaiModel: config.get<string>("openaiModel", ""),
    codexPath: config.get<string>("codexPath", ""),
    claudePath: config.get<string>("claudePath", ""),
    claudeModel: config.get<string>("claudeModel", "sonnet"),
    systemPrompt: config.get<string>("systemPrompt", defaultSystemPrompt),
    enableThinking: config.get<boolean>("enableThinking", false),
    ollamaUnavailableCooldownMs: config.get<number>("ollamaUnavailableCooldownMs", 172800000),
    maxDiffChars: config.get<number>("maxDiffChars", 12000),
    temperature: config.get<number>("temperature", 0.2),
    copyToClipboard: config.get<boolean>("copyToClipboard", false),
  };
}

export type EditableSettings = Pick<
  OllamaCommitConfig,
  "baseUrl" | "model" | "groqApiKey" | "groqModel" | "geminiApiKey" | "geminiModel" | "openaiModel" | "codexPath" | "claudePath" | "claudeModel" | "systemPrompt" | "enableThinking" | "ollamaUnavailableCooldownMs"
>;

export async function updateEditableSettings(settings: EditableSettings): Promise<void> {
  const config = vscode.workspace.getConfiguration("ollamacommit");
  const updates: Array<[keyof EditableSettings, string | boolean | number]> = [];

  if (config.get<string>("baseUrl", "http://127.0.0.1:11434") !== settings.baseUrl) {
    updates.push(["baseUrl", settings.baseUrl]);
  }

  if (config.get<string>("model", "qwen2.5-coder:7b") !== settings.model) {
    updates.push(["model", settings.model]);
  }

  if (config.get<string>("groqApiKey", "") !== settings.groqApiKey) {
    updates.push(["groqApiKey", settings.groqApiKey]);
  }

  if (config.get<string>("groqModel", "openai/gpt-oss-20b") !== settings.groqModel) {
    updates.push(["groqModel", settings.groqModel]);
  }

  if (config.get<string>("geminiApiKey", "") !== settings.geminiApiKey) {
    updates.push(["geminiApiKey", settings.geminiApiKey]);
  }

  if (config.get<string>("geminiModel", "gemini-2.0-flash-lite") !== settings.geminiModel) {
    updates.push(["geminiModel", settings.geminiModel]);
  }

  if (config.get<string>("openaiModel", "") !== settings.openaiModel) {
    updates.push(["openaiModel", settings.openaiModel]);
  }

  if (config.get<string>("codexPath", "") !== settings.codexPath) {
    updates.push(["codexPath", settings.codexPath]);
  }

  if (config.get<string>("claudePath", "") !== settings.claudePath) {
    updates.push(["claudePath", settings.claudePath]);
  }

  if (config.get<string>("claudeModel", "sonnet") !== settings.claudeModel) {
    updates.push(["claudeModel", settings.claudeModel]);
  }

  if (config.get<string>("systemPrompt", defaultSystemPrompt) !== settings.systemPrompt) {
    updates.push(["systemPrompt", settings.systemPrompt]);
  }

  if (config.get<boolean>("enableThinking", false) !== settings.enableThinking) {
    updates.push(["enableThinking", settings.enableThinking]);
  }

  if (config.get<number>("ollamaUnavailableCooldownMs", 172800000) !== settings.ollamaUnavailableCooldownMs) {
    updates.push(["ollamaUnavailableCooldownMs", settings.ollamaUnavailableCooldownMs]);
  }

  for (const [key, value] of updates) {
    await config.update(key, value, vscode.ConfigurationTarget.Global);
  }
}
