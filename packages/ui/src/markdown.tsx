import { toJsxRuntime } from "hast-util-to-jsx-runtime"
import { memo, type ReactNode, useId } from "react"
import { Fragment, jsx, jsxs } from "react/jsx-runtime"
import rehypeSanitize from "rehype-sanitize"
import remarkGfm from "remark-gfm"
import remarkParse from "remark-parse"
import remarkRehype from "remark-rehype"
import remend from "remend"
import { unified } from "unified"
import { useStreamFade } from "./chat/stream-fade"

const LOCAL_IMAGE = /^(\/(?!\/)|data:image\/)/

interface HtmlNode {
  type: string
  tagName?: string
  value?: string
  properties?: Record<string, unknown>
  children?: HtmlNode[]
}

function linkRemoteImages(node: HtmlNode, linked: boolean): void {
  if (!node.children) return
  node.children = node.children.map((child) => {
    const src = child.properties?.src
    if (child.tagName !== "img" || (typeof src === "string" && LOCAL_IMAGE.test(src))) return child
    const alt = child.properties?.alt
    const label: HtmlNode = { type: "text", value: typeof alt === "string" && alt ? alt : "Image" }
    return linked ? label : { type: "element", tagName: "a", properties: { href: src }, children: [label] }
  })
  for (const child of node.children) linkRemoteImages(child, linked || child.tagName === "a")
}

const remoteImagesAsLinks = () => (tree: HtmlNode) => linkRemoteImages(tree, false)

const processor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkRehype)
  .use(rehypeSanitize)
  .use(remoteImagesAsLinks)

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

const Block = memo(function Block({ source, streaming, owner }: { source: string; streaming: boolean; owner: string }) {
  const fade = useStreamFade(source, streaming, owner)
  return (
    <div ref={fade} data-md-fade-owner={owner} data-markdown-block="">
      {render(source)}
    </div>
  )
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
  const owner = useId()
  const blocks = splitBlocks(streaming ? remend(children) : children)
  return (
    <div data-component="markdown" data-size={size} data-tone={tone}>
      {blocks.map((block, index) => (
        <Block key={index} source={block} streaming={streaming === true} owner={`${owner}${index}`} />
      ))}
    </div>
  )
})
