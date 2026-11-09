# skill-sync

Before a skill loads, check the git repository that contains its `SKILL.md` and
fast-forward it to the configured remote.

## Behavior

- Runs on every `skill` tool call, once per repository per 60 seconds.
- `git fetch` first, then `git merge --ff-only @{u}` only when the branch is behind.
- Never rewrites history and never forces. Local changes, a diverged branch, a
  detached HEAD, or a missing upstream leave the checkout untouched.
- Non-git skills (including built-in skills) are ignored silently.
- On a successful pull, refreshes the skill registry and posts a short synthetic
  message naming the commits that were pulled. A pull that cannot be applied is
  reported once; network errors are logged to the server console only.

## Tuning

Edit the constants at the top of `index.ts`:

| Constant      | Default  | Meaning                                  |
| ------------- | -------- | ---------------------------------------- |
| `COOLDOWN_MS` | `60000`  | Minimum time between network checks      |
| `TIMEOUT_MS`  | `15000`  | Cap for each git command                 |
| `REMOTE`      | `origin` | Remote to fetch                          |

## Tests

```sh
bun test ./.opencode/plugins/skill-sync/sync.test.ts
```

## Use in every project

This copy is project-local. To run it everywhere, copy this directory to
`~/.config/opencode/plugins/skill-sync/`.
