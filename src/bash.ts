import { SandboxManager } from "@anthropic-ai/sandbox-runtime";
import { createLocalBashOperations, getShellConfig, type BashOperations } from "@earendil-works/pi-coding-agent";

export function createSandboxedBashOps(shellPath?: string): BashOperations {
  const localOps = createLocalBashOperations({ shellPath });
  return {
    async exec(command, cwd, options) {
      const { shell } = getShellConfig(shellPath);
      const wrappedCommand = await SandboxManager.wrapWithSandbox(command, shell, undefined, options.signal);
      return localOps.exec(wrappedCommand, cwd, options);
    },
  };
}
