import { access, readFile, readdir } from "node:fs/promises";
import { execFile, spawn } from "node:child_process";
import { homedir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

export type GenerateCommitParams = {
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
  diff: string;
  temperature: number;
  cwd?: string;
};

export type GenerateCommitResult = {
  message: string;
  provider: "ollama" | "groq" | "gemini" | "codex" | "claude";
  model: string;
};

type OllamaTagsResponse = {
  models?: Array<{
    name?: string;
  }>;
};

type OllamaChatResponse = {
  message?: { content?: string; thinking?: string };
};

type GroqChatResponse = {
  choices?: Array<{
    message?: {
      content?: string | null;
    };
  }>;
};

type GeminiGenerateContentResponse = {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
      }>;
    };
  }>;
};

type ResolvedModels = {
  models: string[];
  resolvedBaseUrl: string;
};

const execFileAsync = promisify(execFile);

function spawnWithClosedStdin(
  file: string,
  args: string[],
  timeoutMs: number
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(file, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: process.env,
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (data: Buffer) => { stdout += data.toString(); });
    child.stderr.on("data", (data: Buffer) => { stderr += data.toString(); });

    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`Process timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        const error = new Error(stderr.trim() || `Process exited with code ${code}`) as Error & { stderr: string };
        error.stderr = stderr;
        reject(error);
      }
    });

    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}
const ollamaUnavailableUntilByBaseUrl = new Map<string, number>();
const ollamaRecoveryProbeTimeoutMs = 1500;

export async function generateCommitMessage(params: GenerateCommitParams): Promise<GenerateCommitResult> {
  const prompt = [
    "Write a git commit message for the following staged diff.",
    "Return only the commit message.",
    "",
    params.diff
  ].join("\n");

  const failures: string[] = [];
  const ollamaSkipMessage = getOllamaCooldownMessage(
    params.baseUrl,
    params.ollamaUnavailableCooldownMs
  );

  if (ollamaSkipMessage) {
    const recovered = await tryRecoverOllamaDuringCooldown(params.baseUrl);
    if (recovered) {
      try {
        const message = await generateWithOllama(params, prompt);
        clearOllamaUnavailable(params.baseUrl);
        return {
          message,
          provider: "ollama",
          model: params.model,
        };
      } catch (error) {
        if (isOllamaReachabilityError(error) && params.ollamaUnavailableCooldownMs > 0) {
          markOllamaUnavailable(params.baseUrl, params.ollamaUnavailableCooldownMs);
        }
        failures.push(`Ollama: ${formatError(error)}`);
      }
    } else {
      failures.push(`Ollama: ${ollamaSkipMessage}`);
    }
  } else {
    try {
      const message = await generateWithOllama(params, prompt);
      clearOllamaUnavailable(params.baseUrl);
      return {
        message,
        provider: "ollama",
        model: params.model,
      };
    } catch (error) {
      if (isOllamaReachabilityError(error) && params.ollamaUnavailableCooldownMs > 0) {
        markOllamaUnavailable(params.baseUrl, params.ollamaUnavailableCooldownMs);
      }
      failures.push(`Ollama: ${formatError(error)}`);
    }
  }

  if (await hasCodexLogin()) {
    try {
      const message = await generateWithCodex(params, prompt);
      return {
        message,
        provider: "codex",
        model: params.openaiModel || "codex default",
      };
    } catch (error) {
      failures.push(`Codex CLI: ${formatError(error)}`);
    }
  } else {
    failures.push("Codex CLI: skipped because no local Codex login was found");
  }

  if (await hasClaudeCodeCli(params.claudePath)) {
    try {
      const message = await generateWithClaudeCode(params, prompt);
      return {
        message,
        provider: "claude",
        model: params.claudeModel || "claude default",
      };
    } catch (error) {
      failures.push(`Claude Code: ${formatError(error)}`);
    }
  } else {
    failures.push("Claude Code: skipped because the claude CLI was not found");
  }

  if (params.groqApiKey.trim()) {
    try {
      const message = await generateWithGroq(params, prompt);
      return {
        message,
        provider: "groq",
        model: params.groqModel,
      };
    } catch (error) {
      failures.push(`Groq: ${formatError(error)}`);
    }
  } else {
    failures.push("Groq: skipped because no API key is configured");
  }

  if (params.geminiApiKey.trim()) {
    try {
      const message = await generateWithGemini(params, prompt);
      return {
        message,
        provider: "gemini",
        model: params.geminiModel,
      };
    } catch (error) {
      failures.push(`Gemini: ${formatError(error)}`);
    }
  } else {
    failures.push("Gemini: skipped because no API key is configured");
  }

  throw new Error(`Unable to generate a commit message. ${failures.join(" | ")}`);
}

export async function listOllamaModels(baseUrl: string): Promise<ResolvedModels> {
  const { data, resolvedBaseUrl } = await fetchOllamaJson<OllamaTagsResponse>(
    baseUrl,
    "/api/tags",
    4000
  );

  const models = (data.models || [])
    .map((model) => model.name?.trim() || "")
    .filter((name) => name.length > 0)
    .sort((left, right) => left.localeCompare(right));

  return {
    models,
    resolvedBaseUrl,
  };
}

async function generateWithOllama(params: GenerateCommitParams, prompt: string): Promise<string> {
  const { data } = await fetchOllamaJson<OllamaChatResponse>(
    params.baseUrl,
    "/api/chat",
    120000,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: params.model,
        stream: false,
        think: params.enableThinking,
        messages: [
          {
            role: "system",
            content: params.systemPrompt
          },
          {
            role: "user",
            content: prompt
          }
        ],
        options: {
          temperature: params.temperature
        }
      })
    }
  );

  return requireCommitMessage(data.message?.content || "", "Ollama");
}

async function tryRecoverOllamaDuringCooldown(baseUrl: string): Promise<boolean> {
  try {
    await fetchOllamaJson<OllamaTagsResponse>(
      baseUrl,
      "/api/tags",
      ollamaRecoveryProbeTimeoutMs
    );
    clearOllamaUnavailable(baseUrl);
    return true;
  } catch {
    return false;
  }
}

async function generateWithGroq(params: GenerateCommitParams, prompt: string): Promise<string> {
  const data = await fetchJson<GroqChatResponse>(
    "https://api.groq.com/openai/v1/chat/completions",
    45000,
    {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${params.groqApiKey.trim()}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: params.groqModel.trim(),
        temperature: params.temperature,
        messages: [
          {
            role: "system",
            content: params.systemPrompt
          },
          {
            role: "user",
            content: prompt
          }
        ]
      })
    }
  );

  return requireCommitMessage(data.choices?.[0]?.message?.content || "", "Groq");
}

async function generateWithGemini(params: GenerateCommitParams, prompt: string): Promise<string> {
  const model = params.geminiModel.trim();
  const requestBody: Record<string, unknown> = {
    system_instruction: {
      parts: [
        {
          text: params.systemPrompt
        }
      ]
    },
    contents: [
      {
        role: "user",
        parts: [
          {
            text: prompt
          }
        ]
      }
    ],
    generationConfig: {
      temperature: params.temperature,
      responseMimeType: "text/plain"
    }
  };

  if (model.includes("2.5")) {
    requestBody.generationConfig = {
      ...(requestBody.generationConfig as Record<string, unknown>),
      thinkingConfig: {
        thinkingBudget: params.enableThinking ? -1 : 0
      }
    };
  }

  const data = await fetchJson<GeminiGenerateContentResponse>(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    45000,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": params.geminiApiKey.trim()
      },
      body: JSON.stringify(requestBody)
    }
  );

  const content = (data.candidates || [])
    .flatMap((candidate) => candidate.content?.parts || [])
    .map((part) => part.text || "")
    .join("\n");

  return requireCommitMessage(content, "Gemini");
}

async function generateWithCodex(params: GenerateCommitParams, prompt: string): Promise<string> {
  const instruction = [
    params.systemPrompt,
    "",
    "Task:",
    prompt
  ].join("\n");

  const cwd = params.cwd || process.cwd();
  const codexExecutable = await resolveCodexExecutable(params.codexPath);
  const configuredModel = params.openaiModel.trim();
  const args = [
    "exec",
    "--skip-git-repo-check",
    "--sandbox",
    "read-only",
    "--color",
    "never",
    "-C",
    cwd,
  ];

  if (configuredModel) {
    args.push("-m", configuredModel);
  }

  args.push(instruction);

  const { stdout } = await spawnWithClosedStdin(codexExecutable, args, 120000);

  return requireCommitMessage(stdout, "Codex");
}

async function generateWithClaudeCode(params: GenerateCommitParams, prompt: string): Promise<string> {
  const claudeExecutable = await resolveClaudeExecutable(params.claudePath);
  const configuredModel = params.claudeModel.trim();

  const args = [
    "-p",
    "--no-session-persistence",
    "--bare",
  ];

  if (configuredModel) {
    args.push("--model", configuredModel);
  }

  args.push("--append-system-prompt", params.systemPrompt);
  args.push(prompt);

  const { stdout } = await spawnWithClosedStdin(claudeExecutable, args, 120000);

  return requireCommitMessage(stdout, "Claude Code");
}

async function fetchOllamaJson<T>(
  baseUrl: string,
  path: string,
  timeoutMs: number,
  init?: RequestInit
): Promise<{ data: T; resolvedBaseUrl: string }> {
  const candidates = await buildBaseUrlCandidates(baseUrl);
  const errors: string[] = [];

  for (const candidate of candidates) {
    try {
      const data = await fetchJson<T>(`${candidate}${path}`, timeoutMs, init);
      return {
        data,
        resolvedBaseUrl: candidate,
      };
    } catch (error) {
      errors.push(`${candidate}: ${formatError(error)}`);
    }
  }

  throw new Error(`Unable to reach Ollama. Tried ${candidates.join(", ")}. ${errors.join(" | ")}`);
}

async function fetchJson<T>(url: string, timeoutMs: number, init?: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`HTTP ${response.status}: ${text}`);
    }

    return await response.json() as T;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`Request timed out after ${timeoutMs}ms`);
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function buildBaseUrlCandidates(baseUrl: string): Promise<string[]> {
  const primaryUrl = normalizeBaseUrl(baseUrl);
  const candidates = new Set<string>([primaryUrl]);

  if (!isWslEnvironment()) {
    return Array.from(candidates);
  }

  const preferred = new URL(primaryUrl);
  const samePort = preferred.port || "11434";
  const sameProtocol = preferred.protocol || "http:";

  for (const host of await getWslHostCandidates()) {
    candidates.add(`${sameProtocol}//${host}:${samePort}`);
  }

  return Array.from(candidates);
}

function normalizeBaseUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim() || "http://127.0.0.1:11434";
  return trimmed.replace(/\/+$/, "");
}

function isWslEnvironment(): boolean {
  return Boolean(process.env.WSL_DISTRO_NAME || process.env.WSL_INTEROP);
}

async function getWslHostCandidates(): Promise<string[]> {
  const hosts = new Set<string>();

  const gateway = await getWslDefaultGateway();
  if (gateway) {
    hosts.add(gateway);
  }

  const nameserver = await getWslNameserver();
  if (nameserver) {
    hosts.add(nameserver);
  }

  return Array.from(hosts);
}

async function getWslDefaultGateway(): Promise<string | null> {
  try {
    const routes = await readFile("/proc/net/route", "utf8");
    const lines = routes.split("\n");

    for (const line of lines.slice(1)) {
      const columns = line.trim().split(/\s+/);
      if (columns.length < 3) {
        continue;
      }

      const destination = columns[1];
      const gatewayHex = columns[2];

      if (destination === "00000000") {
        return parseRouteHexIp(gatewayHex);
      }
    }
  } catch {
    return null;
  }

  return null;
}

async function getWslNameserver(): Promise<string | null> {
  try {
    const resolvConf = await readFile("/etc/resolv.conf", "utf8");
    const match = resolvConf.match(/^nameserver\s+([^\s]+)$/m);
    return match?.[1] || null;
  } catch {
    return null;
  }
}

function parseRouteHexIp(value: string): string | null {
  if (!/^[0-9A-Fa-f]{8}$/.test(value)) {
    return null;
  }

  const octets = value.match(/../g);
  if (!octets) {
    return null;
  }

  return octets
    .map((octet) => Number.parseInt(octet, 16))
    .reverse()
    .join(".");
}

function requireCommitMessage(content: string, providerName: string): string {
  const message = sanitizeCommitMessage(content);
  if (!message) {
    throw new Error(`${providerName} returned an empty commit message`);
  }

  return message;
}

function sanitizeCommitMessage(content: string): string {
  return content
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/<\/think>/gi, "")
    .replace(/^\s*thinking:\s*/i, "")
    .trim();
}

function formatError(error: unknown): string {
  if (error && typeof error === "object" && "stderr" in error) {
    const stderr = typeof (error as { stderr?: unknown }).stderr === "string"
      ? (error as { stderr: string }).stderr.trim()
      : "";
    if (stderr) {
      return stderr;
    }
  }

  return error instanceof Error ? error.message : String(error);
}

function isOllamaReachabilityError(error: unknown): boolean {
  const message = formatError(error);
  return message.includes("Unable to reach Ollama");
}

function getOllamaCooldownMessage(baseUrl: string, cooldownMs: number): string | null {
  if (cooldownMs <= 0) {
    return null;
  }

  const unavailableUntil = ollamaUnavailableUntilByBaseUrl.get(normalizeBaseUrl(baseUrl));
  if (!unavailableUntil) {
    return null;
  }

  const remainingMs = unavailableUntil - Date.now();
  if (remainingMs <= 0) {
    ollamaUnavailableUntilByBaseUrl.delete(normalizeBaseUrl(baseUrl));
    return null;
  }

  const remainingSeconds = Math.ceil(remainingMs / 1000);
  return `skipped for ${remainingSeconds}s because a recent reachability check already failed`;
}

function markOllamaUnavailable(baseUrl: string, cooldownMs: number): void {
  if (cooldownMs <= 0) {
    return;
  }

  ollamaUnavailableUntilByBaseUrl.set(
    normalizeBaseUrl(baseUrl),
    Date.now() + cooldownMs
  );
}

function clearOllamaUnavailable(baseUrl: string): void {
  ollamaUnavailableUntilByBaseUrl.delete(normalizeBaseUrl(baseUrl));
}

async function hasCodexLogin(): Promise<boolean> {
  try {
    const authFile = join(homedir(), ".codex", "auth.json");
    const raw = await readFile(authFile, "utf8");
    const parsed = JSON.parse(raw) as {
      auth_mode?: unknown;
      OPENAI_API_KEY?: unknown;
      tokens?: unknown;
    };

    const hasApiKey = typeof parsed.OPENAI_API_KEY === "string" && parsed.OPENAI_API_KEY.trim().length > 0;
    const hasTokens = typeof parsed.tokens === "object" && parsed.tokens !== null;
    const hasAuthMode = typeof parsed.auth_mode === "string" && parsed.auth_mode.trim().length > 0;

    return hasApiKey || hasTokens || hasAuthMode;
  } catch {
    return false;
  }
}

async function resolveCodexExecutable(configuredPath: string): Promise<string> {
  const explicit = configuredPath.trim();
  if (explicit) {
    await ensureExecutableExists(explicit);
    return explicit;
  }

  const envCandidates = [
    process.env.CODEX_PATH,
    process.env.CODEX_CLI_PATH,
  ]
    .map((candidate) => candidate?.trim() || "")
    .filter((candidate) => candidate.length > 0);

  for (const candidate of envCandidates) {
    try {
      await ensureExecutableExists(candidate);
      return candidate;
    } catch {
      // Try the next candidate.
    }
  }

  const discovered = await findBundledCodexExecutable();
  if (discovered) {
    return discovered;
  }

  throw new Error("Could not find the Codex CLI binary. Set ollamacommit.codexPath to the full codex executable path.");
}

async function findBundledCodexExecutable(): Promise<string | null> {
  const extensionRoots = [
    join(homedir(), ".vscode-server", "extensions"),
    join(homedir(), ".vscode-server-insiders", "extensions"),
    join(homedir(), ".vscode", "extensions"),
    join(homedir(), ".vscode-insiders", "extensions"),
    join(homedir(), ".cursor-server", "extensions"),
    join(homedir(), ".cursor", "extensions"),
    join(homedir(), ".windsurf-server", "extensions"),
    join(homedir(), ".windsurf", "extensions"),
  ];

  for (const root of extensionRoots) {
    try {
      const entries = (await readdir(root, { withFileTypes: true }))
        .filter((entry) => entry.isDirectory() && entry.name.startsWith("openai.chatgpt-"))
        .map((entry) => entry.name)
        .sort()
        .reverse();

      for (const entry of entries) {
        const binRoot = join(root, entry, "bin");
        const binChildren = await readdir(binRoot, { withFileTypes: true });

        for (const child of binChildren) {
          if (!child.isDirectory()) {
            continue;
          }

          const candidate = join(binRoot, child.name, "codex");
          try {
            await ensureExecutableExists(candidate);
            return candidate;
          } catch {
            // Keep searching.
          }
        }
      }
    } catch {
      // Root not present in this environment.
    }
  }

  return null;
}

async function hasClaudeCodeCli(configuredPath: string): Promise<boolean> {
  try {
    const claudeExecutable = await resolveClaudeExecutable(configuredPath);
    await ensureExecutableExists(claudeExecutable);
    return true;
  } catch {
    return false;
  }
}

async function resolveClaudeExecutable(configuredPath: string): Promise<string> {
  const explicit = configuredPath.trim();
  if (explicit) {
    await ensureExecutableExists(explicit);
    return explicit;
  }

  const envPath = process.env.CLAUDE_PATH?.trim();
  if (envPath) {
    try {
      await ensureExecutableExists(envPath);
      return envPath;
    } catch {
      // Try next candidate.
    }
  }

  const localBin = join(homedir(), ".local", "bin", "claude");
  try {
    await ensureExecutableExists(localBin);
    return localBin;
  } catch {
    // Fall through to bare name.
  }

  return "claude";
}

async function ensureExecutableExists(filePath: string): Promise<void> {
  await access(filePath);
}
