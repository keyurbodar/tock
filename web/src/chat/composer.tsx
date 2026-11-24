import { Add01Icon, ArrowUp02Icon, StopIcon } from "@hugeicons/core-free-icons"
import { useAtomValue } from "@effect/atom-react"
import { Button } from "@tock/ui/button"
import { AttachmentStrip, AttachmentTile } from "@tock/ui/chat/attachments"
import { ComposerEditor, ComposerSurface, ComposerToolbar } from "@tock/ui/composer"
import { Icon } from "@tock/ui/icon"
import * as Atom from "effect/reactivity/Atom"
import { useRef, useState } from "react"
import type { FileMeta, ThinkingLevel } from "../api/types"
import { fileSize } from "../lib/format"
import { useSettings } from "../state/data"
import { registry } from "../state/registry"
import { useAttachments } from "./attachments"
import { ModelPicker, type ModelChoice } from "./model-picker"

const choiceAtom = Atom.make<ModelChoice>({ model: null, thinkingLevel: null }).pipe(Atom.keepAlive)

export interface Outgoing {
  readonly text: string
  readonly model?: string
  readonly thinkingLevel?: ThinkingLevel
}

const withAttachments = (text: string, files: readonly FileMeta[]) =>
  files.length === 0 ? text : `${text}\n\n${files.map((file) => `[attached file: ${file.name} (${file.id})]`).join("\n")}`

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
  const [text, setText] = useState("")
  const attachments = useAttachments(sessionId)
  const picker = useRef<HTMLInputElement>(null)
  const effective: ModelChoice = { model: choice.model ?? settings?.model ?? null, thinkingLevel: choice.thinkingLevel }
  const files = attachments.entries.flatMap((entry) => (entry.meta === undefined ? [] : [entry.meta]))
  const uploading = attachments.entries.some((entry) => entry.status.phase === "uploading")
  const ready = (text.trim() !== "" || files.length > 0) && !uploading

  const submit = () => {
    if (!ready) return
    onSend({
      text: withAttachments(text.trim(), files),
      model: choice.model ?? undefined,
      thinkingLevel: choice.thinkingLevel ?? undefined,
    })
    setText("")
    attachments.clear()
  }

  const attach = attachments.add

  return (
    <ComposerSurface
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault()
        attach(Array.from(event.dataTransfer.files))
      }}
    >
      <ComposerEditor
        autoFocus={autoFocus}
        value={text}
        placeholder="Ask anything"
        hint=", / for commands, @ for context"
        onChange={setText}
        onPaste={(event) => {
          const pasted = Array.from(event.clipboardData.files)
          if (pasted.length === 0) return
          event.preventDefault()
          attach(pasted)
        }}
        onKeyDown={(event) => {
          if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return
          event.preventDefault()
          submit()
        }}
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
              onRemove={() => attachments.remove(entry.localId)}
            />
          ))}
        </AttachmentStrip>
      ) : null}
      <ComposerToolbar
        leading={
          <>
            <span className="flex items-center gap-0.5">
              <Button variant="ghost" size="icon-sm" aria-label="Add to message" onClick={() => picker.current?.click()}>
                <Icon icon={Add01Icon} />
              </Button>
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
            </span>
            <span className="ml-1 flex min-w-0 items-center gap-0.5">
              <ModelPicker value={effective} onChange={(next) => registry.set(choiceAtom, next)} />
            </span>
          </>
        }
        trailing={
          working && !ready && onStop ? (
            <Button variant="solid" size="icon-sm" aria-label="Stop" onClick={onStop}>
              <Icon icon={StopIcon} />
            </Button>
          ) : (
            <Button variant="solid" intent="accent" size="icon-sm" aria-label="Send" disabled={!ready} onClick={submit}>
              <Icon icon={ArrowUp02Icon} />
            </Button>
          )
        }
      />
    </ComposerSurface>
  )
}
