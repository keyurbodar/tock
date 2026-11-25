import { Globe02Icon } from "@hugeicons/core-free-icons"
import { Button } from "@tock/ui/button"
import { Card, ListCardHeader, ListRow, Page, Section } from "@tock/ui/card"
import { ChevronRightSmall, glyphs } from "@tock/ui/glyph"
import { Icon } from "@tock/ui/icon"
import { Field, Input, LabeledField, Textarea } from "@tock/ui/input"
import {
  SideSheet,
  SideSheetBody,
  SideSheetContent,
  SideSheetDescription,
  SideSheetFooter,
  SideSheetHeader,
  SideSheetTitle,
} from "@tock/ui/side-sheet"
import { useState } from "react"
import { socket } from "../api/socket"
import type { SkillRecord } from "../api/types"
import { act, useRemote } from "../lib/remote"
import { composeSkill, parseSkill, SKILL_NAME, skillSlug } from "../lib/skill-text"
import { FormDialog } from "../shell/form-dialog"

const PAGE = 25
const loadSkills = () => socket.request<readonly SkillRecord[]>("skill.list")
const total = (skills: number) => (skills === 0 ? "No skills" : skills === 1 ? "1 skill" : `${skills} skills`)
const imported = (skill: SkillRecord) => skill.source !== "manual"

function SkillRow({ skill, onOpen }: { skill: SkillRecord; onOpen: () => void }) {
  return (
    <ListRow
      icon={glyphs.skill}
      title={
        <span className="flex min-w-0 items-baseline gap-2">
          <span className="truncate">{skill.name}</span>
          {imported(skill) ? <span className="truncate text-xs font-normal text-muted-foreground-2">Imported</span> : null}
        </span>
      }
      description={
        skill.description === "" ? (
          <span className="block truncate text-muted-foreground-3">No description</span>
        ) : (
          <span className="block truncate">{skill.description}</span>
        )
      }
      onClick={onOpen}
    >
      <ChevronRightSmall className="size-(--icon-sm) shrink-0 text-muted-foreground-3" />
    </ListRow>
  )
}

function SkillForm({
  skill,
  taken,
  onDelete,
  onSaved,
}: {
  skill: SkillRecord | undefined
  taken: ReadonlySet<string>
  onDelete: () => void
  onSaved: () => Promise<unknown>
}) {
  const fresh = skill === undefined
  const [parsed] = useState(() => parseSkill(skill?.bodyMd ?? ""))
  const [name, setName] = useState(skill?.name ?? "")
  const [description, setDescription] = useState(skill?.description ?? "")
  const [body, setBody] = useState(parsed.body)
  const [busy, setBusy] = useState(false)
  const duplicate = fresh && taken.has(name)
  const text = composeSkill(parsed, fresh ? name : parsed.name, description.trim(), body)
  const ready = fresh
    ? SKILL_NAME.test(name) && !name.endsWith("-") && !duplicate && description.trim() !== ""
    : text !== "" && (description.trim() !== skill.description || body !== parsed.body)
  const save = async () => {
    if (busy || !ready) return
    setBusy(true)
    await act(
      () =>
        (fresh
          ? socket.request("skill.upsert", { name, description: description.trim(), bodyMd: text })
          : socket.request("skill.update", { name: skill.name, description: description.trim(), bodyMd: text })
        ).then(onSaved),
      fresh ? "Skill created" : "Skill saved",
    )
    setBusy(false)
  }
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <SideSheetBody className="gap-4 pt-4">
        <div className="flex flex-col gap-4">
          <LabeledField label="Name" error={duplicate ? "A skill with this name already exists" : undefined}>
            <Input
              value={name}
              onChange={(event) => setName(skillSlug(event.target.value))}
              placeholder="release-check"
              maxLength={64}
              aria-invalid={duplicate || undefined}
              disabled={!fresh}
              autoFocus={fresh}
              required
            />
            {fresh ? null : <span className="text-xs font-normal text-muted-foreground-2">A skill's name cannot be changed</span>}
          </LabeledField>
          <LabeledField label="Description">
            <Textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="When your agent should use this skill"
              rows={2}
              maxLength={1024}
              className="field-sizing-content max-h-48 min-h-16"
            />
          </LabeledField>
        </div>
        <label className="flex min-h-0 flex-1 flex-col gap-1.5">
          <span className="text-sm font-medium text-foreground">Instructions</span>
          <div className="flex min-h-64 flex-1 flex-col overflow-y-auto overscroll-contain">
            <Textarea
              className="flex-1"
              value={body}
              onChange={(event) => setBody(event.target.value)}
              placeholder="What your agent does when it uses this skill, in markdown"
            />
          </div>
        </label>
        <div className="flex items-center justify-between gap-3 px-1 text-xs text-muted-foreground-2">
          <span className="truncate">{skill !== undefined && imported(skill) ? skill.source : null}</span>
          <span className="tabular-nums">{text.length.toLocaleString("en-US")} characters</span>
        </div>
      </SideSheetBody>
      <SideSheetFooter className="items-center justify-between">
        <span />
        <div className="flex items-center gap-2">
          {fresh ? null : (
            <Button type="button" variant="ghost" intent="danger" onClick={onDelete}>
              Delete
            </Button>
          )}
          <Button type="button" intent="accent" loading={busy} disabled={!ready} onClick={() => void save()}>
            {fresh ? "Create skill" : "Save"}
          </Button>
        </div>
      </SideSheetFooter>
    </div>
  )
}

type Open = { readonly name: string | undefined }

export function Skills() {
  const { data, reload } = useRemote(loadSkills, [])
  const [query, setQuery] = useState("")
  const [shown, setShown] = useState(PAGE)
  const [open, setOpen] = useState<Open>()
  const [removing, setRemoving] = useState(false)
  const [importing, setImporting] = useState(false)
  const [source, setSource] = useState("")
  const needle = query.trim().toLowerCase()
  const matches = data.filter((skill) => needle === "" || skill.name.includes(needle))
  const editing = open?.name === undefined ? undefined : data.find((skill) => skill.name === open.name)
  const title = open?.name ?? "New skill"
  return (
    <Page title="Skills" description="Instructions your agent uses when a task matches">
      <Section title="Your skills" description="Your agent sees each name and description, and opens a skill when a task matches">
        <Card>
          <ListCardHeader
            title={total(data.length)}
            search={data.length < 2 && query === "" ? undefined : { value: query, onChange: setQuery, placeholder: "Search skills" }}
            actions={
              <>
                <Button variant="ghost" size="icon-sm" aria-label="Import skill" title="Import skill" onClick={() => setImporting(true)}>
                  <Icon icon={Globe02Icon} />
                </Button>
                <Button variant="ghost" size="icon-sm" aria-label="New skill" title="New skill" onClick={() => setOpen({ name: undefined })}>
                  {glyphs.add}
                </Button>
              </>
            }
          />
          {matches.slice(0, shown).map((skill) => (
            <SkillRow key={skill.name} skill={skill} onOpen={() => setOpen({ name: skill.name })} />
          ))}
          {matches.length > shown ? (
            <div className="flex justify-center p-3">
              <Button size="sm" variant="ghost" onClick={() => setShown((value) => value + PAGE)}>
                Show more
              </Button>
            </div>
          ) : null}
          {data.length > 0 && matches.length === 0 ? <div className="p-4 text-sm text-muted-foreground-2">No skills match</div> : null}
        </Card>
      </Section>
      <SideSheet open={open !== undefined} onOpenChange={(next) => !next && setOpen(undefined)}>
        <SideSheetContent aria-label={title}>
          <SideSheetHeader>
            <SideSheetTitle>{title}</SideSheetTitle>
            <SideSheetDescription>{editing !== undefined && imported(editing) ? "Imported skill" : "Written by you"}</SideSheetDescription>
          </SideSheetHeader>
          {open === undefined ? null : open.name !== undefined && editing === undefined ? (
            <SideSheetBody>
              <p className="text-sm text-muted-foreground-2">This skill was deleted</p>
            </SideSheetBody>
          ) : (
            <SkillForm
              key={open.name ?? ""}
              skill={editing}
              taken={new Set(data.map((skill) => skill.name))}
              onDelete={() => setRemoving(true)}
              onSaved={() => reload().then(() => setOpen(undefined))}
            />
          )}
        </SideSheetContent>
      </SideSheet>
      <FormDialog
        open={removing}
        onOpenChange={setRemoving}
        title={`Delete ${open?.name ?? "skill"}`}
        description={`Removes ${open?.name ?? "this skill"} and every file in it`}
        submitLabel="Delete skill"
        destructive
        onSubmit={() =>
          act(
            () =>
              socket
                .request("skill.delete", { name: open?.name })
                .then(reload)
                .then(() => setOpen(undefined)),
            "Skill deleted",
          )
        }
      />
      <FormDialog
        open={importing}
        onOpenChange={setImporting}
        title="Import skill"
        description="Paste a link to a skill file or repository."
        submitLabel="Import"
        onSubmit={() =>
          act(() =>
            socket
              .request("skill.import", { source: source.trim() })
              .then(reload)
              .then(() => setSource("")),
          )
        }
      >
        <Field label="Link">
          <Input autoFocus required placeholder="https://github.com/owner/repo" value={source} onChange={(event) => setSource(event.currentTarget.value)} />
        </Field>
      </FormDialog>
    </Page>
  )
}
