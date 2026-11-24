import { createFileRoute, redirect } from "@tanstack/react-router"
import { isSection } from "../settings/sections"

export const Route = createFileRoute("/settings/$section")({
  beforeLoad: ({ params }) => {
    throw redirect({ to: "/", search: { settings: isSection(params.section) ? params.section : "general" }, replace: true })
  },
})
