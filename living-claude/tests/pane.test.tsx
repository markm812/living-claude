import { expect, test } from 'claude-code/testing'
import { MASCOTS, framesOf } from '../hooks/register'

const PANE = {
  plugin: 'living-claude',
  component: 'Pane',
  requestId: 'living-claude',
  viewport: { columns: 120, rows: 40 },
  props: {
    title: "Sprout's Guild · Sprout",
    isFocused: false,
    bodyColumns: 100,
    placement: 'inline',
    scroll: { offset: 0, bodyRows: 18 },
    view: {},
  },
} as const

// Nothing sits beneath the plugin in a test: this stands for the engine's clock.
const beneath = (on: any) => on('clock.every', () => ({ value: { cancel: () => {} } }))

test('the pane draws the scene, and no cell inks a half block in the default colour', async ($, on) => {
  beneath(on)

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  const raster = await ui.find({ key: 'scene' })

  expect(raster?.type).toBe('Raster')
  // A scene is 48x16 pixels; 100 columns and 18 rows of room double it.
  expect(raster?.props.rows).toBe(16)
  expect(raster?.props.columns).toBe(96)

  const bytes = atob(String(raster?.props.cells))
  expect(bytes.length).toBe(96 * 16 * 12)
  const word = (at: number) =>
    bytes.charCodeAt(at) | (bytes.charCodeAt(at + 1) << 8) | (bytes.charCodeAt(at + 2) << 16) | (bytes.charCodeAt(at + 3) << 24)

  const CLEAR = 0x01000000
  let blank = 0
  for (let at = 0; at < bytes.length; at += 12) {
    const glyph = word(at)
    const foreground = word(at + 4)
    if (glyph === 0x20) {
      blank += 1
      expect(foreground).toBe(CLEAR)
    } else {
      // 0x01000000 is the terminal's text colour, so an inked glyph must never carry it.
      expect([0x2580, 0x2584]).toContain(glyph)
      expect(foreground).not.toBe(CLEAR)
    }
  }
  expect(blank).toBeGreaterThan(0)

  await ui.unmount()
})

test('every class draws all thirty-two frames on the grid the band expects', () => {
  expect(MASCOTS.length).toBe(14)
  expect(new Set(MASCOTS.map(m => m.name)).size).toBe(14)

  for (const m of MASCOTS) {
    const frames = framesOf(m)
    expect(frames.length).toBe(32)
    for (const [n, grid] of frames.entries()) {
      // A scene that drew nothing, or drew a colour the palette has no entry
      // for, would come out as an empty band rather than as a failure.
      const where = `${m.name} frame ${n}`
      const ink = grid.flat().filter(c => c !== '.')
      expect([where, grid.length]).toEqual([where, 16])
      expect([where, grid.every(row => row.length === 48)]).toEqual([where, true])
      expect([where, ink.length > 0]).toEqual([where, true])
      expect([where, ink.every(c => 'odkwpymrgbBsSGPhLn'.includes(c))]).toEqual([where, true])
    }
  }
})

test('a pane too narrow for the scene says so instead of drawing a frozen robot', async ($, on) => {
  beneath(on)

  const ui = await $.ui.mount({
    ...PANE,
    surface: 'terminal',
    props: { ...PANE.props, placement: 'dock', bodyColumns: 44 },
  })

  expect(await ui.find({ key: 'scene' })).toBeUndefined()
  expect((await ui.find({ type: 'Text' }))?.text).toBe('Too small for the scene.')

  await ui.unmount()
})

test('a render too small drops the scene, and a later wide one brings it back', async ($, on) => {
  beneath(on)

  const wide = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect((await wide.find({ key: 'scene' }))?.props.columns).toBe(96)
  await wide.unmount()

  const narrow = await $.ui.mount({ ...PANE, surface: 'terminal', props: { ...PANE.props, bodyColumns: 44 } })
  expect(await narrow.find({ key: 'scene' })).toBeUndefined()
  await narrow.unmount()

  const again = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect((await again.find({ key: 'scene' }))?.props.columns).toBe(96)
  await again.unmount()
})

test('a surface without a Raster says so', async ($, on) => {
  beneath(on)

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })

  expect(await ui.find({ key: 'scene' })).toBeUndefined()
  expect((await ui.find({ type: 'Text' }))?.text).toBe('The scene needs a terminal.')

  await ui.unmount()
})

test("the person's prompt opens the pane on a class, and the band outlasts the turn while background work runs", async ($, on) => {
  const opened: string[] = []
  const titles: string[] = []
  const closed: string[] = []
  beneath(on)
  on('ui.open', (_: any, e: any) => {
    opened.push(e.id)
    titles.push(e.title)

    return { value: { isPlaced: true } }
  })
  on('ui.close', (_: any, e: any) => {
    closed.push(e.id)

    return { value: undefined }
  })
  on('prompt.submit', (_: any, e: any) => ({ text: e.text }))
  on('turn.complete', (_: any, e: any) => ({ text: e.answer }))
  on('classic.Stop', () => ({}))
  on('session.start', (_: any, e: any) => ({ cwd: e.cwd }))

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.prompt.submit({ text: 'haul something' } as any)
  expect(opened).toEqual(['living-claude'])
  expect(MASCOTS.map(m => `Sprout's Guild · ${m.name}`)).toContain(titles[0])

  await $.turn.complete({
    turnId: 't1',
    answer: 'done',
    durationMs: 10,
    isAborted: false,
    reason: 'answer',
  } as any)
  expect(closed).toEqual([])

  const shell = [{ id: 'b1', type: 'shell', status: 'running', description: 'a build' }]
  await $.classic.Stop({ stop_hook_active: false, background_tasks: shell } as any)
  expect(closed).toEqual([])

  await $.classic.Stop({ stop_hook_active: false, background_tasks: [] } as any)
  expect(closed).toEqual(['living-claude'])
})

test('work the engine never clears costs the band one turn, not the session', async ($, on) => {
  const closed: string[] = []
  beneath(on)
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.close', (_: any, e: any) => {
    closed.push(e.id)

    return { value: undefined }
  })
  on('prompt.submit', (_: any, e: any) => ({ text: e.text }))
  on('classic.Stop', () => ({}))
  on('session.start', (_: any, e: any) => ({ cwd: e.cwd }))
  const parked = [{ id: 'b1', type: 'shell', status: 'running', description: 'a dev server' }]

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.prompt.submit({ text: 'start the server' } as any)
  await $.classic.Stop({ stop_hook_active: false, background_tasks: parked } as any)
  expect(closed).toEqual([])

  await $.classic.Stop({ stop_hook_active: false, background_tasks: parked } as any)
  expect(closed).toEqual(['living-claude'])
})

test("a Stop raised inside a subagent leaves the main turn's band up", async ($, on) => {
  const closed: string[] = []
  beneath(on)
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.close', (_: any, e: any) => {
    closed.push(e.id)

    return { value: undefined }
  })
  on('prompt.submit', (_: any, e: any) => ({ text: e.text }))
  on('classic.Stop', () => ({}))
  on('session.start', (_: any, e: any) => ({ cwd: e.cwd }))

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.prompt.submit({ text: 'delegate it' } as any)
  await $.classic.Stop({ stop_hook_active: false, agent_id: 'a1', background_tasks: [] } as any)
  expect(closed).toEqual([])
})

test('an interrupted turn closes the band, which raises no Stop to close it', async ($, on) => {
  const closed: string[] = []
  beneath(on)
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.close', (_: any, e: any) => {
    closed.push(e.id)

    return { value: undefined }
  })
  on('prompt.submit', (_: any, e: any) => ({ text: e.text }))
  on('turn.complete', (_: any, e: any) => ({ text: e.answer }))
  on('session.start', (_: any, e: any) => ({ cwd: e.cwd }))

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.prompt.submit({ text: 'haul something' } as any)
  await $.turn.complete({ turnId: 't1', answer: '', durationMs: 10, isAborted: true, reason: 'aborted' } as any)
  expect(closed).toEqual(['living-claude'])
})

test('a prompt queued over a running turn keeps the band it has, and the turn it starts gets its own', async ($, on) => {
  const titles: string[] = []
  const closed: string[] = []
  beneath(on)
  on('ui.open', (_: any, e: any) => {
    titles.push(e.title)

    return { value: { isPlaced: true } }
  })
  on('ui.close', (_: any, e: any) => {
    closed.push(e.id)

    return { value: undefined }
  })
  on('prompt.submit', (_: any, e: any) => ({ text: e.text }))
  on('turn.start', (_: any, e: any) => ({ turnId: e.turnId }))
  on('turn.complete', (_: any, e: any) => ({ text: e.answer }))
  on('classic.Stop', () => ({}))
  on('session.start', (_: any, e: any) => ({ cwd: e.cwd }))
  // An answered turn is closed by its Stop, not by turn.complete.
  const ends = async (turnId: string) => {
    await $.turn.complete({ turnId, answer: 'done', durationMs: 10, isAborted: false, reason: 'answer' } as any)
    await $.classic.Stop({ stop_hook_active: false, background_tasks: [] } as any)
  }

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.prompt.submit({ text: 'first' } as any)
  await $.turn.start({ text: 'first', turnId: 't1' } as any)
  expect(titles.length).toBe(1)

  // Typed over the running turn: queued, and the band must keep its class.
  await $.prompt.submit({ text: 'second', turnId: 't1' } as any)
  expect(titles.length).toBe(1)

  await ends('t1')
  expect(closed).toEqual(['living-claude'])

  // The queued prompt's own turn raises no second prompt.submit, so the band
  // has to come back from turn.start.
  await $.turn.start({ text: 'second', turnId: 't2' } as any)
  expect(titles.length).toBe(2)

  // A subagent's turn rides the band the main turn already has, and its end
  // leaves that band up.
  await $.turn.start({ text: 'sub', turnId: 't3', agentId: 'a1' } as any)
  expect(titles.length).toBe(2)
  await $.turn.complete({ turnId: 't3', agentId: 'a1', answer: 'sub done', durationMs: 10, isAborted: false, reason: 'answer' } as any)
  expect(closed).toEqual(['living-claude'])

  await ends('t2')
  expect(closed).toEqual(['living-claude', 'living-claude'])
})
