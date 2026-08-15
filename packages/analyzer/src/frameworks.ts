import type { ExtractedSymbol, FileAnalysis } from "./types.js";
import type { ConfidenceLevel } from "@arcframe/core";

export interface FrameworkHint {
  id: string;
  confidence: ConfidenceLevel;
  evidence: string[];
}

export interface RouteHit {
  method: string;
  path: string;
  line: number;
  framework: string;
  handler?: string;
  confidence: ConfidenceLevel;
}

function lineOf(content: string, index: number): number {
  return content.slice(0, index).split(/\r?\n/).length;
}

/** Detect framework markers present in a single source file. */
export function detectFrameworksInFile(
  content: string,
  relativePosix: string,
): FrameworkHint[] {
  const hints: FrameworkHint[] = [];
  const add = (id: string, confidence: ConfidenceLevel, evidence: string) => {
    const existing = hints.find((h) => h.id === id);
    if (existing) {
      existing.evidence.push(evidence);
      return;
    }
    hints.push({ id, confidence, evidence: [evidence] });
  };

  if (/from\s+['"]next(\/|$)|require\(['"]next/.test(content) || /\/app\/.*page\.(t|j)sx?$/.test(relativePosix)) {
    add("nextjs", /from\s+['"]next/.test(content) ? "confirmed" : "strongly_inferred", relativePosix);
  }
  if (/from\s+['"]react['"]|from\s+['"]react\//.test(content) || /\.(tsx|jsx)$/.test(relativePosix)) {
    add("react", /from\s+['"]react/.test(content) ? "confirmed" : "weakly_inferred", relativePosix);
  }
  if (/from\s+['"]express['"]|require\(['"]express['"]\)/.test(content)) {
    add("express", "confirmed", "import express");
  }
  if (/from\s+['"]fastify['"]|require\(['"]fastify['"]\)/.test(content)) {
    add("fastify", "confirmed", "import fastify");
  }
  if (/from\s+fastapi|import\s+fastapi/i.test(content)) {
    add("fastapi", "confirmed", "import fastapi");
  }
  if (/from\s+flask|import\s+flask/i.test(content)) {
    add("flask", "confirmed", "import flask");
  }
  if (/from\s+django|import\s+django|urlpatterns\s*=/i.test(content)) {
    add("django", /urlpatterns/.test(content) ? "confirmed" : "strongly_inferred", relativePosix);
  }
  if (/use\s+axum|axum::/.test(content)) {
    add("axum", "confirmed", "use axum");
  }
  if (/use\s+actix_web|actix_web::/.test(content)) {
    add("actix", "confirmed", "use actix_web");
  }
  return hints;
}

/** Extract HTTP routes with framework-aware patterns. */
export function extractFrameworkRoutes(
  content: string,
  relativePosix: string,
): RouteHit[] {
  // Avoid matching illustrative comments / regex source examples
  const code = content
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
  const routes: RouteHit[] = [];
  let m: RegExpExecArray | null;

  // Express / Fastify / generic .get('/path'
  const expressRe =
    /(?:app|router|server|fastify)\s*\.\s*(get|post|put|patch|delete|options|head|all)\s*\(\s*['"`]([^'"`]+)['"`]/gi;
  while ((m = expressRe.exec(code))) {
    routes.push({
      method: m[1].toUpperCase(),
      path: m[2],
      line: lineOf(content, content.indexOf(m[0])),
      framework: /fastify/i.test(m[0]) ? "fastify" : "express",
      confidence: "confirmed",
    });
  }

  // Also catch chained .route('/x').get(
  const routeChain =
    /\.route\s*\(\s*['"`]([^'"`]+)['"`]\s*\)\s*\.\s*(get|post|put|patch|delete)/gi;
  while ((m = routeChain.exec(code))) {
    routes.push({
      method: m[2].toUpperCase(),
      path: m[1],
      line: lineOf(content, Math.max(0, content.indexOf(m[0]))),
      framework: "express",
      confidence: "confirmed",
    });
  }

  // Next.js App Router: export async function GET/POST in route.ts
  if (/\/route\.(t|j)sx?$/.test(relativePosix) || /\/(page|layout)\.(t|j)sx?$/.test(relativePosix)) {
    const methodRe = /export\s+(?:async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\b/g;
    while ((m = methodRe.exec(code))) {
      const routePath = inferNextPath(relativePosix);
      routes.push({
        method: m[1],
        path: routePath,
        line: lineOf(content, Math.max(0, content.indexOf(m[0]))),
        framework: "nextjs",
        handler: m[1],
        confidence: "strongly_inferred",
      });
    }
    if (/\/page\.(t|j)sx?$/.test(relativePosix)) {
      routes.push({
        method: "GET",
        path: inferNextPath(relativePosix),
        line: 1,
        framework: "nextjs",
        handler: "page",
        confidence: "strongly_inferred",
      });
    }
  }

  // FastAPI / Flask
  const pyRe =
    /@(?:app|router|bp|blueprint)\.(get|post|put|patch|delete|route)\s*\(\s*['"]([^'"]+)['"]/gi;
  while ((m = pyRe.exec(code))) {
    const method = m[1].toLowerCase() === "route" ? "GET" : m[1].toUpperCase();
    routes.push({
      method,
      path: m[2],
      line: lineOf(content, Math.max(0, content.indexOf(m[0]))),
      framework: /fastapi/i.test(content) ? "fastapi" : "flask",
      confidence: "confirmed",
    });
  }

  // Django urlpatterns path()/re_path()
  const djangoRe = /(?:path|re_path|url)\s*\(\s*r?['"]([^'"]+)['"]/g;
  if (/urlpatterns/.test(code)) {
    while ((m = djangoRe.exec(code))) {
      routes.push({
        method: "ANY",
        path: "/" + m[1].replace(/^\^/, "").replace(/\$$/, ""),
        line: lineOf(content, Math.max(0, content.indexOf(m[0]))),
        framework: "django",
        confidence: "strongly_inferred",
      });
    }
  }

  // Axum Router::new().route("/path", get(handler))
  const axumRe =
    /\.route\s*\(\s*"([^"]+)"\s*,\s*(get|post|put|patch|delete)\s*\(\s*([a-zA-Z0-9_:]+)/g;
  while ((m = axumRe.exec(code))) {
    routes.push({
      method: m[2].toUpperCase(),
      path: m[1],
      line: lineOf(content, Math.max(0, content.indexOf(m[0]))),
      framework: "axum",
      handler: m[3],
      confidence: "confirmed",
    });
  }

  // Actix #[get("/path")] or web::resource("/path").route(web::get()
  const actixAttr = /#\[(get|post|put|patch|delete)\s*\(\s*"([^"]+)"\s*\)\s*\]/g;
  while ((m = actixAttr.exec(code))) {
    routes.push({
      method: m[1].toUpperCase(),
      path: m[2],
      line: lineOf(content, Math.max(0, content.indexOf(m[0]))),
      framework: "actix",
      confidence: "confirmed",
    });
  }
  const actixRes =
    /web::resource\s*\(\s*"([^"]+)"\s*\)[\s\S]{0,80}?web::(get|post|put|patch|delete)/gi;
  while ((m = actixRes.exec(code))) {
    routes.push({
      method: m[2].toUpperCase(),
      path: m[1],
      line: lineOf(content, Math.max(0, content.indexOf(m[0]))),
      framework: "actix",
      confidence: "strongly_inferred",
    });
  }

  return routes;
}

function inferNextPath(relativePosix: string): string {
  // app/api/users/route.ts → /api/users
  // app/(marketing)/about/page.tsx → /about
  let p = relativePosix.replace(/\\/g, "/");
  const appIdx = p.lastIndexOf("/app/");
  if (appIdx >= 0) p = p.slice(appIdx + 4);
  else if (p.startsWith("app/")) p = p.slice(3);
  p = p
    .replace(/\/(page|layout|route|loading|error|default)\.(t|j)sx?$/, "")
    .replace(/\/\([^)]+\)/g, ""); // drop route groups
  if (!p.startsWith("/")) p = "/" + p;
  if (p === "/") return "/";
  return p.replace(/\/+/g, "/");
}

export function applyFrameworkAnalysis(
  analysis: FileAnalysis,
  content: string,
): FileAnalysis {
  const frameworks = detectFrameworksInFile(content, analysis.path);
  const routes = extractFrameworkRoutes(content, analysis.path);
  if (routes.length === 0 && frameworks.length === 0) return analysis;

  const symbols: ExtractedSymbol[] = [...analysis.symbols];
  const mergedRoutes = [...(analysis.routes ?? [])];

  for (const r of routes) {
    if (!mergedRoutes.some((x) => x.method === r.method && x.path === r.path && x.line === r.line)) {
      mergedRoutes.push({ method: r.method, path: r.path, line: r.line });
    }
    const name = `${r.method} ${r.path}`;
    if (!symbols.some((s) => s.name === name && s.kind === "route")) {
      symbols.push({
        name,
        kind: "route",
        line: r.line,
        exported: true,
        signature: r.handler ? `${r.framework}:${r.handler}` : r.framework,
      });
    }
  }

  // React component heuristic
  if (frameworks.some((f) => f.id === "react" || f.id === "nextjs")) {
    const compRe =
      /(?:export\s+default\s+function\s+(\w+)|export\s+function\s+([A-Z]\w*)|function\s+([A-Z]\w*)\s*\([^)]*\)\s*(?::\s*JSX\.Element|\s*\{))/g;
    let m: RegExpExecArray | null;
    while ((m = compRe.exec(content))) {
      const name = m[1] ?? m[2] ?? m[3];
      if (!symbols.some((s) => s.name === name)) {
        symbols.push({
          name,
          kind: "function",
          line: content.slice(0, m.index).split(/\r?\n/).length,
          exported: Boolean(m[1] || m[2]),
          signature: "react-component",
        });
      }
    }
  }

  return {
    ...analysis,
    symbols,
    routes: mergedRoutes,
  };
}
