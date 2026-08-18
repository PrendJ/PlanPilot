import { cpSync, existsSync, mkdirSync } from "node:fs";

const target = ".next/standalone/.next/static";
mkdirSync(target, { recursive: true });
cpSync(".next/static", target, { recursive: true });
if (existsSync("public")) cpSync("public", ".next/standalone/public", { recursive: true });
