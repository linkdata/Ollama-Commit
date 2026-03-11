# Ollama Commit

VS Code extension for generating Git commit messages with a local Ollama model.

It reads your Git diff, sends it to Ollama, and fills the commit message input in Source Control for you.

## Features

- Generate commit messages from staged changes
- If nothing is staged, choose to:
  - stage all changes and generate
  - generate from unstaged changes
- Dedicated settings page for:
  - Ollama base URL
  - model selection
  - system prompt
- Model picker that loads available models from Ollama
- WSL-aware Ollama connection fallback for common Windows host addresses
- Source Control toolbar button for quick generation
- Optional clipboard copy after generation
- Sends `think: false` to Ollama and strips common thinking tags from the final output

## Requirements

- VS Code `1.90.0` or newer
- Git available in the environment where VS Code runs
- Ollama installed and running
- At least one Ollama model pulled locally

## How It Works

1. The extension reads your repository diff.
2. It sends the diff to Ollama using your selected model and system prompt.
3. It receives a commit message.
4. It inserts the result into the Source Control commit input box.

## Install Ollama

Install Ollama first if you do not already have it:

```bash
ollama serve
ollama pull qwen2.5-coder:7b
```

Default Ollama URL used by the extension:

```text
http://127.0.0.1:11434
```

## Install The Extension

### Development Mode

Use this when you are building and testing the extension locally.

```bash
npm install
npm run build
```

Then open this project in VS Code and press `F5` to launch an Extension Development Host.

### VSIX Package

Use this when you want to install the extension into your normal VS Code.

```bash
npm install
npm run build
npm run package
```

Then in VS Code:

1. Open Command Palette
2. Run `Extensions: Install from VSIX...`
3. Select the generated `.vsix` file
4. Reload VS Code if prompted

When you update the extension later:

```bash
npm run build
npm run package
```

Then install the new `.vsix` again over the old one.

## Commands

Available commands:

- `Ollama Commit: Generate Commit Message`
- `Ollama Commit: Open Settings Page`

You can run them from:

- Command Palette
- Source Control toolbar

## Settings

Open the dedicated settings UI with:

```text
Ollama Commit: Open Settings Page
```

Or open normal VS Code settings and search for `Ollama Commit`.

### Available Settings

#### `ollamacommit.baseUrl`

Base URL for the Ollama server.

Default:

```text
http://127.0.0.1:11434
```

Examples:

```text
http://127.0.0.1:11434
http://localhost:11434
http://192.168.1.10:11434
```

#### `ollamacommit.model`

Ollama model used to generate commit messages.

Default:

```text
qwen2.5-coder:7b
```

#### `ollamacommit.systemPrompt`

System prompt sent before the diff.

Default:

```text
You are an assistant that writes concise, clear, professional git commit messages based on staged diff. Prefer conventional commits. Return only the commit message.
```

#### `ollamacommit.maxDiffChars`

Maximum number of diff characters sent to the model.

Default:

```text
12000
```

#### `ollamacommit.temperature`

Sampling temperature for Ollama.

Default:

```text
0.2
```

#### `ollamacommit.copyToClipboard`

Also copy the generated commit message to the clipboard.

Default:

```text
false
```

## Usage

### Normal Flow

1. Open a Git repository in VS Code
2. Make code changes
3. Stage files if you want the message based only on staged changes
4. Open Source Control
5. Click the `Generate Commit` button or run `Ollama Commit: Generate Commit Message`
6. The extension fills the commit message input box automatically
7. Review the message and commit

### If Nothing Is Staged

When you generate without staged changes, the extension will ask you to choose:

- `Stage All and Generate`
- `Use Unstaged Changes`

If there are no changes at all, it shows:

```text
No changes found
```

## Windows And WSL

### Windows VS Code

If you open the repository directly in Windows VS Code, use:

```text
http://127.0.0.1:11434
```

### Remote - WSL

If you open the repository with `Remote - WSL`, the extension runs inside WSL.

In that mode:

- `127.0.0.1` may not reach Ollama running on Windows
- the extension will automatically try common Windows host fallback addresses
- if fallback works, the settings page will show a message like:

```text
Connected through http://172.xx.xx.x:11434 while keeping your saved URL unchanged.
```

That means:

- your saved setting can stay as `http://127.0.0.1:11434`
- the extension found a reachable Windows host address automatically

If fallback still does not work, the issue is usually outside the extension:

- Windows Firewall is blocking port `11434`
- Ollama is only listening on localhost in a way WSL cannot reach

## Troubleshooting

### `npm error code EJSONPARSE`

This happens if `package.json` is invalid or empty.

Make sure `package.json` contains valid JSON before running:

```bash
npm install
```

### `No staged changes found`

This is not an error anymore.

The extension now offers:

- `Stage All and Generate`
- `Use Unstaged Changes`

### `No changes found`

There are no staged or unstaged changes in the repository.

### Message Was Generated But Not Visible

The extension tries to write directly into the Source Control commit input box.

If insertion fails:

- it falls back to clipboard when needed
- it shows a warning instead of silently succeeding

### Cannot Connect To Ollama

Check:

1. Ollama is running
2. The base URL is correct
3. The selected model exists
4. In WSL, Windows firewall and Ollama binding allow access

Test manually:

```bash
curl http://127.0.0.1:11434/api/tags
```

Or from WSL, test the resolved Windows host address if needed.

## Development

### Scripts

```bash
npm run build
npm run watch
npm run package
```

### Project Structure

```text
src/
  commands/
  panels/
  services/
  extension.ts
```

High-level responsibilities:

- `src/extension.ts`: command registration
- `src/commands/generateCommit.ts`: main generate flow
- `src/services/git.ts`: Git commands and diff collection
- `src/services/ollama.ts`: Ollama API calls and WSL fallback logic
- `src/services/config.ts`: extension configuration access
- `src/panels/settingsPanel.ts`: dedicated settings UI

## Notes

- This extension adds its own Source Control toolbar button, but it does not replace VS Code's native Git actions.
- Commit quality depends on the selected model, the diff, and your system prompt.
- Large diffs are trimmed using `ollamacommit.maxDiffChars`.

## License

MIT. See [LICENSE](./LICENSE).
