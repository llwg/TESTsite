#!/usr/bin/env -S deno run --allow-read --allow-run

import { writeAll } from "@std/io/write-all";
import { expandGlobSync } from "https://deno.land/std@0.170.0/fs/expand_glob.ts";

Array.prototype.to_h = function() { return Object.fromEntries(this) }
Object.prototype.to_a = function() { return Object.entries(this) }
Array.prototype.last = function() { return this[this.length - 1] }

const inputfile = Deno.args[0]
if (!inputfile) throw `args: <inputfile>`

const j = JSON.parse(await Deno.readTextFile(inputfile))

const i2text = inline => {
	const handlers =
		{ Str: ({ c }) => c
		, Space: _ => ' '
		}
	if (!handlers[inline.t]) throw `unsupported inline: ${JSON.stringify(inline)}`
	return handlers[inline.t](inline)
}
const is2text = is => is.map(i2text).join('')

const pandoc_blocks2html = async ({ blocks, "pandoc-api-version": api_ver, meta }) => {
	const p = Deno.run({ cmd: ['pandoc', '--from', 'json', '--to', 'html'], stdout: 'piped', stdin: 'piped' })
	await writeAll(p.stdin, new TextEncoder().encode(JSON.stringify({ blocks, "pandoc-api-version": api_ver, meta })))
	await p.stdin.close()
	const out = await p.output()
	p.close();
	return new TextDecoder().decode(out)
}

const pandoc_file = async path => {
	const p = Deno.run({ cmd: ['pandoc', path], stdout: 'piped' })
	const out = await p.output()
	p.close();
	return new TextDecoder().decode(out)
}

const short2stills = short => [...expandGlobSync(`media/docs/stills/${short}/*`)]
	.sort((x, y) => +x.name.match(/\d+/)[0] - +y.name.match(/\d+/)[0])
	.map(f => `media/stills/${short}/${f.name}`)

const picname2still = page => picname => {
  const path = `media/stills/${page.id}/${picname}.webp`;

  try {
    Deno.statSync(path);
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) {
      console.error(`Warning: The picture does not exist at "${path}"`);
    } else {
      throw error;
    }
  }

  return path;
};

const short2writing = async short => {
	const got = [...expandGlobSync(`media/docs/writing/${short}.md`)]
	if (got.length !== 1) return null
	return pandoc_file(got[0].path)
}

const propcode2props = text => text.trim().split(/\n+/)
	.map(line => {
		const m = line.match(/^(\w+)\s+(.+)$/)
		if (!m) throw `unparseable line: ${line}`
		return m.slice(1)
	}).to_h()

const title2short = text => text.toLowerCase().replace(/[^\w\s]/g, '').replace(/\s+/g, '-')

const pages = []
let curr_group = null

for (const block of j.blocks) {
	if (block.t === 'Header') {
		const [n, attr, is] = block.c
		const title_display = is2text(is)
		const id = title2short(title_display)

		if (n === 1) {
			curr_group = title_display
		} else if (n === 2) {
			pages.push({ group: curr_group, id, title_display, blocks: [] })
		} else {
			throw `level 3+ headers not supported`
		}
	} else if (block.t === 'CodeBlock') {
		const [attr, text] = block.c
		pages.push({ ...pages.pop(), ...propcode2props(text) })
	} else {
		pages.last().blocks.push(block)
	}
}

// for (const page of pages) {
// 	if (page.blocks.length > 0) page.blocks_html =
// }

const die = msg => { throw msg }

const augmented_pages = await Promise.all(pages.map(async page => {
	const blocks_html = await pandoc_blocks2html({ blocks: page.blocks, "pandoc-api-version": j["pandoc-api-version"], meta: j.meta })
	const stills = short2stills(page.id)

	const writing = await short2writing(page.id)
	const type = page.filmtype ? 'film' : page.type ? page.type : die(`cannot determine type for ${page.id}`)
	const four_pics = page.four_pics?.trim()?.split(/\s+/)?.map(picname2still(page))

	const thumb = page.thumb ? picname2still(page)(page.thumb) : null

	const runtime_display = page.runtime_minutes ? `${page.runtime_minutes.trim()} min` : null

	const newpage = { ...page, type, blocks_html, stills, writing, four_pics, thumb, runtime_display }

	newpage.title_sidebar ??= newpage.title_display

	return newpage
}))

console.log(JSON.stringify({ pages: augmented_pages }))

// console.log(JSON.stringify({ pages, "pandoc-api-version": j["pandoc-api-version"], meta: j.meta }))
