import type { ReactElement } from "react"

export interface Case {
  readonly ref: string
  readonly name: string
  readonly render: () => ReactElement
}

export const cases = (component: string, list: ReadonlyArray<readonly [ref: string, name: string, render: () => ReactElement]>) =>
  list.map(([ref, name, render]): Case & { component: string } => ({ component, ref, name, render }))
