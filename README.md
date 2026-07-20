# my-claude-pets 🐾

Desktop pets for people who live in [Claude Code](https://claude.com/claude-code).

Your pets roam along the bottom of **all your monitors**, carry a live
**Claude token budget graph** over their heads, and when you click one, a
retro game-style search panel pops up — type a project name, hit Enter, and
iTerm opens right in that project with `claude` already running.

> macOS + [iTerm2](https://iterm2.com/) only (for now). The token graph reads
> your local Claude Code transcripts — no network calls, nothing leaves your
> machine.

## Features

- **Wandering pets** — pixel-style pets walk along the bottom of the screen,
  pause, breathe, and cross over to neighboring displays when they hit a
  screen edge. Windows are fully click-through except on the pets themselves.
- **Pick them up** — drag a pet anywhere (even to another monitor, the drag
  follows your cursor across displays). Drop it in mid-air and it stays there;
  drop it near the floor and it walks off again.
- **Token budget HUD** — a 7-day usage bar chart plus a **5-hour window
  gauge**: how many tokens you have left in the current window, your estimated
  limit, and when the window resets. Turns red past 85%. Aggregated across all
  your Claude Code projects, refreshed every 2 minutes.
- **Project launcher** — click a pet, fuzzy-search every project folder under
  your configured roots, press Enter. If iTerm is already running you choose
  **new tab** or **new window**; otherwise a window opens directly. The
  terminal starts in the project directory and runs your command
  (default: `claude`).
- **Self-healing** — a watchdog re-spawns a pet within 30 seconds if it ever
  gets lost in a display hand-off, and display plug/unplug is handled
  automatically.

## Install

```bash
git clone https://github.com/CordeliaSun/my-claude-pets.git
cd my-claude-pets
npm install
npm start
```

On first launch a `pets.json` is created from `pets.example.json` and a 🐾
icon appears in the menu bar (reload config / quit live there).

## Configuration (`pets.json`)

```jsonc
{
  // folders scanned (one level deep) by the project search panel
  "searchRoots": ["~/Desktop", "~/Documents", "~/Developer", "~/Projects"],

  // command run in the terminal for projects opened via search
  "defaultCommand": "claude",

  "pets": [
    {
      "name": "my-pet",              // required — label + identity
      "project": "~/Desktop",        // required — this pet's home project
      "image": "./images/cat.png",   // optional — transparent PNG; emoji fallback
      "emoji": "🐱",                 // optional — used when no image is set
      "scale": 1,                    // optional — pet size multiplier
      "speed": 1,                    // optional — walking speed multiplier
      "command": "claude"            // optional — per-pet terminal command
    }
  ]
}
```

Drop your own character image into `images/` and point `image` at it —
`pets.json` and `images/` contents are gitignored, so your customizations
stay local. Reload from the 🐾 menu after editing.

## How the token numbers work

Claude Code writes a transcript (JSONL, with per-message token usage) for
every session under `~/.claude/projects/`. my-claude-pets aggregates those
files (input + output + cache read/write, deduplicated by message id):

- **오늘 / today** — tokens used today across all projects.
- **Bar chart** — daily totals for the last 7 days.
- **5h gauge** — Claude plans rate-limit on a rolling ~5-hour window. Usage is
  grouped into 5-hour blocks (first activity floored to the hour, matching
  [ccusage](https://github.com/ryoppippi/ccusage)'s model). Since Anthropic
  doesn't expose your actual plan quota locally, the *limit* shown is your
  **largest historical 5-hour block** — accurate if you've ever hit your real
  limit, conservative otherwise. Remaining = limit − current block.

## Tests

```bash
npm test
```

## Credits

- Retro Korean pixel font: [Neo둥근모 (NeoDunggeunmo)](https://github.com/neodgm/neodgm)
  — public domain, bundled in `fonts/`.
- 5-hour block model inspired by [ccusage](https://github.com/ryoppippi/ccusage).

## License

[MIT](./LICENSE)
