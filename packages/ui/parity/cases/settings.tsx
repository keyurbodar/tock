import { cases } from "../case"
import { SettingsRow } from "../../src/card"
import { MENU_LABEL, MenuCheck, MenuSearch, menuItemClass } from "../../src/menu"
import { MenuSelectButton } from "../../src/menu-select"

const noop = () => {}

const HIDDEN = {
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
} as const

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
        <input aria-hidden="true" tabIndex={-1} style={HIDDEN} defaultValue="hybrid" />
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
