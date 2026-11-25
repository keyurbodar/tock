import {
  ScrollArea as BaseScrollArea,
  ScrollAreaContent,
  ScrollAreaCorner,
  ScrollAreaScrollbar,
  ScrollAreaScrollToEnd,
  ScrollAreaThumb,
  ScrollAreaViewport,
} from "@ui-sdk/solid/scroll-area"
import { omit, type ComponentProps } from "solid-js"
import { cn } from "./cn"
import "./scroll-area.css"

export type ScrollAreaProps = ComponentProps<typeof BaseScrollArea>

export function ScrollArea(props: ScrollAreaProps) {
  const rest = omit(props, "class")
  return <BaseScrollArea {...rest} class={cn("tui-scroll-area", typeof props.class === "string" ? props.class : undefined)} />
}

export { ScrollAreaContent, ScrollAreaCorner, ScrollAreaScrollbar, ScrollAreaScrollToEnd, ScrollAreaThumb, ScrollAreaViewport }
