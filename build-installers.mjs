#!/usr/bin/env node
// build-installers.mjs — 从 install-yesimbot.mjs 生成 .sh 与 .bat 引导文件
// 用法: node build-installers.mjs [--dir <输出目录>]
// 内嵌 mjs 从源文件实时生成，保证单点维护。
// .sh 拼接: sh-head.txt + mjs + 尾部标记；.bat 拼接: bat-head.txt + base64(mjs) + 尾部标记。

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const scriptDir = path.dirname(new URL(import.meta.url).pathname);
const source = path.join(scriptDir, "install-yesimbot.mjs");
const shHead = fs.readFileSync(path.join(scriptDir, "sh-head.txt"), "utf8");
const batHead = fs.readFileSync(path.join(scriptDir, "bat-head.txt"), "utf8");
const args = process.argv.slice(2);
let outDir = scriptDir;
for (let i = 0; i < args.length; i += 1) {
  if (args[i] === "--dir") outDir = path.resolve(args[i + 1]);
}

const mjs = fs.readFileSync(source, "utf8");

const result = spawnSync("base64", ["-w0"], { input: mjs, encoding: "utf8" });
if (result.error || result.status !== 0) throw new Error(`base64 编码失败: ${result.error?.message || result.status}`);
const b64 = result.stdout.trim();

const sh = `${shHead}${mjs}\n\n@@MJS_END@@\n`;
const bat = `${batHead}${b64}\nREM __MJS_BASE64_END__\n`;

fs.writeFileSync(path.join(outDir, "install-yesimbot.sh"), sh, { mode: 0o755 });
fs.writeFileSync(path.join(outDir, "install-yesimbot.bat"), bat);
console.log(`生成完成:
  ${path.join(outDir, "install-yesimbot.sh")}
  ${path.join(outDir, "install-yesimbot.bat")}`);
