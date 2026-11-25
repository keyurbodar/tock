import { evaluate, type Listed } from "../../../packages/ui/parity/case"
import fixtures from "../../../packages/ui/parity/fixtures/specimens.json"
import { PageHeader } from "../shell/page-header"

const modules = import.meta.glob<{ default: readonly Listed[] }>("../../../packages/ui/parity/cases/*.tsx", { eager: true })
const specimens: Readonly<Record<string, { html: string; cap: string; box: string }>> = fixtures

const results = Object.values(modules)
  .flatMap((module) => module.default)
  .map((item) => {
    const fixture = specimens[item.ref]
    return { item, fixture, result: fixture === undefined ? undefined : evaluate(item, fixture.html) }
  })

const passed = results.filter((entry) => entry.result?.mismatches.length === 0).length

const PANE = "min-w-0 flex-1 overflow-auto rounded-(--radius-card) border-[0.5px] border-border-2 bg-panel p-3"
const STAGE = "relative min-h-14 [contain:paint]"
const LABEL = "mb-2 text-2xs font-medium text-muted-foreground-2"

export default function Gallery() {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <PageHeader />
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6">
        <header className="flex items-baseline gap-2">
          <h1 className="text-lg font-medium text-foreground">Parity</h1>
          <span className="text-sm text-muted-foreground-1" data-slot="parity-total">
            {passed} of {results.length} variants match their frame
          </span>
        </header>
        {results.map(({ item, fixture, result }) => {
          const ok = result?.mismatches.length === 0
          return (
            <section key={`${item.component}${item.ref}`} data-slot="parity-case" data-pass={ok} className="flex flex-col gap-2">
              <div className="flex min-w-0 items-baseline gap-2 text-sm">
                <span className={ok ? "font-medium text-success" : "font-medium text-destructive"}>{ok ? "Pass" : "Fail"}</span>
                <span className="font-medium text-foreground">{item.component}</span>
                <span className="min-w-0 truncate text-muted-foreground-1">{item.name}</span>
                <span className="ml-auto shrink-0 text-2xs text-muted-foreground-2">
                  {result === undefined ? "no frame specimen" : `${result.nodes - result.mismatches.length} of ${result.nodes} nodes`} · {item.ref}
                </span>
              </div>
              <div className="flex min-w-0 gap-2 max-md:flex-col">
                <div className={PANE}>
                  <div className={LABEL}>Frame</div>
                  {fixture === undefined ? null : <div className={STAGE} dangerouslySetInnerHTML={{ __html: fixture.html }} />}
                </div>
                <div className={PANE}>
                  <div className={LABEL}>Ours</div>
                  <div className={STAGE}>{item.render()}</div>
                </div>
              </div>
              {result?.mismatches.slice(0, 4).map((mismatch) => (
                <pre key={mismatch.path} className="overflow-x-auto text-2xs text-muted-foreground-1">
                  {`${mismatch.path}\n  frame ${mismatch.expected}\n  ours  ${mismatch.actual}`}
                </pre>
              ))}
            </section>
          )
        })}
      </div>
    </div>
  )
}
