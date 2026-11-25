import { Button as BaseButton } from "@ui-sdk/solid/button"
import { omit, type ComponentProps } from "solid-js"
import { cn } from "./cn"
import "./button.css"

type ButtonVariant = "ghost" | "solid" | "accent" | "danger"
type ButtonSize = "sm" | "md" | "icon" | "rail" | "composer" | "inline"

export type ButtonProps = ComponentProps<typeof BaseButton> & {
  variant?: ButtonVariant
  size?: ButtonSize
}

export function Button(props: ButtonProps) {
  const rest = omit(props, "variant", "size", "class")
  return (
    <BaseButton
      {...rest}
      class={cn(
        "tui-button",
        `tui-button--${props.variant ?? "ghost"}`,
        `tui-button--${props.size ?? "md"}`,
        typeof props.class === "string" ? props.class : undefined,
      )}
    />
  )
}

export type IconButtonProps = ButtonProps & { "aria-label": string }

export function IconButton(props: IconButtonProps) {
  const rest = omit(props, "size", "variant")
  return <Button {...rest} variant={props.variant ?? "ghost"} size={props.size ?? "icon"} />
}
