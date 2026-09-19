import { spawn } from 'node:child_process'
import path from 'node:path'
import process from 'node:process'
import { resolveTarget, targetArguments } from './target.mjs'

// Dev entry point. It exists so one argument decides what is compiled: both the
// first build and the running server (which rebuilds on every save) have to
// agree, and `pnpm dev -- --folder x` would otherwise only reach Vite.
//
//   pnpm dev
//   pnpm dev -- --sketch ../other/MySketch.ino
//   pnpm dev -- --folder ../LED_Game
const projectRoot = path.resolve(import.meta.dirname, '..')

try {
  resolveTarget(projectRoot)
} catch (error) {
  console.error(error.message)
  process.exit(1)
}

const env = { ...process.env }
const arguments_ = targetArguments()
if (arguments_.length) env.SKETCH_ARGS = JSON.stringify(arguments_)
else if (!env.SKETCH_PATH && !env.SKETCH_FOLDER) env.SKETCH_ARGS = '[]'

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: projectRoot,
      env,
      stdio: 'inherit',
      shell: process.platform === 'win32',
    })
    child.on('error', reject)
    child.on('close', (code) => resolve(code ?? 1))
  })
}

try {
  const buildExit = await run(process.execPath, ['tools/build-sketch.mjs'])
  if (buildExit !== 0) process.exit(buildExit)
  process.exit(await run('vite', []))
} catch (error) {
  console.error(error.message)
  process.exit(1)
}
