#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const repo = resolve(import.meta.dirname, "..");
const buildDir = resolve(repo, ".mcpb/build");

const pkg = JSON.parse(readFileSync(resolve(repo, "package.json"), "utf8"));
const version = pkg.version;
const output = resolve(repo, `.mcpb/civi-mcp-v${version}.mcpb`);

rmSync(buildDir, { recursive: true, force: true });
rmSync(output, { force: true });
mkdirSync(buildDir, { recursive: true });

const manifest = JSON.parse(readFileSync(resolve(repo, ".mcpb/manifest.json"), "utf8"));
manifest.version = version;
writeFileSync(resolve(buildDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);

for (const file of ["dist", "package.json", "README.md", "LICENSE"]) {
  cpSync(resolve(repo, file), resolve(buildDir, file), { recursive: true });
}

execFileSync("npm", ["install", "--omit=dev", "--no-package-lock", "--no-save", "--silent"], {
  cwd: buildDir,
  stdio: "inherit",
});

execFileSync("npx", ["mcpb", "pack", buildDir, output], {
  cwd: repo,
  stdio: "inherit",
});

process.stdout.write(`\nBuilt ${output}\n`);
