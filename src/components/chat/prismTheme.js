import { PrismLight as SyntaxHighlighter } from 'react-syntax-highlighter'

import javascript from 'react-syntax-highlighter/dist/esm/languages/prism/javascript'
import jsx from 'react-syntax-highlighter/dist/esm/languages/prism/jsx'
import typescript from 'react-syntax-highlighter/dist/esm/languages/prism/typescript'
import tsx from 'react-syntax-highlighter/dist/esm/languages/prism/tsx'
import python from 'react-syntax-highlighter/dist/esm/languages/prism/python'
import rust from 'react-syntax-highlighter/dist/esm/languages/prism/rust'
import go from 'react-syntax-highlighter/dist/esm/languages/prism/go'
import java from 'react-syntax-highlighter/dist/esm/languages/prism/java'
import csharp from 'react-syntax-highlighter/dist/esm/languages/prism/csharp'
import cpp from 'react-syntax-highlighter/dist/esm/languages/prism/cpp'
import c from 'react-syntax-highlighter/dist/esm/languages/prism/c'
import ruby from 'react-syntax-highlighter/dist/esm/languages/prism/ruby'
import php from 'react-syntax-highlighter/dist/esm/languages/prism/php'
import bash from 'react-syntax-highlighter/dist/esm/languages/prism/bash'
import powershell from 'react-syntax-highlighter/dist/esm/languages/prism/powershell'
import json from 'react-syntax-highlighter/dist/esm/languages/prism/json'
import yaml from 'react-syntax-highlighter/dist/esm/languages/prism/yaml'
import toml from 'react-syntax-highlighter/dist/esm/languages/prism/toml'
import markdown from 'react-syntax-highlighter/dist/esm/languages/prism/markdown'
import sql from 'react-syntax-highlighter/dist/esm/languages/prism/sql'
import css from 'react-syntax-highlighter/dist/esm/languages/prism/css'
import scss from 'react-syntax-highlighter/dist/esm/languages/prism/scss'
import markup from 'react-syntax-highlighter/dist/esm/languages/prism/markup'
import graphql from 'react-syntax-highlighter/dist/esm/languages/prism/graphql'
import lua from 'react-syntax-highlighter/dist/esm/languages/prism/lua'
import kotlin from 'react-syntax-highlighter/dist/esm/languages/prism/kotlin'
import swift from 'react-syntax-highlighter/dist/esm/languages/prism/swift'
import dart from 'react-syntax-highlighter/dist/esm/languages/prism/dart'
import rLang from 'react-syntax-highlighter/dist/esm/languages/prism/r'
import ini from 'react-syntax-highlighter/dist/esm/languages/prism/ini'
import diff from 'react-syntax-highlighter/dist/esm/languages/prism/diff'
import docker from 'react-syntax-highlighter/dist/esm/languages/prism/docker'
import hcl from 'react-syntax-highlighter/dist/esm/languages/prism/hcl'
import protobuf from 'react-syntax-highlighter/dist/esm/languages/prism/protobuf'

const LANGUAGES = {
  javascript, js: javascript, jsx, typescript, ts: typescript, tsx, python, py: python,
  rust, rs: rust, go, java, csharp, cs: csharp, cpp, 'c++': cpp, c, ruby, rb: ruby, php,
  bash, sh: bash, shell: bash, zsh: bash, powershell, ps1: powershell, json, yaml, yml: yaml,
  toml, markdown, md: markdown, sql, css, scss, less: css, markup, html: markup, xml: markup,
  svg: markup, vue: markup, graphql, gql: graphql, lua, kotlin, kt: kotlin, swift, dart,
  r: rLang, ini, conf: ini, diff, patch: diff, docker, dockerfile: docker, hcl, tf: hcl,
  protobuf, proto: protobuf,
}

const registered = new Set()

/** Registers a Prism grammar on first use; returns whether one exists. */
export function ensureLanguage(name) {
  const lang = LANGUAGES[name]
  if (!lang) return false
  if (registered.has(name)) return true
  SyntaxHighlighter.registerLanguage(name, lang)
  registered.add(name)
  return true
}

/** Prism theme tuned to Lwen's warm palette. */
export const prismTheme = {
  'code[class*="language-"]': { color: '#D8D3C7', background: 'none' },
  'pre[class*="language-"]': { color: '#D8D3C7', background: 'none' },
  comment: { color: '#6E6A61', fontStyle: 'italic' },
  prolog: { color: '#6E6A61' },
  doctype: { color: '#6E6A61' },
  cdata: { color: '#6E6A61' },
  punctuation: { color: '#8E887C' },
  operator: { color: '#B7B2A7' },
  string: { color: '#A8B98C' },
  char: { color: '#A8B98C' },
  'attr-value': { color: '#A8B98C' },
  number: { color: '#E0A46A' },
  boolean: { color: '#E0A46A' },
  constant: { color: '#E0A46A' },
  symbol: { color: '#E0A46A' },
  keyword: { color: '#D97757' },
  atrule: { color: '#D97757' },
  'attr-name': { color: '#E8C07D' },
  property: { color: '#C9C3B5' },
  variable: { color: '#C9C3B5' },
  function: { color: '#E8C07D' },
  'class-name': { color: '#E5B98C' },
  tag: { color: '#D97757' },
  selector: { color: '#E8C07D' },
  builtin: { color: '#E5B98C' },
  regex: { color: '#E29A76' },
  important: { color: '#E29A76', fontWeight: 'bold' },
  entity: { color: '#E29A76' },
  url: { color: '#E29A76' },
  inserted: { color: '#7FA87F' },
  deleted: { color: '#C3644B' },
  namespace: { opacity: 0.75 },
  bold: { fontWeight: 'bold' },
  italic: { fontStyle: 'italic' },
}

export { SyntaxHighlighter }
