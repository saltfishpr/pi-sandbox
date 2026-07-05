import { SandboxManager } from "@anthropic-ai/sandbox-runtime";
import { createLocalBashOperations, getShellConfig, type BashOperations } from "@earendil-works/pi-coding-agent";

import { getBashScratchDir } from "./sandbox.js";

async function wrapInScratchCwd(command: string, shell: string, signal: AbortSignal | undefined): Promise<string> {
  const previous = process.env.PI_SANDBOX_CWD;
  process.env.PI_SANDBOX_CWD = getBashScratchDir();
  try {
    return await SandboxManager.wrapWithSandbox(command, shell, undefined, signal);
  } finally {
    if (previous === undefined) delete process.env.PI_SANDBOX_CWD;
    else process.env.PI_SANDBOX_CWD = previous;
  }
}

export function createSandboxedBashOps(shellPath?: string): BashOperations {
  const localOps = createLocalBashOperations({ shellPath });
  return {
    async exec(command, cwd, options) {
      const { shell } = getShellConfig(shellPath);
      const wrappedCommand = await wrapInScratchCwd(command, shell, options.signal);
      try {
        return await localOps.exec(wrappedCommand, cwd, options);
      } finally {
        SandboxManager.cleanupAfterCommand();
      }
    },
  };
}
