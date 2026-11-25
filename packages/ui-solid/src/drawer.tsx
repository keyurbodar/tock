import {
  Drawer,
  DrawerBackdrop as BaseDrawerBackdrop,
  DrawerClose,
  DrawerContent as BaseDrawerContent,
  DrawerDescription,
  DrawerHandle,
  DrawerTitle,
  DrawerTrigger,
} from "@ui-sdk/solid/drawer"
import { omit, type ComponentProps } from "solid-js"
import { cn } from "./cn"
import "./drawer.css"

export type DrawerBackdropProps = ComponentProps<typeof BaseDrawerBackdrop>

export function DrawerBackdrop(props: DrawerBackdropProps) {
  const rest = omit(props, "class")
  return <BaseDrawerBackdrop {...rest} class={cn("tui-drawer-backdrop", typeof props.class === "string" ? props.class : undefined)} />
}

export type DrawerContentProps = ComponentProps<typeof BaseDrawerContent>

export function DrawerContent(props: DrawerContentProps) {
  const rest = omit(props, "class")
  return <BaseDrawerContent {...rest} class={cn("tui-drawer-content", typeof props.class === "string" ? props.class : undefined)} />
}

export { Drawer, DrawerClose, DrawerDescription, DrawerHandle, DrawerTitle, DrawerTrigger }
