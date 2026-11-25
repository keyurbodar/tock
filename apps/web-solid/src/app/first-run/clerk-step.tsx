import { createSignal } from "solid-js"
import { Button } from "@tock/ui-solid/button"
import { OTPInput, OTPInputGroup, OTPInputSlot } from "@tock/ui-solid/otp-input"
import { openClerkSignIn } from "./clerk"

export function ClerkStep() {
  const [opening, setOpening] = createSignal(false)
  const signIn = async () => {
    setOpening(true)
    try {
      await openClerkSignIn()
    } finally {
      setOpening(false)
    }
  }
  return (
    <>
      <h1>Sign in to Tock</h1>
      <p>Use the owner account for this deployment. Authentication runs through Clerk, with Cloudflare protecting the Worker routes.</p>
      <OTPInput aria-label="One-time sign-in code" maxLength={6} name="code">
        <OTPInputGroup>
          <OTPInputSlot index={0} />
          <OTPInputSlot index={1} />
          <OTPInputSlot index={2} />
          <OTPInputSlot index={3} />
          <OTPInputSlot index={4} />
          <OTPInputSlot index={5} />
        </OTPInputGroup>
      </OTPInput>
      <Button disabled={opening()} onClick={signIn} type="button">
        {opening() ? "Opening…" : "Continue with Clerk"}
      </Button>
    </>
  )
}
