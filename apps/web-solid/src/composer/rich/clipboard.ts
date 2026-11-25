export function copyComposerFragment(markdown: string, transfer: Pick<DataTransfer, "setData">): void {
  transfer.setData("text/plain", markdown)
  transfer.setData("text/markdown", markdown)
}
