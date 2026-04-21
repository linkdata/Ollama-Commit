# Ollama Commit

Generate Git commit messages in VS Code using a local Ollama server.

Ollama Commit is a lightweight VS Code extension that reads your Git diff, sends it to your local or remote Ollama server, and writes the generated commit message into the Source Control input box for you.

Forked from https://github.com/Nice0w0/Ollama-Commit

## Why Use It

- Write commit messages faster
- Keep commit messages consistent
- Use your own Ollama model
- Stay local — your diff never leaves your machine

## Features

- Generate commit messages from staged changes
- Add a `Generate Commit Message` button to the Source Control toolbar
- Open a dedicated settings page inside VS Code
- Load available models directly from Ollama
- Optionally copy the generated message to the clipboard
- Handle common Windows and WSL networking cases
- Fail fast on subsequent requests when Ollama is unreachable

## Quick Start

1. Install and start Ollama.
2. Start the model you want to use.
3. Install this extension in VS Code.
4. Open a Git repository.
5. Stage your changes if needed.
6. Open Source Control and click `Generate Commit Message`.

Example:

```bash
ollama serve
ollama run qwen3-coder-next:latest
```

Then set `ollamacommit.model` to `qwen3-coder-next:latest` (the default) in the extension settings.

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
5. Ollama returns a commit message.
6. The result is inserted into the VS Code Source Control commit box.

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
| `ollamacommit.model` | Model used to generate commit messages | `qwen3-coder-next:latest` |
| `ollamacommit.systemPrompt` | System prompt sent before the diff | Built-in prompt |
| `ollamacommit.enableThinking` | Allow model thinking mode before the final answer | `false` |
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

The extension sends your Git diff to the Ollama server at `ollamacommit.baseUrl`. If you run Ollama locally, your data stays in your local environment. No other network calls are made.

## License

MIT. See [LICENSE](./LICENSE).
