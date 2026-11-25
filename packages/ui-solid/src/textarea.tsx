import { Textarea as BaseTextarea } from "@ui-sdk/solid/textarea"
import { omit, type ComponentProps } from "solid-js"
import { cn } from "./cn"
import "./input.css"

export type TextareaProps = ComponentProps<typeof BaseTextarea>

export function Textarea(props: TextareaProps) {
  const rest = omit(props, "class")
  return <BaseTextarea {...rest} class={cn("tui-input", "tui-textarea", typeof props.class === "string" ? props.class : undefined)} />
}
