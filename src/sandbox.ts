import { SandboxManager, type SandboxAskCallback } from "@anthropic-ai/sandbox-runtime";

import { loadConfig, type SandboxConfig } from "./config.js";
import { EOL } from "os";

const enableLogMonitor = true;

function createNetworkAskCallback(): SandboxAskCallback {
  return async () => true;
}

export async function initializeSandbox(config: SandboxConfig): Promise<void> {
  await SandboxManager.initialize(
    {
      ...config,
      enableWeakerNetworkIsolation: true,
    },
    createNetworkAskCallback(),
    enableLogMonitor,
  );
}

export async function reinitializeSandbox(
  cwd: string,
  sessionAllowedReadPaths: string[],
  sessionAllowedWritePaths: string[],
): Promise<void> {
  const config = loadConfig(cwd);
  try {
    await SandboxManager.reset();
    await SandboxManager.initialize(
      {
        ...config,
        filesystem: {
          ...config.filesystem,
          denyRead: config.filesystem?.denyRead ?? [],
          allowRead: [...(config.filesystem?.allowRead ?? []), ...sessionAllowedReadPaths],
          allowWrite: [...(config.filesystem?.allowWrite ?? []), ...sessionAllowedWritePaths],
          denyWrite: config.filesystem?.denyWrite ?? [],
        },
        enableWeakerNetworkIsolation: true,
      },
      createNetworkAskCallback(),
      enableLogMonitor,
    );
  } catch (e) {
    console.error(`Warning: Failed to reinitialize sandbox: ${e}`);
  }
}

export async function resetSandbox(): Promise<void> {
  await SandboxManager.reset();
}

const SANDBOX_VIOLATION_HINT =
  "Hint: The command was blocked by the sandbox policy. Call the `sandbox_request_permission` tool to request user approval.";

export function annotateSandboxViolation(command: string, message: string): string {
  const violations = SandboxManager.getSandboxViolationStore().getViolationsForCommand(command);
  if (violations.length === 0) {
    return message;
  }

  let annotated = message + EOL;
  annotated += EOL;
  annotated += "<sandbox_violations>" + EOL;
  for (const violation of violations) {
    annotated += violation.line + EOL;
  }
  annotated += "</sandbox_violations>" + EOL;
  annotated += EOL;
  annotated += SANDBOX_VIOLATION_HINT;
  return annotated;
}
