import { access, mkdir } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import path from 'node:path'
import process from 'node:process'
import { describeTarget, resolveTarget } from './target.mjs'

const projectRoot = path.resolve(import.meta.dirname, '..')
const facadeDirectory = path.join(projectRoot, 'src', 'arduino')
const outputDirectory = path.join(projectRoot, 'src', 'generated')
const localCompiler = path.join(
  projectRoot,
  '.emsdk',
  'upstream',
  'emscripten',
  process.platform === 'win32' ? 'em++.bat' : 'em++',
)
const compiler = process.env.EMXX || localCompiler

let target
try {
  target = resolveTarget(projectRoot)
} catch (error) {
  console.error(error.message)
  process.exit(1)
}

// The facade always takes part: it is what stands in for the Arduino core and
// FastLED, and it carries main() and the entry points the page calls.
const facadeSources = ['Arduino.cpp', 'FastLED.cpp', 'main.cpp'].map((name) => path.join(facadeDirectory, name))
const sources = target.kind === 'sketch' ? [target.path] : target.sources
const includes = [facadeDirectory, ...(target.kind === 'project' ? target.includes : [])]

for (const source of sources) {
  try {
    await access(source)
  } catch {
    console.error(`Source not found: ${source}`)
    process.exit(1)
  }
}

await mkdir(outputDirectory, { recursive: true })
console.log(`compiling ${target.kind}: ${describeTarget(projectRoot, target)}`)

const arguments_ = [
  '-std=c++17',
  // .ino is not a C++ extension; the flag applies to every source that follows.
  '-x',
  'c++',
  '-include',
  path.join(facadeDirectory, 'Arduino.h'),
  ...includes.flatMap((directory) => ['-I', directory]),
  ...sources,
  ...facadeSources,
  '-O2',
  '-sASYNCIFY=1',
  '-sMODULARIZE=1',
  '-sEXPORT_ES6=1',
  '-sENVIRONMENT=web',
  '-sNO_EXIT_RUNTIME=1',
  // MODULARIZE keeps wasm exports off the module object, so the entry points
  // the page calls have to be named explicitly.
  '-sEXPORTED_FUNCTIONS=_main,_stopSketch',
  '-o',
  path.join(outputDirectory, 'sketch.js'),
]

const child = spawn(compiler, arguments_, {
  cwd: projectRoot,
  stdio: 'inherit',
  shell: process.platform === 'win32',
})

child.on('error', (error) => {
  console.error(`Could not start Emscripten at ${compiler}.`)
  console.error('Run "pnpm setup:emscripten" or set EMXX to your em++ executable.')
  console.error(error.message)
  process.exit(1)
})

child.on('exit', (code) => process.exit(code ?? 1))
