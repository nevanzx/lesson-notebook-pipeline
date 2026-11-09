import { execFile } from "node:child_process"
import { promisify } from "node:util"

const exec = promisify(execFile)

export interface SyncOptions {
  remote?: string
  timeoutMs?: number
}

export type SyncResult =
  | { status: "not-git"; directory: string }
  | { status: "no-remote"; directory: string; root: string }
  | { status: "current"; directory: string; root: string; branch: string; upstream: string }
  | {
      status: "updated"
      directory: string
      root: string
      branch: string
      upstream: string
      before: string
      after: string
      commits: number
    }
  | {
      status: "skipped"
      directory: string
      root: string
      branch?: string
      upstream?: string
      commits?: number
      reason: string
    }
  | { status: "error"; directory: string; root?: string; reason: string }

async function git(cwd: string, args: string[], timeoutMs: number): Promise<string> {
  const { stdout } = await exec("git", ["-C", cwd, ...args], {
    timeout: timeoutMs,
    windowsHide: true,
    maxBuffer: 10 * 1024 * 1024,
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
  })
  return stdout.trim()
}

function reason(error: unknown): string {
  if (error && typeof error === "object") {
    const e = error as { stderr?: string; message?: string }
    return (e.stderr || e.message || String(error)).trim()
  }
  return String(error)
}

/** The repository root that contains `directory`, or undefined when it is not in a work tree. */
export async function gitRoot(directory: string, timeoutMs = 10_000): Promise<string | undefined> {
  try {
    return await git(directory, ["rev-parse", "--show-toplevel"], timeoutMs)
  } catch {
    return undefined
  }
}

/**
 * Fast-forward the work tree that contains `directory` to its configured remote.
 *
 * Safe by construction: it fetches first, never rewrites history, and uses
 * `merge --ff-only`, which aborts instead of overwriting local work. Any git
 * failure is reported as data, never thrown.
 */
export async function syncRepo(directory: string, options: SyncOptions = {}): Promise<SyncResult> {
  const remote = options.remote ?? "origin"
  const timeoutMs = options.timeoutMs ?? 15_000

  const root = await gitRoot(directory, timeoutMs)
  if (!root) return { status: "not-git", directory }

  try {
    await git(root, ["remote", "get-url", remote], timeoutMs)
  } catch {
    return { status: "no-remote", directory, root }
  }

  try {
    await git(root, ["fetch", "--quiet", "--prune", remote], timeoutMs)
  } catch (error) {
    return { status: "error", directory, root, reason: `fetch failed: ${reason(error)}` }
  }

  let branch: string
  try {
    branch = await git(root, ["rev-parse", "--abbrev-ref", "HEAD"], timeoutMs)
  } catch (error) {
    return { status: "error", directory, root, reason: reason(error) }
  }
  if (branch === "HEAD") {
    return { status: "skipped", directory, root, reason: "detached HEAD" }
  }

  let upstream: string
  try {
    upstream = await git(
      root,
      ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"],
      timeoutMs,
    )
  } catch {
    return {
      status: "skipped",
      directory,
      root,
      branch,
      reason: `branch ${branch} has no upstream`,
    }
  }

  let commits: number
  try {
    commits = Number(await git(root, ["rev-list", "--count", "HEAD..@{u}"], timeoutMs))
  } catch (error) {
    return { status: "error", directory, root, branch, reason: reason(error) }
  }
  if (!Number.isFinite(commits) || commits === 0) {
    return { status: "current", directory, root, branch, upstream }
  }

  let before: string
  try {
    before = await git(root, ["rev-parse", "--short", "HEAD"], timeoutMs)
  } catch (error) {
    return { status: "error", directory, root, branch, reason: reason(error) }
  }

  try {
    await git(root, ["merge", "--ff-only", "@{u}"], timeoutMs)
  } catch (error) {
    return {
      status: "skipped",
      directory,
      root,
      branch,
      upstream,
      commits,
      reason: `cannot fast-forward: ${reason(error)}`,
    }
  }

  const after = await git(root, ["rev-parse", "--short", "HEAD"], timeoutMs)
  return { status: "updated", directory, root, branch, upstream, before, after, commits }
}
