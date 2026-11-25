import { Delete02Icon, File01Icon, Image01Icon, Upload01Icon } from "@hugeicons/core-free-icons"
import { createFileRoute } from "@tanstack/react-router"
import { Button } from "@tock/ui/button"
import { Empty } from "@tock/ui/card"
import { Icon } from "@tock/ui/icon"
import { useRef } from "react"
import { upload } from "../api/http"
import { socket } from "../api/socket"
import type { FileMeta } from "../api/types"
import { fileSize, relativeTime } from "../lib/format"
import { act, useRemote } from "../lib/remote"
import { ListGroup, ListItem, ListPage } from "../shell/list-page"

export const Route = createFileRoute("/files")({ component: Files })

const load = () => socket.request<readonly FileMeta[]>("file.list")

function Files() {
  const { data, loaded, reload } = useRemote(load, [])
  const picker = useRef<HTMLInputElement>(null)
  const add = (files: readonly File[]) => act(() => Promise.all(files.map((file) => upload<FileMeta>(file))).then(reload))
  return (
    <ListPage
      title="Files"
      actions={
        <>
          <Button variant="ghost" size="icon-sm" aria-label="Upload files" onClick={() => picker.current?.click()}>
            <Icon icon={Upload01Icon} />
          </Button>
          <input
            ref={picker}
            type="file"
            multiple
            className="hidden"
            onChange={(event) => {
              void add(Array.from(event.currentTarget.files ?? []))
              event.currentTarget.value = ""
            }}
          />
        </>
      }
    >
      {loaded && data.length === 0 ? (
        <Empty title="No files yet" description="Files you attach, and files your agent saves, appear here.">
          <Button variant="outline" onClick={() => picker.current?.click()}>
            Upload files
          </Button>
        </Empty>
      ) : null}
      {data.length > 0 ? (
        <ListGroup label="All files" count={data.length}>
          {data.map((file) => (
            <ListItem
              key={file.id}
              icon={<Icon icon={file.mime.startsWith("image/") ? Image01Icon : File01Icon} />}
              title={file.name}
              meta={fileSize(file.size)}
              time={relativeTime(file.createdAt)}
              href={`/api/files/${encodeURIComponent(file.id)}`}
              trailing={
                <Button variant="ghost"
                  size="icon-sm"
                  intent="danger"
                  aria-label={`Delete ${file.name}`}
                  onClick={() => void act(() => socket.request("file.delete", { fileId: file.id }).then(reload))}
                >
                  <Icon icon={Delete02Icon} />
                </Button>
              }
            />
          ))}
        </ListGroup>
      ) : null}
    </ListPage>
  )
}
