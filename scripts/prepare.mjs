import { existsSync } from "node:fs";
import { execSync } from "node:child_process";

// Husky is dev-only; skip when installed from npm without a git checkout.
if (existsSync(".git")) {
  try {
    execSync("husky", { stdio: "inherit" });
  } catch (err) {
    console.warn(
      "husky setup skipped:",
      err instanceof Error ? err.message : String(err),
    );
  }
}
