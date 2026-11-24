import { cases } from "../case"
import { BrandIcon, modelMarkOf } from "../../src/brand-icon"
import { Button } from "../../src/button"
import { glyphs } from "../../src/glyph"
import { MenuItemBody, MenuSeparator, menuItemClass } from "../../src/menu"
import { ModelTriggerLabel } from "../../src/model-picker"

const logout = (
  <svg aria-hidden="true" width="24px" height="24px" viewBox="0 0 24 24" fill="none">
    {["M3 21L21 21", "M5 21V6C5 4.34315 6.34315 3 8 3H16C17.6569 3 19 4.34315 19 6V21", "M8 12H9"].map((d) => (
      <path key={d} d={d} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    ))}
  </svg>
)

export default cases("Composer", [
  [
    "W3y4qPfyMq|[aria-label=Model]|0",
    "model trigger with brand, name and reasoning level",
    () => (
      <Button variant="ghost" data-slot="tooltip-trigger" aria-label="Model" aria-keyshortcuts="Alt+/" aria-haspopup="dialog" aria-expanded={false} tabIndex={0}>
        <ModelTriggerLabel brand={<BrandIcon provider={modelMarkOf("Claude Opus 5.5") ?? "anthropic"} name="anthropic" className="mx-0! size-(--icon-sm)" />} name="Claude Opus 5.5" level="Medium" />
      </Button>
    ),
  ],
  [
    "azXNwnLW_K|[role=menu] [role=menuitem]|0",
    "menu item with icon and shortcut",
    () => (
      <div role="menuitem" tabIndex={-1} data-slot="menu-item" className={menuItemClass()}>
        <MenuItemBody icon={glyphs.attach} shortcut="⌘/">
          Upload attachment
        </MenuItemBody>
      </div>
    ),
  ],
  [
    "2lZ3-7a2v5|[data-slot=menu-item][data-intent=danger]|0",
    "danger menu item with icon",
    () => (
      <div role="menuitem" tabIndex={-1} data-slot="menu-item" data-intent="danger" className={menuItemClass(true)}>
        <MenuItemBody icon={logout}>Log out</MenuItemBody>
      </div>
    ),
  ],
  ["azXNwnLW_K|[role=menu] [data-slot=menu-separator]|0", "menu separator", () => <MenuSeparator />],
])
