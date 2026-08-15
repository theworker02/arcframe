import { describe, expect, it } from "vitest";
import { rustAdapter } from "./adapters/rust.js";
import { pythonAdapter } from "./adapters/python.js";
import { goAdapter } from "./adapters/go.js";
import { typescriptAdapter } from "./adapters/javascript.js";

describe("language adapters", () => {
  it("parses TypeScript exports", () => {
    const result = typescriptAdapter.analyzeFile(
      "x.ts",
      `export function hello() {}\nimport { z } from 'zod';\n`,
      "x.ts",
    );
    expect(result.symbols.some((s) => s.name === "hello")).toBe(true);
    expect(result.imports.some((i) => i.source === "zod")).toBe(true);
  });

  it("parses Rust fn/struct", () => {
    const result = rustAdapter.analyzeFile(
      "lib.rs",
      `pub fn greet() {}\npub struct Foo;\nuse std::io;\n`,
      "lib.rs",
    );
    expect(result.symbols.some((s) => s.name === "greet")).toBe(true);
    expect(result.symbols.some((s) => s.name === "Foo")).toBe(true);
  });

  it("parses Python FastAPI routes", () => {
    const result = pythonAdapter.analyzeFile(
      "main.py",
      `from fastapi import FastAPI\napp = FastAPI()\n@app.get("/health")\ndef health():\n    return 1\n`,
      "main.py",
    );
    expect(result.routes?.some((r) => r.path === "/health")).toBe(true);
  });

  it("parses Go funcs", () => {
    const result = goAdapter.analyzeFile(
      "main.go",
      `package main\nfunc Greet(name string) string { return name }\n`,
      "main.go",
    );
    expect(result.symbols.some((s) => s.name === "Greet" && s.exported)).toBe(true);
  });

  it("detects Next.js app router page routes", () => {
    const result = typescriptAdapter.analyzeFile(
      "app/about/page.tsx",
      `export default function About() { return null }\n`,
      "app/about/page.tsx",
    );
    expect(result.routes?.some((r) => r.path === "/about" && r.method === "GET")).toBe(true);
  });

  it("detects Axum routes", () => {
    const result = rustAdapter.analyzeFile(
      "main.rs",
      `use axum::routing::get;\nRouter::new().route("/health", get(health));\n`,
      "main.rs",
    );
    expect(result.routes?.some((r) => r.path === "/health")).toBe(true);
  });

  it("detects Django urlpatterns", () => {
    const result = pythonAdapter.analyzeFile(
      "urls.py",
      `from django.urls import path\nurlpatterns = [path("api/items/", views.items)]\n`,
      "urls.py",
    );
    expect(result.routes?.some((r) => r.path.includes("api/items"))).toBe(true);
  });
});
