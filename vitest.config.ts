import { defineConfig } from "vitest/config";
import path from "node:path";
export default defineConfig({ root: process.cwd(), test: { include: ["tests/**/*.test.ts"], environment: "node", coverage: { reporter: ["text", "json-summary"] } }, resolve: { alias: { "@": path.resolve(process.cwd()) } }, server: { fs: { strict: true, allow: [process.cwd()] } } });
