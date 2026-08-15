import * as vscode from "vscode";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

/** Documented VS Code APIs only — intelligence via CLI. */

const SECTIONS = [
  "Overview",
  "Project",
  "Architecture",
  "Changes",
  "Tasks",
  "Context",
  "Tests",
  "Debug",
  "Rules",
  "Memory",
  "MCP",
  "Health",
  "Settings",
] as const;

type Section = (typeof SECTIONS)[number];

function workspaceRoot(): string | undefined {
  return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
}

function arcBin(context: vscode.ExtensionContext): string | null {
  const root = workspaceRoot();
  if (root) {
    const local = join(root, "cli", "dist", "bin.js");
    if (existsSync(local)) return local;
  }
  const bundled = join(context.extensionPath, "..", "..", "cli", "dist", "bin.js");
  return existsSync(bundled) ? bundled : null;
}

function extractJson(text: string): unknown {
  const start = text.indexOf("{");
  const startArr = text.indexOf("[");
  let i = -1;
  if (start >= 0 && (startArr < 0 || start < startArr)) i = start;
  else if (startArr >= 0) i = startArr;
  if (i < 0) return null;
  try {
    return JSON.parse(text.slice(i));
  } catch {
    return null;
  }
}

function runArc(
  context: vscode.ExtensionContext,
  args: string[],
): Promise<{ ok: boolean; data: unknown; error?: string }> {
  const root = workspaceRoot();
  const bin = arcBin(context);
  if (!root) return Promise.resolve({ ok: false, data: null, error: "No workspace folder" });
  if (!bin) {
    return Promise.resolve({
      ok: false,
      data: null,
      error: "CLI not built — run `pnpm build` (Unavailable)",
    });
  }
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [bin, ...args, "--json"], {
      cwd: root,
      windowsHide: true,
    });
    let out = "";
    let err = "";
    child.stdout.on("data", (d) => (out += d.toString()));
    child.stderr.on("data", (d) => (err += d.toString()));
    child.on("close", (code) => {
      const data = extractJson(out);
      if (code === 0 && data !== null) resolve({ ok: true, data });
      else
        resolve({
          ok: false,
          data,
          error: err.trim() || out.trim() || `arc exited ${code}`,
        });
    });
  });
}

function esc(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function pre(data: unknown): string {
  return `<pre>${esc(JSON.stringify(data, null, 2))}</pre>`;
}

function unavailable(reason: string): string {
  return `<p class="warn">${esc(reason)}</p>`;
}

class ArcframeSidebarProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = "arcframe.sidebar";
  private view?: vscode.WebviewView;
  private section: Section = "Overview";
  private cache: Record<string, unknown> = {};

  constructor(private readonly context: vscode.ExtensionContext) {}

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    this.view = webviewView;
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.context.extensionUri, "media")],
    };
    webviewView.webview.html = this.shell("Loading…");

    webviewView.webview.onDidReceiveMessage(async (msg) => {
      if (msg?.type === "nav" && SECTIONS.includes(msg.section)) {
        this.section = msg.section as Section;
        await this.renderSection();
      }
      if (msg?.type === "refresh") await this.renderSection(true);
      if (msg?.type === "reindex") {
        await runArc(this.context, ["index", "rebuild"]);
        await this.renderSection(true);
      }
    });

    void this.renderSection(true);
  }

  private async loadBase(force = false): Promise<void> {
    if (!force && this.cache.status && this.cache.health) return;
    const [status, health] = await Promise.all([
      runArc(this.context, ["status"]),
      runArc(this.context, ["health"]),
    ]);
    this.cache.status = status;
    this.cache.health = health;
  }

  private async renderSection(force = false): Promise<void> {
    if (!this.view) return;
    this.view.webview.html = this.shell(`Loading ${this.section}…`);
    await this.loadBase(force);
    let body = "";

    try {
      switch (this.section) {
        case "Overview": {
          const st = this.cache.status as { ok: boolean; data: any; error?: string };
          const hp = this.cache.health as { ok: boolean; data: any; error?: string };
          if (!st.ok) body = unavailable(st.error ?? "Status unavailable");
          else {
            body = `
              <div class="metric">${esc(String(hp.data?.score ?? "—"))}
                <span class="muted">/ ${esc(String(hp.data?.grade ?? "?"))}</span></div>
              <p class="muted">${esc(st.data?.project?.name ?? "")} · ${esc(
              (st.data?.project?.languages ?? []).join(", "),
            )}</p>
              <p class="muted">files ${st.data?.index?.files ?? 0} · symbols ${
              st.data?.index?.symbols ?? 0
            } · edges ${st.data?.index?.edges ?? 0}</p>`;
          }
          break;
        }
        case "Project": {
          const st = this.cache.status as { ok: boolean; data: any; error?: string };
          body = st.ok ? pre(st.data?.project) : unavailable(st.error ?? "Unavailable");
          break;
        }
        case "Architecture": {
          const g = await runArc(this.context, ["graph", "stats"]);
          body = g.ok ? pre(g.data) : unavailable(g.error ?? "Graph unavailable — run arc graph build");
          break;
        }
        case "Changes": {
          const c = await runArc(this.context, ["changes", "analyze"]);
          body = c.ok ? pre(c.data) : unavailable(c.error ?? "Changes unavailable");
          break;
        }
        case "Tasks": {
          const t = await runArc(this.context, ["task", "list"]);
          body = t.ok ? pre(t.data) : unavailable(t.error ?? "Tasks unavailable");
          break;
        }
        case "Context": {
          const q = "architecture";
          const c = await runArc(this.context, ["context", q, "--budget", "tiny"]);
          body = c.ok
            ? `<p class="muted">Sample pack query: ${esc(q)}</p>${pre(c.data)}`
            : unavailable(c.error ?? "Context unavailable");
          break;
        }
        case "Tests": {
          const inv = await runArc(this.context, ["changes", "tests"]);
          body = inv.ok
            ? pre(inv.data)
            : unavailable(inv.error ?? "Test analysis unavailable");
          break;
        }
        case "Debug": {
          const d = await runArc(this.context, ["doctor"]);
          body = d.ok || d.data ? pre(d.data) : unavailable(d.error ?? "Doctor unavailable");
          break;
        }
        case "Rules": {
          const root = workspaceRoot();
          const rulesDir = root ? join(root, ".arcframe", "rules") : "";
          if (!rulesDir || !existsSync(rulesDir)) {
            body = unavailable("Not configured — run `arc init` to seed rules");
          } else {
            const { readdirSync, readFileSync } = await import("node:fs");
            const files = readdirSync(rulesDir).filter((f) => f.endsWith(".md"));
            body = `<ul>${files
              .map((f) => `<li>${esc(f)}</li>`)
              .join("")}</ul><pre class="small">${esc(
              files
                .slice(0, 3)
                .map((f) => readFileSync(join(rulesDir, f), "utf8").slice(0, 400))
                .join("\n---\n"),
            )}</pre>`;
          }
          break;
        }
        case "Memory": {
          const m = await runArc(this.context, ["memory", "list"]);
          body = m.ok ? pre(m.data) : unavailable(m.error ?? "Memory unavailable");
          break;
        }
        case "MCP": {
          const root = workspaceRoot();
          const mcp = root ? join(root, ".arcframe", "mcp.json") : "";
          if (!mcp || !existsSync(mcp)) {
            body = unavailable("Not configured — `arc init` writes .arcframe/mcp.json");
          } else {
            const { readFileSync } = await import("node:fs");
            body = `<p class="muted">Configured at .arcframe/mcp.json — start with node servers/mcp/dist/index.js</p>${pre(
              JSON.parse(readFileSync(mcp, "utf8")),
            )}`;
          }
          break;
        }
        case "Health": {
          const hp = this.cache.health as { ok: boolean; data: any; error?: string };
          body = hp.ok || hp.data ? pre(hp.data) : unavailable(hp.error ?? "Health unavailable");
          break;
        }
        case "Settings": {
          const c = await runArc(this.context, ["config", "show"]);
          body = c.ok
            ? pre(c.data)
            : unavailable(c.error ?? "Not configured — run arc init");
          break;
        }
      }
    } catch (e) {
      body = unavailable((e as Error).message);
    }

    this.view.webview.html = this.shell(body);
  }

  private shell(body: string): string {
    const webview = this.view?.webview;
    const markUri = webview
      ? webview
          .asWebviewUri(
            vscode.Uri.joinPath(this.context.extensionUri, "media", "arcframe-mark.svg"),
          )
          .toString()
      : "";
    const nav = SECTIONS.map(
      (sec) =>
        `<button class="nav${sec === this.section ? " active" : ""}" data-section="${sec}">${sec}</button>`,
    ).join("");
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<style>
  :root {
    --bg: #090A0C; --elev: #111318; --sec: #191C22;
    --copper: #B87333; --copper2: #D59255; --text: #F4F4F5; --muted: #A1A7B0;
    --warn: #D8A13B; --err: #CE5353;
  }
  body { margin:0; padding:10px; font-family: Georgia, "Segoe UI", serif;
    background: linear-gradient(160deg, var(--bg), var(--sec)); color: var(--text); }
  .brand { display:flex; align-items:center; gap:8px; margin:0 0 8px; }
  .brand img { width:28px; height:28px; border-radius:6px; }
  h1 { font-size:16px; color: var(--copper2); margin:0; }
  .nav-wrap { display:flex; flex-wrap:wrap; gap:4px; margin-bottom:10px; }
  .nav { background: var(--elev); border:1px solid #2a2e36; color: var(--muted);
    padding:4px 8px; cursor:pointer; font-size:11px; }
  .nav.active { border-color: var(--copper); color: var(--copper2); }
  .actions { display:flex; gap:6px; margin-bottom:10px; }
  button.act { background: var(--elev); border:1px solid var(--copper); color: var(--copper2);
    padding:6px 10px; cursor:pointer; }
  .metric { font-size:28px; }
  .muted { color: var(--muted); font-size:12px; }
  .warn { color: var(--warn); }
  pre { background: var(--elev); padding:8px; font-size:10px; max-height:360px; overflow:auto;
    white-space: pre-wrap; }
  pre.small { max-height:160px; }
  ul { margin:0; padding-left:18px; font-size:12px; color: var(--muted); }
</style>
</head>
<body>
  <div class="brand">
    ${markUri ? `<img src="${markUri}" alt="" />` : ""}
    <h1>Arcframe</h1>
  </div>
  <div class="actions">
    <button class="act" id="refresh">Refresh</button>
    <button class="act" id="reindex">Rebuild index</button>
  </div>
  <div class="nav-wrap">${nav}</div>
  <section id="body">${body}</section>
  <script>
    const vscode = acquireVsCodeApi();
    document.querySelectorAll('.nav').forEach(btn => {
      btn.addEventListener('click', () => vscode.postMessage({ type: 'nav', section: btn.dataset.section }));
    });
    document.getElementById('refresh')?.addEventListener('click', () => vscode.postMessage({ type: 'refresh' }));
    document.getElementById('reindex')?.addEventListener('click', () => vscode.postMessage({ type: 'reindex' }));
  </script>
</body>
</html>`;
  }

}

export function activate(context: vscode.ExtensionContext): void {
  const provider = new ArcframeSidebarProvider(context);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(ArcframeSidebarProvider.viewType, provider),
  );

  const openJson = async (args: string[]) => {
    const result = await runArc(context, args);
    const content = JSON.stringify(result.data ?? { error: result.error }, null, 2);
    const doc = await vscode.workspace.openTextDocument({ content, language: "json" });
    await vscode.window.showTextDocument(doc, { preview: true });
  };

  context.subscriptions.push(
    vscode.commands.registerCommand("arcframe.status", () => openJson(["status"])),
    vscode.commands.registerCommand("arcframe.health", () => openJson(["health"])),
    vscode.commands.registerCommand("arcframe.reindex", async () => {
      const r = await runArc(context, ["index", "rebuild"]);
      vscode.window.showInformationMessage(
        r.ok ? "Arcframe index rebuilt" : r.error ?? "Rebuild failed",
      );
    }),
    vscode.commands.registerCommand("arcframe.openSidebar", () =>
      vscode.commands.executeCommand("arcframe.sidebar.focus"),
    ),
  );
}

export function deactivate(): void {}
