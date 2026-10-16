<div align="center">

<img src="brand/logo.svg" alt="xPrivo Bulk → 9Router" width="520"/>

# xPrivo Bulk → 9Router

**批量创建匿名 xPrivo 会话，并将其聚合到 [9Router](https://9router.com) 作为一个 OpenAI 兼容的提供方。**

[![License: MIT](https://img.shields.io/badge/License-MIT-6366f1.svg)](LICENSE)
[![Node](https://img.shields.io/badge/Node-%E2%89%A518-0ea5e9.svg)](https://nodejs.org)
[![Dependencies](https://img.shields.io/badge/dependencies-0-22c55e.svg)](package.json)
[![Platform](https://img.shields.io/badge/platform-Linux%20%7C%20macOS%20%7C%20Windows-94a3b8.svg)](#环境要求)
[![9Router](https://img.shields.io/badge/9Router-OpenAI--compatible-7dd3fc.svg)](https://9router.com)
[![xPrivo](https://img.shields.io/badge/xPrivo-anonymous%20AI-8b5cf6.svg)](https://www.xprivo.com)

</div>

---

## 项目功能

[xPrivo](https://www.xprivo.com) 是一款免费的匿名 AI 聊天服务，**无需注册账号** ——
每位访客只会在浏览器中获得一个短期会话令牌（`sp_token`）。本工具可以：

1. **批量创建会话** —— 每个会话都是一个隔离的浏览器上下文，用于完成 xPrivo 的
   Bot-shield 挑战并获取其 `sp_token` 与 Cookie。
2. **聚合会话** 至一个 OpenAI 兼容端点，支持轮询与故障转移。
3. **将会话池接入 9Router**，以 `xprivo/` 前缀提供全部 xPrivo 模型。

> 请求会**通过活跃的浏览器上下文转发**，因此会沿用创建会话时的住宅 IP 与已完成的挑战。

## 特性

- ✨ 零运行时依赖（纯 Node ≥ 18）
- 🧩 批量会话创建器，使用可续传的 `sessions.json` 存储
- 🔁 轮询或随机路由，自动故障转移
- 🌊 支持流式**与**非流式对话补全
- 🖥️ 自带 Chromium 启动，或复用现有 `CDP_URL`
- 🔌 一条命令完成 9Router 注册（幂等）
- 🌐 支持代理以获得住宅出口

## 环境要求

- Node.js **18+**
- Chromium/Chrome 可执行文件（自动检测，或设置 `CHROME_PATH`）
- 本地运行的 9Router（已在 **0.5.99** 验证）
- **住宅 IP 或代理** —— xPrivo 的 shield 会拒绝数据中心 IP

## 安装

```bash
git clone https://github.com/0xgetz/xprivo-bulk-9router.git
cd xprivo-bulk-9router
# 无需 npm install —— 零依赖
```

## 快速开始

```bash
# 1. 创建 3 个匿名会话（自动启动 Chromium）
node src/cli.js create --count 3

# 2. 测试每个会话
node src/cli.js test

# 3. 在 :8791 启动 OpenAI 兼容会话池
node src/cli.js serve &

# 4. 将会话池注册到 9Router
node src/cli.js connect

# 5. 通过 9Router 调用
curl http://127.0.0.1:20128/v1/chat/completions \
  -H "Authorization: Bearer <第4步输出的 router-key>" \
  -H "Content-Type: application/json" \
  -d '{"model":"xprivo/xprivo","messages":[{"role":"user","content":"你好"}]}'
```

### 使用代理（在服务器上推荐）

```bash
node src/cli.js create --count 5 --proxy http://user:pass@host:port
```

### 复用已有浏览器

```bash
node src/cli.js create --count 5 --cdp ws://127.0.0.1:9222/devtools/browser/<id>
```

## 命令

| 命令 | 说明 |
| --- | --- |
| `create --count N` | 创建 N 个匿名会话到 `sessions.json` |
| `list` | 显示已保存的会话 |
| `test` | 向每个会话发送测试提示 |
| `serve` | 运行 OpenAI 兼容会话池适配器 |
| `connect` | 将适配器注册到 9Router 并输出 router key |
| `models` | 打印 xPrivo 模型目录 |

常用参数：`--out FILE`、`--cdp WS_URL`、`--chrome PATH`、`--proxy URL`、`--headful`、`--port N`、`--router URL`、`--password PW`。

## 可用模型

由适配器提供，并通过 9Router 以 `xprivo/<model>` 暴露：

| 模型 ID | 显示名称 | 层级 | 推理 | 音频 |
| --- | --- | --- | --- | --- |
| `xprivo` | xPrivo（默认别名） | 免费 | – | – |
| `kolibri` | Kolibri (Aleph Alpha) | 免费 | – | – |
| `kolibri-low` | Kolibri Lite (Aleph Alpha) | 免费 | ✓ | – |
| `kolibri-medium` | Kolibri Medium (Aleph Alpha) | 免费 | ✓ | – |
| `glm-5.3-flash` | GLM 5.3 Flash | 免费 | – | – |
| `mistral-4-large` | Mistral 4 \| Le Chonk | 高级 | – | – |
| `deepseek-v4` | DeepSeek V4.1 Flash | PRO | – | – |
| `minimax-m3` | MiniMax M3 | Lax | – | – |
| `kimi-k2.7` | Kimi K3.0 | PRO | – | – |
| `mistral-3` | Mistral 3 | PRO | – | – |
| `gpt-6.1-sol` | GPT 6.1 Sol | PRO | ✓ | – |
| `gpt-5.2` | GPT 5.2 | PRO | – | – |
| `gemini-3-pro` | Gemini 3.1 PRO | PRO | – | ✓ |
| `gemini-3-pro-thinking` | Gemini 3.1 PRO | PRO | ✓ | ✓ |

**免费（Free）** 模型无需任何套餐即可使用。**高级/PRO** 模型在免费层可能返回
权限或限流错误 —— 目录数据直接取自 xPrivo。

## 适配器端点

| 路径 | 方法 | 说明 |
| --- | --- | --- |
| `/v1/models` | GET | 列出全部 `xprivo/*` 模型 |
| `/v1/chat/completions` | POST | 对话补全（流式 + 非流式） |
| `/health` | GET | 会话池与模型数量 |
| `/pool` | GET | 每个会话的状态 |
| `/pool/reload` | POST | 重新加载 `sessions.json` 并重新挂载上下文 |

## 配置（`config.json`）

```json
{
  "port": 8791,
  "host": "127.0.0.1",
  "modelPrefix": "xprivo",
  "accountsFile": "sessions.json",
  "routing": "round-robin",
  "maxFailures": 3
}
```

## 工作原理

架构图见 [STRUCTURE.md](STRUCTURE.md)，通信协议见 [docs/PROTOCOL.md](docs/PROTOCOL.md)。

## 注意事项与限制

- **必须使用住宅 IP。** xPrivo 的 shield 会封锁数据中心 IP；请从住宅网络运行创建器，
  或提供 `--proxy`。
- 会话令牌短期有效且绑定 IP —— 过期后请重新运行 `create`。
- 高级/PRO 模型会被列出，但在免费层可能无法使用。
- 请遵守 xPrivo 的服务条款并负责任地使用。

## 许可证

[MIT](LICENSE) © 2026 0xgetz
