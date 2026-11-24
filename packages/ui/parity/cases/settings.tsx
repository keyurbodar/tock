import type { CSSProperties } from "react"
import { cases } from "../case"
import { Card, Section, SettingsRow } from "../../src/card"
import { MENU_LABEL, MenuCheck, MenuSearch, menuItemClass } from "../../src/menu"
import { MenuSelectButton } from "../../src/menu-select"
import { Slider } from "../../src/slider"
import { Switch } from "../../src/switch"
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
])
