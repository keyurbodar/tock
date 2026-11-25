import type { JSX } from "@solidjs/web"
import { parseRichText } from "../../lib/protocol/markdown"
import type { Block, Inline } from "../../lib/protocol/rich-text"
import { extractFenceTitle } from "./code/fence"
import { CodeBlock } from "./code/CodeBlock"
import "./rich.css"

function inlineNodes(nodes: readonly Inline[]): JSX.Element {
  return nodes.map((node) => {
    switch (node.t) {
      case "text":
        return node.text
      case "bold":
        return <strong>{inlineNodes(node.children)}</strong>
      case "italic":
        return <em>{inlineNodes(node.children)}</em>
      case "strike":
        return <s>{inlineNodes(node.children)}</s>
      case "code":
        return <code>{node.text}</code>
      case "mention":
        return <span class="rich-mention">@{node.slug}</span>
      case "link":
        return (
          <a class="rich-link" href={node.href} rel="noreferrer" target="_blank">
            {inlineNodes(node.children)}
          </a>
        )
    }
  })
}

function codeFile(block: Extract<Block, { t: "code_block" }>) {
  const title = extractFenceTitle(block.lang)
  return {
    ...(title ? { name: title, lang: title.split(".").pop()?.toLowerCase() } : block.lang ? { lang: block.lang } : {}),
    text: block.text,
  }
}

function blockNodes(blocks: readonly Block[]): JSX.Element {
  return blocks.map((block) => {
    switch (block.t) {
      case "paragraph":
        return <p>{inlineNodes(block.children)}</p>
      case "heading":
        switch (block.level) {
          case 1:
            return <h1>{inlineNodes(block.children)}</h1>
          case 2:
            return <h2>{inlineNodes(block.children)}</h2>
          case 3:
            return <h3>{inlineNodes(block.children)}</h3>
          case 4:
            return <h4>{inlineNodes(block.children)}</h4>
          case 5:
            return <h5>{inlineNodes(block.children)}</h5>
          case 6:
            return <h6>{inlineNodes(block.children)}</h6>
        }
        return null
      case "list":
        return block.start === undefined ? (
          <ul class={block.loose ? "rich-loose" : undefined}>
            {block.items.map((item) => (
              <li>{blockNodes(item)}</li>
            ))}
          </ul>
        ) : (
          <ol start={block.start} class={block.loose ? "rich-loose" : undefined}>
            {block.items.map((item) => (
              <li>{blockNodes(item)}</li>
            ))}
          </ol>
        )
      case "quote":
        return <blockquote>{blockNodes(block.children)}</blockquote>
      case "rule":
        return <hr />
      case "code_block":
        return <CodeBlock files={[codeFile(block)]} />
      case "image":
        return block.url ? <img alt={block.alt} class="rich-image" src={block.url} /> : <span class="rich-image-broken">{block.alt}</span>
      case "table":
        return (
          <div class="rich-table">
            <div class="rich-table-scroll">
              <table>
                <thead>
                  <tr>{block.head.map((cell) => <th>{inlineNodes(cell)}</th>)}</tr>
                </thead>
                <tbody>
                  {block.rows.map((row) => (
                    <tr>{row.map((cell) => <td>{inlineNodes(cell)}</td>)}</tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )
    }
  })
}

export function Markdown(props: { text: string; class?: string }) {
  return <div class={`rich ${props.class ?? ""}`}>{blockNodes(parseRichText(props.text))}</div>
}
