import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
import type { ConsoleConfig } from "./types";

const REPO_ROOT = join(process.cwd(), "..", "..", "..");

/**
 * Reads `usecases/<uc>/ui/console.yaml` at request / build time on the
 * server. Used by RSC pages so the shape always matches what the BFF
 * emits in production.
 */
export function loadConsoleConfig(useCase: string): ConsoleConfig {
  const yamlPath = join(
    REPO_ROOT,
    "usecases",
    useCase,
    "ui",
    "console.yaml",
  );
  const raw = readFileSync(yamlPath, "utf8");
  const parsed = parseYaml(raw) as ConsoleConfig;
  if (parsed.console_pattern !== "pipeline-console") {
    throw new Error(
      `Console pattern mismatch: ${useCase} declares ${parsed.console_pattern}; pipeline-console expected.`,
    );
  }
  return parsed;
}

export const DEFAULT_USE_CASE =
  process.env.NEXT_PUBLIC_USE_CASE ?? "credit-memo-commercial";
