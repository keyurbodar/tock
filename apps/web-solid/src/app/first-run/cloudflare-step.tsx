import { Field, FieldControl, FieldDescription, FieldLabel } from "@tock/ui-solid/field"
import { Button } from "@tock/ui-solid/button"

export function CloudflareStep() {
  return (
    <>
      <h1>Deployment endpoint</h1>
      <p>Cloudflare Access sits in front of the API. The app uses the same origin by default and only needs an endpoint override for split development.</p>
      <Field name="endpoint">
        <FieldLabel>Worker URL</FieldLabel>
        <FieldControl class="tui-field-control" placeholder="https://your-worker.example.com" />
        <FieldDescription>Optional for same-origin production deployments.</FieldDescription>
      </Field>
      <Button type="button">Save endpoint</Button>
    </>
  )
}
