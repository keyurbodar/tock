import type { CSSProperties, ReactNode } from "react"
import { cases } from "../case"
import { Button, ButtonIcon } from "../../src/button"
import { Card, ListCardHeader, ListRow, Section, SettingsRow, SettingsRowLink } from "../../src/card"
import { BackLink, FormLabel, FormRow, RadioCards } from "../../src/form"
import { ChromeMark, glyphs } from "../../src/glyph"
import { MENU_LABEL, MenuCheck, MenuSearch, menuItemClass } from "../../src/menu"
import { MenuSelectButton } from "../../src/menu-select"
import { Slider } from "../../src/slider"
import { Switch } from "../../src/switch"
import { Badge, Input } from "../../src/input"
import { KeybindingButton } from "../../src/keybinding"
import { TableCell, TableGroup, TableHead, TableHeader } from "../../src/table"
import { ModeButton, SplitPreview, SwatchChoice, ThemePreview } from "../../src/theme-swatch"

const noop = () => {}

const SELECT_FORM_INPUT: CSSProperties = {
  clip: "rect(0px, 0px, 0px, 0px)",
  overflow: "hidden",
  whiteSpace: "nowrap",
  position: "fixed",
  top: 0,
  left: 0,
  border: 0,
  padding: 0,
  width: 1,
  height: 1,
  margin: -1,
}

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

const thisDevice = (text: string) => (
  <span className="flex items-center gap-2">
    {text}
    <Badge tone="accent">This device</Badge>
  </span>
)

const devices = (title: ReactNode, description: ReactNode, action: string) => (
  <Section title="Devices" description="Push reaches these browsers and installed apps even when Capy is closed">
    <Card>
      <ListRow icon={<ChromeMark />} title={title} description={description}>
        <Button size="sm">{action}</Button>
      </ListRow>
    </Card>
  </Section>
)

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
  [
    "sHDURlDUwx|[id=system-notifications]|0",
    "notifications, system notifications switch row",
    () => (
      <SettingsRow
        id="system-notifications"
        title="System notifications"
        description="Show a system notification when a thread finishes or needs you"
      >
        <Switch aria-label="System notifications" checked={false} onCheckedChange={noop} />
      </SettingsRow>
    ),
  ],
  [
    "sHDURlDUwx|[id=test-notification]|0",
    "notifications, test notification row",
    () => (
      <SettingsRow id="test-notification" title="Test notification" description="Ring this device the way a finished thread would">
        <Button variant="ghost" size="sm">
          Send test notification
        </Button>
      </SettingsRow>
    ),
  ],
  [
    "sHDURlDUwx|section|3",
    "notifications, devices section with badge beside the status",
    () => devices("Chrome on Linux", thisDevice("Not receiving push"), "Enable"),
  ],
  [
    "W-8s6LsNeN|section|3",
    "notifications, devices section with badge beside the name",
    () => devices(thisDevice("Chrome on Mac"), "Not receiving push", "Enable on this device"),
  ],
  [
    "WVoFiCsWN5|[data-slot=settings-row-link]|2",
    "connections, server row link with tool count and connected badge",
    () => (
      <SettingsRowLink href="/settings/mcp/01M7FWCMS4FBPD9SD5Z71G0NBF" icon={glyphs.server} title="xeffect" description="MCP server · 9 tools">
        <Badge tone="success" className="max-sm:hidden">
          {glyphs.circleCheckLine}
          Connected
        </Badge>
      </SettingsRowLink>
    ),
  ],
  [
    "Je1FzkdWdR|[role=radiogroup]|0",
    "connections, authentication choice cards",
    () => (
      <RadioCards
        label="Authentication"
        value="none"
        onChange={noop}
        options={[
          { value: "oauth", title: "Sign in", description: "Members sign in through the server's own login before Capy can use it" },
          { value: "key", title: "API key", description: "A token Capy sends as a header on every request" },
          { value: "none", title: "No sign-in", description: "The server accepts requests without credentials" },
        ]}
      />
    ),
  ],
  [
    "MKpswnbA_e|[data-slot=settings-row]|1",
    "connections, status row with badge and test",
    () => (
      <SettingsRow title="Status" description="9 tools, checked 52m ago" className="max-sm:flex-col max-sm:items-start">
        <Badge tone="success">
          {glyphs.circleCheckLine}
          Connected
        </Badge>
        <Button variant="ghost" size="sm">
          {glyphs.pulse}
          Test
        </Button>
        <Button variant="ghost" size="icon-sm" aria-label="Server actions" aria-expanded={false} aria-haspopup="menu" data-slot="menu-trigger" tabIndex={0}>
          <ButtonIcon side="only">{glyphs.more}</ButtonIcon>
        </Button>
      </SettingsRow>
    ),
  ],
  [
    "MKpswnbA_e|main header a|0",
    "connections, back link",
    () => (
      <BackLink href="https://capy.ai/settings/mcp" aria-current="page" data-status="active" className="active">
        MCP &amp; plugins
      </BackLink>
    ),
  ],
  [
    "Je1FzkdWdR|main [data-slot=card]:has([data-slot=menu-select-trigger][aria-label=Transport]) > div|0",
    "connections, form row with select",
    () => (
      <FormRow title="Transport" description="Capy speaks MCP over HTTP to a listening server">
        <MenuSelectButton role="combobox" aria-haspopup="listbox" aria-expanded={false} aria-label="Transport" tabIndex={0} className="w-40">
          Streamable HTTP
        </MenuSelectButton>
        <input aria-hidden tabIndex={-1} value="url" readOnly style={SELECT_FORM_INPUT} />
      </FormRow>
    ),
  ],
  [
    "Je1FzkdWdR|main [data-slot=card]:has([data-slot=menu-select-trigger][aria-label=Transport]) > label|0",
    "connections, ruled form label with input",
    () => (
      <FormLabel label="URL" ruled>
        <Input type="url" placeholder="https://mcp.example.com/mcp" aria-invalid={false} value="" onChange={noop} />
      </FormLabel>
    ),
  ],
])
