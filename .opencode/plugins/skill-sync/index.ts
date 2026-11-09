import { dirname } from "node:path"
import { Plugin } from "@opencode/plugin"
import { gitRoot, syncRepo, type SyncResult } from "./sync"

/**
 * Check the skill's repository for upstream commits before the skill loads,
 * and fast-forward it when that is safe.
 *
 * Tuning lives here rather than in opencode.json so the plugin can load
 * automatically from `.opencode/plugins/` without a config entry:
 * - COOLDOWN_MS: skip the network check when the same repo was checked recently
 * - TIMEOUT_MS: cap on each git command, so a slow network cannot stall a skill
 * - REMOTE: the git remote to fetch from
 */
const COOLDOWN_MS = 60_000
const TIMEOUT_MS = 15_000
const REMOTE = "origin"

interface SkillInfo {
  id: string
  path?: string
}

const cache = new Map<string, { at: number; result: SyncResult; announced: boolean }>()
const inflight = new Map<string, Promise<SyncResult>>()

function skillList(output: unknown): SkillInfo[] {
  if (Array.isArray(output)) return output as SkillInfo[]
  const data = (output as { data?: unknown })?.data
  return Array.isArray(data) ? (data as SkillInfo[]) : []
}

function once(root: string, directory: string): Promise<SyncResult> {
  const running = inflight.get(root)
  if (running) return running
  const task = syncRepo(directory, { remote: REMOTE, timeoutMs: TIMEOUT_MS }).finally(() => {
    inflight.delete(root)
  })
  inflight.set(root, task)
  return task
}

function note(name: string, result: SyncResult): string | undefined {
  if (result.status === "updated") {
    const plural = result.commits === 1 ? "commit" : "commits"
    return (
      `skill-sync: updated **${name}** before loading it — ` +
      `${result.commits} new ${plural} pulled from ${result.upstream} ` +
      `(\`${result.before}..${result.after}\`).`
    )
  }
  if (result.status === "skipped" && result.commits) {
    const plural = result.commits === 1 ? "commit" : "commits"
    return (
      `skill-sync: **${name}** is ${result.commits} ${plural} behind ${result.upstream}, ` +
      `but the update was not applied: ${result.reason}.`
    )
  }
  return undefined
}

export default Plugin.define({
  id: "skill-sync",
  async setup(ctx) {
    await ctx.tool.hook("execute.before", async (event) => {
      if (event.tool !== "skill") return

      try {
        const input = event.input as { id?: string; name?: string } | undefined
        const id = input?.id ?? input?.name
        if (!id) return

        const info = skillList(await ctx.skill.list()).find((skill) => skill.id === id)
        if (!info?.path) return

        const directory = dirname(info.path)
        const root = await gitRoot(directory, TIMEOUT_MS)
        if (!root) return

        const now = Date.now()
        const cached = cache.get(root)
        let result: SyncResult
        let announced = false
        if (cached && now - cached.at < COOLDOWN_MS) {
          result = cached.result
          announced = cached.announced
        } else {
          result = await once(root, directory)
          cache.set(root, { at: now, result, announced: false })
        }

        const text = note(id, result)
        if (!text || announced) return

        if (result.status === "updated") {
          // The registry holds the pre-pull content; refresh it before the
          // tool body reads the skill.
          await ctx.skill.reload()
        }
        await ctx.session.synthetic({ sessionID: event.sessionID, text })
        cache.set(root, { at: cache.get(root)?.at ?? now, result, announced: true })
      } catch (error) {
        // A sync problem must never break the skill call.
        console.error("[skill-sync]", error)
      }
    })
  },
})
