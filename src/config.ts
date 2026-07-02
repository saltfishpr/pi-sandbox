import type { SandboxRuntimeConfig } from "@anthropic-ai/sandbox-runtime";
import { CONFIG_DIR_NAME, getAgentDir } from "@earendil-works/pi-coding-agent";
import { defu } from "defu";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

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
    denyRead: [".env", ".env.*"],
    allowRead: [],
    allowWrite: ["."],
    denyWrite: [".env", ".env.*"],
  },
};

export function loadConfig(cwd: string): SandboxConfig {
  const { globalPath, projectPath } = getConfigPaths(cwd);
  const globalConfig = readOrEmptyConfig(globalPath);
  const projectConfig = readOrEmptyConfig(projectPath);
  return defu(projectConfig, globalConfig, DEFAULT_CONFIG) as SandboxConfig;
}

export function getConfigPaths(cwd: string): {
  globalPath: string;
  projectPath: string;
} {
  return {
    globalPath: join(getAgentDir(), "extensions", "sandbox.json"),
    projectPath: join(cwd, CONFIG_DIR_NAME, "extensions", "sandbox.json"),
  };
}

function readOrEmptyConfig(configPath: string): Partial<SandboxConfig> {
  if (!existsSync(configPath)) return {};
  try {
    return JSON.parse(readFileSync(configPath, "utf-8"));
  } catch (e) {
    console.error(`Warning: Could not parse ${configPath}: ${e}`);
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
