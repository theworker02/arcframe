import { typescriptAdapter, javascriptAdapter } from "./javascript.js";
import { rustAdapter } from "./rust.js";
import { pythonAdapter } from "./python.js";
import { goAdapter } from "./go.js";
import type { LanguageAdapter } from "../types.js";
import { extname } from "node:path";

const adapters: LanguageAdapter[] = [
  typescriptAdapter,
  javascriptAdapter,
  rustAdapter,
  pythonAdapter,
  goAdapter,
];

const byExt = new Map<string, LanguageAdapter>();
for (const adapter of adapters) {
  for (const ext of adapter.extensions) {
    byExt.set(ext.toLowerCase(), adapter);
  }
}

export function listAdapters(): LanguageAdapter[] {
  return [...adapters];
}

export function getAdapter(id: string): LanguageAdapter | undefined {
  return adapters.find((a) => a.id === id);
}

export function adapterForPath(filePath: string): LanguageAdapter | undefined {
  return byExt.get(extname(filePath).toLowerCase());
}

export function registerAdapter(adapter: LanguageAdapter): void {
  adapters.push(adapter);
  for (const ext of adapter.extensions) {
    byExt.set(ext.toLowerCase(), adapter);
  }
}

export {
  typescriptAdapter,
  javascriptAdapter,
  rustAdapter,
  pythonAdapter,
  goAdapter,
};
