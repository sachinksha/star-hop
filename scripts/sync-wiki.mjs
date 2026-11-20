#!/usr/bin/env node
/**
 * Mirrors the study guides in docs/ into a clone of the GitHub wiki.
 *
 *   git clone git@github.com:sachinksha/star-hop.wiki.git ../star-hop.wiki
 *   npm run wiki:sync -- ../star-hop.wiki
 *   cd ../star-hop.wiki && git add -A && git commit -m "Sync from docs/" && git push
 *
 * docs/ stays the source of truth (versioned and reviewed with the code); the
 * wiki is a generated copy for browsing. The script:
 *  - writes one wiki page per guide chapter (flat names, since wikis have no folders);
 *  - rewrites links: guide-to-guide links point at wiki pages, links to source
 *    files and other repo files point at github.com, links into the sibling
 *    Ludo project point at its repository;
 *  - generates Home, _Sidebar and _Footer;
 *  - removes pages it generated before that no longer exist.
 *
 * No dependencies: plain Node.
 */
import { existsSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO_URL = 'https://github.com/sachinksha/star-hop'
const LUDO_URL = 'https://github.com/sachinksha/ludo-game'
const BRANCH = 'main'
const GENERATED_PREFIXES = ['Onboarding', 'Advanced-']
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const wikiDir = process.argv[2]
if (!wikiDir || !existsSync(path.join(wikiDir, '.git'))) {
  console.error('Usage: npm run wiki:sync -- <path to a clone of the wiki repo>')
  process.exit(1)
}

/** Guide files (repo-relative, posix) to wiki page names, in reading order. */
function collectPages() {
  const pages = []
  const mdIn = (dir) =>
    readdirSync(path.join(ROOT, dir))
      .filter((f) => f.endsWith('.md'))
      .sort()
  pages.push({ src: 'docs/onboarding/README.md', name: 'Onboarding', group: 'onboarding' })
  for (const f of mdIn('docs/onboarding')) {
    if (f === 'README.md' || f === 'cheatsheet.md') continue
    pages.push({ src: `docs/onboarding/${f}`, name: `Onboarding-${f.replace(/\.md$/, '')}`, group: 'onboarding' })
  }
  // The cheatsheet comes after the chapters.
  if (existsSync(path.join(ROOT, 'docs/onboarding/cheatsheet.md'))) {
    pages.push({ src: 'docs/onboarding/cheatsheet.md', name: 'Onboarding-Cheatsheet', group: 'onboarding' })
  }
  pages.push({ src: 'docs/README.md', name: 'Advanced-Guide', group: 'advanced' })
  for (const f of mdIn('docs')) {
    if (f === 'README.md') continue
    pages.push({ src: `docs/${f}`, name: `Advanced-${f.replace(/\.md$/, '')}`, group: 'advanced' })
  }
  return pages
}

const pages = collectPages()
const pageBySrc = new Map(pages.map((p) => [p.src, p]))

/** Rewrites one link target found in `src`. */
function rewrite(src, target) {
  if (/^([a-z]+:|#)/i.test(target)) return target // absolute URL, mailto, or same-page anchor
  const [rawPath, anchor] = target.split('#')
  const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(src), rawPath))
  const hash = anchor ? `#${anchor}` : ''
  if (resolved.startsWith('../ludo-game/')) return `${LUDO_URL}/blob/${BRANCH}/${resolved.slice('../ludo-game/'.length)}${hash}`
  if (resolved.startsWith('../')) {
    console.warn(`  ! ${src}: link leaves the repository: ${target}`)
    return target
  }
  const page = pageBySrc.get(resolved)
  if (page) return `${page.name}${hash}`
  const full = path.join(ROOT, resolved)
  if (!existsSync(full)) console.warn(`  ! ${src}: link to a missing file: ${target}`)
  const kind = existsSync(full) && statSync(full).isDirectory() ? 'tree' : 'blob'
  return `${REPO_URL}/${kind}/${BRANCH}/${resolved.replace(/\/$/, '')}${hash}`
}

/** Rewrites every markdown link outside fenced code blocks. */
function convert(src, text) {
  let fenced = false
  return text
    .split('\n')
    .map((line) => {
      if (/^\s*```/.test(line)) fenced = !fenced
      if (fenced) return line
      return line.replace(/(!?\[[^\]]*\])\(([^)\s]+)\)/g, (_, label, target) => `${label}(${rewrite(src, target)})`)
    })
    .join('\n')
}

const titleOf = (text) => (text.match(/^# (.+)$/m)?.[1] ?? '').trim()

// Remove previously generated pages, so renamed or deleted chapters disappear.
for (const f of readdirSync(wikiDir)) {
  if (f.endsWith('.md') && GENERATED_PREFIXES.some((p) => f.startsWith(p))) rmSync(path.join(wikiDir, f))
}

const titles = new Map()
for (const page of pages) {
  const text = readFileSync(path.join(ROOT, page.src), 'utf8')
  titles.set(page.name, titleOf(text))
  const note = `\n\n---\n\n_Generated from [\`${page.src}\`](${REPO_URL}/blob/${BRANCH}/${page.src}). Edit it there, not in the wiki._\n`
  writeFileSync(path.join(wikiDir, `${page.name}.md`), convert(page.src, text).trimEnd() + note)
}

const link = (name) => `[${titles.get(name)}](${name})`
const group = (g) => pages.filter((p) => p.group === g && p.name !== 'Onboarding' && p.name !== 'Advanced-Guide')

writeFileSync(
  path.join(wikiDir, 'Home.md'),
  `# Star Hop wiki

Study guides that use the [Star Hop](${REPO_URL}) codebase to learn frontend engineering and prepare for senior and principal frontend interviews. Play the game at https://star-hop-game.vercel.app/.

## Where to start

- **New to JavaScript, TypeScript, React, Vite, testing or game development?** Start with the **[onboarding track](Onboarding)**. It assumes no prior knowledge and doubles as the project's handover guide.
- **Already comfortable with React and TypeScript?** Go to the **[advanced guide](Advanced-Guide)**.
- Need a quick reference? The **[cheatsheet](Onboarding-Cheatsheet)** has commands, file locations, a glossary and common gotchas.

## Onboarding track

${group('onboarding').map((p) => `- ${link(p.name)}`).join('\n')}

## Advanced guide

${group('advanced').map((p) => `- ${link(p.name)}`).join('\n')}

---

_These pages are generated from [\`docs/\`](${REPO_URL}/tree/${BRANCH}/docs) in the repository by \`scripts/sync-wiki.mjs\`. Edit the files there, not in the wiki._
`,
)

const short = (name) => titles.get(name).replace(/^\d+\.\s*/, '')
writeFileSync(
  path.join(wikiDir, '_Sidebar.md'),
  `**[Home](Home)**

**[Onboarding](Onboarding)**

${group('onboarding').map((p) => `- [${short(p.name)}](${p.name})`).join('\n')}

**[Advanced guide](Advanced-Guide)**

${group('advanced').map((p) => `- [${short(p.name)}](${p.name})`).join('\n')}
`,
)

writeFileSync(
  path.join(wikiDir, '_Footer.md'),
  `[Source on GitHub](${REPO_URL}) · [Play Star Hop](https://star-hop-game.vercel.app/) · Pages generated from [\`docs/\`](${REPO_URL}/tree/${BRANCH}/docs)
`,
)

console.log(`Wrote ${pages.length} guide pages, Home, _Sidebar and _Footer to ${wikiDir}`)
