const glyph = (paths: readonly string[], join = true) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24px" height="24px" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    {paths.map((d) => (
      <path key={d} d={d} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin={join ? "round" : undefined} />
    ))}
  </svg>
)

export const glyphs = {
  minus: glyph(["M7 12H17"], false),
  plus: glyph(["M12 4V12M12 12V20M12 12H4M12 12H20"], false),
  close: glyph(["M5 5L19 19M19 5L5 19"], false),
  reset: glyph([
    "M4.4834 14.6667C5.58163 17.7738 8.54493 20 12.0282 20C16.4465 20 20.0282 16.4183 20.0282 12C20.0282 7.58172 16.4465 4 12.0282 4C8.93224 4 6.99986 5.5 4.99986 8",
    "M5 4V8H9",
  ]),
  copy: glyph([
    "M9 9V5.25C9 4.00736 10.0074 3 11.25 3H18.75C19.9926 3 21 4.00736 21 5.25V12.75C21 13.9926 19.9926 15 18.75 15H15M12.75 9H5.25C4.00736 9 3 10.0074 3 11.25V18.75C3 19.9926 4.00736 21 5.25 21H12.75C13.9926 21 15 19.9926 15 18.75V11.25C15 10.0074 13.9926 9 12.75 9Z",
  ]),
  download: glyph(["M20 15V17C20 18.6569 18.6569 20 17 20H7C5.34315 20 4 18.6569 4 17V15M12 14.5V4M12 14.5L8.5 11M12 14.5L15.5 11"]),
  previous: glyph(["M10 6L4 12L10 18", "M5 12H20"]),
  next: glyph(["M14 6L20 12L14 18", "M19 12H4"]),
  add: glyph(["M12 5.5V12M12 12V18.5M12 12H5.5M12 12H18.5"], false),
  send: glyph(["M12 5V20", "M6 10L12 4L18 10"]),
  stop: (
    <svg aria-hidden="true" width="24px" height="24px" viewBox="0 0 24 24" fill="none" style={{ margin: "0px" }}>
      <path
        d="M15.2413 3H8.7587C7.95374 2.99999 7.28937 2.99998 6.74818 3.04419C6.18608 3.09012 5.66937 3.18868 5.18404 3.43598C4.43139 3.81947 3.81947 4.43139 3.43598 5.18404C3.18868 5.66937 3.09012 6.18608 3.04419 6.74818C2.99998 7.28937 2.99999 7.95372 3 8.75869V15.2413C2.99999 16.0463 2.99998 16.7106 3.04419 17.2518C3.09012 17.8139 3.18868 18.3306 3.43598 18.816C3.81947 19.5686 4.43139 20.1805 5.18404 20.564C5.66937 20.8113 6.18608 20.9099 6.74818 20.9558C7.28937 21 7.95372 21 8.75868 21H15.2413C16.0463 21 16.7106 21 17.2518 20.9558C17.8139 20.9099 18.3306 20.8113 18.816 20.564C19.5686 20.1805 20.1805 19.5686 20.564 18.816C20.8113 18.3306 20.9099 17.8139 20.9558 17.2518C21 16.7106 21 16.0463 21 15.2413V8.75868C21 7.95372 21 7.28936 20.9558 6.74818C20.9099 6.18608 20.8113 5.66937 20.564 5.18404C20.1805 4.43139 19.5686 3.81947 18.816 3.43598C18.3306 3.18868 17.8139 3.09012 17.2518 3.04419C16.7106 2.99998 16.0463 2.99999 15.2413 3Z"
        fill="currentColor"
      />
    </svg>
  ),
} as const

const filled = (d: string) =>
  function StatusGlyph({ className }: { className?: string }) {
    return (
      <svg className={className} aria-hidden="true" width="24px" height="24px" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path fillRule="evenodd" clipRule="evenodd" d={d} fill="currentColor" />
      </svg>
    )
  }

export const CircleCheck = filled("M12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2ZM15.774 10.1333C16.1237 9.70582 16.0607 9.0758 15.6332 8.72607C15.2058 8.37635 14.5758 8.43935 14.226 8.86679L10.4258 13.5116L9.20711 12.2929C8.81658 11.9024 8.18342 11.9024 7.79289 12.2929C7.40237 12.6834 7.40237 13.3166 7.79289 13.7071L9.79289 15.7071C9.99267 15.9069 10.2676 16.0129 10.5498 15.9988C10.832 15.9847 11.095 15.8519 11.274 15.6333L15.774 10.1333Z")
export const CircleFail = filled("M2 12C2 6.47715 6.47715 2 12 2C17.5228 2 22 6.47715 22 12C22 17.5228 17.5228 22 12 22C6.47715 22 2 17.5228 2 12ZM9.70711 8.29289C9.31658 7.90237 8.68342 7.90237 8.29289 8.29289C7.90237 8.68342 7.90237 9.31658 8.29289 9.70711L10.5858 12L8.29289 14.2929C7.90237 14.6834 7.90237 15.3166 8.29289 15.7071C8.68342 16.0976 9.31658 16.0976 9.70711 15.7071L12 13.4142L14.2929 15.7071C14.6834 16.0976 15.3166 16.0976 15.7071 15.7071C16.0976 15.3166 16.0976 14.6834 15.7071 14.2929L13.4142 12L15.7071 9.70711C16.0976 9.31658 16.0976 8.68342 15.7071 8.29289C15.3166 7.90237 14.6834 7.90237 14.2929 8.29289L12 10.5858L9.70711 8.29289Z")
export const CircleInfo = filled("M12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2ZM10 11C10 10.4477 10.4477 10 11 10H12C12.5523 10 13 10.4477 13 11V16C13 16.5523 12.5523 17 12 17C11.4477 17 11 16.5523 11 16V12C10.4477 12 10 11.5523 10 11ZM12 7C11.4477 7 11 7.44772 11 8C11 8.55228 11.4477 9 12 9C12.5523 9 13 8.55228 13 8C13 7.44772 12.5523 7 12 7Z")
export const CircleAlert = filled("M12 2C17.5228 2 22 6.47715 22 12C22 17.5228 17.5228 22 12 22C6.47715 22 2 17.5228 2 12C2 6.47715 6.47715 2 12 2ZM12 14.5996C11.3373 14.5996 10.7998 15.1371 10.7998 15.7998C10.7999 16.4624 11.3373 17 12 17C12.6627 17 13.2001 16.4625 13.2002 15.7998C13.2002 15.1371 12.6627 14.5996 12 14.5996ZM12 7C11.4477 7 11 7.44772 11 8V12C11 12.5523 11.4477 13 12 13C12.5523 13 13 12.5523 13 12V8C13 7.44772 12.5523 7 12 7Z")

export function ChevronDown({ className }: { className?: string }) {
  return (
    <svg className={className} aria-hidden="true" width="24px" height="24px" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M8 10L10.9393 12.9393C11.5251 13.5251 12.4749 13.5251 13.0607 12.9393L16 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function Check({ className }: { className?: string }) {
  return (
    <svg className={className} aria-hidden="true" width="24px" height="24px" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M5 12.75L10 19L19 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function Cross({ className }: { className?: string }) {
  return (
    <svg className={className} aria-hidden="true" width="24px" height="24px" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M6.5 6.5L17.5 17.5M17.5 6.5L6.5 17.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}
