<div align="center">

<img src="brand/logo.svg" alt="xPrivo Bulk → 9Router" width="520"/>

# xPrivo Bulk → 9Router

**Crea sesiones anónimas de xPrivo en bloque y agrúpalas en [9Router](https://9router.com) como un único proveedor compatible con OpenAI.**

[![License: MIT](https://img.shields.io/badge/License-MIT-6366f1.svg)](LICENSE)
[![Node](https://img.shields.io/badge/Node-%E2%89%A518-0ea5e9.svg)](https://nodejs.org)
[![Dependencies](https://img.shields.io/badge/dependencies-0-22c55e.svg)](package.json)
[![Platform](https://img.shields.io/badge/platform-Linux%20%7C%20macOS%20%7C%20Windows-94a3b8.svg)](#requisitos)
[![9Router](https://img.shields.io/badge/9Router-OpenAI--compatible-7dd3fc.svg)](https://9router.com)
[![xPrivo](https://img.shields.io/badge/xPrivo-anonymous%20AI-8b5cf6.svg)](https://www.xprivo.com)

</div>

---

## Qué hace

[xPrivo](https://www.xprivo.com) es un chat de IA anónimo y gratuito que **no requiere cuenta** —
cada visitante recibe un token de sesión de corta duración (`sp_token`) en el navegador. Esta herramienta:

1. **Crea sesiones en bloque** — cada una es un contexto de navegador aislado que resuelve el
   desafío Bot-shield de xPrivo y obtiene su `sp_token` y cookies.
2. **Las agrupa** detrás de un único endpoint compatible con OpenAI con round-robin y failover.
3. **Conecta el grupo a 9Router**, exponiendo todos los modelos de xPrivo bajo el prefijo `xprivo/`.

> Las peticiones se transmiten **a través de los contextos de navegador activos**, por lo que usan
> la misma IP residencial y el desafío ya resuelto que creó cada sesión.

## Características

- ✨ Sin dependencias en tiempo de ejecución (Node ≥ 18 puro)
- 🧩 Creador de sesiones en bloque con almacén `sessions.json` reanudable
- 🔁 Enrutado round-robin o aleatorio con failover automático
- 🌊 Chat completions en streaming **y** sin streaming
- 🖥️ Lanza su propio Chromium o reutiliza un `CDP_URL` existente
- 🔌 Registro en 9Router con un solo comando (idempotente)
- 🌐 Compatible con proxy para salida residencial

## Requisitos

- Node.js **18+**
- Un binario de Chromium/Chrome (autodetectado o define `CHROME_PATH`)
- 9Router ejecutándose en local (probado con **0.5.99**)
- **Una IP residencial o proxy** — el shield de xPrivo rechaza IPs de datacenter

## Instalación

```bash
git clone https://github.com/0xgetz/xprivo-bulk-9router.git
cd xprivo-bulk-9router
# no hace falta npm install — cero dependencias
```

## Inicio rápido

```bash
# 1. Crea 3 sesiones anónimas (lanza su propio Chromium)
node src/cli.js create --count 3

# 2. Verifica cada sesión
node src/cli.js test

# 3. Sirve el grupo compatible con OpenAI en :8791
node src/cli.js serve &

# 4. Registra el grupo en 9Router
node src/cli.js connect

# 5. Llámalo a través de 9Router
curl http://127.0.0.1:20128/v1/chat/completions \
  -H "Authorization: Bearer <router-key-del-paso-4>" \
  -H "Content-Type: application/json" \
  -d '{"model":"xprivo/xprivo","messages":[{"role":"user","content":"hola"}]}'
```

### Usar un proxy (recomendado en servidores)

```bash
node src/cli.js create --count 5 --proxy http://user:pass@host:port
```

### Reutilizar un navegador existente

```bash
node src/cli.js create --count 5 --cdp ws://127.0.0.1:9222/devtools/browser/<id>
```

## Comandos

| Comando | Descripción |
| --- | --- |
| `create --count N` | Crea N sesiones anónimas en `sessions.json` |
| `list` | Muestra las sesiones guardadas |
| `test` | Envía un prompt de prueba por cada sesión |
| `serve` | Ejecuta el adaptador de grupo compatible con OpenAI |
| `connect` | Registra el adaptador en 9Router e imprime un router key |
| `models` | Imprime el catálogo de modelos de xPrivo |

Flags comunes: `--out FILE`, `--cdp WS_URL`, `--chrome PATH`, `--proxy URL`, `--headful`, `--port N`, `--router URL`, `--password PW`.

## Modelos disponibles

Servidos por el adaptador y expuestos en 9Router como `xprivo/<model>`:

| ID del modelo | Nombre visible | Nivel | Razonamiento | Audio |
| --- | --- | --- | --- | --- |
| `xprivo` | xPrivo (alias por defecto) | Gratis | – | – |
| `kolibri` | Kolibri (Aleph Alpha) | Gratis | – | – |
| `kolibri-low` | Kolibri Lite (Aleph Alpha) | Gratis | ✓ | – |
| `kolibri-medium` | Kolibri Medium (Aleph Alpha) | Gratis | ✓ | – |
| `glm-5.3-flash` | GLM 5.3 Flash | Gratis | – | – |
| `mistral-4-large` | Mistral 4 \| Le Chonk | Premium | – | – |
| `deepseek-v4` | DeepSeek V4.1 Flash | PRO | – | – |
| `minimax-m3` | MiniMax M3 | Lax | – | – |
| `kimi-k2.7` | Kimi K3.0 | PRO | – | – |
| `mistral-3` | Mistral 3 | PRO | – | – |
| `gpt-6.1-sol` | GPT 6.1 Sol | PRO | ✓ | – |
| `gpt-5.2` | GPT 5.2 | PRO | – | – |
| `gemini-3-pro` | Gemini 3.1 PRO | PRO | – | ✓ |
| `gemini-3-pro-thinking` | Gemini 3.1 PRO | PRO | ✓ | ✓ |

Los modelos **Gratis** funcionan sin ningún plan. Los modelos **Premium/PRO** pueden devolver
un error de acceso o de límite en el nivel gratuito de xPrivo — el catálogo se obtiene de xPrivo.

## Endpoints del adaptador

| Ruta | Método | Descripción |
| --- | --- | --- |
| `/v1/models` | GET | Lista todos los modelos `xprivo/*` |
| `/v1/chat/completions` | POST | Chat completion (stream + sin stream) |
| `/health` | GET | Recuento de grupo y modelos |
| `/pool` | GET | Estado por sesión |
| `/pool/reload` | POST | Recarga `sessions.json` y reconecta contextos |

## Configuración (`config.json`)

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

## Cómo funciona

Consulta [STRUCTURE.md](STRUCTURE.md) para el diagrama de arquitectura y
[docs/PROTOCOL.md](docs/PROTOCOL.md) para el protocolo.

## Notas y limitaciones

- **Se requiere IP residencial.** El shield de xPrivo bloquea IPs de datacenter; ejecuta el
  creador desde una conexión residencial o aporta `--proxy`.
- Los tokens de sesión son de corta duración y están ligados a la IP — vuelve a ejecutar
  `create` cuando caduquen.
- Los modelos Premium/PRO se listan pero pueden no ser usables en el nivel gratuito.
- Úsalo de forma responsable y conforme a los términos de xPrivo.

## Licencia

[MIT](LICENSE) © 2026 0xgetz
