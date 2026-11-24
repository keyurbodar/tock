import { Button, ButtonIcon } from "@tock/ui/button"
import { ListCard, Page, Section } from "@tock/ui/card"
import { CollapsePanel } from "@tock/ui/form"
import { glyphs } from "@tock/ui/glyph"
import { Input, Label, Textarea } from "@tock/ui/input"
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from "@tock/ui/menu"
import {
  SideSheet,
  SideSheetActions,
  SideSheetBody,
  SideSheetClose,
  SideSheetContent,
  SideSheetDescription,
  SideSheetFooter,
  SideSheetHeader,
  SideSheetTitle,
} from "@tock/ui/side-sheet"
import { MaskedValueRow, VariableFields, type VariableDraft } from "@tock/ui/variable"
import { useState } from "react"
import { socket } from "../api/socket"
import type { SecretMeta } from "../api/types"
import { timeAgo } from "../lib/format"
import { act, useRemote } from "../lib/remote"
import { FormDialog } from "../shell/form-dialog"
import { AddButton, count } from "./lists"

interface Draft extends VariableDraft {
  readonly origin: string
}

const BLANK: Draft = { name: "", value: "", description: "", origin: "" }
const SITE_HINT = "The secret is only sent to this site"
const loadSecrets = () => socket.request<readonly SecretMeta[]>("vault.list")
const optional = (text: string) => text.trim() || undefined
const validSite = (origin: string) => origin.trim() === "" || (URL.canParse(origin.trim()) && new URL(origin.trim()).protocol === "https:")
const saved = (total: number) => `${count(total, "secret")} saved`

function SiteField({ id, value, onChange }: { id: string; value: string; onChange: (value: string) => void }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>
        Allowed site
        <span className="font-normal text-muted-foreground-2">Optional</span>
      </Label>
      <Input
        id={id}
        type="url"
        autoComplete="off"
        placeholder="https://api.github.com"
        aria-invalid={!validSite(value) || undefined}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      <p className="text-xs font-normal text-muted-foreground-2">{SITE_HINT}</p>
    </div>
  )
}

function AddSheet({
  open,
  onOpenChange,
  taken,
  onSaved,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  taken: ReadonlySet<string>
  onSaved: () => Promise<unknown>
}) {
  const [rows, setRows] = useState<readonly Draft[]>([BLANK])
  const [busy, setBusy] = useState(false)
  const names = rows.map((row) => row.name.trim())
  const clash = (index: number) => {
    const name = names[index] ?? ""
    return name !== "" && (taken.has(name) || names.indexOf(name) !== index) ? `${name} already exists` : undefined
  }
  const ready = rows.every((row, index) => row.name.trim() !== "" && row.value !== "" && validSite(row.origin) && clash(index) === undefined)
  const change = (index: number, next: Draft) => setRows(rows.map((row, at) => (at === index ? next : row)))
  const save = async () => {
    setBusy(true)
    const done = await act(async () => {
      for (const row of rows) {
        await socket.request("vault.set", {
          name: row.name.trim(),
          value: row.value,
          description: optional(row.description),
          origin: optional(row.origin),
        })
      }
      await onSaved()
    }, saved(rows.length))
    setBusy(false)
    if (done) onOpenChange(false)
  }
  return (
    <SideSheet open={open} onOpenChange={onOpenChange}>
      <SideSheetContent aria-label="Add secrets">
        <SideSheetHeader>
          <SideSheetTitle>Add secrets</SideSheetTitle>
          <SideSheetDescription className="flex flex-col">
            <span>Encrypted at rest and masked once saved</span>
          </SideSheetDescription>
        </SideSheetHeader>
        <SideSheetBody className="gap-5">
          <div className="flex flex-col gap-4">
            {rows.map((row, index) => (
              <VariableFields
                key={index}
                fieldId={(field) => `secret-sheet-${field}-${index}`}
                draft={row}
                onChange={(next) => change(index, { ...row, ...next })}
                onRemove={rows.length > 1 ? () => setRows(rows.filter((_, at) => at !== index)) : undefined}
                namePlaceholder="GITHUB_TOKEN"
                descriptionPlaceholder="When should Tock use this"
                error={clash(index)}
              >
                <SiteField id={`secret-sheet-site-${index}`} value={row.origin} onChange={(origin) => change(index, { ...row, origin })} />
              </VariableFields>
            ))}
          </div>
          <Button variant="outline" className="w-full" onClick={() => setRows([...rows, BLANK])}>
            {glyphs.add}
            Add new secret
          </Button>
        </SideSheetBody>
        <SideSheetFooter className="flex-wrap items-center justify-end">
          <SideSheetActions>
            <SideSheetClose render={<Button variant="ghost" size="base" />}>Cancel</SideSheetClose>
            <Button variant="solid" intent="accent" size="base" disabled={!ready} loading={busy} onClick={() => void save()}>
              {rows.length === 1 ? "Save secret" : "Save secrets"}
            </Button>
          </SideSheetActions>
        </SideSheetFooter>
      </SideSheetContent>
    </SideSheet>
  )
}

function SecretRow({
  secret,
  taken,
  reload,
  onRemove,
}: {
  secret: SecretMeta
  taken: ReadonlySet<string>
  reload: () => Promise<unknown>
  onRemove: () => void
}) {
  const initial: Draft = { name: secret.name, value: "", description: secret.description, origin: secret.origin }
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(initial)
  const [busy, setBusy] = useState(false)
  const name = draft.name.trim()
  const moved = draft.origin.trim() !== secret.origin
  const error =
    name === ""
      ? "Enter a key"
      : name !== secret.name && taken.has(name)
        ? `${name} already exists`
        : undefined
  const blocked = error !== undefined || !validSite(draft.origin) || (moved && draft.value === "")
  const close = () => {
    setEditing(false)
    setDraft(initial)
  }
  const save = async () => {
    setBusy(true)
    const done = await act(
      () =>
        socket
          .request("vault.update", {
            name: secret.name,
            rename: name === secret.name ? undefined : name,
            value: draft.value === "" ? undefined : draft.value,
            description: draft.description.trim(),
            origin: moved ? draft.origin.trim() : undefined,
          })
          .then(reload),
      saved(1),
    )
    setBusy(false)
    if (done) setEditing(false)
  }
  return (
    <div>
      <MaskedValueRow name={secret.name}>
        <span className="text-xs font-normal text-muted-foreground-2 tabular-nums">Updated {timeAgo(secret.updatedAt)}</span>
        <Menu>
          <MenuTrigger render={<Button variant="ghost" size="icon-sm" className="-mr-2" aria-label={`${secret.name} actions`} />}>
            <ButtonIcon side="only">{glyphs.more}</ButtonIcon>
          </MenuTrigger>
          <MenuContent align="end" className="w-44">
            <MenuItem icon={glyphs.edit} onClick={() => (editing ? close() : setEditing(true))}>
              Edit
            </MenuItem>
            <MenuSeparator />
            <MenuItem danger icon={glyphs.trash} onClick={onRemove}>
              Remove
            </MenuItem>
          </MenuContent>
        </Menu>
      </MaskedValueRow>
      <CollapsePanel open={editing}>
        <div className="flex flex-col gap-3 px-4 pb-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`edit-name-${secret.name}`}>Key</Label>
            <Input
              id={`edit-name-${secret.name}`}
              autoComplete="off"
              spellCheck={false}
              aria-invalid={error !== undefined || undefined}
              value={draft.name}
              onChange={(event) => setDraft({ ...draft, name: event.target.value })}
            />
            {error === undefined ? null : <p className="text-xs font-normal text-destructive">{error}</p>}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`edit-value-${secret.name}`}>Value</Label>
            <Textarea
              id={`edit-value-${secret.name}`}
              rows={3}
              autoComplete="off"
              spellCheck={false}
              placeholder={moved ? "Enter the value again to change the site" : "Leave blank to keep the current value"}
              className="max-h-40"
              value={draft.value}
              onChange={(event) => setDraft({ ...draft, value: event.target.value })}
            />
            <Label htmlFor={`edit-description-${secret.name}`}>Description</Label>
            <Input
              id={`edit-description-${secret.name}`}
              autoComplete="off"
              placeholder="When should Tock use this?"
              value={draft.description}
              onChange={(event) => setDraft({ ...draft, description: event.target.value })}
            />
          </div>
          <SiteField id={`edit-site-${secret.name}`} value={draft.origin} onChange={(origin) => setDraft({ ...draft, origin })} />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={close}>
              Cancel
            </Button>
            <Button variant="ghost" size="sm" loading={busy} disabled={blocked} onClick={() => void save()}>
              Save
            </Button>
          </div>
        </div>
      </CollapsePanel>
    </div>
  )
}

export function Secrets() {
  const { data, reload } = useRemote(loadSecrets, [])
  const [adding, setAdding] = useState(false)
  const [sheet, setSheet] = useState(0)
  const [removing, setRemoving] = useState<string | null>(null)
  const taken = new Set(data.map((secret) => secret.name))
  return (
    <Page title="Secrets" description="Values your agent can use in requests without ever seeing them.">
      <Section>
        <ListCard
          title={data.length === 0 ? "No secrets" : count(data.length, "secret")}
          actions={
            <AddButton
              label="Add secret"
              onClick={() => {
                setSheet(sheet + 1)
                setAdding(true)
              }}
            />
          }
        >
          {data.length > 0
            ? data.map((secret) => (
                <SecretRow key={secret.name} secret={secret} taken={taken} reload={reload} onRemove={() => setRemoving(secret.name)} />
              ))
            : null}
        </ListCard>
      </Section>
      <AddSheet key={sheet} open={adding} onOpenChange={setAdding} taken={taken} onSaved={reload} />
      <FormDialog
        open={removing !== null}
        onOpenChange={(open) => (open ? undefined : setRemoving(null))}
        title={`Remove ${removing ?? "secret"}`}
        description="Your agent can no longer use it in requests"
        submitLabel="Remove"
        destructive
        onSubmit={() => act(() => socket.request("vault.delete", { name: removing ?? "" }).then(reload))}
      />
    </Page>
  )
}
