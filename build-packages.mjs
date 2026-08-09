#!/usr/bin/env node
// build-packages.mjs — 制作三系统安装包（每个包含完整文件）
// 用法: node build-packages.mjs [--version <版本>] [--out <输出目录>]
// 产物:
//   yesimbot-installer-<ver>-macos.tar.gz   （install-yesimbot.mjs / .sh / .bat / README.md）
//   yesimbot-installer-<ver>-linux.tar.gz   （同上）
//   yesimbot-installer-<ver>-windows.zip    （同上）

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const scriptDir = path.dirname(new URL(import.meta.url).pathname);
const args = process.argv.slice(2);
let version = "1.0.0";
let outDir = path.join(scriptDir, "dist");
let sourceDir = scriptDir; // 默认为脚本所在目录，--repo 可指向已生成的仓库目录
for (let i = 0; i < args.length; i += 1) {
  if (args[i] === "--version") version = args[i + 1];
  else if (args[i] === "--out") outDir = path.resolve(args[i + 1]);
  else if (args[i] === "--repo") sourceDir = path.resolve(args[i + 1]);
}

const FILES = ["install-yesimbot.mjs", "install-yesimbot.sh", "install-yesimbot.bat", "README.md"];
for (const file of FILES) {
  if (!fs.existsSync(path.join(sourceDir, file))) throw new Error(`缺少 ${file}，请先运行 build-installers.mjs`);
}

fs.mkdirSync(outDir, { recursive: true });
const staging = fs.mkdtempSync(path.join(outDir, "staging-"));

function run(cmd, cmdArgs, options = {}) {
  const result = spawnSync(cmd, cmdArgs, { cwd: options.cwd, encoding: "utf8", stdio: options.quiet ? "pipe" : "inherit" });
  if (result.error || result.status !== 0) {
    throw new Error(`${cmd} ${cmdArgs.join(" ")} 失败: ${result.error?.message || `exit ${result.status}`}\n${result.stderr || ""}`);
  }
  return result.stdout?.trim() || "";
}

function prepareStaging(target) {
  const dir = path.join(staging, target);
  fs.mkdirSync(dir, { recursive: true });
  for (const file of FILES) {
    fs.copyFileSync(path.join(sourceDir, file), path.join(dir, file));
  }
  return dir;
}

const base = `yesimbot-installer-${version}`;

const macDir = prepareStaging("macos");
run("tar", ["-czf", path.join(outDir, `${base}-macos.tar.gz`), "-C", macDir, "."]);
console.log(`  ${base}-macos.tar.gz`);

const linuxDir = prepareStaging("linux");
run("tar", ["-czf", path.join(outDir, `${base}-linux.tar.gz`), "-C", linuxDir, "."]);
console.log(`  ${base}-linux.tar.gz`);

const winDir = prepareStaging("windows");
run("zip", ["-r", "-q", path.join(outDir, `${base}-windows.zip`), "."], { cwd: winDir });
console.log(`  ${base}-windows.zip`);

fs.rmSync(staging, { recursive: true, force: true });
console.log(`打包完成，输出目录: ${outDir}`);
