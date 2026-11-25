import { Input as BaseInput, InputClear, InputGroup } from "@ui-sdk/solid/input"
import { omit, type ComponentProps } from "solid-js"
import { cn } from "./cn"
import "./input.css"

export type InputProps = ComponentProps<typeof BaseInput>

export function Input(props: InputProps) {
  const rest = omit(props, "class")
  return <BaseInput {...rest} class={cn("tui-input", typeof props.class === "string" ? props.class : undefined)} />
}

export { InputClear, InputGroup }
