# 1 — Setup & how to run

How to bring up the forked **Vercel AI Chatbot** with **MCP-UI** rendering, validated against the **OpenAI Apps SDK examples** (Pizzaz + Kitchen Sink).

---

## Repos involved

Two repositories are cloned side by side. The examples repo lives **inside** the chatbot repo so the chat app can read its pre-built widget assets directly.

```
~/Desktop/Codes/chatbot-vercel/                 # forked vercel/ai-chatbot
├── ...                                         # chatbot source
└── openai-apps-sdk-examples/                   # cloned next to it (untracked)
    ├── pizzaz_server_node/                     # Pizzaz MCP server (Node)
    ├── kitchen_sink_server_node/               # Kitchen-sink MCP server (Node)
    └── assets/                                 # pre-built widget HTML/JS/CSS
```

The `openai-apps-sdk-examples/` folder is **untracked** in this repo — it is a separate clone, never modified, and not committed.

---

## 1. Clone

```bash
# Vercel AI Chatbot fork
git clone https://github.com/<your-fork>/chatbot-vercel.git
cd chatbot-vercel

# OpenAI Apps SDK examples (cloned INSIDE the chatbot repo)
git clone https://github.com/openai/openai-apps-sdk-examples.git
```

---

## 2. Install

### Chatbot deps

```bash
# from chatbot-vercel/
pnpm install
```

### Examples repo deps

```bash
# from chatbot-vercel/openai-apps-sdk-examples/
pnpm install
```

> Widget assets in `openai-apps-sdk-examples/assets/` ship pre-built — you do **not** need to run `pnpm run build` unless you change a widget source.

---

## 3. Postgres + env

The chatbot needs a Postgres database for chat/message persistence. The simplest path on macOS is the local Postgres.app (already running for many devs) or Docker.

### Option A — local Postgres (no password)

```bash
# create DB on the host postgres instance
node -e "const p=require('postgres');(async()=>{const s=p({host:'localhost',port:5432,user:'$(whoami)',database:'$(whoami)'});await s.unsafe('CREATE DATABASE chatbot;');await s.end();})();"
```

`POSTGRES_URL=postgres://$(whoami)@localhost:5432/chatbot`

### Option B — Docker

```bash
docker run -d --name chatbot-pg -e POSTGRES_PASSWORD=pg -p 5432:5432 postgres:16
docker exec -i chatbot-pg psql -U postgres -c "CREATE DATABASE chatbot;"
```

`POSTGRES_URL=postgres://postgres:pg@localhost:5432/chatbot`

### `.env.local`

Create `chatbot-vercel/.env.local` (gitignored):

```bash
AUTH_SECRET=$(openssl rand -base64 32)
POSTGRES_URL=postgres://<user>@localhost:5432/chatbot
OPENAI_API_KEY=sk-...your-key...
MCP_PIZZAZ_URL=http://localhost:8000/mcp
```

> The migrate script reads from `.env.local` specifically (not `.env`).

### Run migrations

```bash
# from chatbot-vercel/
pnpm db:migrate
```

---

## 4. Run all three processes

You need three terminals.

### Terminal A — widget asset server (port 4444)

Serves the pre-built HTML/JS/CSS that the widgets load via `<script src="http://localhost:4444/...">`.

```bash
cd chatbot-vercel/openai-apps-sdk-examples
pnpm run serve
```

Verify: `curl -I http://localhost:4444/pizzaz-2d2b.js` should return `200`.

### Terminal B — an MCP server (port 8000)

Pick **one** of these to run at a time (both default to port 8000):

#### Pizzaz (5 widget tools — display-focused)

```bash
cd chatbot-vercel/openai-apps-sdk-examples/pizzaz_server_node
pnpm start
```

Tools: `pizza-map`, `pizza-carousel`, `pizza-albums`, `pizza-list`, `pizza-shop`.

#### Kitchen Sink (best for testing widget → host round-trip)

```bash
cd chatbot-vercel/openai-apps-sdk-examples/kitchen_sink_server_node
pnpm start
```

Tools: `kitchen-sink-show`, `kitchen-sink-refresh`. The widget actually exercises `window.openai.callTool`, `setWidgetState`, `requestDisplayMode`, etc., so it's the most useful target to confirm the bridge works end-to-end.

> Both speak the same wire protocol on `http://localhost:8000/mcp`, so `MCP_PIZZAZ_URL` works unchanged for either. To run them in parallel, start one with `PORT=8100 pnpm start` and update `MCP_PIZZAZ_URL` accordingly.

### Terminal C — the chatbot

```bash
cd chatbot-vercel
pnpm dev
```

Open <http://localhost:3000>, continue as guest, and use the **GPT-4o mini (direct)** model from the picker (it bypasses the Vercel AI Gateway and uses your `OPENAI_API_KEY` directly).

---

## 5. Try it

| Server running | Sample prompt | What to expect |
|---|---|---|
| Pizzaz | "Show me a pizza carousel for pepperoni." | 4 cards render, ◀ ▶ buttons + scrollbar slide horizontally. Display-only widget. |
| Pizzaz | "Open the pizzaz shop with mushrooms." | Interactive shop with quantity steppers; uses `setWidgetState` / `requestDisplayMode`. |
| Kitchen Sink | "Use the kitchen sink widget to show 'hello world' with a blue accent." | Widget renders, then the widget itself calls `kitchen-sink-refresh` via `window.openai.callTool` — confirming the full host round-trip. Watch the network tab for `POST /api/mcp/action`. |

---

## 6. Stop everything

```bash
# Ctrl+C in each terminal, then if Docker:
docker rm -f chatbot-pg
```

---

## Notes

- The `openai-apps-sdk-examples/` clone is intentionally outside version control here. If you want it tracked, do it in its own repo or as a submodule — don't add it to this fork.
- All MCP-UI integration code lives under `lib/ai/mcp/`, `app/(chat)/api/mcp/`, `components/chat/mcp-ui-resource.tsx`, and `public/mcp-sandbox.html`.
- Chat route auto-loads MCP tools when `MCP_PIZZAZ_URL` is set; if the server is unreachable the chat still works with just the built-in tools.
