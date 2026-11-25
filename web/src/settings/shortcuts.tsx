import { Button } from "@tock/ui/button"
import { Page } from "@tock/ui/card"
import { glyphs } from "@tock/ui/glyph"
import { Input } from "@tock/ui/input"
import { KeybindingButton } from "@tock/ui/keybinding"
import { Menu, MenuContent, MenuItem, MenuTrigger } from "@tock/ui/menu"
import { Table, TableCell, TableGroup, TableHead, TableHeader, TableRow } from "@tock/ui/table"
import { toast } from "@tock/ui/toast"
import { useState, type KeyboardEvent } from "react"
import { APPLE } from "../lib/platform"
import { FormDialog } from "../shell/form-dialog"
import {
  bindingConflict,
  bindingFromPress,
  bindingParts,
  COMMANDS,
  isDefault,
  type CommandId,
  type Overrides,
} from "../shortcuts/keybindings"
import { saveOverrides, useBindings, useOverrides } from "../shortcuts/store"

const COLUMNS = "minmax(0,1.4fr) minmax(0,1.2fr) minmax(0,1fr) auto"

function save(next: Overrides) {
  try {
    saveOverrides(next)
    toast.success("Shortcuts saved")
  } catch {
    toast.error("Could not save the shortcut")
  }
}

export function Shortcuts() {
  const overrides = useOverrides()
  const bindings = useBindings()
  const [editing, setEditing] = useState<CommandId | null>(null)
  const [resetting, setResetting] = useState(false)
  const [query, setQuery] = useState("")
  const needle = query.trim().toLowerCase()
  const visible = COMMANDS.filter((entry) => entry.label.toLowerCase().includes(needle))

  const reset = (command: CommandId) => {
    const { [command]: _dropped, ...rest } = overrides
    save(rest)
  }

  const capture = (command: CommandId) => (event: KeyboardEvent) => {
    if (event.key === "Tab") return
    event.preventDefault()
    event.stopPropagation()
    if (event.key === "Escape") return setEditing(null)
    if (event.key === "Backspace") {
      save({ ...overrides, [command]: null })
      return setEditing(null)
    }
    const binding = bindingFromPress(event.nativeEvent, APPLE)
    if (binding === null) return
    const conflict = bindingConflict(binding, command, bindings, APPLE)
    if (conflict !== null) {
      toast.error(conflict)
      return setEditing(null)
    }
    if (isDefault(command, binding)) reset(command)
    else save({ ...overrides, [command]: [binding] })
    setEditing(null)
  }

  return (
    <Page title="Shortcuts">
      <section className="flex flex-col gap-5">
        <div className="flex items-center justify-between gap-6">
          <div className="w-full max-w-[300px]">
            <Input
              icon={glyphs.search}
              placeholder="Search shortcuts"
              aria-label="Search shortcuts"
              value={query}
              onChange={(event) => setQuery(event.currentTarget.value)}
            />
          </div>
          <Button variant="ghost" size="base" disabled={Object.keys(overrides).length === 0} onClick={() => setResetting(true)}>
            Reset all
          </Button>
        </div>
        <div className="-mx-4">
          <Table columns={COLUMNS}>
            <TableHeader>
              <TableHead>Command</TableHead>
              <TableHead>Keybinding</TableHead>
              <TableHead>When</TableHead>
              <TableHead aria-hidden />
            </TableHeader>
            <TableGroup label="General" count={visible.length} />
            {visible.map((entry) => {
              const keys = bindings.filter((binding) => binding.command === entry.command).map((binding) => binding.key)
              return (
                <TableRow key={entry.command}>
                  <TableCell className="text-sm font-medium text-foreground">{entry.label}</TableCell>
                  <TableCell>
                    {editing === entry.command ? (
                      <Input
                        autoFocus
                        data-keybinding-capture=""
                        size="sm"
                        placeholder="Press shortcut"
                        aria-label={`Record shortcut for ${entry.label}`}
                        value=""
                        readOnly
                        className="w-40"
                        onKeyDown={capture(entry.command)}
                        onBlur={() => setEditing(null)}
                      />
                    ) : (
                      <KeybindingButton
                        aria-label={`Edit shortcut for ${entry.label}`}
                        bindings={keys.flatMap((key) => {
                          const parts = bindingParts(key, APPLE)
                          return parts === null ? [] : [parts]
                        })}
                        onClick={() => setEditing(entry.command)}
                      />
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground-1">{"when" in entry ? entry.when : "Always"}</TableCell>
                  <TableCell className="justify-end">
                    <Menu>
                      <MenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={`Actions for ${entry.label}`} />}>
                        {glyphs.more}
                      </MenuTrigger>
                      <MenuContent align="end" className="w-44">
                        <MenuItem disabled={overrides[entry.command] === undefined} onSelect={() => reset(entry.command)}>
                          Reset to default
                        </MenuItem>
                        <MenuItem disabled={keys.length === 0} onSelect={() => save({ ...overrides, [entry.command]: null })}>
                          Unassign
                        </MenuItem>
                      </MenuContent>
                    </Menu>
                  </TableCell>
                </TableRow>
              )
            })}
            {visible.length === 0 ? (
              <div className="col-span-full flex items-center justify-center py-12 text-sm font-normal text-muted-foreground-2">
                No shortcuts match
              </div>
            ) : null}
          </Table>
        </div>
      </section>
      <FormDialog
        open={resetting}
        onOpenChange={setResetting}
        title="Reset all shortcuts?"
        description="Every command returns to its default keybinding"
        submitLabel="Reset all"
        onSubmit={async () => {
          save({})
          return true
        }}
      />
    </Page>
  )
}
