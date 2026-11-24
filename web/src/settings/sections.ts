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
  { id: "general", label: "General", icon: Settings02Icon },
  { id: "appearance", label: "Appearance", icon: PaintBoardIcon },
  { id: "models", label: "Models", icon: Key01Icon },
  { id: "connections", label: "Connections", icon: Plug01Icon },
  { id: "secrets", label: "Secrets", icon: LockKeyIcon },
  { id: "skills", label: "Skills", icon: SparklesIcon },
  { id: "plugins", label: "Plugins", icon: PuzzleIcon },
  { id: "notifications", label: "Notifications", icon: Notification01Icon },
  { id: "shortcuts", label: "Shortcuts", icon: KeyboardIcon },
] as const satisfies readonly { id: string; label: string; icon: IconData }[]

export type SectionId = (typeof SECTIONS)[number]["id"]

export const isSection = (value: string): value is SectionId => SECTIONS.some((section) => section.id === value)
