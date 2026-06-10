# Odyssey — Docker

A self-hosted chat UI for Ollama with web search (SearXNG) and deep research.

## Quick start

```bash
docker compose up -d --build
```

Then open <http://localhost:3000>.

## Services

| Service   | Port  | Description                                  |
| --------- | ----- | -------------------------------------------- |
| odyssey   | 3000  | The web UI (TanStack Start, Node server).    |
| searxng   | 8888  | Self-hosted metasearch (used for web mode).  |
| ollama    | 11434 | Optional — usually run on the host instead.  |

## Ollama

Most users run Ollama natively for GPU access. Start it with CORS open so the
browser app can reach it:

```bash
OLLAMA_ORIGINS='*' ollama serve
ollama pull llama3.2
```

To run Ollama in Docker instead, uncomment the `ollama` service in
`docker-compose.yml`.

## SearXNG

Spun up automatically. Edit `searxng/settings.yml` to customize engines and
**set a real `secret_key`** before exposing the instance publicly.

The default URL is `http://localhost:8888` and is already configured as the
default in the app's Settings page.

## OpenCode (optional)

To use the OpenCode agent for Deep Research, run it on your host:

```bash
opencode serve --port 4096
```

Then enable it in **Settings → Deep Research**.

## Configuration

All connection URLs (Ollama, SearXNG, OpenCode) and the active model are
configured in the app's **Settings** page and stored in your browser.
