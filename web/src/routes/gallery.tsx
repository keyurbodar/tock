import { createFileRoute, redirect } from "@tanstack/react-router"
import { lazy } from "react"

const Gallery = import.meta.env.DEV ? lazy(() => import("../parity/gallery")) : () => null

export const Route = createFileRoute("/gallery")({
  beforeLoad: () => {
    if (!import.meta.env.DEV) throw redirect({ to: "/" })
  },
  component: Gallery,
})
