# Customizing your pet 🎨

Everything about swapping in your own character. The short version lives in
the [README](../README.md#use-your-own-character); this is the full guide.

## What a fully custom pet looks like

```jsonc
{
  "name": "kitty",
  "project": "~/Projects/my-app",
  "image": "./images/kitty.png",           // walking / idle sprite
  "balloonImage": "./images/kitty-balloon.png", // shown while floating down (optional)
  "emoji": "🐱",                            // fallback if the image path breaks
  "scale": 1.3                              // size multiplier
}
```

Both image paths can be relative to the repo (`./images/...`), absolute, or
start with `~`. `pets.json` and anything you put in `images/` are
**gitignored** — your characters stay on your machine.

## 1. Find some art

Any PNG or SVG works: your own drawings, pixel art, stickers, fan art you
have the rights to use personally. Roughly square images look best for the
walking sprite (it renders in a 64×64 box × `scale`).

## 2. Make the background transparent

This is the step that trips everyone up. If your pet shows up inside a
**white rectangle**, the image has a solid background baked in — most
"transparent PNG" images downloaded from the web actually do.

**Check first:**

```bash
sips -g hasAlpha your-image.png    # "hasAlpha: no" means solid background
```

**Fix it with the bundled tool** — no extra installs, it reuses the app's
own Electron:

```bash
npm run strip-bg -- ~/Downloads/kitty.png images/kitty.png
```

It flood-fills from the image edges, so only the background connected to
the border becomes transparent — white **inside** your character (face,
eyes, teeth) is safe. Near-white JPEG-ish backgrounds work too. The output
is also downscaled to 512px so your repo stays light (pass a third argument
to change that).

**Other ways**, if you prefer:

- macOS Preview → Markup toolbar → Instant Alpha → drag over the
  background → Delete → export as PNG.
- Any online background remover.
- You live in Claude Code — just ask it: *"remove the white background
  from ~/Downloads/kitty.png and save it to images/kitty.png"*.

## 3. Size it

- The walking sprite renders at **64×64 px × `scale`** (`object-fit:
  contain`, so nothing gets distorted).
- Source images around **256–512 px** are plenty; bigger just wastes disk.
- Tune `scale` (e.g. `1.3`) rather than resizing the file when it looks too
  small next to the token HUD.

## 4. Add a balloon sprite (optional but adorable)

When you drop a pet in mid-air it floats back down to the floor. Without
any extra art it descends under a 🎈 emoji hung over its head — that works
for every pet, including emoji-only ones.

For extra charm, give it a dedicated descent sprite — your character
holding balloons, an umbrella, a parachute…:

```jsonc
"balloonImage": "./images/kitty-balloon.png"
```

- Run it through `npm run strip-bg` too.
- Landscape images are fine — the descent sprite gets a slightly wider
  box than the walking sprite, and aspect ratio is preserved.
- `balloonImage` only applies to pets that have an `image`; if the path is
  missing or broken the pet just uses the 🎈 fallback.

## 5. Reload

Menu bar 🐾 → **reload config**. No restart needed — the pet swaps
in place.

## Troubleshooting

| Symptom | Cause / fix |
| --- | --- |
| Pet is inside a white box | Background isn't transparent — see step 2. |
| Pet shows an emoji instead of my image | Image path is wrong or unreadable; a config warning notification lists the resolved path it tried. |
| Pet is tiny / huge | Adjust `scale` in `pets.json`. |
| Descent shows 🎈 instead of my balloon sprite | `balloonImage` path is missing/broken, or the pet has no `image`. |
| Nothing changed after editing `pets.json` | Menu bar 🐾 → reload config (or check the JSON is valid). |

## A little zoo, for inspiration

```jsonc
"pets": [
  { "name": "frontend", "project": "~/work/web",  "image": "./images/fox.png",  "scale": 1.2 },
  { "name": "backend",  "project": "~/work/api",  "image": "./images/crab.png", "balloonImage": "./images/crab-balloon.png" },
  { "name": "sandbox",  "project": "~/scratch",   "emoji": "🐸", "speed": 1.5 }
]
```

Each pet walks, carries its own HUD, and opens its own project — click the
one whose codebase you want to dive into.
