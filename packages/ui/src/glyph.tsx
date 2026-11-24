const glyph = (paths: readonly string[], join = true) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24px" height="24px" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    {paths.map((d) => (
      <path key={d} d={d} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin={join ? "round" : undefined} />
    ))}
  </svg>
)

export const glyphs = {
  minus: glyph(["M7 12H17"], false),
  search: glyph(
    ["M11 18C14.866 18 18 14.866 18 11C18 7.13401 14.866 4 11 4C7.13401 4 4 7.13401 4 11C4 14.866 7.13401 18 11 18Z", "M20 20L16.05 16.05"],
    false,
  ),
  more: glyph([
    "M12 13C12.5523 13 13 12.5523 13 12C13 11.4477 12.5523 11 12 11C11.4477 11 11 11.4477 11 12C11 12.5523 11.4477 13 12 13Z",
    "M20 13C20.5523 13 21 12.5523 21 12C21 11.4477 20.5523 11 20 11C19.4477 11 19 11.4477 19 12C19 12.5523 19.4477 13 20 13Z",
    "M4 13C4.55228 13 5 12.5523 5 12C5 11.4477 4.55228 11 4 11C3.44772 11 3 11.4477 3 12C3 12.5523 3.44772 13 4 13Z",
  ]),
  attach: glyph(
    ["M6 11V15C6 18.3137 8.68629 21 12 21C15.3137 21 18 18.3137 18 15V7C18 4.79086 16.2091 3 14 3C11.7909 3 10 4.79086 10 7V15C10 16.1046 10.8954 17 12 17C13.1046 17 14 16.1046 14 15V7"],
    false,
  ),
  plus: glyph(["M12 4V12M12 12V20M12 12H4M12 12H20"], false),
  close: glyph(["M5 5L19 19M19 5L5 19"], false),
  reset: glyph([
    "M4.4834 14.6667C5.58163 17.7738 8.54493 20 12.0282 20C16.4465 20 20.0282 16.4183 20.0282 12C20.0282 7.58172 16.4465 4 12.0282 4C8.93224 4 6.99986 5.5 4.99986 8",
    "M5 4V8H9",
  ]),
  automation: (
    <svg xmlns="http://www.w3.org/2000/svg" width="24px" height="24px" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="size-4">
      <path
        d="M2.75879 10.1637L3.62703 15.0877C3.91474 16.7194 5.47072 17.8089 7.1024 17.5212L10.0972 16.9931M2.75879 10.1637L2.58514 9.17888C2.29743 7.5472 3.38694 5.99122 5.01862 5.70351L11.9123 4.48797C13.544 4.20026 15.0999 5.28977 15.3876 6.92145C15.4835 7.46535 15.1204 7.984 14.5765 8.07991L2.75879 10.1637Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M16 20C19.3137 20 22 17.3137 22 14C22 10.6863 19.3137 8 16 8C12.6863 8 10 10.6863 10 14C10 17.3137 12.6863 20 16 20Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M16 12V14L17.6667 15.6667" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  expand: glyph(["M14 4H20V10", "M4 14V20H10", "M19.25 4.75L14 10", "M10 14L4.75 19.25"]),
  wrap: glyph(["M4 12H16.75C18.683 12 20.25 13.567 20.25 15.5C20.25 17.433 18.683 19 16.75 19H13", "M4 19H7", "M4 5H20", "M14.5 16.5L12 19L14.5 21.5"]),
  clipboard: (
    <svg xmlns="http://www.w3.org/2000/svg" width="24px" height="24px" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M15 5H16C17.6569 5 19 6.34315 19 8V18C19 19.6569 17.6569 21 16 21H8C6.34315 21 5 19.6569 5 18V8C5 6.34315 6.34315 5 8 5H9M15 7V6C15 4.34315 13.6569 3 12 3C10.3431 3 9 4.34315 9 6V7H15Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  ),
  copy: glyph([
    "M9 9V5.25C9 4.00736 10.0074 3 11.25 3H18.75C19.9926 3 21 4.00736 21 5.25V12.75C21 13.9926 19.9926 15 18.75 15H15M12.75 9H5.25C4.00736 9 3 10.0074 3 11.25V18.75C3 19.9926 4.00736 21 5.25 21H12.75C13.9926 21 15 19.9926 15 18.75V11.25C15 10.0074 13.9926 9 12.75 9Z",
  ]),
  edit: glyph([
    "M13.5 5.99997L15.25 4.24997C16.4926 3.00733 18.5074 3.00733 19.75 4.24997C20.9926 5.49261 20.9926 7.50733 19.75 8.74997L18 10.5L7.79289 20.7071C7.60536 20.8946 7.351 21 7.08579 21H3V16.9142C3 16.649 3.10536 16.3946 3.29289 16.2071L13.5 5.99997Z",
    "M13.5 6L18 10.5",
  ]),
  reply: (
    <svg xmlns="http://www.w3.org/2000/svg" width="24px" height="24px" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M2.23598 11.2833L9.30253 4.40271C9.93624 3.78568 11.0001 4.23469 11.0001 5.11918V7.99977C11.0001 8.27591 11.228 8.49935 11.5041 8.50341C19.4593 8.6202 21.9154 11.5656 21.998 19.5722C21.9991 19.6777 21.8568 19.7147 21.8087 19.6208C20.4299 16.9313 19.1878 15.5583 11.5051 15.5016C11.2289 15.4996 11.0001 15.7236 11.0001 15.9998V18.8804C11.0001 19.7648 9.93624 20.2139 9.30252 19.5968L2.23598 12.7162C1.8328 12.3237 1.8328 11.6759 2.23598 11.2833Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  ),
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

const chevron = (path: string) =>
  function Chevron({ className }: { className?: string }) {
    return (
      <svg width="24px" height="24px" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" className={className}>
        <path d={path} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    )
  }

export const ChevronLeftSmall = chevron("M13.3787 16L10.4393 13.0607C9.85355 12.4749 9.85355 11.5251 10.4393 10.9393L13.3787 8")
export const ChevronRightSmall = chevron("M10 16L12.9393 13.0607C13.5251 12.4749 13.5251 11.5251 12.9393 10.9393L10 8")

export function ChromeMark() {
  return (
    <svg aria-hidden="true" width="24px" height="24px" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path fillRule="evenodd" clipRule="evenodd" d="M4.41459 5.4838C9.06327 0.0735695 17.6827 1.14152 20.905 7.46127C18.6367 7.46205 15.0847 7.46065 13.161 7.46127C11.7657 7.46174 10.865 7.43002 9.88935 7.94361C8.74249 8.54735 7.87704 9.6664 7.57501 10.9809L4.41459 5.4838Z" fill="currentColor" />
      <path fillRule="evenodd" clipRule="evenodd" d="M8.67296 11.9995C8.67296 13.8331 10.1639 15.3249 11.9965 15.3249C13.829 15.3249 15.3199 13.8332 15.3199 11.9995C15.3199 10.1659 13.829 8.67407 11.9965 8.67407C10.1639 8.67407 8.67296 10.1659 8.67296 11.9995Z" fill="currentColor" />
      <path fillRule="evenodd" clipRule="evenodd" d="M13.2863 16.3521C11.4209 16.9064 9.23796 16.2916 8.04219 14.2276C7.12939 12.6521 4.71771 8.45079 3.62163 6.54051C-0.217376 12.4246 3.09133 20.4431 10.0609 21.8117L13.2863 16.3521Z" fill="currentColor" />
      <path fillRule="evenodd" clipRule="evenodd" d="M15.0837 8.67407C16.6374 10.119 16.9758 12.459 15.9233 14.2734C15.1304 15.6404 12.5998 19.9116 11.3732 21.9798C18.5541 22.4225 23.7888 15.3848 21.4243 8.67407H15.0837Z" fill="currentColor" />
    </svg>
  )
}
