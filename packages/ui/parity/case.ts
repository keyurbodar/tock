import type { ReactElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { compare } from "./canon"

export interface Case {
  readonly ref: string
  readonly name: string
  readonly render: () => ReactElement
  readonly measured?: readonly string[]
}

export const cases = (
  component: string,
  list: ReadonlyArray<readonly [ref: string, name: string, render: () => ReactElement, measured?: readonly string[]]>,
) => list.map(([ref, name, render, measured]): Case & { component: string } => ({ component, ref, name, render, measured }))

export type Listed = Case & { readonly component: string }

export function evaluate(item: Case, fixture: string) {
  const frame = (item.measured ?? []).reduce((html, property) => html.replace(new RegExp(`\\s*${property}:[^;"]*;?`, "g"), ""), fixture)
  return compare(frame, renderToStaticMarkup(item.render()).replace(/<link rel="preload"[^>]*>/g, ""))
}
