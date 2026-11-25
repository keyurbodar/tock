import { createMemo, createSignal, For, Show } from "solid-js"
import { Input } from "@tock/ui-solid/input"
import { fixtureFiles } from "../fixtures/files"
import type { FixtureFile } from "../fixtures/types"
import { AttachIcon, FilesIcon, PlusIcon, SearchIcon } from "../shell/icons"
import "../screens/page.css"
import "./card.css"

type Sort = "recent" | "name" | "size" | "type"
type View = "grid" | "list"
type Kind = "all" | FixtureFile["kind"]

const typeNames: Record<FixtureFile["kind"], string> = {
  folder: "Folder",
  markdown: "Markdown",
  image: "Image",
  code: "Code",
  spreadsheet: "Spreadsheet",
  archive: "Archive",
}

const kinds: readonly Kind[] = ["all", "markdown", "image", "code", "spreadsheet", "archive"]

function sizeValue(size: string) {
  const n = Number.parseFloat(size)
  return /mb/i.test(size) ? n * 1024 : n
}

function previewLines(file: FixtureFile) {
  if (file.kind === "markdown") return [`# ${file.name}`, "", "Notes, decisions, and generated documentation", "kept in the owner's file space.", "", "- searchable", "- downloadable", "- agent writable"]
  if (file.kind === "spreadsheet") return ["Name,Notes", `${file.name},Generated fixture`, "Files,56 rows", "Recipes,34 rows"]
  if (file.kind === "code") return [`// ${file.name}`, "export function fixture() {", "  return { owner: true, optimistic: true }", "}"]
  return [file.name, file.path, `${typeNames[file.kind]} · ${file.size}`]
}

function FileTypeIcon(props: { file: FixtureFile }) {
  return (
    <span class="file-type-icon" data-kind={props.file.kind}>
      <FilesIcon />
    </span>
  )
}

function FileCard(props: { file: FixtureFile; onOpen: () => void }) {
  return (
    <div class="file-card" data-type={props.file.kind} data-file={props.file.path}>
      <button aria-label={props.file.name} class="file-card-hit" onClick={props.onOpen} type="button">
        <span class="file-card-plate">
          <span class="file-card-sheet" data-kind={props.file.kind === "image" ? "image" : "lines"} data-drawn="">
            <Show when={props.file.kind === "image"} fallback={<pre class="file-card-lines" data-mono={props.file.kind === "code" ? "" : undefined}>{previewLines(props.file).join("\n")}</pre>}>
              <span class="file-image-art" aria-hidden="true" />
            </Show>
          </span>
        </span>
        <span class="file-card-text">
          <span class="file-card-name">{props.file.name}</span>
          <span class="file-card-meta">{new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(new Date(props.file.updatedAt))} · {typeNames[props.file.kind]}</span>
        </span>
      </button>
      <button aria-label={`Save ${props.file.name}`} class="file-card-action" type="button">↓</button>
    </div>
  )
}

function EmptyFiles(props: { onFiles: (files: File[]) => void }) {
  let input: HTMLInputElement | undefined
  return (
    <div class="kiko-empty-card" data-component="files-empty">
      <input multiple onChange={(event) => { props.onFiles([...(event.currentTarget.files ?? [])]); event.currentTarget.value = "" }} ref={input} style={{ display: "none" }} type="file" />
      <span class="files-empty-art"><AttachIcon /></span>
      <div>
        <p class="kiko-empty-title">No files yet. Drop some anywhere, or upload.</p>
        <p class="kiko-empty-body">Files are searchable documents, images, spreadsheets, code, and archives your agents can use.</p>
      </div>
      <button class="kiko-primary-button" onClick={() => input?.click()} type="button">Upload</button>
    </div>
  )
}

export default function FilesPage() {
  const [query, setQuery] = createSignal("")
  const [sort, setSort] = createSignal<Sort>("recent")
  const [kind, setKind] = createSignal<Kind>("all")
  const [view, setView] = createSignal<View>("grid")
  const [uploaded, setUploaded] = createSignal<FixtureFile[]>([])
  const [opened, setOpened] = createSignal<FixtureFile | null>(null)
  const entries = createMemo(() => [...uploaded(), ...fixtureFiles].filter((file) => file.kind !== "folder"))
  const shown = createMemo(() => {
    const words = query().toLowerCase().split(/\s+/).filter(Boolean)
    return entries()
      .filter((file) => (kind() === "all" || file.kind === kind()) && words.every((word) => `${file.path} ${typeNames[file.kind]}`.toLowerCase().includes(word)))
      .sort((a, b) => {
        if (sort() === "name") return a.name.localeCompare(b.name, undefined, { numeric: true })
        if (sort() === "size") return sizeValue(b.size) - sizeValue(a.size)
        if (sort() === "type") return typeNames[a.kind].localeCompare(typeNames[b.kind])
        return Date.parse(b.updatedAt) - Date.parse(a.updatedAt)
      })
  })
  const addFiles = (files: File[]) => {
    setUploaded((current) => [...files.map((file) => ({
      id: `upload-${crypto.randomUUID()}`,
      name: file.name,
      path: `/vault/uploads/${file.name}`,
      kind: /\.(png|jpe?g|gif|webp|svg)$/i.test(file.name) ? "image" as const : /\.(csv|xlsx?)$/i.test(file.name) ? "spreadsheet" as const : /\.(tsx?|jsx?|py|rs|css|json|ya?ml|sh)$/i.test(file.name) ? "code" as const : /\.(zip|tar|gz|7z)$/i.test(file.name) ? "archive" as const : "markdown" as const,
      size: file.size > 1024 * 1024 ? `${(file.size / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(file.size / 1024))} KB`,
      updatedAt: new Date().toISOString(),
    })), ...current])
  }
  let uploadInput: HTMLInputElement | undefined

  return (
    <div class="kiko-page" data-component="page-frame">
      <header class="kiko-page-header">
        <div class="kiko-page-header-inner">
          <h1 class="kiko-page-title">Files</h1>
          <div class="kiko-page-actions">
            <Input aria-label="Search files" class="kiko-page-search" onInput={(event) => setQuery(event.currentTarget.value)} placeholder="Search files" value={query()} />
            <select aria-label="Filter files" class="files-select" onChange={(event) => setKind(event.currentTarget.value as Kind)} value={kind()}>
              <For each={kinds}>{(item) => <option value={item}>{item === "all" ? "All" : typeNames[item]}</option>}</For>
            </select>
            <select aria-label="Sort files" class="files-select" onChange={(event) => setSort(event.currentTarget.value as Sort)} value={sort()}>
              <option value="recent">Newest</option><option value="name">Name</option><option value="size">Size</option><option value="type">Type</option>
            </select>
            <button aria-label={view() === "grid" ? "Show as list" : "Show as grid"} class="kiko-tool-button" onClick={() => setView(view() === "grid" ? "list" : "grid")} type="button"><SearchIcon /></button>
            <input multiple onChange={(event) => { addFiles([...(event.currentTarget.files ?? [])]); event.currentTarget.value = "" }} ref={uploadInput} style={{ display: "none" }} type="file" />
            <button class="kiko-secondary-button" onClick={() => uploadInput?.click()} type="button">Upload</button>
            <button class="kiko-primary-button" type="button"><PlusIcon /> New</button>
          </div>
        </div>
      </header>
      <div class="kiko-page-body">
        <div class="files-content" data-component="files-page">
          <Show when={entries().length} fallback={<EmptyFiles onFiles={addFiles} />}>
            <Show when={shown().length} fallback={<div class="kiko-empty-card" data-component="files-no-match"><p class="kiko-empty-title">No results</p><p class="kiko-empty-body">Try another name, or clear the filter.</p></div>}>
              <Show when={view() === "grid"} fallback={
                <div class="files-list" data-component="files-list">
                  <For each={shown()}>{(file) => <button class="files-list-row" data-file={file.path} onClick={() => setOpened(file)} type="button"><FileTypeIcon file={file} /><span class="files-list-name">{file.name}</span><span class="files-list-meta">{typeNames[file.kind]}</span><span class="files-list-size">{file.size}</span></button>}</For>
                </div>
              }>
                <div class="files-grid" data-component="files-grid">
                  <For each={shown()}>{(file) => <FileCard file={file} onOpen={() => setOpened(file)} />}</For>
                </div>
              </Show>
            </Show>
          </Show>
        </div>
      </div>
      <Show when={opened()}>
        {(file) => (
          <div class="files-open" role="dialog" aria-modal="true" aria-label={file().name}>
            <button aria-label="Close file" class="files-open-backdrop" onClick={() => setOpened(null)} type="button" />
            <section class="files-open-panel">
              <header><h2>{file().name}</h2><button onClick={() => setOpened(null)} type="button">×</button></header>
              <p>{file().path}</p>
              <pre>{previewLines(file()).join("\n")}</pre>
            </section>
          </div>
        )}
      </Show>
    </div>
  )
}
