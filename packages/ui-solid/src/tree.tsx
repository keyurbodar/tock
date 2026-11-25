import {
  Tree as BaseTree,
  TreeGroup,
  TreeItem,
  TreeItemCheckbox,
  TreeItemIndicator,
  TreeItemLabel,
  TreeItems,
} from "@ui-sdk/solid/tree"
import { omit, type ComponentProps } from "solid-js"
import { cn } from "./cn"
import "./tree.css"

export type TreeProps = ComponentProps<typeof BaseTree>

export function Tree(props: TreeProps) {
  const rest = omit(props, "class")
  return <BaseTree {...rest} class={cn("tui-tree", typeof props.class === "string" ? props.class : undefined)} />
}

export { TreeGroup, TreeItem, TreeItemCheckbox, TreeItemIndicator, TreeItemLabel, TreeItems }
