# living-claude

While a turn runs, a pixel band sits above the prompt: one of Sprout's fourteen
guild classes, drawn at random and animated until the turn ends.

Each class is a 48x16 pixel scene over a 32 frame loop, painted into a terminal
`Raster` with half-block glyphs — two pixels to a cell. The band opens on your
prompt, keeps its class for the whole turn (a prompt typed over a running turn
does not swap it), and closes when the turn answers.

The fourteen: Sprout, Miner, Hauler, Swordsman, Wizard, Archer, Smith, Cook,
Bard, Fisherman, Sailor, Bartender, Farmer, Wagoner.

## Install

```
claude plugin install living-claude@mods
```

Terminal only. Any other surface gets a line of text instead, and so does a pane
narrower than 48 columns or shorter than the scene.

## Develop

```
claude plugin test living-claude
claude plugin validate living-claude
```

`.claude-plugin/types/` holds the `claude-code` type stubs the hooks module
compiles against, and is deliberately untracked — Claude Code regenerates it
when the plugin is installed or loaded. A fresh clone therefore has no stubs,
so `tsc` cannot resolve `h`, `Fragment`, `Register` or `Timer` until you install
the plugin once. The tests do not typecheck, so `claude plugin test` runs on a
bare clone regardless.

## License

MIT — see [LICENSE](../LICENSE).
