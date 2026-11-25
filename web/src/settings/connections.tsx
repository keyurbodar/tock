import { Button, ButtonIcon } from "@tock/ui/button"
import { Card, ListCardHeader, Section, SettingsRow, SettingsRowLink } from "@tock/ui/card"
import { BackLink, Collapsible, FormCard, FormLabel, FormRow, RadioCards } from "@tock/ui/form"
import { glyphs } from "@tock/ui/glyph"
import { Badge, Input } from "@tock/ui/input"
import { Menu, MenuContent, MenuTrigger } from "@tock/ui/menu"
import { MenuSelect } from "@tock/ui/menu-select"
import { Switch } from "@tock/ui/switch"
import { useState, type MouseEvent, type ReactNode } from "react"
import { post } from "../api/http"
import { socket } from "../api/socket"
import type { McpAuthMode, McpServerRecord } from "../api/types"
import { act, useRemote } from "../lib/remote"
import { AddButton, RemoveItem, count } from "./lists"

type Transport = "http" | "sse"
type Auth = "oauth" | "key" | "none"
type View = { readonly kind: "list" } | { readonly kind: "add" } | { readonly kind: "detail"; readonly id: string }
interface Header {
  readonly name: string
  readonly value: string
}
interface Config {
  readonly transport: Transport
  readonly url: string
  readonly auth: Auth
  readonly headers: readonly Header[]
}

const TRANSPORTS = [
  { value: "http", label: "Streamable HTTP" },
  { value: "sse", label: "SSE" },
] as const
const BLANK: Header = { name: "", value: "" }
const EMPTY: Config = { transport: "http", url: "", auth: "none", headers: [BLANK] }

const loadServers = () => socket.request<McpServerRecord[]>("mcp.list")
const tools = (total: number) => count(total, "tool")
const host = (url: string) => (URL.canParse(url) ? new URL(url).host : url)

function ago(at: number, now: number): string {
  const minutes = Math.floor((now - at) / 60_000)
  if (minutes < 1) return "just now"
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  return hours < 24 ? `${hours}h ago` : `${Math.floor(hours / 24)}d ago`
}

function configOf(server: McpServerRecord): Config {
  const auth = server.authMode === "oauth" ? "oauth" : server.headerNames.length > 0 ? "key" : "none"
  return { transport: server.authMode === "sse" ? "sse" : "http", url: server.url, auth, headers: [BLANK] }
}

const authModeOf = (config: Config): McpAuthMode => (config.transport === "sse" ? "sse" : config.auth === "oauth" ? "oauth" : "headers")
const entered = (config: Config) => config.headers.filter((header) => header.name.trim() !== "")
const validUrl = (url: string) => URL.canParse(url.trim()) && /^https?:$/.test(new URL(url.trim()).protocol)

async function save(name: string, config: Config, stored: readonly string[]): Promise<McpServerRecord | null> {
  const url = config.url.trim()
  if (authModeOf(config) === "oauth") {
    const result = await post<{ authUrl?: string }>("/api/mcp/oauth", { name, url })
    if (result.authUrl) window.open(result.authUrl, "_blank", "noopener")
    return null
  }
  const rows = entered(config)
  const headers =
    config.auth === "none"
      ? {}
      : rows.length > 0 || stored.length === 0
        ? Object.fromEntries(rows.map((header) => [header.name.trim(), header.value]))
        : undefined
  const saved = await socket.request<McpServerRecord>("mcp.upsert", { name, url, authMode: authModeOf(config), headers })
  return saved.enabled ? socket.request<McpServerRecord>("mcp.test", { idOrName: name }) : saved
}

function Connected({ server, className }: { server: McpServerRecord; className?: string }) {
  if (server.enabled && server.checkedAt !== null && server.lastError === null) {
    return (
      <Badge tone="success" className={className}>
        {glyphs.circleCheckLine}
        Connected
      </Badge>
    )
  }
  return <Badge className={className}>{server.enabled ? "Not connected" : "Off"}</Badge>
}

function SubPage({
  icon,
  title,
  description,
  onBack,
  children,
}: {
  icon?: ReactNode
  title: string
  description: string
  onBack: () => void
  children: ReactNode
}) {
  const back = (event: MouseEvent) => {
    event.preventDefault()
    onBack()
  }
  return (
    <div className="flex flex-col gap-10">
      <header className="flex flex-col gap-3">
        <BackLink href="/settings/connections" onClick={back}>
          Connections
        </BackLink>
        <div className="flex items-center gap-3">
          {icon ? <div className="grid size-10 shrink-0 place-items-center rounded-md bg-secondary [&_svg]:size-6">{icon}</div> : null}
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <h1 className="font-medium text-foreground text-xl">{title}</h1>
            <p className="truncate text-sm font-normal text-muted-foreground-1">{description}</p>
          </div>
        </div>
      </header>
      {children}
    </div>
  )
}

function ConfigSections({
  config,
  onChange,
  stored,
  action,
}: {
  config: Config
  onChange: (config: Config) => void
  stored: readonly string[]
  action?: ReactNode
}) {
  const setHeader = (index: number, patch: Partial<Header>) =>
    onChange({ ...config, headers: config.headers.map((header, at) => (at === index ? { ...header, ...patch } : header)) })
  return (
    <>
      <Section title="Runtime" action={action}>
        <FormCard>
          <FormRow title="Transport" description="Tock speaks MCP over HTTP to a listening server">
            <MenuSelect
              className="w-40"
              label="Transport"
              value={config.transport}
              options={TRANSPORTS}
              onChange={(transport) =>
                onChange({ ...config, transport, auth: transport === "sse" && config.auth === "oauth" ? "none" : config.auth })
              }
            />
          </FormRow>
          <FormLabel label="URL" ruled>
            <Input
              type="url"
              placeholder="https://mcp.example.com/mcp"
              aria-invalid={config.url.trim() !== "" && !validUrl(config.url)}
              value={config.url}
              onChange={(event) => onChange({ ...config, url: event.target.value })}
            />
          </FormLabel>
        </FormCard>
      </Section>
      <Section title="Authentication">
        <RadioCards
          label="Authentication"
          value={config.auth}
          onChange={(auth) => onChange({ ...config, auth })}
          options={[
            {
              value: "oauth",
              title: "Sign in",
              description: "You sign in through the server's own login before Tock can use it",
              disabled: config.transport === "sse",
            },
            { value: "key", title: "API key", description: "A token Tock sends as a header on every request" },
            { value: "none", title: "No sign-in", description: "The server accepts requests without credentials" },
          ]}
        />
        {config.auth === "key" ? (
          <FormCard>
            <div className="flex flex-col gap-1.5 text-sm font-medium text-foreground">
              Headers
              {stored.length > 0 ? (
                <div className="flex flex-col gap-2">
                  {stored.map((name) => (
                    <div key={name} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] items-center gap-2">
                      <Input disabled aria-label={`Stored header ${name}`} value={name} readOnly />
                      <Input disabled aria-label={`Stored header ${name} value`} value="Hidden value" readOnly />
                      <span className="size-(--h-control-sm)" />
                    </div>
                  ))}
                </div>
              ) : null}
              <div className="flex flex-col gap-2">
                {config.headers.map((header, index) => (
                  <div key={index} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] items-center gap-2">
                    <Input
                      aria-label={`Header ${index + 1} name`}
                      placeholder="Key"
                      value={header.name}
                      onChange={(event) => setHeader(index, { name: event.target.value })}
                    />
                    <Input
                      autoComplete="new-password"
                      aria-label={`Header ${index + 1} value`}
                      placeholder="Value"
                      type="password"
                      value={header.value}
                      onChange={(event) => setHeader(index, { value: event.target.value })}
                    />
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="-mr-2"
                      aria-label={`Remove header ${index + 1}`}
                      onClick={() => onChange({ ...config, headers: config.headers.filter((_, at) => at !== index) })}
                    >
                      {glyphs.trash}
                    </Button>
                  </div>
                ))}
                <Button variant="soft" className="w-full" onClick={() => onChange({ ...config, headers: [...config.headers, BLANK] })}>
                  {glyphs.add}
                  Add header
                </Button>
              </div>
              {stored.length > 0 ? (
                <span className="text-xs font-normal text-muted-foreground-2">Stored values stay hidden; entering rows replaces them</span>
              ) : null}
            </div>
          </FormCard>
        ) : null}
      </Section>
    </>
  )
}

function AddServer({ onBack, onAdded }: { onBack: () => void; onAdded: (server: McpServerRecord | null) => void }) {
  const [name, setName] = useState("")
  const [config, setConfig] = useState(EMPTY)
  const [busy, setBusy] = useState(false)
  const ready = name.trim() !== "" && validUrl(config.url)
  const submit = async () => {
    setBusy(true)
    let added: McpServerRecord | null = null
    const ok = await act(async () => {
      added = await save(name.trim(), config, [])
    })
    setBusy(false)
    if (ok) onAdded(added)
  }
  return (
    <SubPage title="Add MCP server" description="Connect tools and services Tock can use" onBack={onBack}>
      <Section
        title="Server"
        action={
          <Button disabled={!ready} loading={busy} onClick={() => void submit()}>
            Add server
          </Button>
        }
      >
        <FormCard>
          <FormLabel label="Name">
            <Input placeholder="DeepWiki" maxLength={255} value={name} onChange={(event) => setName(event.target.value)} />
          </FormLabel>
        </FormCard>
      </Section>
      <ConfigSections config={config} onChange={setConfig} stored={[]} />
    </SubPage>
  )
}

function Detail({ server, onBack, reload }: { server: McpServerRecord; onBack: () => void; reload: () => Promise<unknown> }) {
  const [config, setConfig] = useState(() => configOf(server))
  const [busy, setBusy] = useState<"test" | "save" | "reconnect" | null>(null)
  const [now] = useState(() => Date.now())
  const initial = configOf(server)
  const dirty =
    config.transport !== initial.transport || config.url.trim() !== initial.url || config.auth !== initial.auth || entered(config).length > 0
  const run = async (kind: NonNullable<typeof busy>, action: () => Promise<unknown>) => {
    setBusy(kind)
    await act(() => action().then(reload))
    setBusy(null)
  }
  const status = !server.enabled
    ? "Turned off"
    : server.lastError !== null
      ? server.lastError
      : server.checkedAt === null || server.toolCount === null
        ? "Not checked yet"
        : `${tools(server.toolCount)}, checked ${ago(server.checkedAt, now)}`
  return (
    <SubPage icon={glyphs.server} title={server.name} description={host(server.url)} onBack={onBack}>
      <Section>
        <Card>
          <SettingsRow title="Enabled" description="Available to the model">
            <Switch
              aria-label={`${server.enabled ? "Disable" : "Enable"} ${server.name}`}
              checked={server.enabled}
              onCheckedChange={(enabled) =>
                void act(() => socket.request("mcp.enable", { idOrName: server.id, enabled }).then(reload))
              }
            />
          </SettingsRow>
          <SettingsRow title="Status" description={status} className="max-sm:flex-col max-sm:items-start">
            <Connected server={server} />
            {server.authMode === "oauth" ? (
              <Button
                variant="ghost"
                loading={busy === "reconnect"}
                disabled={!server.enabled}
                onClick={() => void run("reconnect", () => save(server.name, configOf(server), []))}
              >
                {glyphs.refresh}
                Reconnect
              </Button>
            ) : null}
            <Button
              variant="ghost"
              loading={busy === "test"}
              disabled={!server.enabled}
              onClick={() => void run("test", () => socket.request("mcp.test", { idOrName: server.id }))}
            >
              {glyphs.pulse}
              Test
            </Button>
            <Menu>
              <MenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label="Server actions" />}>
                <ButtonIcon side="only">{glyphs.more}</ButtonIcon>
              </MenuTrigger>
              <MenuContent align="end" className="w-40">
                <RemoveItem
                  onSelect={() => void act(() => socket.request("mcp.delete", { idOrName: server.id }).then(reload)).then((ok) => ok && onBack())}
                />
              </MenuContent>
            </Menu>
          </SettingsRow>
        </Card>
      </Section>
      <Collapsible title="Configuration" defaultOpen>
        <ConfigSections
          config={config}
          onChange={setConfig}
          stored={config.auth === "key" ? server.headerNames : []}
          action={
            dirty ? (
              <Button
                disabled={!validUrl(config.url)}
                loading={busy === "save"}
                onClick={() =>
                  void run("save", async () => {
                    await save(server.name, config, server.headerNames)
                    setConfig((current) => ({ ...current, headers: [BLANK] }))
                  })
                }
              >
                Save changes
              </Button>
            ) : undefined
          }
        />
      </Collapsible>
    </SubPage>
  )
}

export function Connections() {
  const { data, loaded, reload } = useRemote(loadServers, [])
  const [view, setView] = useState<View>({ kind: "list" })
  const list = () => setView({ kind: "list" })
  const selected = view.kind === "detail" ? data.find((server) => server.id === view.id) : undefined

  if (view.kind === "add") {
    return (
      <AddServer
        onBack={list}
        onAdded={(server) => void reload().then(() => setView(server === null ? { kind: "list" } : { kind: "detail", id: server.id }))}
      />
    )
  }
  if (selected !== undefined) return <Detail key={`${selected.id}:${selected.updatedAt}`} server={selected} onBack={list} reload={reload} />

  const open = (id: string) => (event: MouseEvent) => {
    event.preventDefault()
    setView({ kind: "detail", id })
  }
  return (
    <div className="flex flex-col gap-10">
      <header className="flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <h1 className="font-medium text-foreground text-xl">Connections</h1>
            <p className="text-sm font-normal text-muted-foreground-1">Teach Tock to work with the services you use</p>
          </div>
        </div>
      </header>
      <Section>
        <Card>
          <ListCardHeader
            title={loaded ? `${count(data.length, "MCP server")}` : "MCP servers"}
            actions={<AddButton label="Add" onClick={() => setView({ kind: "add" })} />}
          />
          {data.map((server) => (
            <SettingsRowLink
              key={server.id}
              href={`/settings/connections/${server.id}`}
              onClick={open(server.id)}
              icon={glyphs.server}
              title={server.name}
              description={server.toolCount === null ? "MCP server" : `MCP server · ${tools(server.toolCount)}`}
            >
              <Connected server={server} className="max-sm:hidden" />
            </SettingsRowLink>
          ))}
        </Card>
      </Section>
    </div>
  )
}
