import { createFileRoute } from "@tanstack/react-router";
import { spawn, type ChildProcess } from "node:child_process";
import { createServer } from "node:net";

type Instance = {
  id: string;
  port: number;
  url: string;
  proc: ChildProcess;
  startedAt: number;
};

// Module-level registry. In dev/Node this persists across requests; on
// serverless targets that spin per request this won't work — see the
// 405 path below and the README note.
const g = globalThis as unknown as { __opencodeInstances?: Map<string, Instance> };
const instances: Map<string, Instance> = g.__opencodeInstances ?? new Map();
g.__opencodeInstances = instances;

function newId() {
  return `oc-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.unref();
    srv.on("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const addr = srv.address();
      if (!addr || typeof addr === "string") {
        srv.close();
        reject(new Error("Could not allocate port"));
        return;
      }
      const port = addr.port;
      srv.close(() => resolve(port));
    });
  });
}

async function waitForReady(port: number, signal?: AbortSignal, timeoutMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (signal?.aborted) throw new Error("Aborted");
    try {
      const res = await fetch(`http://127.0.0.1:${port}/app`, { method: "GET" });
      if (res.ok) return;
    } catch {
      /* not ready yet */
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`opencode did not become ready on port ${port}`);
}

function killInstance(inst: Instance) {
  try {
    inst.proc.kill("SIGTERM");
    setTimeout(() => {
      if (!inst.proc.killed) inst.proc.kill("SIGKILL");
    }, 2000).unref?.();
  } catch {
    /* ignore */
  }
  instances.delete(inst.id);
}

async function handleStart(body: any) {
  const ollamaBaseUrl: string = body?.ollamaBaseUrl ?? "http://127.0.0.1:11434";
  const port = await getFreePort();
  const id = newId();

  const env = {
    ...process.env,
    OLLAMA_BASE_URL: ollamaBaseUrl,
    OLLAMA_HOST: ollamaBaseUrl,
  };

  let proc: ChildProcess;
  try {
    proc = spawn(
      "opencode",
      ["serve", "--port", String(port), "--hostname", "127.0.0.1"],
      { env, stdio: ["ignore", "pipe", "pipe"] }
    );
  } catch (e: any) {
    return Response.json(
      { error: `Failed to launch opencode: ${e?.message ?? e}` },
      { status: 500 }
    );
  }

  const inst: Instance = {
    id,
    port,
    url: `http://127.0.0.1:${port}`,
    proc,
    startedAt: Date.now(),
  };
  instances.set(id, inst);

  const logs: string[] = [];
  proc.stdout?.on("data", (c) => logs.push(String(c)));
  proc.stderr?.on("data", (c) => logs.push(String(c)));

  let earlyExit: { code: number | null; signal: NodeJS.Signals | null } | null = null;
  proc.on("exit", (code, signal) => {
    earlyExit = { code, signal };
    instances.delete(id);
  });

  try {
    await Promise.race([
      waitForReady(port),
      new Promise((_r, rej) => {
        proc.on("exit", () =>
          rej(
            new Error(
              `opencode exited before ready (code=${earlyExit?.code}). Output:\n${logs.join("")}`
            )
          )
        );
      }),
    ]);
  } catch (e: any) {
    killInstance(inst);
    return Response.json(
      {
        error:
          e?.message ??
          "opencode did not start. Make sure `opencode` is installed and on PATH.",
        logs: logs.join("").slice(-2000),
      },
      { status: 500 }
    );
  }

  // Safety: auto-kill after 30 minutes.
  setTimeout(() => {
    if (instances.has(id)) killInstance(inst);
  }, 30 * 60 * 1000).unref?.();

  return Response.json({ id, url: inst.url, port });
}

function handleStop(body: any) {
  const id: string = body?.id;
  const inst = id ? instances.get(id) : null;
  if (!inst) return Response.json({ ok: true, notFound: true });
  killInstance(inst);
  return Response.json({ ok: true });
}

export const Route = createFileRoute("/api/opencode")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (typeof (globalThis as any).process?.versions?.node !== "string") {
          return Response.json(
            {
              error:
                "OpenCode spawning requires a Node runtime. Run `bun run dev` locally; it is unavailable on serverless deployments.",
            },
            { status: 501 }
          );
        }
        let body: any = {};
        try {
          body = await request.json();
        } catch {
          /* ignore */
        }
        const action = body?.action;
        if (action === "start") return handleStart(body);
        if (action === "stop") return handleStop(body);
        return Response.json({ error: "Unknown action" }, { status: 400 });
      },
    },
  },
});