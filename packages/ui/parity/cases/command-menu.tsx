import { cases } from "../case"
import { commandIcons } from "../../src/chat/command-icons"
import { CommandMenuSurface, type Command } from "../../src/chat/command-menu"

const noop = () => {}
const commands: readonly Command[] = [
  { kind: "action", name: "plan", label: "Plan mode", icon: <svg aria-hidden="true" width="24px" height="24px" viewBox="0 0 24 24" fill="none"><circle cx="17.5" cy="6.5" r="2.5" stroke="currentColor" strokeWidth="2" /><circle cx="6.5" cy="17.5" r="2.5" stroke="currentColor" strokeWidth="2" /><path d="M15 6.5H9.94627C7.90133 6.5 7.17446 9.20626 8.9442 10.2309L15.0558 13.7692C16.8255 14.7937 16.0987 17.5 14.0537 17.5H9" stroke="currentColor" strokeWidth="2" /></svg>, run: noop },
  { kind: "picker", name: "model", label: "Model", icon: commandIcons.model, items: [], select: noop, emptyLabel: "" },
  { kind: "picker", name: "reasoning", label: "Reasoning", icon: commandIcons.reasoning, items: [], select: noop, emptyLabel: "" },
  { kind: "picker", name: "machine-size", label: "Machine size", icon: <svg aria-hidden="true" width="24px" height="24px" viewBox="0 0 24 24" fill="none"><path d="M19 5.5C19 6.88071 15.866 8 12 8C8.13401 8 5 6.88071 5 5.5M19 5.5C19 4.11929 15.866 3 12 3C8.13401 3 5 4.11929 5 5.5M19 5.5V18.5C19 19.8807 15.866 21 12 21C8.13401 21 5 19.8807 5 18.5V5.5M19 9.75C19 11.1307 15.866 12.25 12 12.25C8.13401 12.25 5 11.1307 5 9.75M19 14C19 15.3807 15.866 16.5 12 16.5C8.13401 16.5 5 15.3807 5 14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>, items: [], select: noop, emptyLabel: "" },
  { kind: "action", name: "pin", label: "Pin", icon: <svg aria-hidden="true" width="24px" height="24px" viewBox="0 0 24 24" fill="none"><path d="M4 20L8 16M5.02911 13.0291L10.9709 18.9709C12.7694 20.7694 15.8496 19.6542 16.0799 17.1212L16.354 14.1055C16.4452 13.103 17.0331 12.213 17.9194 11.7357L19.4499 10.9116C21.2192 9.95887 21.5699 7.56988 20.1489 6.14888L17.8511 3.85112C16.4301 2.43013 14.0411 2.78076 13.0884 4.55014L12.2643 6.08057C11.787 6.96692 10.897 7.55481 9.8945 7.64595L6.87882 7.92011C4.34575 8.15039 3.23057 11.2306 5.02911 13.0291Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>, run: noop },
  { kind: "picker", name: "folder", label: "Folder", icon: <svg aria-hidden="true" width="24px" height="24px" viewBox="0 0 24 24" fill="none"><path d="M3 7V16C3 17.6569 4.34315 19 6 19H18C19.6569 19 21 17.6569 21 16V10C21 8.34315 19.6569 7 18 7H13.0704C12.4017 7 11.7772 6.6658 11.4063 6.1094L10.5937 4.8906C10.2228 4.3342 9.59834 4 8.92963 4H6C4.34315 4 3 5.34315 3 7Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>, items: [], select: noop, emptyLabel: "" },
  { kind: "picker", name: "tags", label: "Tags", icon: <svg aria-hidden="true" width="24px" height="24px" viewBox="0 0 24 24" fill="none"><path d="M8 7.5C8 7.77614 7.77614 8 7.5 8C7.22386 8 7 7.77614 7 7.5C7 7.22386 7.22386 7 7.5 7C7.77614 7 8 7.22386 8 7.5Z" stroke="currentColor" strokeWidth="2" strokeLinecap="square" /><path d="M3 10.7574V6C3 4.34315 4.34315 3 6 3H10.7574C11.553 3 12.3161 3.31607 12.8787 3.87868L20.1287 11.1287C21.3003 12.3003 21.3003 14.1997 20.1287 15.3713L15.3713 20.1287C14.1997 21.3003 12.3003 21.3003 11.1287 20.1287L3.87868 12.8787C3.31607 12.3161 3 11.553 3 10.7574Z" stroke="currentColor" strokeWidth="2" strokeLinecap="square" strokeLinejoin="round" /><path d="M7.39844 7.5H7.59844" stroke="currentColor" strokeWidth="2" strokeLinecap="square" strokeLinejoin="round" /></svg>, items: [], select: noop, emptyLabel: "" },
  { kind: "picker", name: "skills", label: "Skills", icon: commandIcons.skills, items: [], select: noop, emptyLabel: "" },
]

export default cases("CommandMenu", [
  [
    "TFIKvuEngk|[data-slot=composer-command-menu] [role=listbox]|0",
    "top level, first row highlighted",
    () => <CommandMenuSurface rows={commands.map((command) => ({ type: "command", command }))} command={null} loading={false} empty={null} highlight={0} />,
  ],
])
