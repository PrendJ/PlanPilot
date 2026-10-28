import { describe, expect, it } from "vitest";
import { mkdtemp, readFile, writeFile, rm, mkdir, utimes } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

describe("authenticated backups", () => {
  it("does not publish or prune a backup when pg_dump fails", async () => {
    const bash = process.platform === "win32" ? "C:/Program Files/Git/bin/bash.exe" : "/bin/sh";
    if (!existsSync(bash)) return;
    const dir = await mkdtemp(path.join(tmpdir(), "boardcue-backup-test-"));
    try {
      const bin = path.join(dir, "bin"); await mkdir(bin);
      await writeFile(path.join(bin, "docker"), '#!/bin/sh\nexit 42\n', { mode: 0o755 });
      const old = path.join(dir, "boardcue-old.dump.enc"); await writeFile(old, "synthetic old backup");
      await utimes(old, new Date(0), new Date(0));
      const result = spawnSync(bash, ["scripts/backup-db.sh"], { windowsHide: true, env: { ...process.env, PATH: bin + path.delimiter + process.env.PATH, BACKUP_DIR: dir, DB_CONTAINER: "synthetic-db", BACKUP_PASSPHRASE: "synthetic-test-passphrase" } });
      expect(result.status).toBe(42);
      expect(await readFile(old, "utf8")).toBe("synthetic old backup");
      expect(result.stdout.toString()).not.toContain("backup written");
    } finally { await rm(dir, { recursive: true, force: true }); }
  });
  it("round trips and refuses corruption and wrong keys without publishing plaintext", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "boardcue-crypto-test-"));
    const input = path.join(dir, "input"), sealed = path.join(dir, "sealed"), output = path.join(dir, "output");
    const run = (mode: string, from: string, to: string, key = "synthetic-test-passphrase") => spawnSync(process.execPath, ["scripts/backup-crypto.mjs", mode, from, to], { env: { ...process.env, BACKUP_PASSPHRASE: key }, windowsHide: true });
    try {
      await writeFile(input, "Synthetic PostgreSQL dump content");
      expect(run("encrypt", input, sealed).status).toBe(0);
      expect(run("decrypt", sealed, output).status).toBe(0);
      expect(await readFile(output, "utf8")).toBe("Synthetic PostgreSQL dump content");
      expect(run("decrypt", sealed, output, "wrong-key").status).not.toBe(0);
      expect(await readFile(output, "utf8")).toBe("Synthetic PostgreSQL dump content");
      const bytes = await readFile(sealed); bytes[bytes.length - 17] ^= 1; await writeFile(sealed, bytes);
      expect(run("decrypt", sealed, output).status).not.toBe(0);
      expect(await readFile(output, "utf8")).toBe("Synthetic PostgreSQL dump content");
    } finally { await rm(dir, { recursive: true, force: true }); }
  });
});
