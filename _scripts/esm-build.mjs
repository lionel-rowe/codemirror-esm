import { all } from "../bin/packages.js"
import fs from "fs"
import path from "path"
import fetch from "node-fetch"
import { exec as _exec, spawn } from "child_process";

const startDevServer = () => new Promise((res, rej) => {
	const proc = spawn("node", ["bin/cm.js", "devserver"])

	proc.stdout.on("data", (data) => {
		const txt = new TextDecoder().decode(data)

		if (txt.includes('8090')) {
			console.info(txt)
			res(proc.kill.bind(proc))
		}
	})
})

const withDevServer = async (fn) => {
	const kill = await startDevServer()
	await fn()
	kill()
}

const ignores = ['legacy-modes']

const packages = (await fs.promises.readdir('.'))
	.filter(x => all.includes(x) && !ignores.includes(x))

const camelize = (str) => str.replaceAll(/-([a-z])/g, (_, p) => p.toUpperCase())

const setup = async () => {
	await fs.promises.writeFile('./demo/demo.ts', [
		packages.map(x => `import * as ${camelize(x)} from '../${x}';`).join('\n'),
		packages.map(x => `(window as any)['${x}'] = ${camelize(x)};`).join('\n')
	].join('\n\n'))

	try {
		await fs.promises.rm('./esm', { recursive: true })
	} catch(e) {
		console.error(e)
	} finally {
		await fs.promises.mkdir('./esm', { recursive: true })
	}

	console.info('setup complete')
}

const included = new Set()

const origin = 'http://localhost:8090'
const basePath = '/_m/__/'

const re = () => new RegExp(basePath + `[^'"]+`, 'g')

const includeWithDeps = async (url) => {
	const subPath = url.slice(origin.length + basePath.length)
	const subDir = subPath.replace(/[^\/]+\.[^\/]+$/, '')

	const res = await fetch(url)

	const text = await res.text()

	await fs.promises.mkdir(`./esm/${subDir}`, { recursive: true })
	await fs.promises.writeFile(`./esm/${subPath}`, text.replaceAll(re(), (m) => {
		const relativePath = path.relative(path.join(basePath, subPath, '..'), m)

		if (relativePath.startsWith('/')) {
			console.log(relativePath)
		}

		return relativePath
	}))

	included.add(url)

	for (const [path] of text.matchAll(re())) {
		if (!included.has(origin + path)) {
			await includeWithDeps(origin + path)
		}
	}
}

const includeAll = async () => {
	for (const pkg of packages) {
		await includeWithDeps(`${origin}${basePath}${pkg}/dist/index.js`)
	}
}

await setup()
// await withDevServer(includeAll)
await includeAll()

console.info('ESM build complete')
