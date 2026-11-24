import { toJsxRuntime } from "hast-util-to-jsx-runtime"
import { memo, type ReactNode } from "react"
import { Fragment, jsx, jsxs } from "react/jsx-runtime"
import rehypeSanitize from "rehype-sanitize"
import remarkGfm from "remark-gfm"
import remarkParse from "remark-parse"
import remarkRehype from "remark-rehype"
import remend from "remend"
import { unified } from "unified"

const LOCAL_IMAGE = /^(\/(?!\/)|data:image\/)/

interface MdNode {
  type: string
  url?: string
  alt?: string | null
  value?: string
  children?: MdNode[]
}

function linkRemoteImages(node: MdNode, linked: boolean): void {
  if (!node.children) return
  node.children = node.children.map((child) => {
    if (child.type !== "image" || LOCAL_IMAGE.test(child.url ?? "")) return child
    const label: MdNode = { type: "text", value: child.alt || "Image" }
    return linked ? label : { type: "link", url: child.url, children: [label] }
  })
  for (const child of node.children) linkRemoteImages(child, linked || child.type === "link")
}

const remoteImagesAsLinks = () => (tree: MdNode) => linkRemoteImages(tree, false)

const processor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remoteImagesAsLinks)
  .use(remarkRehype)
  .use(rehypeSanitize)

const FENCE = /^\s*(```|~~~)/

export function splitBlocks(source: string): string[] {
  const blocks: string[] = []
  let current: string[] = []
  let fenced = false
  for (const line of source.split("\n")) {
    if (FENCE.test(line)) fenced = !fenced
    if (!fenced && line.trim() === "" && current.length > 0) {
      blocks.push(current.join("\n"))
      current = []
      continue
    }
    if (fenced || line.trim() !== "") current.push(line)
  }
  if (current.length > 0) blocks.push(current.join("\n"))
  return blocks
}

function render(source: string): ReactNode {
  const tree = processor.runSync(processor.parse(source))
  return toJsxRuntime(tree, {
    Fragment,
    jsx,
    jsxs,
    components: {
      a: (props) => <a {...props} target="_blank" rel="noreferrer" />,
    },
  })
}

const Block = memo(function Block({ source }: { source: string }) {
  return <div data-markdown-block="">{render(source)}</div>
})

export const Markdown = memo(function Markdown({
  children,
  streaming,
  size,
  tone,
}: {
  children: string
  streaming?: boolean
  size?: "sm" | "xs"
  tone?: "muted"
}) {
  const blocks = splitBlocks(streaming ? remend(children) : children)
  return (
    <div data-component="markdown" data-size={size} data-tone={tone}>
      {blocks.map((block, index) => (
        <Block key={index} source={block} />
      ))}
    </div>
  )
})
