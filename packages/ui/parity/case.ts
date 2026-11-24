import type { ReactElement } from "react"

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
