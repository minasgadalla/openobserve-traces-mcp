import { existsSync } from "node:fs";
import { execSync } from "node:child_process";

// Husky is dev-only; skip when installed from npm without a git checkout.
if (existsSync(".git")) {
  try {
    execSync("husky", { stdio: "inherit" });
  } catch {
    // Non-fatal for contributors on minimal environments.
  }
}
