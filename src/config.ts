import type { SandboxRuntimeConfig } from "@anthropic-ai/sandbox-runtime";
import { CONFIG_DIR_NAME, getAgentDir } from "@earendil-works/pi-coding-agent";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { logger } from "./logger.js";

export interface SandboxConfig extends SandboxRuntimeConfig {
  enabled?: boolean;
}

export const DEFAULT_CONFIG: SandboxConfig = {
  enabled: true,
  network: {
    allowedDomains: ["*"],
    deniedDomains: [],
  },
  filesystem: {
    denyRead: [".env", ".env.*", "~/.ssh"],
    allowWrite: ["."],
    denyWrite: [".env", ".env.*"],
  },
};

export function getConfigPaths(cwd: string): {
  globalPath: string;
  projectPath: string;
} {
  return {
    globalPath: join(getAgentDir(), "extensions", "sandbox.json"),
    projectPath: join(cwd, CONFIG_DIR_NAME, "extensions", "sandbox.json"),
  };
}

// Merges top-level scalar options and shallow-merges network/filesystem objects.
// Nested values such as arrays are replaced by overrides rather than concatenated;
// undefined options preserve the corresponding value from base.
function deepMerge(base: SandboxConfig, overrides: Partial<SandboxConfig>): SandboxConfig {
  const result: SandboxConfig = { ...base };

  if (overrides.enabled !== undefined) result.enabled = overrides.enabled;
  if (overrides.network) {
    result.network = { ...base.network, ...overrides.network };
  }
  if (overrides.filesystem) {
    result.filesystem = { ...base.filesystem, ...overrides.filesystem };
  }
  if (overrides.ignoreViolations) {
    result.ignoreViolations = overrides.ignoreViolations;
  }
  if (overrides.enableWeakerNestedSandbox !== undefined) {
    result.enableWeakerNestedSandbox = overrides.enableWeakerNestedSandbox;
  }

  return result;
}

export function loadConfig(cwd: string): SandboxConfig {
  const { globalPath, projectPath } = getConfigPaths(cwd);
  if (!existsSync(globalPath)) {
    writeConfigFile(globalPath, DEFAULT_CONFIG);
  }
  const globalConfig = readOrEmptyConfig(globalPath);
  const projectConfig = readOrEmptyConfig(projectPath);
  return deepMerge(deepMerge(DEFAULT_CONFIG, globalConfig), projectConfig);
}

function readOrEmptyConfig(configPath: string): Partial<SandboxConfig> {
  if (!existsSync(configPath)) return {};
  try {
    return JSON.parse(readFileSync(configPath, "utf-8"));
  } catch (error) {
    logger.warn(`Could not parse ${configPath}: ${error}`);
    return {};
  }
}

function writeConfigFile(configPath: string, config: Partial<SandboxConfig>): void {
  mkdirSync(dirname(configPath), { recursive: true });
  writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n", "utf-8");
}

export function addReadPathToConfig(configPath: string, pathToAdd: string): void {
  const config = readOrEmptyConfig(configPath);
  const existing = config.filesystem?.allowRead ?? [];
  if (!existing.includes(pathToAdd)) {
    config.filesystem = {
      ...config.filesystem,
      allowRead: [...existing, pathToAdd],
      denyRead: config.filesystem?.denyRead ?? [],
      allowWrite: config.filesystem?.allowWrite ?? [],
      denyWrite: config.filesystem?.denyWrite ?? [],
    };
    writeConfigFile(configPath, config);
  }
}

export function addWritePathToConfig(configPath: string, pathToAdd: string): void {
  const config = readOrEmptyConfig(configPath);
  const existing = config.filesystem?.allowWrite ?? [];
  if (!existing.includes(pathToAdd)) {
    config.filesystem = {
      ...config.filesystem,
      denyRead: config.filesystem?.denyRead ?? [],
      allowWrite: [...existing, pathToAdd],
      denyWrite: config.filesystem?.denyWrite ?? [],
    };
    writeConfigFile(configPath, config);
  }
}
