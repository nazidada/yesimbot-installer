# YesImBot Installer

一键在全新的电脑上安装 **Koishi + YesImBot**，并完成插件配置——无需手动创建 Koishi 应用、拉取源码、配置依赖。

支持 **Windows / macOS / Linux** 三平台。

## 快速开始

### 一键安装（推荐）

在终端执行以下任一命令（安装过程中会交互式询问配置）：

```bash
# macOS / Linux
curl -fsSL https://raw.githubusercontent.com/TiccaTika/yesimbot-installer/main/install-yesimbot.mjs | node

# Windows（PowerShell，Win10+ 自带 curl.exe）
curl.exe -fsSL https://raw.githubusercontent.com/TiccaTika/yesimbot-installer/main/install-yesimbot.mjs -o install-yesimbot.mjs
node install-yesimbot.mjs
```

### 手动安装

```bash
# 下载脚本
curl -fsSL https://raw.githubusercontent.com/TiccaTika/yesimbot-installer/main/install-yesimbot.mjs -o install-yesimbot.mjs

# 运行（交互式）
node install-yesimbot.mjs

# 或非交互式（自动使用默认值）
node install-yesimbot.mjs --yes --api-key sk-xxxx --dir ./my-bot
```

## 安装流程

脚本会自动完成以下步骤：

1. **检查环境** — 需要 Node.js ≥ 18（未安装会提示引导安装）；git 缺失时自动降级为 tarball 下载
2. **拉取源码** — 从 GitHub `YesWeAreBot/YesImBot` 的 `dev` 分支拉取（git clone，失败自动改用 tarball）
3. **创建 Koishi 应用** — 复用官方 `setup-koishi.mjs`，自动创建应用、安装依赖、接入 workspace、构建全部插件
4. **交互式配置** — 选择模型 provider、填写 API Key、设置默认模型
5. **模型检测** — 启动前用真实 API 调用验证模型连通性（失败不阻断启动，仅提示）
6. **启动** — 确认后直接启动 Koishi，控制台默认 `http://127.0.0.1:5140`

## 交互式配置说明

安装过程中会依次询问：

| 问题 | 说明 |
| ---- | ---- |
| 安装目录 | 默认 `./yesimbot`，会自动复用上次安装的位置 |
| 选择模型 provider | 1) DeepSeek 2) OpenAI 3) Anthropic 4) Google 5) **其他（自定义 OpenAI 兼容 API）** |
| API Key | 必填，明文写入 `koishi.yml`（可在控制台修改） |
| API Base URL | 仅选"其他"时出现，输入自定义 API 地址，如 `https://api.example.com/v1` |
| 默认模型 | 回车使用该 provider 的默认模型（"其他"需手动输入） |
| 允许所有频道 | 默认允许 `*`（正式使用建议收紧） |
| 立即启动 | 回车启动，或 `n` 后手动 `cd <目录>/yesimbot-koishi && yarn start` |

## 命令行参数

| 参数 | 说明 |
| ---- | ---- |
| `--dir <path>` | 安装目录（默认 `./yesimbot`，自动复用上次目录） |
| `--yes` | 非交互模式，全部使用默认值（启用第一个 provider，deepseek） |
| `--api-key <key>` | 非交互模式传入 API Key |
| `--model <id>` | 指定模型 ID（不指定则用默认） |
| `--base-url <url>` | 自定义 API Base URL（仅"其他" provider 需要） |
| `--no-start` | 安装配置完成后不启动 |
| `--help` | 显示帮助 |

### 非交互示例

```bash
# 使用 DeepSeek + 指定模型
node install-yesimbot.mjs --yes --api-key sk-xxxx --model deepseek-v4-pro

# 使用自定义 OpenAI 兼容 API
node install-yesimbot.mjs --yes --api-key sk-xxxx --base-url https://api.example.com/v1 --model my-model
```

## 环境要求

- **Node.js ≥ 18**（脚本不负责安装，缺失时提示使用 [nodejs.org](https://nodejs.org) 或 nvm）
- **Git**（可选，缺失时自动改用 tarball 下载源码）
- **Yarn 4**（脚本通过 Corepack 自动启用）
- 首次运行需要联网（下载 create-koishi 与 npm 依赖）

## 安装后

1. 启动后打开控制台 **http://127.0.0.1:5140**（端口被占用自动 +1）
2. 在「插件管理」启用一个平台适配器（如 `adapter-qq`），连接机器人账号
3. 在群聊 @ 机器人即可对话（需要 `allowedChannels` 覆盖该频道）

## 目录结构（安装后）

```
<安装目录>/
├── YesImBot/              # yesimbot 源码（dev 分支）
└── yesimbot-koishi/       # Koishi 应用
    ├── koishi.yml         # 配置文件（含 API Key）
    └── package.json
```

## 常见问题

### 提示"Workspace not found"？

安装目录不要放在 `/tmp`（macOS 上是 `/private/tmp` 的符号链接），改用普通目录（如桌面、`~/apps`）。

### 模型检测失败？

- 检查 API Key 是否正确
- 检查 Base URL 是否可达（可先浏览器打开验证）
- 模型 ID 是否是该 API 支持的（DeepSeek 官方模型：`deepseek-v4-pro` / `deepseek-v4-flash`）
- 检测失败不阻断安装，可启动后在控制台修正配置

### 想重新安装？

直接删除安装目录，重新运行脚本即可（会自动复用或重建）。

### 安装中断了怎么办？

重新运行脚本，会自动检测并复用已存在的源码与应用，跳过已完成的步骤。

## 工作原理

- 从 `https://github.com/YesWeAreBot/YesImBot`（`dev` 分支）拉取源码
- 调用官方 `scripts/setup-koishi.mjs` 完成 Koishi 应用创建与 workspace 接入
- 修改应用 `koishi.yml` 的 `group:yesimbot` 配置块（启用所选 provider、写入 API Key、设置 `chatModel`）
- 用 `@ai-sdk` 客户端做启动前模型连通性检测

## 许可证

MIT

## 贡献者

感谢以下贡献者：

- [Nazidada](https://github.com/nazidada) — 项目发起与维护
- [Claude](https://github.com/anthropics/claude-code) — 脚本开发、测试与文档编写

欢迎提交 Issue 与 PR！
