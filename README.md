# Ollama Commit

<p align="center">
  <img src="https://github.com/Nice0w0/Ollama-Commit/blob/main/media/ollama-commit-title.png?raw=true" alt="Ollama Commit cover" width="860" />
</p>

Generate Git commit messages in VS Code with Ollama, with Groq, Gemini, and Codex/OpenAI fallback support.

Ollama Commit is a lightweight VS Code extension that reads your Git diff, sends it to your local or remote Ollama server, and writes the generated commit message into the Source Control input box for you. If Ollama is unavailable, it can fall back to local Codex CLI first, then Groq, then Gemini.

## Why Use It

- Write commit messages faster
- Keep commit messages consistent
- Use your own Ollama model
- Stay local when running Ollama on your machine

## Features

- Generate commit messages from staged changes
- Fall back to Groq, Gemini, and Codex/OpenAI when Ollama is unavailable
- Fall back gracefully when nothing is staged
- Add a `Generate Commit Message` button to the Source Control toolbar
- Open a dedicated settings page inside VS Code
- Load available models directly from Ollama
- Optionally copy the generated message to the clipboard
- Handle common Windows and WSL networking cases

## Quick Start

1. Install and start Ollama.
2. Start the model you want to use.
3. Install this extension in VS Code.
4. Open a Git repository.
5. Stage your changes if needed.
6. Open Source Control and click `Generate Commit Message`.

Optional fallback setup:

1. Create a Groq API key and set `ollamacommit.groqApiKey`.
2. Create a Gemini API key and set `ollamacommit.geminiApiKey`.
3. Optionally keep a local Codex login on the same machine so the extension can use `codex exec` as a final fallback.
4. Keep Ollama as the primary provider. The extension will try Codex first, Groq second, and Gemini third if Ollama cannot be reached.

Example:

```bash
ollama serve
ollama run minimax-m2.7:cloud
```

Then set `ollamacommit.model` to `minimax-m2.7:cloud` in the extension settings.

Default Ollama URL:

```text
http://127.0.0.1:11434
```

## How It Works

1. The extension reads your staged diff.
2. If no files are staged, it lets you choose between:
   - `Stage All and Generate`
   - `Use Unstaged Changes`
3. The diff is trimmed to the configured max size.
4. The extension sends the diff to Ollama.
5. If Ollama is unavailable, the extension tries local Codex CLI, then Groq, then Gemini.
6. The active provider returns a commit message.
7. The result is inserted into the VS Code Source Control commit box.

If VS Code cannot insert the message into Source Control directly, the extension copies it to your clipboard instead.

## Commands

- `Ollama Commit: Generate Commit Message`
- `Ollama Commit: Open Settings Page`

## Settings

Open the built-in settings page with:

```text
Ollama Commit: Open Settings Page
```

Or search for `Ollama Commit` in VS Code Settings.

| Setting | Description | Default |
| --- | --- | --- |
| `ollamacommit.baseUrl` | Ollama server URL | `http://127.0.0.1:11434` |
| `ollamacommit.model` | Model used to generate commit messages. For this setup, use `minimax-m2.7:cloud`. | `qwen2.5-coder:7b` |
| `ollamacommit.groqApiKey` | Groq API key used when Ollama is unavailable | `""` |
| `ollamacommit.groqModel` | Groq model used as the first fallback | `openai/gpt-oss-20b` |
| `ollamacommit.geminiApiKey` | Gemini API key used when Ollama and Groq are unavailable | `""` |
| `ollamacommit.geminiModel` | Gemini model used as the second fallback | `gemini-2.0-flash-lite` |
| `ollamacommit.openaiModel` | Optional model override for the last fallback through local Codex CLI. Leave empty to use Codex's configured default model | `""` |
| `ollamacommit.codexPath` | Optional absolute path to the Codex CLI binary when the extension host PATH does not include it | `""` |
| `ollamacommit.systemPrompt` | System prompt sent before the diff | Built-in prompt |
| `ollamacommit.enableThinking` | Allow model thinking mode before the final answer | `false` |
| `ollamacommit.ollamaUnavailableCooldownMs` | After an Ollama connection failure, skip retrying Ollama for this many milliseconds and jump straight to fallbacks. Each request still does a quick hidden probe and re-enables Ollama immediately if it comes back | `172800000` |
| `ollamacommit.maxDiffChars` | Maximum diff characters sent to Ollama | `12000` |
| `ollamacommit.temperature` | Sampling temperature | `0.2` |
| `ollamacommit.copyToClipboard` | Also copy the result to the clipboard | `false` |

## Requirements

- VS Code `1.90.0` or newer
- Git installed and available in your environment
- Ollama installed and running
- At least one Ollama model available to run

## Install From Source

```bash
npm install
npm run build
```

Run in Extension Development Host:

1. Open this repository in VS Code.
2. Press `F5`.

Build a VSIX package:

```bash
npm run package
```

Install the generated `.vsix` from VS Code with `Extensions: Install from VSIX...`

## WSL Notes

If you use VS Code with `Remote - WSL`, `127.0.0.1` may point to WSL instead of the Windows host running Ollama.

Ollama Commit tries your configured `baseUrl` first and then attempts common WSL fallback host addresses automatically.

## Privacy

The extension sends your Git diff to the active provider:

- Ollama through `ollamacommit.baseUrl`
- Groq when `ollamacommit.groqApiKey` is configured
- Gemini when `ollamacommit.geminiApiKey` is configured
- Codex CLI when you are logged in locally and `codex exec` is available in the extension host environment

If you run Ollama locally, your data stays in your local environment. Cloud fallbacks send the diff to the selected provider, and the Codex fallback sends the diff through your local Codex CLI session.

## License

MIT. See [LICENSE](./LICENSE).
