import {
  Key01Icon,
  KeyboardIcon,
  LockKeyIcon,
  Notification01Icon,
  PaintBoardIcon,
  Plug01Icon,
  PuzzleIcon,
  Settings02Icon,
  SparklesIcon,
} from "@hugeicons/core-free-icons"
import type { IconData } from "@tock/ui/icon"

export const SECTIONS = [
  { id: "general", label: "General", icon: Settings02Icon, group: "" },
  { id: "appearance", label: "Appearance", icon: PaintBoardIcon, group: "" },
  { id: "notifications", label: "Notifications", icon: Notification01Icon, group: "" },
  { id: "shortcuts", label: "Shortcuts", icon: KeyboardIcon, group: "" },
  { id: "models", label: "Models", icon: Key01Icon, group: "" },
  { id: "connections", label: "Connections", icon: Plug01Icon, group: "" },
  { id: "plugins", label: "Plugins", icon: PuzzleIcon, group: "" },
  { id: "secrets", label: "Secrets", icon: LockKeyIcon, group: "" },
  { id: "skills", label: "Skills", icon: SparklesIcon, group: "Agent" },
] as const satisfies readonly { id: string; label: string; icon: IconData; group: string }[]

export type SectionId = (typeof SECTIONS)[number]["id"]

export const isSection = (value: string): value is SectionId => SECTIONS.some((section) => section.id === value)

export type SettingsView = SectionId | "list"

export const isSettingsView = (value: unknown): value is SettingsView =>
  typeof value === "string" && (value === "list" || isSection(value))
