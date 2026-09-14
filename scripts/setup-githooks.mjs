#!/usr/bin/env node
/** Point git at githooks/ (pre-push runs the same checks as CI check-and-lint). */
import { existsSync } from "node:fs";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
if (!existsSync(path.join(root, ".git"))) {
	process.exit(0);
}
try {
	execSync("git config core.hooksPath githooks", { cwd: root, stdio: "ignore" });
	console.log("Git hooks path set to githooks/ (pre-push runs npm run verify:ci)");
} catch {
	// Non-fatal (e.g. bare clone, sandbox).
	process.exit(0);
}
