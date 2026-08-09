#!/usr/bin/env node
// build-installers.mjs — 从 install-yesimbot.mjs 生成 .sh 引导文件
// 用法: node build-installers.mjs [--dir <输出目录>]
// 内嵌 mjs 从源文件实时生成，保证单点维护。
// .sh 拼接: sh-head.txt + mjs + 尾部标记。Windows 不打包（见 README 的 PowerShell 安装方式）。

import fs from "node:fs";
import path from "node:path";

const scriptDir = path.dirname(new URL(import.meta.url).pathname);
const source = path.join(scriptDir, "install-yesimbot.mjs");
const shHead = fs.readFileSync(path.join(scriptDir, "sh-head.txt"), "utf8");
const args = process.argv.slice(2);
let outDir = scriptDir;
for (let i = 0; i < args.length; i += 1) {
  if (args[i] === "--dir") outDir = path.resolve(args[i + 1]);
}

const mjs = fs.readFileSync(source, "utf8");

const sh = `${shHead}${mjs}\n\n@@MJS_END@@\n`;

fs.writeFileSync(path.join(outDir, "install-yesimbot.sh"), sh, { mode: 0o755 });
console.log(`生成完成:
  ${path.join(outDir, "install-yesimbot.sh")}`);
