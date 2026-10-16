<div align="center">

<img src="brand/logo.svg" alt="xPrivo Bulk → 9Router" width="520"/>

# xPrivo Bulk → 9Router

**匿名の xPrivo セッションを一括作成し、[9Router](https://9router.com) に単一の OpenAI 互換プロバイダとして統合します。**

[![License: MIT](https://img.shields.io/badge/License-MIT-6366f1.svg)](LICENSE)
[![Node](https://img.shields.io/badge/Node-%E2%89%A518-0ea5e9.svg)](https://nodejs.org)
[![Dependencies](https://img.shields.io/badge/dependencies-0-22c55e.svg)](package.json)
[![Platform](https://img.shields.io/badge/platform-Linux%20%7C%20macOS%20%7C%20Windows-94a3b8.svg)](#動作要件)
[![9Router](https://img.shields.io/badge/9Router-OpenAI--compatible-7dd3fc.svg)](https://9router.com)
[![xPrivo](https://img.shields.io/badge/xPrivo-anonymous%20AI-8b5cf6.svg)](https://www.xprivo.com)

</div>

---

## これは何か

[xPrivo](https://www.xprivo.com) は**アカウント不要**の無料・匿名 AI チャットです。
訪問者はブラウザ内で短命なセッショントークン（`sp_token`）を受け取るだけです。本ツールは：

1. **セッションを一括作成** — 各セッションは分離されたブラウザコンテキストで、
   xPrivo の Bot-shield チャレンジを突破し `sp_token` と Cookie を取得します。
2. **プール化** — 単一の OpenAI 互換エンドポイントの背後でラウンドロビンとフェイルオーバー。
3. **9Router に接続** — すべての xPrivo モデルを `xprivo/` プレフィックスで公開。

> リクエストは**稼働中のブラウザコンテキスト経由**で中継されるため、セッション作成時と
> 同じレジデンシャル IP と突破済みチャレンジを利用します。

## 特徴

- ✨ 実行時依存ゼロ（純粋な Node ≥ 18）
- 🧩 再開可能な `sessions.json` を使う一括セッション作成
- 🔁 ラウンドロビン／ランダム経路と自動フェイルオーバー
- 🌊 ストリーミング**および**非ストリーミングのチャット補完
- 🖥️ 自前の Chromium を起動、または既存の `CDP_URL` を再利用
- 🔌 ワンコマンドで 9Router 登録（冪等）
- 🌐 レジデンシャル出口のためのプロキシ対応

## 動作要件

- Node.js **18+**
- Chromium/Chrome バイナリ（自動検出、または `CHROME_PATH` を設定）
- ローカルで稼働する 9Router（**0.5.99** で検証済み）
- **レジデンシャル IP またはプロキシ** — xPrivo の shield はデータセンター IP を拒否します

## インストール

```bash
git clone https://github.com/0xgetz/xprivo-bulk-9router.git
cd xprivo-bulk-9router
# npm install は不要 — 依存ゼロ
```

## クイックスタート

```bash
# 1. 匿名セッションを 3 件作成（自前の Chromium を起動）
node src/cli.js create --count 3

# 2. 各セッションを検証
node src/cli.js test

# 3. :8791 で OpenAI 互換プールを起動
node src/cli.js serve &

# 4. プールを 9Router に登録
node src/cli.js connect

# 5. 9Router 経由で呼び出す
curl http://127.0.0.1:20128/v1/chat/completions \
  -H "Authorization: Bearer <手順4のrouter-key>" \
  -H "Content-Type: application/json" \
  -d '{"model":"xprivo/xprivo","messages":[{"role":"user","content":"こんにちは"}]}'
```

### プロキシを使う（サーバーでは推奨）

```bash
node src/cli.js create --count 5 --proxy http://user:pass@host:port
```

### 既存ブラウザを再利用

```bash
node src/cli.js create --count 5 --cdp ws://127.0.0.1:9222/devtools/browser/<id>
```

## コマンド

| コマンド | 説明 |
| --- | --- |
| `create --count N` | N 件の匿名セッションを `sessions.json` に作成 |
| `list` | 保存済みセッションを表示 |
| `test` | 各セッションにテストプロンプトを送信 |
| `serve` | OpenAI 互換プールアダプタを起動 |
| `connect` | アダプタを 9Router に登録し router key を出力 |
| `models` | xPrivo モデルカタログを表示 |

共通フラグ：`--out FILE`、`--cdp WS_URL`、`--chrome PATH`、`--proxy URL`、`--headful`、`--port N`、`--router URL`、`--password PW`。

## 利用可能なモデル

アダプタが提供し、9Router では `xprivo/<model>` として公開されます：

| モデル ID | 表示名 | 階層 | 推論 | 音声 |
| --- | --- | --- | --- | --- |
| `xprivo` | xPrivo（デフォルト別名） | Free | – | – |
| `kolibri` | Kolibri (Aleph Alpha) | Free | – | – |
| `kolibri-low` | Kolibri Lite (Aleph Alpha) | Free | ✓ | – |
| `kolibri-medium` | Kolibri Medium (Aleph Alpha) | Free | ✓ | – |
| `glm-5.3-flash` | GLM 5.3 Flash | Free | – | – |
| `mistral-4-large` | Mistral 4 \| Le Chonk | Premium | – | – |
| `deepseek-v4` | DeepSeek V4.1 Flash | PRO | – | – |
| `minimax-m3` | MiniMax M3 | Lax | – | – |
| `kimi-k2.7` | Kimi K3.0 | PRO | – | – |
| `mistral-3` | Mistral 3 | PRO | – | – |
| `gpt-6.1-sol` | GPT 6.1 Sol | PRO | ✓ | – |
| `gpt-5.2` | GPT 5.2 | PRO | – | – |
| `gemini-3-pro` | Gemini 3.1 PRO | PRO | – | ✓ |
| `gemini-3-pro-thinking` | Gemini 3.1 PRO | PRO | ✓ | ✓ |

**Free** モデルはプランなしで利用できます。**Premium/PRO** モデルは無料階層では
アクセス／レート制限エラーを返す場合があります — カタログは xPrivo から直接取得しています。

## アダプタのエンドポイント

| パス | メソッド | 説明 |
| --- | --- | --- |
| `/v1/models` | GET | すべての `xprivo/*` モデルを一覧 |
| `/v1/chat/completions` | POST | チャット補完（ストリーム＋非ストリーム） |
| `/health` | GET | プールとモデル数 |
| `/pool` | GET | セッションごとの状態 |
| `/pool/reload` | POST | `sessions.json` を再読込しコンテキストを再アタッチ |

## 設定（`config.json`）

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

## 仕組み

アーキテクチャ図は [STRUCTURE.md](STRUCTURE.md)、通信プロトコルは
[docs/PROTOCOL.md](docs/PROTOCOL.md) を参照してください。

## 注意と制限

- **レジデンシャル IP が必須。** xPrivo の shield はデータセンター IP を遮断します。
  レジデンシャル回線で実行するか `--proxy` を指定してください。
- セッショントークンは短命かつ IP に紐づきます — 失効したら `create` を再実行してください。
- Premium/PRO モデルは一覧に表示されますが、無料階層では使えない場合があります。
- xPrivo の利用規約に従い、責任を持って使用してください。

## ライセンス

[MIT](LICENSE) © 2026 0xgetz
