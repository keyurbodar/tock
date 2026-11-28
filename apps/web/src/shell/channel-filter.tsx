import { createSignal, For, Show } from "solid-js"
import { createMenuController, Menu, MenuContent, MenuItem, MenuSeparator, MenuSub, MenuSubContent, MenuSubTrigger, MenuTrigger } from "@ui-sdk/solid/menu"
import { Icon } from "@tock/ui/icon"
import { MorphIcon } from "@tock/ui/morph-icon"
import { tokens } from "@tock/tokens"

/**
 * The Channels filter, Claude's way: one menu off the filter button, each row naming a setting and showing its value on the
 * right, opening a submenu of choices with a check on the current one. Status and last activity narrow the list, sort and
 * group order it, and archived channels can be shown under their own heading. Settings persist per browser.
 */
export type Status = "all" | "unread" | "working" | "needs" | "done"
export type Activity = "all" | "today" | "week" | "month"
export type Sort = "activity" | "created" | "name"
export type Group = "none" | "status" | "date"
export type ChannelView = { status: Status; activity: Activity; sort: Sort; group: Group; archived: boolean }

const DEFAULT: ChannelView = { status: "all", activity: "all", sort: "activity", group: "none", archived: true }
const KEY = "tock.channel-view"
const load = (): ChannelView => {
  try {
    return { ...DEFAULT, ...(JSON.parse(localStorage.getItem(KEY) ?? "{}") as Partial<ChannelView>) }
  } catch {
    return DEFAULT
  }
}
const [view, setViewSignal] = createSignal<ChannelView>(load())
export { view as channelView }
export const setChannelView = (patch: Partial<ChannelView>) => {
  const next = { ...view(), ...patch }
  setViewSignal(next)
  try {
    localStorage.setItem(KEY, JSON.stringify(next))
  } catch {}
}
export const filtering = () => view().status !== "all" || view().activity !== "all"
export const resetChannelView = () => setChannelView({ status: "all", activity: "all" })

const STATUS: [Status, string][] = [["all", "All"], ["unread", "Unread"], ["working", "Working"], ["needs", "Needs you"], ["done", "Done"]]
const ACTIVITY: [Activity, string][] = [["all", "All"], ["today", "Today"], ["week", "Last 7 days"], ["month", "Last 30 days"]]
const SORT: [Sort, string][] = [["activity", "Last activity"], ["created", "Created"], ["name", "Name"]]
const GROUP: [Group, string][] = [["none", "None"], ["status", "Status"], ["date", "Date"]]
const label = <T extends string>(list: [T, string][], value: T) => list.find(([v]) => v === value)?.[1] ?? ""

const controller = createMenuController<undefined>()

function Setting<T extends string>(props: { name: string; field: keyof ChannelView; list: [T, string][]; value: T }) {
  return (
    <MenuSub delay={tokens.motion.duration["submenu-rest"]}>
      <MenuSubTrigger class="tds-menu-item tds-menu-sub tds-fm-row">
        <span class="tds-fm-name">{props.name}</span>
        <span class="tds-fm-value">{label(props.list, props.value)}</span>
        <Icon name="caret-right" size="chip" class="tds-menu-caret" />
      </MenuSubTrigger>
      <MenuSubContent class="tds-menu tds-menu-subcontent tds-over tds-fm">
        <For each={props.list}>
          {([value, text]) => (
            <MenuItem value={`${String(props.field)}:${value}`} class="tds-menu-item tds-fm-choice" data-on={props.value === value ? "" : undefined}>
              <span>{text}</span>
              <span class="tds-fm-check" aria-hidden="true">
                <Show when={props.value === value}>
                  <Icon name="check" size="chip" />
                </Show>
              </span>
            </MenuItem>
          )}
        </For>
      </MenuSubContent>
    </MenuSub>
  )
}

export function ChannelFilterButton() {
  const run = (action: string) => {
    if (action === "archived") return setChannelView({ archived: !view().archived })
    if (action === "reset") return setChannelView({ ...DEFAULT })
    const [field, value] = action.split(":") as [keyof ChannelView, string]
    setChannelView({ [field]: value } as Partial<ChannelView>)
  }
  return (
    <>
      <MenuTrigger
        controller={controller}
        class="tds-ib"
        data-size="sec"
        data-filter-active={filtering() ? "" : undefined}
        aria-label="Filter and sort channels"
        data-tip=""
        data-tip-side="bottom"
      >
        <MorphIcon name="filter" size="bar" />
        <span class="tds-fm-dot" aria-hidden="true" />
      </MenuTrigger>
      <Menu controller={controller} onAction={(value) => run(String(value))}>
        <MenuContent class="tds-menu tds-over tds-fm" data-edge-fade="y" align="start" sideOffset={tokens.size["menu-offset"]}>
          <Setting name="Status" field="status" list={STATUS} value={view().status} />
          <Setting name="Last activity" field="activity" list={ACTIVITY} value={view().activity} />
          <MenuSeparator class="tds-menu-sep" />
          <Setting name="Group by" field="group" list={GROUP} value={view().group} />
          <Setting name="Sort by" field="sort" list={SORT} value={view().sort} />
          <MenuSeparator class="tds-menu-sep" />
          <MenuItem value="archived" class="tds-menu-item tds-fm-row">
            <span class="tds-fm-name">Archived</span>
            <span class="tds-fm-value">{view().archived ? "Shown" : "Hidden"}</span>
          </MenuItem>
          <Show when={filtering() || view().sort !== DEFAULT.sort || view().group !== DEFAULT.group}>
            <MenuItem value="reset" class="tds-menu-item tds-fm-row">
              <span class="tds-fm-name">Reset</span>
            </MenuItem>
          </Show>
        </MenuContent>
      </Menu>
    </>
  )
}
