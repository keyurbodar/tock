export type Token = readonly [content: string, style: string]

export interface HighlightRequest {
  readonly type: "highlight"
  readonly id: number
  readonly key: string
  readonly text: string
  readonly language: string
  readonly complete: boolean
}

export type WorkerRequest = HighlightRequest | { readonly type: "dispose"; readonly key: string }

export type WorkerResponse =
  | {
      readonly type: "highlight"
      readonly id: number
      readonly key: string
      readonly reset: boolean
      readonly stable: readonly Token[]
      readonly unstable: readonly Token[]
    }
  | { readonly type: "superseded"; readonly id: number; readonly key: string }
  | { readonly type: "error"; readonly id: number; readonly key: string; readonly message: string }
