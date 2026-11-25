import type { FixtureSettingSection } from "./types"

export const fixtureSettings: FixtureSettingSection[] = [
  {
    id: "profile",
    title: "Profile",
    description: "Owner identity and defaults for this Tock install.",
    fields: [
      { id: "name", label: "Display name", value: "Owner", kind: "text" },
      { id: "timezone", label: "Time zone", value: "UTC", kind: "select" },
    ],
  },
  {
    id: "models",
    title: "Models",
    description: "Model providers and fallback order.",
    fields: [
      { id: "default", label: "Default model", value: "pi-large", kind: "select" },
      { id: "fallbacks", label: "Use fallbacks", value: "enabled", kind: "toggle" },
    ],
  },
  {
    id: "memory",
    title: "Memory",
    description: "What Tock is allowed to remember and revise.",
    fields: [
      { id: "write-memory", label: "Write memories", value: "enabled", kind: "toggle" },
      { id: "retention", label: "Retention", value: "Owner controlled", kind: "text" },
    ],
  },
]

export const emptySettingsCopy = {
  title: "Settings unavailable",
  body: "Fixture settings are empty for this state. Populate a profile to edit preferences.",
  action: "Reset fixture",
}
