import { useAtomValue } from "@effect/atom-react"
import { BrandIcon, familyOf } from "@tock/ui/brand-icon"
import { Button, ButtonIcon } from "@tock/ui/button"
import { AttachmentStrip, AttachmentTile } from "@tock/ui/chat/attachments"
import { commandIcons } from "@tock/ui/chat/command-icons"
import type { Command } from "@tock/ui/chat/command-menu"
import { ComposerSurface, ComposerToolbar } from "@tock/ui/composer"
import { ComposerEditor, type ComposerHandle } from "@tock/ui/composer-editor"
import { glyphs } from "@tock/ui/glyph"
import { Menu, MenuContent, MenuItem, MenuTrigger } from "@tock/ui/menu"
import * as Atom from "effect/reactivity/Atom"
import { useEffect, useMemo, useRef, useState } from "react"
import { socket } from "../api/socket"
import type { SkillRecord, ThinkingLevel } from "../api/types"
import { fileSize, titleCase } from "../lib/format"
import { chord } from "../lib/platform"
import { useRemote } from "../lib/remote"
import { modelSpec, useModels, useProviders, useSettings } from "../state/data"
import { registry } from "../state/registry"
import { withAttachments } from "./attached"
import { AttachmentLightbox, type MediaEntry } from "./attachment-lightbox"
import { useAttachments } from "./attachments"
import { findModel, levelFor, ModelPicker, type ModelChoice } from "./model-picker"

const ATTACH_KEYS = chord("/")
const EDITABLE = "input, textarea, select, [contenteditable=true]"
const OVERLAY = "[role=dialog], [role=menu], [role=listbox]"

const choiceAtom = Atom.make<ModelChoice>({ model: null, thinkingLevel: null }).pipe(Atom.keepAlive)
const loadSkills = () => socket.request<readonly SkillRecord[]>("skill.list")
const noSkills: readonly SkillRecord[] = []

export interface Outgoing {
  readonly text: string
  readonly model?: string
  readonly thinkingLevel?: ThinkingLevel
}


function useCommands(effective: ModelChoice): readonly Command[] {
  const models = useModels()
  const providers = useProviders()
  const skills = useRemote(loadSkills, noSkills)
  return useMemo(() => {
    const names = new Map(providers.map((provider) => [provider.id, provider.name]))
    const selected = findModel(models, effective.model)
    const levels = selected && selected.thinkingLevels.length > 1 ? selected.thinkingLevels : []
    const level = levelFor(levels, effective.thinkingLevel) ?? levels[0]
    const model: Command = {
      kind: "picker",
      name: "model",
      aliases: ["models"],
      label: "Model",
      icon: commandIcons.model,
      searchTerms: ["models", "switch model", "change model"],
      emptyLabel: "No models found",
      items: models.map((item) => ({
        id: modelSpec(item),
        label: item.name,
        icon: <BrandIcon provider={familyOf(item.name) ?? item.provider} name={item.provider} className="mx-0! size-(--icon-sm)" />,
        group: names.get(item.provider) ?? item.provider,
        searchTerms: [item.provider, item.id],
        selected: modelSpec(item) === effective.model,
      })),
      select: (item) => {
        const next = findModel(models, item.id)
        if (next) registry.set(choiceAtom, { model: item.id, thinkingLevel: levelFor(next.thinkingLevels.length > 1 ? next.thinkingLevels : [], effective.thinkingLevel) })
      },
    }
    const reasoning: Command = {
      kind: "picker",
      name: "reasoning",
      aliases: ["effort"],
      label: "Reasoning",
      icon: commandIcons.reasoning,
      searchTerms: ["thinking", "reasoning effort"],
      emptyLabel: "No reasoning levels",
      items: levels.map((item) => ({ id: item, label: titleCase(item), icon: commandIcons.reasoning, selected: item === level })),
      select: (item) => {
        const next = levels.find((candidate) => candidate === item.id)
        if (next) registry.set(choiceAtom, { model: effective.model, thinkingLevel: next })
      },
    }
    const skill: Command = {
      kind: "picker",
      name: "skills",
      label: "Skills",
      icon: commandIcons.skills,
      emptyLabel: "No skills found",
      loading: !skills.loaded,
      inline: true,
      items: skills.data
        .filter((item) => item.enabled)
        .map((item) => ({ id: item.name, label: item.name, icon: commandIcons.skills, searchTerms: [item.description], insert: `@${item.name}` })),
      select: () => undefined,
    }
    return [model, ...(levels.length > 0 ? [reasoning] : []), skill]
  }, [models, providers, skills.data, skills.loaded, effective.model, effective.thinkingLevel])
}

export function Composer({
  sessionId,
  working,
  autoFocus,
  onSend,
  onStop,
}: {
  sessionId?: string
  working: boolean
  autoFocus?: boolean
  onSend: (message: Outgoing) => void
  onStop?: () => void
}) {
  const settings = useSettings()
  const choice = useAtomValue(choiceAtom)
  const [empty, setEmpty] = useState(true)
  const editor = useRef<ComposerHandle>(null)
  const attachments = useAttachments(sessionId)
  const picker = useRef<HTMLInputElement>(null)
  const effective: ModelChoice = { model: choice.model ?? settings?.model ?? null, thinkingLevel: choice.thinkingLevel }
  const files = attachments.entries.flatMap((entry) => (entry.meta === undefined ? [] : [entry.meta]))
  const uploading = attachments.entries.some((entry) => entry.status.phase === "uploading")
  const ready = attachments.entries.some((entry) => entry.status.phase === "ready")
  const content = !empty || ready
  const commands = useCommands(effective)
  const [previewing, setPreviewing] = useState<string>()
  const media = attachments.entries.flatMap((entry): MediaEntry[] =>
    entry.status.phase === "ready" && entry.previewUrl !== undefined
      ? [{ key: entry.localId, kind: "image", label: entry.name, url: entry.previewUrl }]
      : [],
  )
  const previewAt = media.findIndex((entry) => entry.key === previewing)

  const submit = (text: string) => {
    if ((text.trim() === "" && files.length === 0) || uploading) return false
    onSend({
      text: withAttachments(text.trim(), files),
      model: choice.model ?? undefined,
      thinkingLevel: choice.thinkingLevel ?? undefined,
    })
    attachments.clear()
    return true
  }

  const attach = attachments.add
  const surface = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "/" || !(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey) return
      const focused = document.activeElement
      const inside = surface.current?.contains(focused) === true
      if (!inside && (focused?.matches(EDITABLE) === true || document.querySelector(OVERLAY) !== null)) return
      event.preventDefault()
      picker.current?.click()
    }
    addEventListener("keydown", onKey)
    return () => removeEventListener("keydown", onKey)
  }, [])

  return (
    <ComposerSurface
      ref={surface}
      translucent={sessionId === undefined}
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault()
        attach(Array.from(event.dataTransfer.files))
      }}
    >
      <ComposerEditor
        ref={editor}
        autoFocus={autoFocus}
        className={sessionId === undefined ? undefined : "min-h-6"}
        commands={commands}
        placeholder={
          <>
            Ask anything
            <span className="@max-md/composer:hidden">, / for commands</span>
          </>
        }
        onSubmit={submit}
        onEmptyChange={setEmpty}
        onFiles={attach}
      />
      {attachments.entries.length > 0 ? (
        <AttachmentStrip>
          {attachments.entries.map((entry) => (
            <AttachmentTile
              key={entry.localId}
              name={entry.name}
              mediaType={entry.mediaType}
              size={fileSize(entry.sizeBytes)}
              status={entry.status}
              previewUrl={entry.previewUrl}
              onPreview={media.some((item) => item.key === entry.localId) ? () => setPreviewing(entry.localId) : undefined}
              onRemove={() => attachments.remove(entry.localId)}
            />
          ))}
        </AttachmentStrip>
      ) : null}
      {previewAt >= 0 ? (
        <AttachmentLightbox
          entries={media}
          index={previewAt}
          onIndexChange={(index) => setPreviewing(media[index]?.key)}
          onClose={() => setPreviewing(undefined)}
        />
      ) : null}
      <ComposerToolbar
        leading={
          <>
            <Menu>
              <MenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label="Add to message" className="relative" />}>
                {glyphs.add}
              </MenuTrigger>
              <MenuContent side="top" align="start" className="w-max min-w-56 max-w-sm">
                <MenuItem icon={glyphs.attach} keys={ATTACH_KEYS} onSelect={() => picker.current?.click()}>
                  Upload attachment
                </MenuItem>
              </MenuContent>
            </Menu>
            <input
              ref={picker}
              type="file"
              multiple
              className="hidden"
              onChange={(event) => {
                attach(Array.from(event.currentTarget.files ?? []))
                event.currentTarget.value = ""
              }}
            />
            <span className="ml-1 flex min-w-0 items-center gap-0.5">
              <ModelPicker value={effective} onChange={(next) => registry.set(choiceAtom, next)} />
            </span>
          </>
        }
        trailing={
          content ? (
            <span className="flex rounded-(--radius)">
              <Button
                variant="solid"
                intent="accent"
                size="icon-sm"
                aria-label={sessionId === undefined ? "Start" : "Send"}
                className="select-none [-webkit-touch-callout:none]"
                disabled={uploading}
                onClick={() => editor.current?.submit()}
              >
                {glyphs.send}
              </Button>
            </span>
          ) : working && onStop ? (
            <Button variant="solid" intent="accent" size="icon-sm" aria-label="Stop run" onClick={onStop}>
              <ButtonIcon>{glyphs.stop}</ButtonIcon>
            </Button>
          ) : null
        }
      />
    </ComposerSurface>
  )
}
