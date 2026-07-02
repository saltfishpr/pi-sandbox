import { existsSync, realpathSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, resolve } from "node:path";

function expandPath(filePath: string): string {
  const expanded = filePath.replace(/^~(?=$|\/)/, homedir());
  return resolve(expanded);
}

/**
 * 将文件路径规范化为绝对路径的规范形式。
 * 处理波浪号展开、符号链接解析，对不存在的路径也会尽可能解析最近的存在父目录。
 * @param filePath 输入的文件路径（可以是相对路径、包含 ~ 的路径）
 * @returns 规范化后的绝对路径
 */
export function canonicalizePath(filePath: string): string {
  const abs = expandPath(filePath);
  try {
    return realpathSync.native(abs);
  } catch {
    // For writes to paths that do not exist yet, resolve symlinks in the nearest
    // existing parent directory, then append the non-existent tail.
    const tail: string[] = [];
    let probe = abs;
    while (!existsSync(probe)) {
      const parent = dirname(probe);
      if (parent === probe) return abs;
      tail.unshift(basename(probe));
      probe = parent;
    }
    try {
      return resolve(realpathSync.native(probe), ...tail);
    } catch {
      return abs;
    }
  }
}

export function matchesPattern(filePath: string, patterns: string[]): boolean {
  const abs = canonicalizePath(filePath);
  return patterns.some((p) => {
    const absP = p.includes("*") ? expandPath(p) : canonicalizePath(p);
    if (p.includes("*")) {
      const escaped = absP.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
      return new RegExp(`^${escaped}$`).test(abs);
    }
    const sep = absP.endsWith("/") ? "" : "/";
    return abs === absP || abs.startsWith(absP + sep);
  });
}
