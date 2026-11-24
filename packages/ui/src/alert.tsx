import type { ReactNode } from "react"

const ALERT =
  "relative w-full rounded-(--radius-card) border-[0.5px] border-border-1 bg-card p-4 text-sm shadow-card [&>svg]:absolute [&>svg]:left-4 [&>svg]:top-4 [&>svg]:size-(--icon-base) [&>svg~*:not([data-slot=alert-action])]:pl-6.5 has-[>[data-slot=alert-action]]:grid has-[>[data-slot=alert-action]]:grid-cols-[minmax(0,1fr)_auto] has-[>[data-slot=alert-action]]:gap-x-4 text-foreground [&>[data-slot=alert-description]]:text-muted-foreground-1 [&>svg]:text-[var(--intent-text,var(--muted-foreground-1))] [&>svg]:[--intent-text:var(--destructive)]"

const ERROR = (
  <svg xmlns="http://www.w3.org/2000/svg" width="24px" height="24px" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path
      fillRule="evenodd"
      clipRule="evenodd"
      d="M12 2C17.5228 2 22 6.47715 22 12C22 17.5228 17.5228 22 12 22C6.47715 22 2 17.5228 2 12C2 6.47715 6.47715 2 12 2ZM12 14.5996C11.3373 14.5996 10.7998 15.1371 10.7998 15.7998C10.7999 16.4624 11.3373 17 12 17C12.6627 17 13.2001 16.4625 13.2002 15.7998C13.2002 15.1371 12.6627 14.5996 12 14.5996ZM12 7C11.4477 7 11 7.44772 11 8V12C11 12.5523 11.4477 13 12 13C12.5523 13 13 12.5523 13 12V8C13 7.44772 12.5523 7 12 7Z"
      fill="currentColor"
    />
  </svg>
)

export function ErrorAlert({ title, code, children }: { title: string; code?: string; children?: ReactNode }) {
  return (
    <div data-slot="alert" role="alert" className={ALERT}>
      {ERROR}
      <h5 data-slot="alert-title" className="text-sm font-medium leading-4 break-words [&:has(~[data-slot=alert-description])]:mb-1" title={code}>
        {title}
      </h5>
      {children ? (
        <div data-slot="alert-description" className="text-sm font-normal break-words">
          {children}
        </div>
      ) : null}
    </div>
  )
}
