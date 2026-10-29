# living-claude

A Claude Code plugin. While a turn runs, a pixel band sits above the prompt: one
of Sprout's fourteen guild classes, drawn at random and animated until the turn
ends.

Sprout, Miner, Hauler, Swordsman, Wizard, Archer, Smith, Cook, Bard, Fisherman,
Sailor, Bartender, Farmer, Wagoner.

Each is a 48x16 pixel scene over a 32 frame loop, painted into a terminal
`Raster` with half-block glyphs. No image assets — every frame is generated in
[`living-claude/hooks/register.tsx`](living-claude/hooks/register.tsx).

## Install

```
claude plugin install living-claude@mods
```

Terminal only. Any other surface gets a line of text instead.

See [`living-claude/README.md`](living-claude/README.md) for development and
testing.

## License

MIT — see [LICENSE](LICENSE).
