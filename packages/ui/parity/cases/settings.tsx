import type { CSSProperties } from "react"
import { cases } from "../case"
import { Button } from "../../src/button"
import { Card, ListCardHeader, Section, SettingsRow } from "../../src/card"
import { glyphs } from "../../src/glyph"
import { MENU_LABEL, MenuCheck, MenuSearch, menuItemClass } from "../../src/menu"
import { MenuSelectButton } from "../../src/menu-select"
import { Slider } from "../../src/slider"
import { Switch } from "../../src/switch"
import { Input } from "../../src/input"
import { KeybindingButton } from "../../src/keybinding"
import { TableCell, TableGroup, TableHead, TableHeader } from "../../src/table"
import { ModeButton, SplitPreview, SwatchChoice, ThemePreview } from "../../src/theme-swatch"

const noop = () => {}

const tokens = (bg: string, fg: string, primary: string, ink: string) =>
  ({ "--bg": bg, "--fg": fg, "--text": fg, "--primary": primary, "--primary-text": "#ffffff", "--shader-ink": ink }) as CSSProperties

const LIGHT = tokens("#f2f2f4", "#1e1e20", "#3b5de8", "#778abd")
const DARK = tokens("#09090a", "#ebebec", "#21a388", "#566a9e")

const preview = (mode: "light" | "dark", style = mode === "light" ? LIGHT : DARK) => (
  <ThemePreview mode={mode} theme="editor-preview" style={style} />
)

const sliderRow = (label: string, max: number, value: number, text: string) => (
  <SettingsRow title={label}>
    <Slider label={label} max={max} value={value} valueText={text} onChange={noop} />
  </SettingsRow>
)

const INPUT_ROWS = [
  ["submit-on-enter", "Enter behavior", "What pressing Enter does mid-run; Newline keeps ⌘/Ctrl+Enter and ⌥/Alt+Enter sends", "Steer", "w-32"],
  ["submit-on-mod-enter", "⌘/Ctrl+Enter behavior", "What pressing ⌘/Ctrl+Enter does mid-run", "Interrupt", "w-32"],
  ["submit-on-alt-enter", "⌥/Alt+Enter behavior", "What pressing ⌥/Alt+Enter does mid-run", "Queue", "w-32"],
  ["voice-microphone", "Microphone", "Used for voice input on this device", "System default", "w-56"],
] as const

export default cases("settings", [
  [
    "neCzrQIJd2|[data-slot=menu-select-trigger]|0",
    "select trigger",
    () => (
      <MenuSelectButton role="combobox" aria-haspopup="listbox" aria-expanded={false} tabIndex={0} className="w-32">
        Hybrid
      </MenuSelectButton>
    ),
  ],
  [
    "neCzrQIJd2|[data-slot=settings-row]:has([data-slot=menu-select-trigger])|0",
    "settings row with description and select",
    () => (
      <SettingsRow id="sidebar-layout" title="Sidebar layout" description="Hybrid shows Captains above threads, Split shows one at a time">
        <MenuSelectButton role="combobox" aria-haspopup="listbox" aria-expanded={false} tabIndex={0} className="w-32">
          Hybrid
        </MenuSelectButton>
      </SettingsRow>
    ),
  ],
  [
    "neCzrQIJd2|div.max-w-3xl > section|1",
    "section with heading, card and four select rows",
    () => (
      <Section title="Input">
        <Card>
          {INPUT_ROWS.map(([id, title, description, label, width]) => (
            <SettingsRow key={id} id={id} title={title} description={description}>
              <MenuSelectButton role="combobox" aria-haspopup="listbox" aria-expanded={false} tabIndex={0} className={width}>
                {label}
              </MenuSelectButton>
            </SettingsRow>
          ))}
        </Card>
      </Section>
    ),
  ],
  [
    "neCzrQIJd2|[data-slot=settings-row]:has([role=switch][data-unchecked])|0",
    "settings row with switch off",
    () => (
      <SettingsRow id="sidebar-page-rows" title="Pages at top" description="List pages like Issues and Pull requests above Captains and threads">
        <Switch aria-label="Pages at top" checked={false} />
      </SettingsRow>
    ),
  ],
  [
    "neCzrQIJd2|[data-slot=settings-row]:has([role=switch][data-checked])|0",
    "settings row with switch on",
    () => (
      <SettingsRow
        id="scroll-new-messages-to-top"
        title="Scroll new messages to top"
        description="Keep your latest message at the top of the chat as the reply streams in below it"
      >
        <Switch aria-label="Scroll new messages to top" checked />
      </SettingsRow>
    ),
  ],
  [
    "p2AvOpYcqz|[data-slot=menu-content]:has(input[aria-label*=timezones]) [data-slot=menu-search-row]|0",
    "menu search row",
    () => <MenuSearch label="Search timezones" value="" onValueChange={noop} />,
  ],
  [
    "p2AvOpYcqz|[data-slot=menu-content]:has(input[aria-label*=timezones]) [data-slot=menu-item]:has(> svg)|0",
    "checked menu item",
    () => (
      <div role="menuitem" tabIndex={-1} data-slot="menu-item" className={menuItemClass()}>
        <span className={MENU_LABEL}>Asia/Calcutta</span>
        <MenuCheck />
      </div>
    ),
  ],
  [
    "cCozgJ4FFz|[id=theme]|0",
    "mode row with system, light and dark previews",
    () => (
      <SettingsRow id="theme" title="Mode" fill>
        <div role="group" aria-label="Mode" className="flex min-w-0 gap-4">
          <ModeButton label="System" pressed={false} onSelect={noop}>
            <SplitPreview light={preview("light")} dark={preview("dark")} />
          </ModeButton>
          <ModeButton label="Light" pressed={false} onSelect={noop}>
            {preview("light")}
          </ModeButton>
          <ModeButton label="Dark" pressed onSelect={noop}>
            {preview("dark")}
          </ModeButton>
        </div>
      </SettingsRow>
    ),
  ],
  [
    "cCozgJ4FFz|[role=radio][aria-checked=false]|0",
    "theme choice",
    () => (
      <SwatchChoice label="Capy" checked={false} onSelect={noop}>
        {preview("dark", tokens("#09090a", "#ebebec", "#456af6", "#566a9e"))}
      </SwatchChoice>
    ),
  ],
  [
    "cCozgJ4FFz|[role=radio][aria-checked=true]|0",
    "theme choice, selected",
    () => (
      <SwatchChoice label="Classic" checked onSelect={noop}>
        {preview("dark")}
      </SwatchChoice>
    ),
  ],
  ["cCozgJ4FFz|[data-slot=settings-row]:has(input[aria-label=Brightness])|0", "slider row at half", () => sliderRow("Brightness", 200, 100, "100%")],
  ["cCozgJ4FFz|[data-slot=settings-row]:has(input[aria-label=Blur])|0", "slider row at zero", () => sliderRow("Blur", 24, 0, "0px")],
  ["cCozgJ4FFz|[data-slot=settings-row]:has(input[aria-label^=Image])|0", "slider row at full", () => sliderRow("Image opacity", 100, 100, "100%")],
  [
    "cCozgJ4FFz|[id=background-effect]|0",
    "settings row with select and no description",
    () => (
      <SettingsRow id="background-effect" title="Background effect">
        <MenuSelectButton role="combobox" aria-haspopup="listbox" aria-expanded={false} tabIndex={0} className="w-32">
          Dither
        </MenuSelectButton>
      </SettingsRow>
    ),
  ],
  [
    "ODpLEfAwFP|[id=my-connections] [data-slot=card-list-header]|0",
    "list card header with count and add button",
    () => (
      <ListCardHeader
        divided
        title="3 connections"
        actions={
          <Button variant="ghost" size="icon-sm" aria-label="Add connection" title="Add connection">
            {glyphs.add}
          </Button>
        }
      />
    ),
  ],
  ["ODpLEfAwFP|div.max-w-3xl [role=columnheader]|1", "table header cell, numeric", () => <TableHead numeric>Context</TableHead>],
  ["ODpLEfAwFP|div.max-w-3xl [role=columnheader]|5", "table header cell", () => <TableHead>Reasoning</TableHead>],
  ["ODpLEfAwFP|div.max-w-3xl [role=cell]|1", "table cell, numeric", () => <TableCell numeric>1M</TableCell>],
  [
    "ODpLEfAwFP|div.max-w-3xl [role=cell]|5",
    "table cell, reasoning range",
    () => <TableCell className="text-muted-foreground">low-max</TableCell>,
  ],
  [
    "ODpLEfAwFP|div.max-w-3xl [role=cell]|6",
    "table cell, served by",
    () => (
      <TableCell>
        <span className="flex max-w-full min-w-0 items-center gap-1.5">
          <span className="max-w-full shrink-0 truncate">Capy credits</span>
        </span>
      </TableCell>
    ),
  ],
  [
    "5fVhyCBDQk|section [data-slot=input-group]|0",
    "search field with icon",
    () => <Input icon={glyphs.search} placeholder="Search shortcuts" aria-label="Search shortcuts" value="" onChange={noop} />,
  ],
  [
    "5fVhyCBDQk|div.justify-between.gap-6 > button|0",
    "ghost button, disabled",
    () => (
      <Button variant="ghost" size="base" disabled>
        Reset all
      </Button>
    ),
  ],
  [
    "5fVhyCBDQk|[role=table] > [role=row]|0",
    "table header row",
    () => (
      <TableHeader>
        <TableHead>Command</TableHead>
        <TableHead>Keybinding</TableHead>
        <TableHead>When</TableHead>
        <TableHead aria-hidden />
      </TableHeader>
    ),
  ],
  ["5fVhyCBDQk|[role=table] > [role=row]|1", "table group row with count", () => <TableGroup label="General" count={49} />],
  [
    "5fVhyCBDQk|[role=table] > [role=row]:nth-child(3) > [role=cell]|0",
    "table cell, command name",
    () => <TableCell className="text-sm font-medium text-foreground">Open command menu</TableCell>,
  ],
  [
    "5fVhyCBDQk|[role=table] > [role=row]:nth-child(3) > [role=cell]|1",
    "table cell, keybinding button",
    () => (
      <TableCell>
        <KeybindingButton aria-label="Edit shortcut for Open command menu" bindings={[["Ctrl", "K"]]} />
      </TableCell>
    ),
  ],
  [
    "5fVhyCBDQk|[role=table] > [role=row]:nth-child(3) > [role=cell]|2",
    "table cell, when",
    () => <TableCell className="text-xs text-muted-foreground-1">Always</TableCell>,
  ],
])
