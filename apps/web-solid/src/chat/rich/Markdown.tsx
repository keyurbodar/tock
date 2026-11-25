import { For, Match, Show, Switch } from "solid-js"
import type { JSX } from "@solidjs/web"
import { parseRichText } from "../../lib/protocol/markdown"
import type { Block, Inline } from "../../lib/protocol/rich-text"
import { extractFenceTitle } from "./code/fence"
import { CodeBlock } from "./code/CodeBlock"
import "./rich.css"

function InlineNodes(props: { nodes: readonly Inline[] }): JSX.Element {
  return (
    <For each={props.nodes}>
      {(node) => (
        <Switch>
          <Match when={node.t === "text"}>{node.t === "text" ? node.text : ""}</Match>
          <Match when={node.t === "bold"}><strong>{node.t === "bold" ? <InlineNodes nodes={node.children} /> : null}</strong></Match>
          <Match when={node.t === "italic"}><em>{node.t === "italic" ? <InlineNodes nodes={node.children} /> : null}</em></Match>
          <Match when={node.t === "strike"}><s>{node.t === "strike" ? <InlineNodes nodes={node.children} /> : null}</s></Match>
          <Match when={node.t === "code"}><code>{node.t === "code" ? node.text : ""}</code></Match>
          <Match when={node.t === "mention"}><span class="rich-mention">@{node.t === "mention" ? node.slug : ""}</span></Match>
          <Match when={node.t === "link"}>
            <a class="rich-link" href={node.t === "link" ? node.href : undefined} rel="noreferrer" target="_blank">
              {node.t === "link" ? <InlineNodes nodes={node.children} /> : null}
            </a>
          </Match>
        </Switch>
      )}
    </For>
  )
}

function Blocks(props: { blocks: readonly Block[] }): JSX.Element {
  return (
    <For each={props.blocks}>
      {(block) => (
        <Switch>
          <Match when={block.t === "paragraph"}><p>{block.t === "paragraph" ? <InlineNodes nodes={block.children} /> : null}</p></Match>
          <Match when={block.t === "heading"}>
            <Show when={block.t === "heading" ? block : undefined}>
              {(heading) => (
                <Switch>
                  <Match when={heading().level === 1}><h1><InlineNodes nodes={heading().children} /></h1></Match>
                  <Match when={heading().level === 2}><h2><InlineNodes nodes={heading().children} /></h2></Match>
                  <Match when={heading().level === 3}><h3><InlineNodes nodes={heading().children} /></h3></Match>
                  <Match when={heading().level === 4}><h4><InlineNodes nodes={heading().children} /></h4></Match>
                  <Match when={heading().level === 5}><h5><InlineNodes nodes={heading().children} /></h5></Match>
                  <Match when={heading().level === 6}><h6><InlineNodes nodes={heading().children} /></h6></Match>
                </Switch>
              )}
            </Show>
          </Match>
          <Match when={block.t === "list"}>
            <Show when={block.t === "list" ? block : undefined}>
              {(list) => (
                <Show
                  when={list().start === undefined}
                  fallback={<ol start={list().start} class={list().loose ? "rich-loose" : undefined}><For each={list().items}>{(item) => <li><Blocks blocks={item} /></li>}</For></ol>}
                >
                  <ul class={list().loose ? "rich-loose" : undefined}><For each={list().items}>{(item) => <li><Blocks blocks={item} /></li>}</For></ul>
                </Show>
              )}
            </Show>
          </Match>
          <Match when={block.t === "quote"}><blockquote>{block.t === "quote" ? <Blocks blocks={block.children} /> : null}</blockquote></Match>
          <Match when={block.t === "rule"}><hr /></Match>
          <Match when={block.t === "code_block"}>
            <Show when={block.t === "code_block" ? block : undefined}>
              {(code) => {
                const title = extractFenceTitle(code().lang)
                return <CodeBlock files={[{ ...(title ? { name: title, lang: title.split(".").pop()?.toLowerCase() } : code().lang ? { lang: code().lang } : {}), text: code().text }]} />
              }}
            </Show>
          </Match>
          <Match when={block.t === "image"}>
            <Show when={block.t === "image" ? block : undefined}>
              {(image) => (
                <Show when={image().url} fallback={<span class="rich-image-broken">{image().alt}</span>}>
                  {(url) => <img alt={image().alt} class="rich-image" src={url()} />}
                </Show>
              )}
            </Show>
          </Match>
          <Match when={block.t === "table"}>
            <Show when={block.t === "table" ? block : undefined}>
              {(table) => (
                <div class="rich-table"><div class="rich-table-scroll"><table>
                  <thead><tr><For each={table().head}>{(cell) => <th><InlineNodes nodes={cell} /></th>}</For></tr></thead>
                  <tbody><For each={table().rows}>{(row) => <tr><For each={row}>{(cell) => <td><InlineNodes nodes={cell} /></td>}</For></tr>}</For></tbody>
                </table></div></div>
              )}
            </Show>
          </Match>
        </Switch>
      )}
    </For>
  )
}

export function Markdown(props: { text: string; class?: string }) {
  const tree = () => parseRichText(props.text)
  return <div class={`rich ${props.class ?? ""}`}><Blocks blocks={tree()} /></div>
}
