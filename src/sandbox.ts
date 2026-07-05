import { SandboxManager, type SandboxAskCallback } from "@anthropic-ai/sandbox-runtime";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { loadConfig, type SandboxConfig } from "./config.js";
import { EOL } from "os";

const enableLogMonitor = true;

// The patched @anthropic-ai/sandbox-runtime reads process.env.PI_SANDBOX_CWD to
// resolve DANGEROUS_FILES (.bashrc, .env, .gitconfig, …). Pointing it at an
// empty scratch dir makes every resolved path both non-existent and outside
// the user's allowedWritePaths, so generateFilesystemArgs skips them entirely
// and bwrap never creates mount-point files in the workspace.
let bashScratchDir: string | undefined;

export function getBashScratchDir(): string {
  if (!bashScratchDir) {
    bashScratchDir = mkdtempSync(join(tmpdir(), "pi-sandbox-"));
  }
  return bashScratchDir;
}

function cleanupBashScratchDir(): void {
  if (!bashScratchDir) return;
  try {
    rmSync(bashScratchDir, { recursive: true, force: true });
  } catch {
    // best-effort
  }
  bashScratchDir = undefined;
}

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
  cleanupBashScratchDir();
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
