import { Add01Icon, ArrowUp02Icon, Cancel01Icon, File01Icon, StopIcon } from "@hugeicons/core-free-icons"
import { useAtomValue } from "@effect/atom-react"
import { Button } from "@tock/ui/button"
import { ComposerEditor, ComposerSurface, ComposerToolbar } from "@tock/ui/composer"
import { DotGrid } from "@tock/ui/dot-grid"
import { Icon } from "@tock/ui/icon"
import * as Atom from "effect/reactivity/Atom"
import { useRef, useState } from "react"
import { toast } from "sonner"
import { upload } from "../api/http"
import type { FileMeta, ThinkingLevel } from "../api/types"
import { fileSize } from "../lib/format"
import { useSettings } from "../state/data"
import { registry } from "../state/registry"
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
  const [files, setFiles] = useState<readonly FileMeta[]>([])
  const [uploading, setUploading] = useState(0)
  const picker = useRef<HTMLInputElement>(null)
  const effective: ModelChoice = { model: choice.model ?? settings?.model ?? null, thinkingLevel: choice.thinkingLevel }
  const ready = text.trim() !== "" && uploading === 0

  const submit = () => {
    if (!ready) return
    onSend({
      text: withAttachments(text.trim(), files),
      model: choice.model ?? undefined,
      thinkingLevel: choice.thinkingLevel ?? undefined,
    })
    setText("")
    setFiles([])
  }

  const attach = async (incoming: readonly File[]) => {
    setUploading((count) => count + incoming.length)
    for (const file of incoming) {
      try {
        const meta = await upload<FileMeta>(file, sessionId)
        setFiles((current) => [...current, meta])
      } catch {
        toast.error(`Could not upload ${file.name}`)
      } finally {
        setUploading((count) => count - 1)
      }
    }
  }

  return (
    <ComposerSurface
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault()
        void attach(Array.from(event.dataTransfer.files))
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
          void attach(pasted)
        }}
        onKeyDown={(event) => {
          if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return
          event.preventDefault()
          submit()
        }}
      />
      {files.length > 0 || uploading > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5 pt-2">
          {files.map((file) => (
            <div
              key={file.id}
              className="flex h-12 w-60 max-w-full items-center gap-2 rounded-(--radius-card) border-[0.5px] border-border-2 bg-button py-1.5 pr-1 pl-1.5 shadow-plate"
            >
              <a
                href={`/api/files/${encodeURIComponent(file.id)}`}
                target="_blank"
                rel="noreferrer"
                aria-label={`Preview ${file.name}`}
                className="flex min-w-0 flex-1 cursor-zoom-in items-center gap-2 rounded-(--radius) text-left outline-none focus-visible:outline-ring-inset"
              >
                <span className="relative flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-(--radius) bg-secondary text-icon-muted [&_svg]:size-(--icon-base)">
                  {file.mime.startsWith("image/") ? (
                    <img alt={file.name} src={`/api/files/${encodeURIComponent(file.id)}`} className="size-full object-cover" />
                  ) : (
                    <Icon icon={File01Icon} />
                  )}
                </span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="mask-fade-r overflow-hidden text-sm font-medium whitespace-nowrap [--mask-fade-ramp:8px]">
                    {file.name}
                  </span>
                  <span className="truncate text-2xs text-muted-foreground-2 tabular-nums">{fileSize(file.size)}</span>
                </span>
              </a>
              <Button
                size="icon-sm"
                aria-label={`Remove ${file.name}`}
                onClick={() => setFiles((current) => current.filter((item) => item.id !== file.id))}
              >
                <Icon icon={Cancel01Icon} />
              </Button>
            </div>
          ))}
          {uploading > 0 ? (
            <div className="flex h-12 w-60 max-w-full items-center gap-2 rounded-(--radius-card) border-[0.5px] border-border-2 bg-button py-1.5 pr-1 pl-1.5 shadow-plate">
              <span className="relative flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-(--radius) bg-secondary">
                <DotGrid state="working" label="Uploading" className="size-(--icon-sm)" />
              </span>
              <span className="text-shimmer text-sm font-medium">Uploading</span>
            </div>
          ) : null}
        </div>
      ) : null}
      <ComposerToolbar
        leading={
          <>
            <span className="flex items-center gap-0.5">
              <Button size="icon-sm" aria-label="Add to message" onClick={() => picker.current?.click()}>
                <Icon icon={Add01Icon} />
              </Button>
              <input
                ref={picker}
                type="file"
                multiple
                className="hidden"
                onChange={(event) => {
                  void attach(Array.from(event.currentTarget.files ?? []))
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
