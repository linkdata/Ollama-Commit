import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export async function getStagedDiff(cwd: string): Promise<string> {
  const { stdout } = await runGit(cwd, ["diff", "--cached", "--no-color"]);

  return stdout?.trim() || "";
}

export async function getWorkingTreeDiff(cwd: string): Promise<string> {
  const { stdout } = await runGit(cwd, ["diff", "--no-color"]);

  return stdout?.trim() || "";
}

export async function stageAllChanges(cwd: string): Promise<void> {
  await runGit(cwd, ["add", "-A"]);
}

async function runGit(cwd: string, args: string[]): Promise<{ stdout: string; stderr: string }> {
  return execFileAsync("git", args, {
    cwd,
    maxBuffer: 10 * 1024 * 1024,
  });
}
