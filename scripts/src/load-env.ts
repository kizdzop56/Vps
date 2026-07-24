// Loads the repo-root .env BEFORE any module that reads process.env at import
// time (e.g. @workspace/db throws if DATABASE_URL is missing). This module has
// no such dependencies, so importing it first guarantees env is populated.
import { config } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url)); // .../scripts/src
const rootEnv = path.resolve(here, "../../.env"); // repo root .env

// dotenv does not override variables already present in the environment,
// so shell / orchestrator-provided values still win.
config({ path: rootEnv });
