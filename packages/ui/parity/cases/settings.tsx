import { cases } from "../case"
import { Card, Section, SettingsRow } from "../../src/card"
import { MENU_LABEL, MenuCheck, MenuSearch, menuItemClass } from "../../src/menu"
import { MenuSelectButton } from "../../src/menu-select"
import { Switch } from "../../src/switch"

const noop = () => {}

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
])
