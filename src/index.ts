import type {
  EditToolCallEvent,
  ExtensionAPI,
  ExtensionContext,
  ReadToolCallEvent,
  ToolCallEvent,
  ToolCallEventResult,
  WriteToolCallEvent,
} from "@earendil-works/pi-coding-agent";
import { createBashToolDefinition, isToolCallEventType, SettingsManager } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

import { createSandboxedBashOps } from "./bash.js";
import type { SandboxConfig } from "./config.js";
import { addReadPathToConfig, addWritePathToConfig, getConfigPaths, loadConfig } from "./config.js";
import { canonicalizePath, matchesPattern } from "./paths.js";
import type { FilesystemAccess, PermissionChoice } from "./permissions.js";
import { promptRequestPermission } from "./permissions.js";
import { annotateSandboxViolation, initializeSandbox, reinitializeSandbox, resetSandbox } from "./sandbox.js";

interface SandboxPermissionRequest {
  access: FilesystemAccess;
  path: string;
}

export default function (pi: ExtensionAPI) {
  pi.registerFlag("no-sandbox", {
    description: "Disable OS-level sandboxing for bash commands",
    type: "boolean",
    default: false,
  });

  const localCwd = process.cwd();
  const userShellPath = SettingsManager.create(localCwd).getShellPath();
  const localBash = createBashToolDefinition(localCwd, { shellPath: userShellPath });

  let sandboxEnabled = false;
  let sandboxInitialized = false;

  // Session-temporary allowances — held in JS memory, not accessible by the agent.
  // These are added on top of whatever is in the config files.
  const sessionAllowedReadPaths: string[] = [];
  const sessionAllowedWritePaths: string[] = [];

  function getEffectiveAllowRead(cwd: string): string[] {
    const config = loadConfig(cwd);
    return [...(config.filesystem?.allowRead ?? []), ...sessionAllowedReadPaths, ...sessionAllowedWritePaths];
  }

  function getEffectiveAllowWrite(cwd: string): string[] {
    const config = loadConfig(cwd);
    return [...(config.filesystem?.allowWrite ?? []), ...sessionAllowedWritePaths];
  }

  async function reinitializeIfNeeded(cwd: string): Promise<void> {
    if (!sandboxInitialized) return;
    await reinitializeSandbox(cwd, sessionAllowedReadPaths, sessionAllowedWritePaths);
  }

  async function applyPermissionChoice(
    access: FilesystemAccess,
    path: string,
    choice: PermissionChoice,
    ctx: ExtensionContext,
  ): Promise<void> {
    if (choice === "abort") return;

    const { globalPath, projectPath } = getConfigPaths(ctx.cwd);

    if (access === "read") {
      if (!sessionAllowedReadPaths.includes(path)) sessionAllowedReadPaths.push(path);
      if (choice === "project") addReadPathToConfig(projectPath, path);
      if (choice === "global") addReadPathToConfig(globalPath, path);
    } else {
      if (!sessionAllowedWritePaths.includes(path)) sessionAllowedWritePaths.push(path);
      if (choice === "project") addWritePathToConfig(projectPath, path);
      if (choice === "global") addWritePathToConfig(globalPath, path);
    }

    await reinitializeIfNeeded(ctx.cwd);
  }

  async function handleReadToolCall(
    event: ReadToolCallEvent,
    ctx: ExtensionContext,
    config: SandboxConfig,
  ): Promise<ToolCallEventResult | void> {
    const filePath = canonicalizePath(event.input.path);

    const effectiveAllowRead = getEffectiveAllowRead(ctx.cwd);
    if (matchesPattern(filePath, effectiveAllowRead)) return;

    const denyRead = config.filesystem?.denyRead ?? [];
    if (!matchesPattern(filePath, denyRead)) return;

    const choice = await promptRequestPermission(ctx, "read", filePath);
    if (choice === "abort") {
      return {
        block: true,
        reason: `Sandbox permission denied by user: read "${filePath}"`,
      };
    }

    await applyPermissionChoice("read", filePath, choice, ctx);
  }

  async function handleWriteToolCall(
    event: EditToolCallEvent | WriteToolCallEvent,
    ctx: ExtensionContext,
    config: SandboxConfig,
  ): Promise<ToolCallEventResult | void> {
    const path = canonicalizePath(event.input.path);
    const allowWrite = getEffectiveAllowWrite(ctx.cwd);
    const denyWrite = config.filesystem?.denyWrite ?? [];

    if (matchesPattern(path, denyWrite)) {
      return {
        block: true,
        reason: `Sandbox: write access denied for "${path}" (in denyWrite). `,
      };
    }

    if (matchesPattern(path, allowWrite)) return;

    const choice = await promptRequestPermission(ctx, "write", path);
    if (choice === "abort") {
      return {
        block: true,
        reason: `Sandbox permission denied by user: write "${path}"`,
      };
    }

    await applyPermissionChoice("write", path, choice, ctx);
  }

  async function handleToolCall(event: ToolCallEvent, ctx: ExtensionContext): Promise<ToolCallEventResult | void> {
    if (!sandboxEnabled) return;

    const config = loadConfig(ctx.cwd);
    if (!config.enabled) return;

    if (isToolCallEventType("read", event)) {
      return handleReadToolCall(event, ctx, config);
    }

    if (isToolCallEventType("write", event) || isToolCallEventType("edit", event)) {
      return handleWriteToolCall(event, ctx, config);
    }
  }

  pi.registerTool({
    ...localBash,
    label: "bash (sandboxed)",
    async execute(id, params, signal, onUpdate, ctx) {
      if (!sandboxEnabled || !sandboxInitialized) {
        return localBash.execute(id, params, signal, onUpdate, ctx);
      }
      const sandboxedBash = createBashToolDefinition(localCwd, {
        operations: createSandboxedBashOps(userShellPath),
        shellPath: userShellPath,
      });
      try {
        return await sandboxedBash.execute(id, params, signal, onUpdate, ctx);
      } catch (err) {
        if (err instanceof Error) {
          err.message = annotateSandboxViolation(params.command, err.message);
        }
        throw err;
      }
    },
  });

  async function requestSandboxPermission(request: SandboxPermissionRequest, ctx: ExtensionContext): Promise<string> {
    const path = canonicalizePath(request.path);
    const config = loadConfig(ctx.cwd);
    const allowRead = getEffectiveAllowRead(ctx.cwd);
    const allowWrite = getEffectiveAllowWrite(ctx.cwd);
    const denyRead = config.filesystem?.denyRead ?? [];
    const denyWrite = config.filesystem?.denyWrite ?? [];

    if (request.access === "read") {
      if (matchesPattern(path, allowRead)) {
        return `Sandbox permission granted: read "${path}"`;
      }
      if (!matchesPattern(path, denyRead)) {
        return `Sandbox permission granted: read "${path}"`;
      }
    }

    if (request.access === "write") {
      if (matchesPattern(path, denyWrite)) {
        return `Sandbox permission unavailable: write "${path}" is blocked by the denyWrite policy and cannot be granted at runtime. Do not retry this path — use a different path, or ask user to update the denyWrite config.`;
      }
      if (matchesPattern(path, allowWrite)) {
        return `Sandbox permission granted: write "${path}"`;
      }
    }

    const choice = await promptRequestPermission(ctx, request.access, path);
    if (choice === "abort") {
      return `Sandbox permission denied by user: ${request.access} "${path}"`;
    }

    await applyPermissionChoice(request.access, path, choice, ctx);
    return `Sandbox permission granted: ${request.access} "${path}"`;
  }

  pi.registerTool({
    name: "sandbox_request_permission",
    label: "request sandbox permission",
    description:
      "Request user approval for read or write access to a filesystem path. The user may deny the request, so the returned text must be checked before proceeding. When permission is granted, the sandbox is updated immediately and subsequent commands may use the path.",
    promptSnippet:
      "Request user approval for a filesystem path when a sandboxed bash command is blocked by the sandbox policy.",
    promptGuidelines: [
      "When a sandboxed bash command is blocked by the sandbox policy, call sandbox_request_permission with the access type and path inferred from the violation. This tool only requests permission; it never executes or retries a command.",
      "After calling, inspect the returned text to confirm permission was granted (it may be denied). Only if granted, re-run the original bash command yourself.",
      "Use access=write for commands that create, modify, delete, move, or redirect output to a path. Use access=read for commands that only read, list, or stat a path. When unsure, choose write.",
    ],
    parameters: Type.Object({
      access: Type.Union([Type.Literal("read"), Type.Literal("write")], {
        description: "The filesystem access being requested.",
      }),
      path: Type.String({
        description: "The filesystem path being requested. Relative paths, ~, and absolute paths are accepted.",
      }),
    }),
    async execute(_id, params, _signal, _onUpdate, ctx) {
      if (!sandboxEnabled || !sandboxInitialized) {
        return {
          content: [{ type: "text", text: "Sandbox permission unavailable: sandbox is disabled" }],
          details: undefined,
        };
      }

      const text = await requestSandboxPermission(params, ctx);
      return {
        content: [{ type: "text", text }],
        details: undefined,
      };
    },
  });

  pi.on("tool_call", handleToolCall);

  pi.on("session_start", async (_event, ctx) => {
    const noSandbox = pi.getFlag("no-sandbox") as boolean;

    if (noSandbox) {
      sandboxEnabled = false;
      ctx.ui.notify("Sandbox disabled via --no-sandbox", "warning");
      return;
    }

    const config = loadConfig(ctx.cwd);

    if (!config.enabled) {
      sandboxEnabled = false;
      ctx.ui.notify("Sandbox disabled via config", "info");
      return;
    }

    const platform = process.platform;
    if (platform !== "darwin" && platform !== "linux") {
      sandboxEnabled = false;
      ctx.ui.notify(`Sandbox not supported on ${platform}`, "warning");
      return;
    }

    try {
      await initializeSandbox(config);

      // Make Node's built-in fetch() honour HTTP_PROXY / HTTPS_PROXY in this
      // process and any child processes that inherit the environment.
      // NODE_USE_ENV_PROXY avoids NODE_OPTIONS allowlisting issues on older Node
      // versions while still propagating naturally to child `node` processes.
      // fetch() supports this on Node 22.21.0+ and 24.0.0+.
      const [nodeMajor, nodeMinor] = process.versions.node.split(".").map(Number);
      const supportsEnvProxy = (nodeMajor === 22 && nodeMinor >= 21) || nodeMajor >= 24;
      if (supportsEnvProxy) {
        process.env.NODE_USE_ENV_PROXY ??= "1";
      }

      sandboxEnabled = true;
      sandboxInitialized = true;
    } catch (err) {
      sandboxEnabled = false;
      ctx.ui.notify(`Sandbox initialization failed: ${err instanceof Error ? err.message : err}`, "error");
    }
  });

  pi.on("session_shutdown", async () => {
    if (sandboxInitialized) {
      try {
        await resetSandbox();
      } catch {
        // Ignore cleanup errors
      }
    }
  });

  pi.registerCommand("enable-sandbox", {
    description: "Enable the sandbox for this session",
    handler: async (_args, ctx) => {
      if (sandboxEnabled) {
        ctx.ui.notify("Sandbox is already enabled", "info");
        return;
      }

      const config = loadConfig(ctx.cwd);
      const platform = process.platform;
      if (platform !== "darwin" && platform !== "linux") {
        ctx.ui.notify(`Sandbox not supported on ${platform}`, "warning");
        return;
      }

      try {
        await initializeSandbox(config);

        sandboxEnabled = true;
        sandboxInitialized = true;

        ctx.ui.notify("Sandbox enabled", "info");
      } catch (err) {
        ctx.ui.notify(`Sandbox initialization failed: ${err instanceof Error ? err.message : err}`, "error");
      }
    },
  });

  pi.registerCommand("disable-sandbox", {
    description: "Disable the sandbox for this session",
    handler: async (_args, ctx) => {
      if (!sandboxEnabled) {
        ctx.ui.notify("Sandbox is already disabled", "info");
        return;
      }

      if (sandboxInitialized) {
        try {
          await resetSandbox();
        } catch {
          // Ignore cleanup errors
        }
      }

      sandboxEnabled = false;
      sandboxInitialized = false;
      ctx.ui.notify("Sandbox disabled", "info");
    },
  });

  pi.registerCommand("sandbox", {
    description: "Show sandbox configuration",
    handler: async (_args, ctx) => {
      if (!sandboxEnabled) {
        ctx.ui.notify("Sandbox is disabled", "info");
        return;
      }

      const config = loadConfig(ctx.cwd);
      const { globalPath, projectPath } = getConfigPaths(ctx.cwd);

      const lines = [
        "Sandbox Configuration",
        `  Project config: ${projectPath}`,
        `  Global config:  ${globalPath}`,
        "",
        "Filesystem (bash + read/write/edit tools):",
        `  Deny Read:   ${config.filesystem?.denyRead?.join(", ") || "(none)"}`,
        `  Allow Read:  ${config.filesystem?.allowRead?.join(", ") || "(none)"}`,
        `  Allow Write: ${config.filesystem?.allowWrite?.join(", ") || "(none)"}`,
        `  Deny Write:  ${config.filesystem?.denyWrite?.join(", ") || "(none)"}`,
        ...(sessionAllowedReadPaths.length > 0 ? [`  Session read:  ${sessionAllowedReadPaths.join(", ")}`] : []),
        ...(sessionAllowedWritePaths.length > 0 ? [`  Session write: ${sessionAllowedWritePaths.join(", ")}`] : []),
        "",
        "Note: reads are allowed by default; only paths matching denyRead are prompted (allowRead re-allows within denyRead).",
        "Note: allowRead takes PRECEDENCE over denyRead — granting a prompt adds to allowRead.",
        "Note: denyWrite takes PRECEDENCE over allowWrite and is never prompted.",
      ];
      ctx.ui.notify(lines.join("\n"), "info");
    },
  });
}
