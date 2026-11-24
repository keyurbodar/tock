import { Card, Page, Section, SettingsRow } from "@tock/ui/card"
import { Input } from "@tock/ui/input"
import { Switch } from "@tock/ui/switch"
import { ModelPicker } from "../chat/model-picker"
import { act } from "../lib/remote"
import { updateSettings, useSettings } from "../state/data"

const MODEL_ROWS = [
  { key: "model", title: "Default model", description: "Used for new chats" },
  { key: "backgroundModel", title: "Background model", description: "Used for routines and memory upkeep" },
  { key: "fallbackModel", title: "Fallback model", description: "Used when the default model fails" },
] as const

export function General() {
  const settings = useSettings()
  if (settings === null) return <Page title="General">{null}</Page>
  return (
    <Page title="General">
      <Section title="Models">
        <Card>
          {MODEL_ROWS.map((row) => (
            <SettingsRow key={row.key} title={row.title} description={row.description}>
              <ModelPicker
                side="bottom"
                showLevel={false}
                emptyLabel="Not set"
                value={{ model: settings[row.key], thinkingLevel: null }}
                onChange={(choice) => void act(() => updateSettings({ [row.key]: choice.model }))}
              />
            </SettingsRow>
          ))}
        </Card>
      </Section>
      <Section title="Agent">
        <Card>
          <SettingsRow title="Timezone" description="Routines and reminders run in this timezone">
            <Input
              key={settings.timezone}
              aria-label="Timezone"
              defaultValue={settings.timezone}
              className="w-56"
              onBlur={(event) => {
                const timezone = event.currentTarget.value.trim()
                if (timezone && timezone !== settings.timezone) void act(() => updateSettings({ timezone }), "Timezone saved")
              }}
            />
          </SettingsRow>
          <SettingsRow title="Parallel helpers" description="How many helper agents may run at once">
            <Input
              key={settings.maxSubagents}
              aria-label="Parallel helpers"
              type="number"
              min={1}
              max={16}
              defaultValue={settings.maxSubagents}
              className="w-20"
              onBlur={(event) => {
                const maxSubagents = Number(event.currentTarget.value)
                if (Number.isInteger(maxSubagents) && maxSubagents >= 1 && maxSubagents <= 16 && maxSubagents !== settings.maxSubagents)
                  void act(() => updateSettings({ maxSubagents }))
              }}
            />
          </SettingsRow>
          <SettingsRow title="Developer mode" description="Lets the agent write and run its own plugins">
            <Switch
              aria-label="Developer mode"
              checked={settings.devMode}
              onCheckedChange={(devMode) => void act(() => updateSettings({ devMode }))}
            />
          </SettingsRow>
        </Card>
      </Section>
    </Page>
  )
}
