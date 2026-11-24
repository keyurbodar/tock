import { Add01Icon, Clock01Icon, Delete02Icon } from "@hugeicons/core-free-icons"
import { createFileRoute } from "@tanstack/react-router"
import { Button } from "@tock/ui/button"
import { Empty } from "@tock/ui/card"
import { Icon } from "@tock/ui/icon"
import { Field, Input, Textarea } from "@tock/ui/input"
import { Switch } from "@tock/ui/switch"
import { useState } from "react"
import { socket } from "../api/socket"
import type { RoutineRecord, ScheduleType } from "../api/types"
import { relativeTime } from "../lib/format"
import { act, useRemote } from "../lib/remote"
import { FormDialog, Segmented } from "../shell/form-dialog"
import { ListGroup, ListItem, ListPage } from "../shell/list-page"

export const Route = createFileRoute("/routines")({ component: Routines })

type Draft = Pick<RoutineRecord, "name" | "schedule" | "scheduleType" | "prompt" | "checkScript" | "quietIfUnchanged" | "enabled"> & {
  id?: string
}

const BLANK: Draft = {
  name: "",
  schedule: "",
  scheduleType: "cron",
  prompt: "",
  checkScript: null,
  quietIfUnchanged: false,
  enabled: true,
}

const SCHEDULE_TYPES: readonly { value: ScheduleType; label: string; hint: string; placeholder: string }[] = [
  { value: "cron", label: "Cron", hint: "Five-field cron expression, in your timezone.", placeholder: "0 9 * * 1-5" },
  { value: "interval", label: "Interval", hint: "Seconds between runs.", placeholder: "3600" },
  { value: "delayed", label: "Once", hint: "Seconds from now.", placeholder: "600" },
]

const toDraft = (routine: RoutineRecord): Draft => ({
  id: routine.id,
  name: routine.name,
  schedule: routine.schedule,
  scheduleType: routine.scheduleType,
  prompt: routine.prompt,
  checkScript: routine.checkScript,
  quietIfUnchanged: routine.quietIfUnchanged,
  enabled: routine.enabled,
})

const load = () => socket.request<readonly RoutineRecord[]>("routine.list")

function Routines() {
  const { data, loaded, reload } = useRemote(load, [])
  const [draft, setDraft] = useState<Draft | null>(null)
  const kind = SCHEDULE_TYPES.find((type) => type.value === draft?.scheduleType) ?? SCHEDULE_TYPES[0]
  const save = (routine: Draft) => act(() => socket.request("routine.upsert", { routine }).then(reload))
  return (
    <ListPage
      title="Routines"
      actions={
        <Button variant="ghost" size="icon-sm" aria-label="New routine" onClick={() => setDraft(BLANK)}>
          <Icon icon={Add01Icon} />
        </Button>
      }
    >
      {loaded && data.length === 0 ? (
        <Empty title="No routines yet" description="A routine runs a prompt on a schedule, or only when something it checks has changed.">
          <Button variant="outline" onClick={() => setDraft(BLANK)}>
            New routine
          </Button>
        </Empty>
      ) : null}
      {data.length > 0 ? (
        <ListGroup label="All routines" count={data.length}>
          {data.map((routine) => (
            <ListItem
              key={routine.id}
              icon={<Icon icon={Clock01Icon} />}
              title={routine.name}
              meta={routine.enabled ? routine.schedule : "Paused"}
              time={relativeTime(routine.lastRunAt)}
              onClick={() => setDraft(toDraft(routine))}
              trailing={
                <>
                  <Switch
                    aria-label={`Enable ${routine.name}`}
                    checked={routine.enabled}
                    onCheckedChange={(enabled) => void save({ ...toDraft(routine), enabled })}
                  />
                  <Button variant="ghost"
                    size="icon-sm"
                    intent="danger"
                    aria-label={`Delete ${routine.name}`}
                    onClick={() => void act(() => socket.request("routine.delete", { routineId: routine.id }).then(reload))}
                  >
                    <Icon icon={Delete02Icon} />
                  </Button>
                </>
              }
            />
          ))}
        </ListGroup>
      ) : null}
      <FormDialog
        open={draft !== null}
        onOpenChange={(open) => {
          if (!open) setDraft(null)
        }}
        title={draft?.id ? "Edit routine" : "New routine"}
        submitLabel={draft?.id ? "Save" : "Create"}
        onSubmit={() => (draft ? save({ ...draft, name: draft.name.trim(), schedule: draft.schedule.trim() }) : Promise.resolve(false))}
      >
        {draft ? (
          <>
            <Field label="Name">
              <Input autoFocus required value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.currentTarget.value })} />
            </Field>
            <Field label="Schedule" hint={kind?.hint}>
              <Segmented
                label="Schedule type"
                value={draft.scheduleType}
                options={SCHEDULE_TYPES}
                onChange={(scheduleType) => setDraft({ ...draft, scheduleType })}
              />
              <Input
                required
                aria-label="Schedule"
                placeholder={kind?.placeholder}
                value={draft.schedule}
                onChange={(event) => setDraft({ ...draft, schedule: event.currentTarget.value })}
              />
            </Field>
            <Field label="Prompt">
              <Textarea required rows={4} value={draft.prompt} onChange={(event) => setDraft({ ...draft, prompt: event.currentTarget.value })} />
            </Field>
            <Field label="Check script" hint="Optional. Runs first without the model, and the prompt only runs when its result changes.">
              <Textarea
                mono
                rows={4}
                value={draft.checkScript ?? ""}
                onChange={(event) => setDraft({ ...draft, checkScript: event.currentTarget.value || null })}
              />
            </Field>
            <label className="flex items-center justify-between gap-3 text-sm font-medium text-foreground">
              Stay quiet when nothing changed
              <Switch
                checked={draft.quietIfUnchanged}
                onCheckedChange={(quietIfUnchanged) => setDraft({ ...draft, quietIfUnchanged })}
              />
            </label>
          </>
        ) : null}
      </FormDialog>
    </ListPage>
  )
}
