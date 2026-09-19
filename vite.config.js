import { spawn } from 'node:child_process'
import { createReadStream, existsSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import {
  describeTarget,
  resolveTarget,
  targetArguments,
  targetDirectories,
} from './tools/target.mjs'

const projectRoot = import.meta.dirname
const FACADE_DIRECTORY = path.join(projectRoot, 'src', 'arduino')
const GENERATED_DIRECTORY = path.join(projectRoot, 'src', 'generated')
const GENERATED_PREFIX = '/src/generated/'
const BUILD_SCRIPT = 'tools/build-sketch.mjs'
const ARTIFACT_TYPES = { '.js': 'text/javascript', '.wasm': 'application/wasm' }

const target = resolveTarget(projectRoot)

// The plugin spawns the build, so it has to hand the same choice over. Directly
// started Vite passes its own flags; through the dev wrapper the choice already
// travels in SKETCH_ARGS, which must reach the build untouched.
const arguments_ = targetArguments()
const buildEnvironment = arguments_.length
  ? { ...process.env, SKETCH_ARGS: JSON.stringify(arguments_) }
  : process.env

// Recompiles the target when it or the facade changes and hands the fresh module
// to every open page, which swaps the running instance in place. The build
// output is hidden from Vite's watcher so the page is not fully reloaded instead.
function sketchReload(target) {
  const watched = targetDirectories(target, FACADE_DIRECTORY)

  return {
    name: 'sketch-reload',
    apply: 'serve',
    configureServer(server) {
      const { root, logger } = server.config
      let building = false
      let rebuildQueued = false
      let timer

      // The target may live outside the project, where Vite's watcher does not
      // look.
      server.watcher.add(watched)

      const send = (event, data) => server.ws.send({ type: 'custom', event, data })
      const isSource = (file) =>
        watched.some((directory) => file === directory || file.startsWith(directory + path.sep))

      function compile() {
        if (building) {
          rebuildQueued = true
          return
        }
        building = true
        const compiler = spawn(process.execPath, [BUILD_SCRIPT], { cwd: root, env: buildEnvironment })
        let output = ''
        compiler.stdout.on('data', (chunk) => { output += chunk })
        compiler.stderr.on('data', (chunk) => { output += chunk })
        compiler.on('error', (error) => {
          building = false
          logger.error(`sketch: could not start the compiler - ${error.message}`)
          send('sketch-failed', { output: error.message })
        })
        compiler.on('close', (code) => {
          building = false
          if (code === 0) {
            // Name the target: a rebuild can only be trusted if it compiled the
            // same thing the page is showing.
            logger.info(`  sketch: recompiled ${describeTarget(projectRoot, target)}`, { timestamp: true })
            send('sketch-updated')
          } else {
            logger.error(`sketch: build failed\n${output.trim()}`)
            send('sketch-failed', { output: output.trim() })
          }
          if (rebuildQueued) {
            rebuildQueued = false
            compile()
          }
        })
      }

      const schedule = (file) => {
        if (!isSource(file)) return
        clearTimeout(timer)
        timer = setTimeout(compile, 120)
      }

      for (const event of ['change', 'add', 'unlink']) server.watcher.on(event, schedule)

      logger.info(`  sketch: watching ${describeTarget(projectRoot, target)}`, { timestamp: true })
    },
  }
}

// The Sketch's build output is rewritten behind Vite's back: the watcher above
// ignores it so a swap is never raced by a full page reload, which also means
// Vite's transform cache keeps serving the build before last. The page asks for
// the artifacts by URL, so they are served straight from disk, uncached.
function sketchArtifacts() {
  return {
    name: 'sketch-artifacts',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const { pathname, searchParams } = new URL(request.url, 'http://localhost')
        if (!pathname.startsWith(GENERATED_PREFIX)) return next()
        // ?url, ?raw, ?import and friends ask Vite for a module of its own, not
        // for the bytes on disk. Only a plain request, or this page's own
        // cache-busting stamp, is an artifact.
        for (const name of searchParams.keys()) if (name !== 't') return next()

        const file = path.join(GENERATED_DIRECTORY, path.basename(pathname))
        if (!existsSync(file)) return next()

        response.setHeader(
          'Content-Type',
          ARTIFACT_TYPES[path.extname(file)] ?? 'application/octet-stream',
        )
        response.setHeader('Cache-Control', 'no-store')
        createReadStream(file).pipe(response)
      })
    },
  }
}

export default defineConfig({
  // The page names the source it is running; the same resolution rule as the
  // build keeps them in step.
  define: {
    __SKETCH_PATH__: JSON.stringify(describeTarget(projectRoot, target)),
  },
  // The LED Game rules live in ../shared so this canvas and the gallery room run
  // the same Strip Path helpers; the dev server has to be allowed to serve that
  // directory. The Sketch itself is compiled, not served from there.
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    fs: { allow: [fileURLToPath(new URL('..', import.meta.url))] },
    // The plugin recompiles and swaps the target itself, so the rewritten
    // artifacts must not trigger Vite's own page reload.
    watch: { ignored: ['**/src/generated/**'] },
  },
  preview: { host: '0.0.0.0', port: 5173, strictPort: true },
  plugins: [sketchReload(target), sketchArtifacts()],
})
