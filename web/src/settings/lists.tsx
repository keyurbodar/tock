import {
  Add01Icon,
  Delete02Icon,
  Globe02Icon,
  Key01Icon,
  LockKeyIcon,
  MoreHorizontalIcon,
  Plug01Icon,
  PuzzleIcon,
  RefreshIcon,
  SparklesIcon,
} from "@hugeicons/core-free-icons"
import { BrandIcon, modelMarkOf } from "@tock/ui/brand-icon"
import { Button } from "@tock/ui/button"
import { ListCard, ListRow, Page, RowActions, Section } from "@tock/ui/card"
import { glyphs } from "@tock/ui/glyph"
import { Icon } from "@tock/ui/icon"
import { Field, Input, Textarea } from "@tock/ui/input"
import { Menu, MenuContent, MenuItem, MenuTrigger } from "@tock/ui/menu"
import { MenuSelect } from "@tock/ui/menu-select"
import { Switch } from "@tock/ui/switch"
import { Table, TableCell, TableHead, TableHeader, TableRow } from "@tock/ui/table"
import { useMemo, useState, type ReactNode } from "react"
import { http, post } from "../api/http"
import { socket } from "../api/socket"
import type { DevPluginRecord, McpAuthMode, McpServerRecord, SecretMeta, SkillRecord } from "../api/types"
import { act, useRemote } from "../lib/remote"
import { FormDialog, Segmented } from "../shell/form-dialog"
import { modelSpec, refreshModels, useModels, useProviders } from "../state/data"

const count = (total: number, noun: string) => `${total} ${noun}${total === 1 ? "" : "s"}`

function AddButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <Button variant="ghost" size="icon-sm" aria-label={label} onClick={onClick}>
      <Icon icon={Add01Icon} />
    </Button>
  )
}

function RowMenu({ label, children }: { label: string; children: ReactNode }) {
  return (
    <RowActions>
      <Menu>
        <MenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={label} />}>
          <Icon icon={MoreHorizontalIcon} />
        </MenuTrigger>
        <MenuContent align="end" className="w-40">
          {children}
        </MenuContent>
      </Menu>
    </RowActions>
  )
}

function RemoveItem({ onSelect }: { onSelect: () => void }) {
  return (
    <MenuItem danger onSelect={onSelect}>
      <Icon icon={Delete02Icon} />
      Remove
    </MenuItem>
  )
}

const MODEL_COLUMNS =
  "minmax(160px,3fr) minmax(72px,auto) minmax(72px,auto) minmax(72px,auto) minmax(96px,auto) minmax(128px,auto)"

const tokens = (count: number) => (count >= 1e6 ? `${Number((count / 1e6).toFixed(1))}M` : `${Number((count / 1e3).toFixed(1))}K`)
const dollars = (value: number) => `$${Number(value.toFixed(4))}`
const reasoningRange = (levels: readonly string[]) => (levels.length > 1 ? `${levels[0]}-${levels[levels.length - 1]}` : "—")

export function Models() {
  const providers = useProviders()
  const models = useModels()
  const [target, setTarget] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [key, setKey] = useState("")
  const connected = providers.filter((provider) => provider.configured)
  const available = useMemo(
    () => providers.filter((provider) => !provider.configured).map((provider) => ({ value: provider.id, label: provider.name })),
    [providers],
  )
  const nameOf = (id: string) => providers.find((provider) => provider.id === id)?.name ?? id
  const replacing = target !== null && connected.some((provider) => provider.id === target)
  return (
    <Page title="Models">
      <Section id="my-connections" title="Your connections" description="Your agent can use the models these serve">
        <ListCard
          title={count(connected.length, "connection")}
          actions={
            <>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Refresh model list"
                title="Refresh model list"
                onClick={() => void act(() => post("/api/models/refresh", {}).then(refreshModels), "Model list refreshed")}
              >
                <Icon icon={RefreshIcon} />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Add connection"
                title="Add connection"
                onClick={() => {
                  setTarget(null)
                  setAdding(true)
                }}
              >
                {glyphs.add}
              </Button>
            </>
          }
        >
          {connected.length > 0
            ? connected.map((provider) => (
                <ListRow
                  key={provider.id}
                  icon={<BrandIcon provider={provider.id} name={provider.name} className="size-4" />}
                  title={provider.name}
                  description={`Serves ${count(models.filter((model) => model.provider === provider.id).length, "model")}`}
                >
                  <RowMenu label={`Actions for ${provider.name}`}>
                    <MenuItem
                      onSelect={() => {
                        setTarget(provider.id)
                        setAdding(true)
                      }}
                    >
                      Replace key
                    </MenuItem>
                    <RemoveItem
                      onSelect={() =>
                        void act(() =>
                          http(`/api/providers/${encodeURIComponent(provider.id)}/credential`, { method: "DELETE" }).then(refreshModels),
                        )
                      }
                    />
                  </RowMenu>
                </ListRow>
              ))
            : null}
        </ListCard>
      </Section>
      {models.length > 0 ? (
        <Section title="Models" description="Every model your connections serve">
          <div className="flex flex-col">
            <Table card density="pick" columns={MODEL_COLUMNS}>
              <TableHeader>
                <TableHead>Model</TableHead>
                <TableHead numeric>Context</TableHead>
                <TableHead numeric>Input $</TableHead>
                <TableHead numeric>Output $</TableHead>
                <TableHead>Reasoning</TableHead>
                <TableHead>Served by</TableHead>
              </TableHeader>
              {models.map((model) => (
                <TableRow key={modelSpec(model)}>
                  <TableCell>
                    <span className="flex min-w-0 items-center gap-2">
                      <BrandIcon provider={modelMarkOf(model.name) ?? model.provider} name={model.provider} className="size-4 shrink-0" />
                      <span className="truncate">{model.name}</span>
                    </span>
                  </TableCell>
                  <TableCell numeric>{tokens(model.contextWindow)}</TableCell>
                  <TableCell numeric>{dollars(model.cost.input)}</TableCell>
                  <TableCell numeric>{dollars(model.cost.output)}</TableCell>
                  <TableCell className="text-muted-foreground">{reasoningRange(model.thinkingLevels)}</TableCell>
                  <TableCell>
                    <span className="flex max-w-full min-w-0 items-center gap-1.5">
                      <span className="max-w-full shrink-0 truncate">{nameOf(model.provider)}</span>
                    </span>
                  </TableCell>
                </TableRow>
              ))}
            </Table>
          </div>
        </Section>
      ) : null}
      <FormDialog
        open={adding}
        onOpenChange={(open) => {
          setAdding(open)
          setKey("")
        }}
        title={replacing && target ? `${nameOf(target)} key` : "Add connection"}
        description="Stored encrypted on your Worker and never shown again."
        disabled={target === null}
        onSubmit={() =>
          target === null
            ? Promise.resolve(false)
            : act(() => post(`/api/providers/${encodeURIComponent(target)}/credential`, { apiKey: key.trim() }).then(refreshModels))
        }
      >
        {replacing ? null : (
          <Field label="Provider">
            <MenuSelect
              value={target}
              options={available}
              onChange={setTarget}
              placeholder="Choose a provider"
              searchLabel="Search providers"
              className="w-56"
            />
          </Field>
        )}
        <Field label="API key">
          <Input autoFocus={replacing} required type="password" autoComplete="off" value={key} onChange={(event) => setKey(event.currentTarget.value)} />
        </Field>
      </FormDialog>
    </Page>
  )
}

const loadServers = () => socket.request<readonly McpServerRecord[]>("mcp.list")

const AUTH_MODES: readonly { value: McpAuthMode; label: string }[] = [
  { value: "headers", label: "Headers" },
  { value: "oauth", label: "OAuth" },
  { value: "sse", label: "SSE" },
]

export function Connections() {
  const { data, reload } = useRemote(loadServers, [])
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ name: "", url: "", authMode: "headers" as McpAuthMode, header: "", value: "" })
  const submit = async () => {
    if (form.authMode === "oauth") {
      const result = await post<{ authUrl?: string }>("/api/mcp/oauth", { name: form.name.trim(), url: form.url.trim() })
      if (result.authUrl) window.open(result.authUrl, "_blank", "noopener")
      return
    }
    await socket.request("mcp.upsert", {
      name: form.name.trim(),
      url: form.url.trim(),
      authMode: form.authMode,
      headers: form.header.trim() ? { [form.header.trim()]: form.value } : undefined,
    })
  }
  return (
    <Page title="Connections" description="MCP servers give your agent tools from other services.">
      <Section>
        <ListCard title={count(data.length, "server")} actions={<AddButton label="Add server" onClick={() => setOpen(true)} />}>
          {data.length > 0
            ? data.map((server) => (
                <ListRow key={server.id} icon={<Icon icon={Plug01Icon} />} title={server.name} description={server.url}>
                  <RowMenu label={`${server.name} options`}>
                    <RemoveItem onSelect={() => void act(() => socket.request("mcp.delete", { idOrName: server.id }).then(reload))} />
                  </RowMenu>
                </ListRow>
              ))
            : null}
        </ListCard>
      </Section>
      <FormDialog open={open} onOpenChange={setOpen} title="Add server" submitLabel="Add" onSubmit={() => act(() => submit().then(reload))}>
        <Field label="Name">
          <Input autoFocus required value={form.name} onChange={(event) => setForm({ ...form, name: event.currentTarget.value })} />
        </Field>
        <Field label="URL">
          <Input required type="url" placeholder="https://" value={form.url} onChange={(event) => setForm({ ...form, url: event.currentTarget.value })} />
        </Field>
        <Field label="Sign-in">
          <Segmented label="Sign-in" value={form.authMode} options={AUTH_MODES} onChange={(authMode) => setForm({ ...form, authMode })} />
        </Field>
        {form.authMode === "oauth" ? null : (
          <Field label="Header" hint="Optional, for example Authorization and a bearer token.">
            <div className="flex gap-2">
              <Input aria-label="Header name" placeholder="Authorization" value={form.header} onChange={(event) => setForm({ ...form, header: event.currentTarget.value })} className="w-40" />
              <Input aria-label="Header value" type="password" autoComplete="off" value={form.value} onChange={(event) => setForm({ ...form, value: event.currentTarget.value })} className="flex-1" />
            </div>
          </Field>
        )}
      </FormDialog>
    </Page>
  )
}

const loadSecrets = () => socket.request<readonly SecretMeta[]>("vault.list")

export function Secrets() {
  const { data, reload } = useRemote(loadSecrets, [])
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ name: "", value: "", origin: "", description: "" })
  return (
    <Page title="Secrets" description="Values your agent can use in requests without ever seeing them.">
      <Section>
        <ListCard title={count(data.length, "secret")} actions={<AddButton label="Add secret" onClick={() => setOpen(true)} />}>
          {data.length > 0
            ? data.map((secret) => (
                <ListRow
                  key={secret.name}
                  icon={<Icon icon={LockKeyIcon} />}
                  title={secret.name}
                  description={[secret.origin, secret.description].filter(Boolean).join(" · ") || undefined}
                >
                  <RowMenu label={`${secret.name} options`}>
                    <RemoveItem onSelect={() => void act(() => socket.request("vault.delete", { name: secret.name }).then(reload))} />
                  </RowMenu>
                </ListRow>
              ))
            : null}
        </ListCard>
      </Section>
      <FormDialog
        open={open}
        onOpenChange={setOpen}
        title="Add secret"
        submitLabel="Add"
        onSubmit={() =>
          act(() =>
            socket
              .request("vault.set", {
                name: form.name.trim(),
                value: form.value,
                origin: form.origin.trim() || undefined,
                description: form.description.trim() || undefined,
              })
              .then(reload),
          )
        }
      >
        <Field label="Name">
          <Input autoFocus required placeholder="GITHUB_TOKEN" value={form.name} onChange={(event) => setForm({ ...form, name: event.currentTarget.value })} />
        </Field>
        <Field label="Value">
          <Input required type="password" autoComplete="off" value={form.value} onChange={(event) => setForm({ ...form, value: event.currentTarget.value })} />
        </Field>
        <Field label="Allowed site" hint="The secret is only sent to this origin.">
          <Input type="url" placeholder="https://api.github.com" value={form.origin} onChange={(event) => setForm({ ...form, origin: event.currentTarget.value })} />
        </Field>
        <Field label="Description">
          <Input value={form.description} onChange={(event) => setForm({ ...form, description: event.currentTarget.value })} />
        </Field>
      </FormDialog>
    </Page>
  )
}

const loadSkills = () => socket.request<readonly SkillRecord[]>("skill.list")

export function Skills() {
  const { data, reload } = useRemote(loadSkills, [])
  const [mode, setMode] = useState<"new" | "import" | null>(null)
  const [form, setForm] = useState({ name: "", description: "", bodyMd: "", source: "" })
  return (
    <Page title="Skills" description="Instructions your agent loads when a task calls for them.">
      <Section>
        <ListCard
          title={count(data.length, "skill")}
          actions={
            <>
              <Button variant="ghost" size="icon-sm" aria-label="Import skill" onClick={() => setMode("import")}>
                <Icon icon={Globe02Icon} />
              </Button>
              <AddButton label="New skill" onClick={() => setMode("new")} />
            </>
          }
        >
          {data.length > 0
            ? data.map((skill) => (
                <ListRow key={skill.name} icon={<Icon icon={SparklesIcon} />} title={skill.name} description={skill.description}>
                  <RowMenu label={`${skill.name} options`}>
                    <RemoveItem onSelect={() => void act(() => socket.request("skill.delete", { name: skill.name }).then(reload))} />
                  </RowMenu>
                </ListRow>
              ))
            : null}
        </ListCard>
      </Section>
      <FormDialog
        open={mode === "new"}
        onOpenChange={(open) => setMode(open ? "new" : null)}
        title="New skill"
        submitLabel="Create"
        onSubmit={() =>
          act(() =>
            socket
              .request("skill.upsert", { name: form.name.trim(), description: form.description.trim(), bodyMd: form.bodyMd })
              .then(reload),
          )
        }
      >
        <Field label="Name">
          <Input autoFocus required value={form.name} onChange={(event) => setForm({ ...form, name: event.currentTarget.value })} />
        </Field>
        <Field label="Description">
          <Input value={form.description} onChange={(event) => setForm({ ...form, description: event.currentTarget.value })} />
        </Field>
        <Field label="Instructions">
          <Textarea required mono rows={8} value={form.bodyMd} onChange={(event) => setForm({ ...form, bodyMd: event.currentTarget.value })} />
        </Field>
      </FormDialog>
      <FormDialog
        open={mode === "import"}
        onOpenChange={(open) => setMode(open ? "import" : null)}
        title="Import skill"
        description="Paste a link to a skill file or repository."
        submitLabel="Import"
        onSubmit={() => act(() => socket.request("skill.import", { source: form.source.trim() }).then(reload))}
      >
        <Field label="Link">
          <Input autoFocus required placeholder="https://github.com/owner/repo" value={form.source} onChange={(event) => setForm({ ...form, source: event.currentTarget.value })} />
        </Field>
      </FormDialog>
    </Page>
  )
}

const loadPlugins = () => socket.request<readonly DevPluginRecord[]>("plugin.list")

const PLUGIN_KINDS: readonly { value: DevPluginRecord["kind"]; label: string }[] = [
  { value: "tool", label: "Tool" },
  { value: "webhook_filter", label: "Webhook filter" },
]

export function Plugins() {
  const { data, reload } = useRemote(loadPlugins, [])
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ name: "", kind: "tool" as DevPluginRecord["kind"], description: "", schemaJson: "{}", tsSource: "" })
  const save = (plugin: Omit<DevPluginRecord, "id" | "updatedAt"> & { id?: string }) =>
    act(() => socket.request("plugin.upsert", { plugin }).then(reload))
  return (
    <Page title="Plugins" description="Small scripts that add tools or filter incoming webhooks.">
      <Section>
        <ListCard title={count(data.length, "plugin")} actions={<AddButton label="New plugin" onClick={() => setOpen(true)} />}>
          {data.length > 0
            ? data.map((plugin) => (
                <ListRow
                  key={plugin.id}
                  icon={<Icon icon={PuzzleIcon} />}
                  title={plugin.name}
                  description={plugin.description || (plugin.kind === "tool" ? "Tool" : "Webhook filter")}
                >
                  <Switch
                    aria-label={`Enable ${plugin.name}`}
                    checked={plugin.enabled}
                    onCheckedChange={(enabled) =>
                      void save({
                        id: plugin.id,
                        name: plugin.name,
                        kind: plugin.kind,
                        description: plugin.description,
                        schemaJson: plugin.schemaJson,
                        tsSource: plugin.tsSource,
                        enabled,
                      })
                    }
                  />
                  <RowMenu label={`${plugin.name} options`}>
                    <RemoveItem onSelect={() => void act(() => socket.request("plugin.delete", { pluginId: plugin.id }).then(reload))} />
                  </RowMenu>
                </ListRow>
              ))
            : null}
        </ListCard>
      </Section>
      <FormDialog open={open} onOpenChange={setOpen} title="New plugin" submitLabel="Create" onSubmit={() => save({ ...form, name: form.name.trim(), enabled: true })}>
        <Field label="Name">
          <Input autoFocus required value={form.name} onChange={(event) => setForm({ ...form, name: event.currentTarget.value })} />
        </Field>
        <Field label="Kind">
          <Segmented label="Kind" value={form.kind} options={PLUGIN_KINDS} onChange={(kind) => setForm({ ...form, kind })} />
        </Field>
        <Field label="Description">
          <Input value={form.description} onChange={(event) => setForm({ ...form, description: event.currentTarget.value })} />
        </Field>
        <Field label="Input schema">
          <Textarea mono rows={3} value={form.schemaJson} onChange={(event) => setForm({ ...form, schemaJson: event.currentTarget.value })} />
        </Field>
        <Field label="Source">
          <Textarea required mono rows={8} value={form.tsSource} onChange={(event) => setForm({ ...form, tsSource: event.currentTarget.value })} />
        </Field>
      </FormDialog>
    </Page>
  )
}
