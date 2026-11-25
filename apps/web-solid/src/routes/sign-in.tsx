import { createFileRoute } from "@tanstack/solid-router"
import { ClerkStep } from "../app/first-run/clerk-step"
import { FirstRunFrame } from "../app/first-run/frame"

export const Route = createFileRoute("/sign-in")({
  component: SignInPage,
})

function SignInPage() {
  return (
    <FirstRunFrame>
      <ClerkStep />
    </FirstRunFrame>
  )
}
