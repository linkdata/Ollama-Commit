import { readFile } from "node:fs/promises";

export type GenerateCommitParams = {
  baseUrl: string;
  model: string;
  systemPrompt: string;
  enableThinking: boolean;
  diff: string;
  temperature: number;
};

type OllamaTagsResponse = {
  models?: Array<{
    name?: string;
  }>;
};

type OllamaChatResponse = {
  message?: { content?: string; thinking?: string };
};

type ResolvedModels = {
  models: string[];
  resolvedBaseUrl: string;
};

export async function generateCommitMessage(params: GenerateCommitParams): Promise<string> {
  const prompt = [
    "Write a git commit message for the following staged diff.",
    "Return only the commit message.",
    "",
    params.diff
  ].join("\n");

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

  return sanitizeCommitMessage(data.message?.content || "");
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

async function fetchOllamaJson<T>(
  baseUrl: string,
  path: string,
  timeoutMs: number,
  init?: RequestInit
): Promise<{ data: T; resolvedBaseUrl: string }> {
  const candidates = await buildBaseUrlCandidates(baseUrl);
  const errors: string[] = [];

  for (const candidate of candidates) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(`${candidate}${path}`, {
        ...init,
        signal: controller.signal,
      });

      if (!response.ok) {
        const text = await response.text();
        errors.push(`${candidate}: Ollama error ${response.status}: ${text}`);
        continue;
      }

      const data = await response.json() as T;
      return {
        data,
        resolvedBaseUrl: candidate,
      };
    } catch (error) {
      const message = error instanceof Error
        ? error.name === "AbortError"
          ? `Request timed out after ${timeoutMs}ms`
          : error.message
        : String(error);
      errors.push(`${candidate}: ${message}`);
    } finally {
      clearTimeout(timeout);
    }
  }

  throw new Error(`Unable to reach Ollama. Tried ${candidates.join(", ")}. ${errors.join(" | ")}`);
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

function sanitizeCommitMessage(content: string): string {
  return content
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/<\/think>/gi, "")
    .replace(/^\s*thinking:\s*/i, "")
    .trim();
}
