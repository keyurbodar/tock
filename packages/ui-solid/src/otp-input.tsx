import {
  OTPInput as BaseOTPInput,
  OTPInputGroup as BaseOTPInputGroup,
  OTPInputSeparator,
  OTPInputSlot as BaseOTPInputSlot,
} from "@ui-sdk/solid/otp-input"
import { omit, type ComponentProps } from "solid-js"
import { cn } from "./cn"
import "./otp-input.css"

export type OTPInputProps = ComponentProps<typeof BaseOTPInput>

export function OTPInput(props: OTPInputProps) {
  const rest = omit(props, "class")
  return <BaseOTPInput {...rest} class={cn("tui-otp-input", typeof props.class === "string" ? props.class : undefined)} />
}

export type OTPInputGroupProps = ComponentProps<typeof BaseOTPInputGroup>

export function OTPInputGroup(props: OTPInputGroupProps) {
  const rest = omit(props, "class")
  return <BaseOTPInputGroup {...rest} class={cn("tui-otp-group", typeof props.class === "string" ? props.class : undefined)} />
}

export type OTPInputSlotProps = ComponentProps<typeof BaseOTPInputSlot>

export function OTPInputSlot(props: OTPInputSlotProps) {
  const rest = omit(props, "class")
  return <BaseOTPInputSlot {...rest} class={cn("tui-otp-slot", typeof props.class === "string" ? props.class : undefined)} />
}

export { OTPInputSeparator }
