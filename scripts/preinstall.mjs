import { rm } from "node:fs/promises";

// Keep the workspace on pnpm and remove lockfiles from other package managers.
// This runs on Windows too, so avoid shell-specific `sh -c` commands here.
const userAgent = process.env.npm_config_user_agent ?? "";

await Promise.all([
  rm("package-lock.json", { force: true }),
  rm("yarn.lock", { force: true }),
]);

if (!userAgent.startsWith("pnpm/")) {
  console.error("Use pnpm instead");
  process.exitCode = 1;
}
