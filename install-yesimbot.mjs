#!/usr/bin/env node
// install-yesimbot.mjs — 一键安装 Koishi + YesImBot（dev 分支，含 v4 架构）
//
// 用法：
//   macOS / Linux:   curl -fsSL <URL> | node
//   Windows:         curl.exe -fsSL <URL> -o install.mjs; node install.mjs
// 或下载后直接：    node install.mjs
//
// 流程：检查环境 -> 选择目录 -> 拉取 YesImBot dev 分支源码 -> 复用官方 setup-koishi.mjs
//       创建 Koishi 应用并接入 -> 交互式配置 provider/API Key/模型/allowedChannels -> 启动

import { createRequire } from "node:module";
import { createInterface } from "node:readline";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const REPO = "https://github.com/YesWeAreBot/YesImBot.git";
const BRANCH = "dev"; // 官方 setup-koishi.mjs 同样固定 dev 分支（含安装脚本），v4 分支无 setup 脚本
const TARBALL = `https://codeload.github.com/YesWeAreBot/YesImBot/tar.gz/refs/heads/${BRANCH}`;
const MIN_NODE_MAJOR = 18;
const MIN_YARN_MAJOR = 4;
const APP_SUFFIX = "yesimbot-koishi";

// provider 交互提示：{ 配置短名, 提示语, 默认模型（other 为 null）, 实际使用的插件短名 }
const PROVIDERS = {
  deepseek: { label: "DeepSeek", defaultModel: "deepseek-v4-pro", plugin: "deepseek" },
  openai: { label: "OpenAI", defaultModel: "gpt-4o", plugin: "openai" },
  anthropic: { label: "Anthropic", defaultModel: "claude-sonnet-4-6", plugin: "anthropic" },
  google: { label: "Google", defaultModel: "gemini-2.5-flash", plugin: "google" },
  other: { label: "其他（自定义 API，OpenAI 兼容）", defaultModel: null, plugin: "openai" },
};

// 配置短名 <-> 完整包名（与官方 setup-koishi.mjs 的 configKeyToPackageName 对应）
function configKeyToPackageName(key) {
  if (key === "yesimbot") return "koishi-plugin-yesimbot";
  if (key.startsWith("@yesimbot/provider-")) return `@yesimbot/koishi-plugin-provider-${key.slice("@yesimbot/provider-".length)}`;
  if (key.startsWith("yesimbot-")) return `koishi-plugin-${key}`;
  return null;
}
function packageNameToConfigKey(name) {
  if (name.startsWith("@") && name.includes("/")) {
    const [scope, rest] = name.split("/");
    return `${scope}/${rest.replace(/^koishi-plugin-/, "")}`;
  }
  return name.replace(/^koishi-plugin-/, "");
}

const parsed = parseArgs();
let yesimbotRoot;
let appRoot;
const stateFile = path.join(os.homedir(), ".yesimbot-install-state.json");

function parseArgs() {
  const args = process.argv.slice(2);
  const options = { dir: null, yes: false, noStart: false, apiKey: null, model: null, baseURL: null, help: false };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--dir") options.dir = args[++index] || null;
    else if (arg === "--yes") options.yes = true;
    else if (arg === "--no-start") options.noStart = true;
    else if (arg === "--api-key") options.apiKey = args[++index] || null;
    else if (arg === "--model") options.model = args[++index] || null;
    else if (arg === "--base-url") options.baseURL = args[++index] || null;
    else if (arg === "--help") options.help = true;
  }
  return options;
}

function log(message) {
  console.log(`[install] ${message}`);
}
function warn(message) {
  console.log(`[install] 注意: ${message}`);
}
function fail(message) {
  console.error(`[install] 失败: ${message}`);
  process.exit(1);
}

// ---------- 交互 ----------

// 全局共享 readline：重复创建会导致管道输入（echo | node script）丢失后续行
let sharedRl;
let stdinLines = null; // 管道输入模式（stdin 非 TTY）下预读全部行，逐行消费

function collectStdinLines() {
  if (stdinLines !== null) return stdinLines;
  stdinLines = [];
  if (process.stdin.isTTY) return stdinLines;
  const input = fs.readFileSync(0, "utf8");
  stdinLines = input.split(/\r?\n/);
  return stdinLines;
}

async function ask(prompt, defaultValue) {
  if (parsed.yes) return defaultValue ?? "";
  const suffix = defaultValue !== undefined ? ` [${defaultValue}]` : "";
  if (!process.stdin.isTTY) {
    const lines = collectStdinLines();
    const answer = lines.length > 0 ? lines.shift().trim() : "";
    const value = answer || (defaultValue ?? "");
    console.log(`${prompt}${suffix}: ${answer || (defaultValue ?? "")}`);
    return value;
  }
  if (!sharedRl) sharedRl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    sharedRl.question(`${prompt}${suffix}: `, (answer) => {
      resolve(answer.trim() || (defaultValue ?? ""));
    });
  });
}

async function choose(prompt, choices) {
  if (parsed.yes) return choices[0];
  const list = choices.map((c, i) => `  ${i + 1}) ${c}`).join("\n");
  while (true) {
    const answer = await ask(`${prompt}\n${list}\n请输入编号`, "");
    const index = Number.parseInt(answer, 10) - 1;
    if (index >= 0 && index < choices.length) return choices[index];
    console.log("  输入无效，请重新选择。");
  }
}

async function confirm(prompt, defaultValue = true) {
  if (parsed.yes) return defaultValue;
  const answer = await ask(`${prompt} ${defaultValue ? "(y/n, 默认 y)" : "(y/n, 默认 n)"}`, "");
  if (!answer) return defaultValue;
  return answer.toLowerCase() === "y" || answer.toLowerCase() === "yes";
}

// ---------- 环境检查 ----------

function ensureNode() {
  const major = Number.parseInt(process.versions.node.split(".")[0], 10);
  if (major < MIN_NODE_MAJOR) {
    fail(`需要 Node.js ${MIN_NODE_MAJOR}+，当前 ${process.versions.node}。请先安装：https://nodejs.org/ 或使用 nvm`);
  }
  log(`Node.js ${process.versions.node} 可用`);
}

function run(command, args, options = {}) {
  const useShell = options.shell ?? process.platform === "win32";
  const quoted = useShell && process.platform === "win32" ? args.map((a) => `"${a.replace(/"/g, '\\"')}"`) : args;
  const result = spawnSync(command, quoted, {
    cwd: options.cwd,
    env: { ...process.env, ...(options.env || {}) },
    encoding: "utf8",
    shell: useShell,
    stdio: options.quiet ? "pipe" : "inherit",
  });
  if (result.error) result.errorMessage = `${command} ${args.join(" ")} 启动失败: ${result.error.message}`;
  else if (result.status !== 0) result.errorMessage = `${command} ${args.join(" ")} 退出码 ${result.status}`;
  return result;
}

function runChecked(command, args, options = {}) {
  const result = run(command, args, { ...options, quiet: true });
  if (result.errorMessage) throw new Error(`${result.errorMessage}\n${result.stderr?.trim() || ""}`);
  return result.stdout?.trim() || "";
}

function yarnVersion(cwd) {
  for (const [cmd, args] of [["yarn", ["--version"]], ["corepack", ["yarn", "--version"]]]) {
    const result = run(cmd, args, { cwd, quiet: true });
    if (!result.errorMessage) return result.stdout?.trim() || "";
  }
  return "";
}

function ensureYarn(cwd) {
  const version = yarnVersion(cwd);
  if (version.startsWith(`${MIN_YARN_MAJOR}.`)) {
    log(`Yarn ${version} 可用`);
    return;
  }
  log("未检测到 Yarn 4，尝试通过 Corepack 启用...");
  const corepack = run("corepack", ["enable", "--yes"], { cwd, quiet: true });
  if (corepack.errorMessage) fail(`Corepack 不可用，无法启用 Yarn 4。请先安装 Node.js ${MIN_NODE_MAJOR}+（自带 Corepack）。`);
  const enabled = yarnVersion(cwd);
  if (!enabled.startsWith(`${MIN_YARN_MAJOR}.`)) fail(`Corepack 启用后 Yarn 仍不可用（${enabled || "未知"}）。`);
  log(`Yarn ${enabled} 可用（通过 Corepack）`);
}

// ---------- 目录与源码 ----------

function stateDir() {
  if (parsed.dir) return path.resolve(parsed.dir);
  if (fs.existsSync(stateFile)) {
    const saved = JSON.parse(fs.readFileSync(stateFile, "utf8"));
    if (saved.repo && fs.existsSync(saved.repo)) return saved.repo;
  }
  return path.join(process.cwd(), "yesimbot");
}

async function chooseDir() {
  const defaultDir = parsed.dir ? path.resolve(parsed.dir) : stateDir();
  const answer = parsed.dir ? defaultDir : await ask(`安装目录`, defaultDir);
  const dir = path.resolve(answer);
  const repo = path.join(dir, "YesImBot");
  appRoot = path.join(dir, APP_SUFFIX);
  return { dir, repo, appRoot };
}

function saveState(dir, repo) {
  fs.writeFileSync(stateFile, JSON.stringify({ dir, repo }, null, 2));
}

async function obtainSource(repoDir) {
  const looksLikeRepo = fs.existsSync(path.join(repoDir, "package.json")) && fs.existsSync(path.join(repoDir, "scripts", "setup-koishi.mjs"));
  if (looksLikeRepo) {
    log(`复用已存在的 YesImBot 源码: ${repoDir}`);
    yesimbotRoot = repoDir;
    return;
  }
  log(`拉取 YesImBot ${BRANCH} 分支...`);
  if (!run("git", ["clone", "--depth", "1", "--branch", BRANCH, REPO, repoDir], { quiet: false }).errorMessage) {
    yesimbotRoot = repoDir;
    return;
  }
  warn("git clone 失败，改用 tarball 下载...");
  const tarballPath = path.join(path.dirname(repoDir), "yesimbot.tar.gz");
  const download = run("curl", ["-fsSL", "-o", tarballPath, TARBALL], { quiet: false });
  if (download.errorMessage) fail(`源码获取失败（git 与 tarball 均不可用）：${download.errorMessage}`);
  const extract = run("tar", ["-xzf", tarballPath, "-C", path.dirname(repoDir)], { quiet: false });
  if (extract.errorMessage) fail(`tarball 解压失败: ${extract.errorMessage}`);
  fs.rmSync(tarballPath, { force: true });
  const extracted = path.join(path.dirname(repoDir), `YesImBot-${BRANCH}`);
  fs.renameSync(extracted, repoDir);
  yesimbotRoot = repoDir;
}

// ---------- 配置插件（koishi.yml） ----------

function loadYaml(root) {
  let require;
  try {
    require = createRequire(path.join(root, "package.json"));
    return require("js-yaml");
  } catch {
    fail(`js-yaml 不可用（${root}/node_modules 未安装依赖）。请先运行 setup-koishi.mjs 完成依赖安装。`);
  }
}

function findProviderKey(group, providerShort) {
  const full = configKeyToPackageName(providerShort) || `@yesimbot/koishi-plugin-provider-${providerShort}`;
  for (const key of Object.keys(group)) {
    const base = key.replace(/^~/, "").split(":")[0];
    const normalized = base.startsWith("@yesimbot/koishi-plugin-provider-")
      ? base.slice("@yesimbot/koishi-plugin-provider-".length)
      : base.replace(/^@yesimbot\/provider-/, "").replace(/^koishi-plugin-/, "");
    if (base === providerShort || base === full || normalized === providerShort) return key;
  }
  return null;
}

function applyProviderConfig(yaml, config, providerShort, apiKey, model, baseURL) {
  const group = config.plugins["group:yesimbot"];
  const providerKey = findProviderKey(group, providerShort);
  if (!providerKey) fail(`koishi.yml 中找不到 ${providerShort} 配置项`);
  const body = providerKey.replace(/^~/, "");
  const providerConfig = { ...group[providerKey], apiKey };
  if (baseURL) providerConfig.baseURL = baseURL;
  group[body] = providerConfig;
  if (providerKey !== body) delete group[providerKey];
  log(`已启用 provider ${providerShort} 并写入 API Key${baseURL ? `（baseURL: ${baseURL}）` : ""}`);

  group.yesimbot = {
    ...(group.yesimbot || {}),
    chatModel: `${providerShort}:${model}`,
    allowedChannels: [{ platform: "*", channelId: "*" }],
  };
  log(`yesimbot.chatModel = ${providerShort}:${model}`);
}

async function configurePlugins() {
  const yaml = loadYaml(yesimbotRoot);
  const configFile = path.join(appRoot, "koishi.yml");
  const config = yaml.load(fs.readFileSync(configFile, "utf8")) || {};
  config.plugins ||= {};
  const group = (config.plugins["group:yesimbot"] = config.plugins["group:yesimbot"] || {});

  const providerNames = Object.keys(PROVIDERS);
  const providerShort = parsed.yes ? providerNames[0] : await choose(`选择要启用的模型 provider（其余保持禁用）:`, providerNames);
  const provider = PROVIDERS[providerShort];
  const pluginShort = provider.plugin; // "其他" 复用 OpenAI 兼容插件

  let apiKey = parsed.apiKey ?? null;
  if (!apiKey) {
    apiKey = await ask(`输入 ${provider.label} API Key（明文写入 koishi.yml，可在控制台修改）`, undefined);
  }
  if (!apiKey) fail("API Key 不能为空（非交互模式请用 --api-key 传入）");

  let baseURL = null;
  if (providerShort === "other") {
    baseURL = parsed.baseURL ?? null;
    if (!baseURL) baseURL = await ask("输入自定义 API Base URL（例如 https://api.example.com/v1）", undefined);
    if (!baseURL) fail("自定义 provider 必须提供 API Base URL（非交互模式请用 --base-url 传入）");
  }

  let model = parsed.model ?? null;
  if (!model) {
    const modelPrompt = provider.defaultModel
      ? `设置默认模型（回车使用默认）`
      : `输入模型 ID（OpenAI 兼容 API 需完整模型名）`;
    model = await ask(modelPrompt, provider.defaultModel);
  }

  const allowAll = await confirm("是否允许所有平台/频道（正式使用建议收紧）?", true);
  if (!allowAll) {
    warn("allowedChannels 留空 = 拒绝所有消息。请稍后在控制台或 koishi.yml 中配置。");
  }

  applyProviderConfig(yaml, config, pluginShort, apiKey, model, baseURL);
  fs.writeFileSync(configFile, yaml.dump(config, { lineWidth: -1, noRefs: true }));
  log("koishi.yml 已更新");
  return { providerShort: pluginShort, apiKey, baseURL, model };
}

// ---------- 模型调用检测 ----------

// 各 provider 的 SDK 客户端工厂与模型包（与 provider 插件源码一致）
const SDK = {
  deepseek: { factory: "createDeepSeek", pkg: "@ai-sdk/deepseek", model: "deepseek-chat" },
  openai: { factory: "createOpenAI", pkg: "@ai-sdk/openai" },
  anthropic: { factory: "createAnthropic", pkg: "@ai-sdk/anthropic" },
  google: { factory: "createGoogleGenerativeAI", pkg: "@ai-sdk/google" },
};

async function verifyModelCall(providerShort, apiKey, baseURL, model) {
  const sdk = SDK[providerShort];
  if (!sdk) {
    warn(`暂不支持对 ${providerShort} 做模型调用检测，已跳过`);
    return true;
  }
  log(`检测模型调用 ${providerShort}:${model} ...`);
  try {
    const require = createRequire(path.join(yesimbotRoot, "package.json"));
    const factory = require(sdk.pkg)[sdk.factory];
    const client = factory({ apiKey, baseURL });
    const { generateText } = require("ai");
    const testModel = sdk.model ? client(sdk.model) : client(model);
    const { text } = await generateText({ model: testModel, prompt: "回复两个字：成功", maxRetries: 0 });
    log(`模型调用正常（响应: ${text.trim().slice(0, 30)}）`);
    return true;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    warn(`模型调用失败: ${detail}`);
    return false;
  }
}

// ---------- 主流程 ----------

async function main() {
  if (parsed.help) {
    console.log(
      [
        "install-yesimbot.mjs — 一键安装 Koishi + YesImBot（dev）",
        "",
        "用法: node install-yesimbot.mjs [options]",
        "",
        "  --dir <path>    安装目录（默认 ./yesimbot，自动复用上次目录）",
        "  --yes           非交互模式，全部使用默认值（会启用第一个 provider 且不询问）",
        "  --api-key <key> 非交互模式传入 API Key",
        "  --model <id>    指定模型 ID（不指定则用默认）",
        "  --base-url <url> 自定义 API Base URL（仅\"其他\" provider 需要）",
        "  --no-start      安装配置完成后不启动",
        "  --help          显示帮助",
        "",
        "安装方式:",
        "  macOS/Linux:  curl -fsSL <URL> | node",
        "  Windows:      curl.exe -fsSL <URL> -o install.mjs; node install.mjs",
      ].join("\n"),
    );
    return;
  }

  ensureNode();

  const { dir, repo, appRoot: app } = await chooseDir();
  appRoot = app;
  log(`安装目录: ${dir}`);
  if (fs.existsSync(repo) || fs.existsSync(app)) {
    log("检测到已有安装，将复用现有文件。");
  }

  await obtainSource(repo);
  saveState(dir, repo);

  ensureYarn(yesimbotRoot);

  log("调用官方 setup-koishi.mjs 创建 Koishi 应用并接入...");
  const setup = run("node", ["scripts/setup-koishi.mjs", "--create-app", appRoot], { cwd: yesimbotRoot });
  if (setup.errorMessage) fail(`setup-koishi.mjs 失败: ${setup.errorMessage}`);

  const providerSelection = await configurePlugins();

  if (!parsed.noStart) {
    await verifyModelCall(providerSelection.providerShort, providerSelection.apiKey, providerSelection.baseURL, providerSelection.model);
  }

  const launch = parsed.noStart ? false : await confirm("安装完成。是否现在启动 Koishi?", true);
  if (launch) {
    log(`启动 Koishi（控制台 http://127.0.0.1:5140）...`);
    run("yarn", ["start"], { cwd: appRoot });
  } else {
    log(`完成。之后启动: cd ${appRoot} && yarn start`);
  }
}

main().catch((error) => fail(error instanceof Error ? error.message : String(error)));
