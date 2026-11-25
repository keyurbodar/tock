import {
  Field as BaseField,
  FieldControl,
  FieldDescription as BaseFieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel as BaseFieldLabel,
  FieldLegend,
  FieldSet,
} from "@ui-sdk/solid/field"
import { omit, type ComponentProps } from "solid-js"
import { cn } from "./cn"
import "./field.css"

export type FieldProps = ComponentProps<typeof BaseField>

export function Field(props: FieldProps) {
  const rest = omit(props, "class")
  return <BaseField {...rest} class={cn("tui-field", typeof props.class === "string" ? props.class : undefined)} />
}

export type FieldLabelProps = ComponentProps<typeof BaseFieldLabel>

export function FieldLabel(props: FieldLabelProps) {
  const rest = omit(props, "class")
  return <BaseFieldLabel {...rest} class={cn("tui-field-label", typeof props.class === "string" ? props.class : undefined)} />
}

export type FieldDescriptionProps = ComponentProps<typeof BaseFieldDescription>

export function FieldDescription(props: FieldDescriptionProps) {
  const rest = omit(props, "class")
  return <BaseFieldDescription {...rest} class={cn("tui-field-description", typeof props.class === "string" ? props.class : undefined)} />
}

export { FieldControl, FieldError, FieldGroup, FieldLegend, FieldSet }
