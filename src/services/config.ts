import * as vscode from "vscode";

export const defaultSystemPrompt =
  [
    "You are an assistant that writes professional git commit messages from staged diff.",
    "",
    "Write the commit message in this format:",
    "",
    "<type>(optional scope): <subject>",
    "",
    "- <specific change 1>",
    "- <specific change 2>",
    "- <specific change 3>",
    "",
    "Instructions:",
    "- Prefer Conventional Commits",
    "- The subject must capture the primary purpose of the commit",
    "- The bullet list must enumerate the concrete changes",
    "- Do not give only an overall summary",
    "- Break down the diff into distinct meaningful modifications",
    "- Mention each important code/config/test/doc change separately",
    "- Be specific about what was changed",
    "",
    "Good bullet examples:",
    "- add null check before accessing user profile",
    "- rename orderStatus to paymentStatus in checkout flow",
    "- update nginx config to increase client body size limit",
    "- remove unused retry wrapper from payment service",
    "- add test coverage for invalid token handling",
    "- change sort order to newest-first in activity endpoint",
    "",
    "Bad bullet examples:",
    "- improve system",
    "- update code",
    "- fix issues",
    "- refactor project",
    "- make changes",
    "",
    "Constraints:",
    "- subject in lowercase",
    "- imperative mood",
    "- no trailing period",
    "- subject max 72 characters",
    "- use concise bullets",
    "- do not include file paths unless necessary for clarity",
    "- do not include reasoning or analysis",
    "- do not include markdown fences",
    "",
    "Output:",
    "- Return only the final commit message",
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
  systemPrompt: string;
  enableThinking: boolean;
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
    systemPrompt: config.get<string>("systemPrompt", defaultSystemPrompt),
    enableThinking: config.get<boolean>("enableThinking", false),
    maxDiffChars: config.get<number>("maxDiffChars", 12000),
    temperature: config.get<number>("temperature", 0.2),
    copyToClipboard: config.get<boolean>("copyToClipboard", false),
  };
}

export type EditableSettings = Pick<
  OllamaCommitConfig,
  "baseUrl" | "model" | "groqApiKey" | "groqModel" | "geminiApiKey" | "geminiModel" | "openaiModel" | "codexPath" | "systemPrompt" | "enableThinking"
>;

export async function updateEditableSettings(settings: EditableSettings): Promise<void> {
  const config = vscode.workspace.getConfiguration("ollamacommit");
  const updates: Array<[keyof EditableSettings, string | boolean]> = [];

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

  if (config.get<string>("systemPrompt", defaultSystemPrompt) !== settings.systemPrompt) {
    updates.push(["systemPrompt", settings.systemPrompt]);
  }

  if (config.get<boolean>("enableThinking", false) !== settings.enableThinking) {
    updates.push(["enableThinking", settings.enableThinking]);
  }

  for (const [key, value] of updates) {
    await config.update(key, value, vscode.ConfigurationTarget.Global);
  }
}
