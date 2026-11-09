import { afterAll, describe, expect, test } from "bun:test"
import { execFileSync } from "node:child_process"
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { syncRepo } from "./sync"

const roots: string[] = []

function sh(cwd: string, ...args: string[]): string {
  return execFileSync("git", ["-C", cwd, ...args], {
    encoding: "utf8",
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
  }).trim()
}

function commit(cwd: string, message: string): void {
  sh(cwd, "add", "-A")
  sh(cwd, "-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "-m", message)
}

/** A bare remote, a seed clone, and a local clone of the same skill repo. */
function fixture() {
  const base = mkdtempSync(join(tmpdir(), "skill-sync-"))
  roots.push(base)

  const remote = join(base, "remote.git")
  const seed = join(base, "seed")
  const local = join(base, "local")

  execFileSync("git", ["init", "--bare", "-b", "main", remote], { stdio: "ignore" })
  execFileSync("git", ["clone", remote, seed], { stdio: "ignore" })
  mkdirSync(join(seed, "skill"), { recursive: true })
  writeFileSync(join(seed, "skill", "SKILL.md"), "# v1\n")
  commit(seed, "v1")
  sh(seed, "push", "-u", "origin", "main")

  execFileSync("git", ["clone", remote, local], { stdio: "ignore" })
  return { remote, seed, local }
}

afterAll(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true })
})

describe("syncRepo", () => {
  test("fast-forwards a behind clone and keeps untracked files", async () => {
    const { seed, local } = fixture()
    writeFileSync(join(seed, "skill", "SKILL.md"), "# v2\n")
    commit(seed, "v2")
    sh(seed, "push")

    writeFileSync(join(local, "scratch.txt"), "keep me")

    const result = await syncRepo(join(local, "skill"))
    expect(result.status).toBe("updated")
    if (result.status !== "updated") return
    expect(result.commits).toBe(1)
    expect(readFileSync(join(local, "skill", "SKILL.md"), "utf8").replace(/\r\n/g, "\n")).toBe("# v2\n")
    expect(readFileSync(join(local, "scratch.txt"), "utf8")).toBe("keep me")
  })

  test("reports current when the clone is up to date", async () => {
    const { local } = fixture()
    const result = await syncRepo(join(local, "skill"))
    expect(result.status).toBe("current")
  })

  test("refuses to fast-forward a diverged branch", async () => {
    const { seed, local } = fixture()

    writeFileSync(join(seed, "skill", "SKILL.md"), "# remote\n")
    commit(seed, "remote")
    sh(seed, "push")

    writeFileSync(join(local, "local.txt"), "local work\n")
    commit(local, "local")

    const result = await syncRepo(join(local, "skill"))
    expect(result.status).toBe("skipped")
    if (result.status !== "skipped") return
    expect(result.commits).toBe(1)
    expect(readFileSync(join(local, "local.txt"), "utf8")).toBe("local work\n")
  })

  test("reports a directory outside a work tree", async () => {
    const base = mkdtempSync(join(tmpdir(), "skill-sync-plain-"))
    roots.push(base)
    const result = await syncRepo(base)
    expect(result.status).toBe("not-git")
  })

  test("reports a repository without the configured remote", async () => {
    const base = mkdtempSync(join(tmpdir(), "skill-sync-noremote-"))
    roots.push(base)
    sh(base, "init")
    const result = await syncRepo(base)
    expect(result.status).toBe("no-remote")
  })
})
