import { getAgentDir } from "@earendil-works/pi-coding-agent";
import fs from "node:fs";
import path from "node:path";
import winston from "winston";
import DailyRotateFile from "winston-daily-rotate-file";

export interface Logger {
  debug(message: string, meta?: unknown): void;
  info(message: string, meta?: unknown): void;
  warn(message: string, meta?: unknown): void;
  error(message: string, meta?: unknown): void;
}

// ~/.pi/agent/extensions/logs/YYYY-MM-DD.log
const LOG_DIR = path.join(getAgentDir(), "extensions", "logs");

let cachedLogger: winston.Logger | null = null;

function buildLogger(): winston.Logger | null {
  try {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  } catch {
    return null;
  }

  const level = process.env.PI_SANDBOX_DEBUG === "1" ? "debug" : "info";

  try {
    return winston.createLogger({
      level,
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.splat(),
        winston.format.json(),
      ),
      transports: [
        new DailyRotateFile({
          dirname: LOG_DIR,
          filename: "pi-sandbox-%DATE%.log",
          datePattern: "YYYY-MM-DD",
          zippedArchive: false,
          maxSize: "10m",
          maxFiles: "14d",
        }),
      ],
    });
  } catch {
    return null;
  }
}

function getWinston(): winston.Logger | null {
  if (cachedLogger) return cachedLogger;
  cachedLogger = buildLogger();
  return cachedLogger;
}

function emit(level: "debug" | "info" | "warn" | "error", message: string, meta?: unknown): void {
  const w = getWinston();
  if (!w) return;
  try {
    if (meta === undefined) {
      w.log(level, message);
    } else {
      w.log(level, message, { meta });
    }
  } catch {
    // 日志失败不应影响主流程。
  }
}

export const logger: Logger = {
  debug: (message, meta) => emit("debug", message, meta),
  info: (message, meta) => emit("info", message, meta),
  warn: (message, meta) => emit("warn", message, meta),
  error: (message, meta) => emit("error", message, meta),
};
