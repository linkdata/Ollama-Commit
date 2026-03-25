import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

export type GenerateCommitParams = {
  baseUrl: string;
  model: string;
  groqApiKey: string;
  groqModel: string;
  geminiApiKey: string;
  geminiModel: string;
  openaiModel: string;
  systemPrompt: string;
  enableThinking: boolean;
  diff: string;
  temperature: number;
};

export type GenerateCommitResult = {
  message: string;
  provider: "ollama" | "groq" | "gemini" | "openai";
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

type OpenAiResponsesResponse = {
  output_text?: string;
};

type ResolvedModels = {
  models: string[];
  resolvedBaseUrl: string;
};

export async function generateCommitMessage(params: GenerateCommitParams): Promise<GenerateCommitResult> {
  const prompt = [
    "Write a git commit message for the following staged diff.",
    "Return only the commit message.",
    "",
    params.diff
  ].join("\n");

  const failures: string[] = [];

  try {
    const message = await generateWithOllama(params, prompt);
    return {
      message,
      provider: "ollama",
      model: params.model,
    };
  } catch (error) {
    failures.push(`Ollama: ${formatError(error)}`);
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

  const openAiApiKey = await getOpenAiApiKeyFromCodex();
  if (openAiApiKey) {
    try {
      const message = await generateWithOpenAi(params, prompt, openAiApiKey);
      return {
        message,
        provider: "openai",
        model: params.openaiModel,
      };
    } catch (error) {
      failures.push(`OpenAI via Codex login: ${formatError(error)}`);
    }
  } else {
    failures.push("OpenAI via Codex login: skipped because no local Codex API key was found");
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

async function generateWithOpenAi(
  params: GenerateCommitParams,
  prompt: string,
  apiKey: string
): Promise<string> {
  const data = await fetchJson<OpenAiResponsesResponse>(
    "https://api.openai.com/v1/responses",
    45000,
    {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: params.openaiModel.trim(),
        input: [
          {
            role: "developer",
            content: [
              {
                type: "input_text",
                text: params.systemPrompt
              }
            ]
          },
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text: prompt
              }
            ]
          }
        ],
        temperature: params.temperature
      })
    }
  );

  return requireCommitMessage(data.output_text || "", "OpenAI");
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
  return error instanceof Error ? error.message : String(error);
}

async function getOpenAiApiKeyFromCodex(): Promise<string | null> {
  const envKey = process.env.OPENAI_API_KEY?.trim();
  if (envKey) {
    return envKey;
  }

  try {
    const authFile = join(homedir(), ".codex", "auth.json");
    const raw = await readFile(authFile, "utf8");
    const parsed = JSON.parse(raw) as { OPENAI_API_KEY?: unknown };
    const apiKey = typeof parsed.OPENAI_API_KEY === "string" ? parsed.OPENAI_API_KEY.trim() : "";
    return apiKey || null;
  } catch {
    return null;
  }
}
