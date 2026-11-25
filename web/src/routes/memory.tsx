import { BrainIcon, Clock01Icon, Search01Icon, Tick02Icon } from "@hugeicons/core-free-icons"
import { createFileRoute } from "@tanstack/react-router"
import { Button } from "@tock/ui/button"
import { Card, Empty, ListCard, ListRow, Page, Section } from "@tock/ui/card"
import { Icon } from "@tock/ui/icon"
import { Input } from "@tock/ui/input"
import { Markdown } from "@tock/ui/markdown"
import { useEffect, useState } from "react"
import { http, post } from "../api/http"
import { socket } from "../api/socket"
import type { MemoryItem, MemoryRevision, MemorySnapshot } from "../api/types"
import { dateTime, titleCase } from "../lib/format"
import { act, useRemote } from "../lib/remote"
import { PageHeader } from "../shell/page-header"

export const Route = createFileRoute("/memory")({ component: Memory })

const EMPTY: MemorySnapshot = { core: { content: "", version: 0, updatedAt: 0 }, openItems: [], recent: [] }
const SEARCH_DELAY_MS = 200

const loadMemory = () => socket.request<MemorySnapshot>("memory.get")
const loadRevisions = () => http<{ revisions: readonly MemoryRevision[] }>("/api/memory/revisions").then((body) => body.revisions)

function Memory() {
  const memory = useRemote(loadMemory, EMPTY)
  const revisions = useRemote(loadRevisions, [])
  const [query, setQuery] = useState("")
  const [found, setFound] = useState<readonly MemoryItem[] | null>(null)

  useEffect(() => {
    const term = query.trim()
    if (term === "") {
      setFound(null)
      return
    }
    const timer = setTimeout(() => {
      socket
        .request<readonly MemoryItem[]>("memory.search", { query: term, limit: 20 })
        .then(setFound)
        .catch(() => setFound([]))
    }, SEARCH_DELAY_MS)
    return () => clearTimeout(timer)
  }, [query])

  const facts = found ?? memory.data.recent
  const { core, openItems } = memory.data
  return (
    <>
      <PageHeader />
      <Page title="Memory" description="What your agent keeps between chats.">
        <Section title="Core memory" description={core.updatedAt ? `Version ${core.version}, updated ${dateTime(core.updatedAt)}` : undefined}>
          <Card>
            {core.content.trim() === "" ? (
              <Empty title="Nothing remembered yet" description="Your agent writes this as it learns about you." />
            ) : (
              <div className="px-4 py-3.5">
                <Markdown size="sm">{core.content}</Markdown>
              </div>
            )}
          </Card>
        </Section>
        <Section title="Open items">
          <ListCard title={`${openItems.length} open`}>
            {openItems.length > 0
              ? openItems.map((item) => (
                  <ListRow key={item.id} icon={<Icon icon={Tick02Icon} />} title={item.title} description={item.context}>
                    {item.dueAt ? <span className="text-xs text-muted-foreground-2 tabular-nums">{dateTime(item.dueAt)}</span> : null}
                  </ListRow>
                ))
              : null}
          </ListCard>
        </Section>
        <Section title="Facts">
          <span data-slot="input-group" className="relative mx-4 inline-flex w-64">
            <span aria-hidden="true" className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-icon-muted [&_svg]:size-(--icon-sm)">
              <Icon icon={Search01Icon} />
            </span>
            <Input aria-label="Search memory" placeholder="Search memory" value={query} onChange={(event) => setQuery(event.currentTarget.value)} className="w-full pl-8" />
          </span>
          <ListCard title={found === null ? "Recent" : `${facts.length} found`}>
            {facts.length > 0
              ? facts.map((fact) => (
                  <ListRow key={fact.id} icon={<Icon icon={BrainIcon} />} title={fact.content} description={`${titleCase(fact.kind)} · ${dateTime(fact.createdAt)}`} />
                ))
              : null}
          </ListCard>
        </Section>
        <Section title="History" description="Earlier versions of core memory. Restoring one replaces the current version.">
          <ListCard title={`${revisions.data.length} versions`}>
            {revisions.data.length > 0
              ? revisions.data.map((revision) => (
                  <ListRow key={revision.id} icon={<Icon icon={Clock01Icon} />} title={`Version ${revision.version}`} description={dateTime(revision.createdAt)}>
                    <Button
                      variant="outline"
                      onClick={() =>
                        void act(
                          () => post(`/api/memory/revisions/${revision.id}/restore`).then(() => Promise.all([memory.reload(), revisions.reload()])),
                          "Memory restored",
                        )
                      }
                    >
                      Restore
                    </Button>
                  </ListRow>
                ))
              : null}
          </ListCard>
        </Section>
      </Page>
    </>
  )
}
