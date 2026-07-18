import { SandboxManager } from "@anthropic-ai/sandbox-runtime";
import { createLocalBashOperations, getShellConfig, type BashOperations } from "@earendil-works/pi-coding-agent";
import { execFileSync } from "node:child_process";
import { realpathSync } from "node:fs";

function getDarwinUserTempDir(): string | undefined {
  if (process.platform !== "darwin") return undefined;

  try {
    // Xcode tool shims ignore the sandbox's TMPDIR override and restore this directory.
    const tempDir = execFileSync("/usr/bin/getconf", ["DARWIN_USER_TEMP_DIR"], { encoding: "utf8" }).trim();
    return tempDir ? realpathSync.native(tempDir) : undefined;
  } catch {
    return undefined;
  }
}

const darwinUserTempDir = getDarwinUserTempDir();

function getCustomConfig() {
  if (!darwinUserTempDir) return undefined;

  const config = SandboxManager.getConfig();
  if (!config) return undefined;

  const { filesystem } = config;
  if (filesystem.allowWrite.includes(darwinUserTempDir)) return undefined;

  return {
    filesystem: {
      ...filesystem,
      allowWrite: [...filesystem.allowWrite, darwinUserTempDir],
    },
  };
}

export function createSandboxedBashOps(shellPath?: string): BashOperations {
  const localOps = createLocalBashOperations({ shellPath });
  return {
    async exec(command, cwd, options) {
      const { shell } = getShellConfig(shellPath);

      const customConfig = getCustomConfig();
      const wrappedCommand = await SandboxManager.wrapWithSandbox(command, shell, customConfig, options.signal);

      try {
        return await localOps.exec(wrappedCommand, cwd, options);
      } finally {
        SandboxManager.cleanupAfterCommand();
      }
    },
  };
}
