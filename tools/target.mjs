import { existsSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'

// What every tool compiles, resolved in one place so the build, the dev wrapper,
// and the watcher cannot disagree:
//   --sketch <file.ino>   one Arduino sketch
//   --folder <dir>        a folder: either the sketch in it, or a C++ project
//   SKETCH_ARGS           the wrapper hands its own choice to the tools it spawns
//   SKETCH_PATH           same as --sketch,  for tools started directly
//   SKETCH_FOLDER         same as --folder,  for tools started directly
//   otherwise             the repository's own sketch
// Relative paths are taken from the project directory, not the caller's cwd.
const DEFAULT_SKETCH = path.join('..', 'LEDGame.ino')

// Folders that never hold the Sketch or sources we are looking for.
const SKIPPED_DIRECTORIES = new Set(['.git', '.pio', 'build', 'dist', 'node_modules', 'test'])
const SEARCH_DEPTH = 3

function argumentValue(argv, name) {
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === name) return argv[index + 1]
    if (argv[index].startsWith(`${name}=`)) return argv[index].slice(name.length + 1)
  }
  return null
}

// The flags that decide the target, for forwarding to another process.
export function targetArguments(argv = process.argv.slice(2)) {
  for (const name of ['--sketch', '--folder']) {
    const value = argumentValue(argv, name)
    if (value) return [name, value]
  }
  return []
}

function collectFiles(directory, depth, extension, found) {
  if (depth < 0) return
  let entries
  try {
    entries = readdirSync(directory, { withFileTypes: true })
  } catch {
    return
  }
  for (const entry of entries) {
    const location = path.join(directory, entry.name)
    if (entry.isDirectory()) {
      if (entry.name.startsWith('.') || SKIPPED_DIRECTORIES.has(entry.name)) continue
      collectFiles(location, depth - 1, extension, found)
    } else if (entry.name.endsWith(extension)) {
      found.push(location)
    }
  }
}

function sketchTarget(projectRoot, requested) {
  const resolved = path.isAbsolute(requested) ? requested : path.resolve(projectRoot, requested)
  if (existsSync(resolved) && statSync(resolved).isDirectory()) {
    throw new Error(`${resolved} is a folder. Use --folder to search it for a sketch.`)
  }
  return { kind: 'sketch', path: resolved }
}

// A folder is one Arduino sketch, or a C++ project whose sources are compiled
// together. Which one it is decided by what is inside.
function folderTarget(projectRoot, requested) {
  const directory = path.isAbsolute(requested) ? requested : path.resolve(projectRoot, requested)
  if (!existsSync(directory) || !statSync(directory).isDirectory()) {
    throw new Error(`Folder not found: ${directory}`)
  }

  const conventional = path.join(directory, `${path.basename(directory)}.ino`)
  if (existsSync(conventional)) return { kind: 'sketch', path: conventional }

  const sketches = []
  collectFiles(directory, SEARCH_DEPTH, '.ino', sketches)
  sketches.sort()
  if (sketches.length === 1) return { kind: 'sketch', path: sketches[0] }
  if (sketches.length > 1) {
    throw new Error(`Several .ino sketches found in ${directory}, choose one with --sketch:\n  ${sketches.join('\n  ')}`)
  }

  const sources = []
  collectFiles(path.join(directory, 'src'), SEARCH_DEPTH, '.cpp', sources)
  sources.sort()
  if (sources.length > 0) {
    const includes = [path.join(directory, 'src')]
    const includeDirectory = path.join(directory, 'include')
    if (existsSync(includeDirectory)) includes.push(includeDirectory)
    return { kind: 'project', root: directory, sources, includes }
  }

  if (existsSync(path.join(directory, 'platformio.ini'))) {
    throw new Error(`${directory} is a PlatformIO project with neither an .ino nor any .cpp under src/.`)
  }
  throw new Error(`No .ino sketch or src/*.cpp project found in ${directory}`)
}

// The choice the flags themselves make, or null when they make none.
function flagTarget(projectRoot, argv) {
  const file = argumentValue(argv, '--sketch')
  const folder = argumentValue(argv, '--folder')
  if (file && folder) throw new Error('Use either --sketch or --folder, not both.')

  if (file) return sketchTarget(projectRoot, file)
  if (folder) return folderTarget(projectRoot, folder)
  return null
}

export function resolveTarget(projectRoot, argv = process.argv.slice(2)) {
  const flagged = flagTarget(projectRoot, argv)
  if (flagged) return flagged

  // The wrapper forwards its own choice; an empty list means it made none.
  if (process.env.SKETCH_ARGS) {
    const forwarded = flagTarget(projectRoot, JSON.parse(process.env.SKETCH_ARGS))
    if (forwarded) return forwarded
  }
  if (process.env.SKETCH_PATH) return sketchTarget(projectRoot, process.env.SKETCH_PATH)
  if (process.env.SKETCH_FOLDER) return folderTarget(projectRoot, process.env.SKETCH_FOLDER)

  return sketchTarget(projectRoot, DEFAULT_SKETCH)
}

// The directories whose changes mean the target has to be recompiled.
export function targetDirectories(target, facadeDirectory) {
  const own =
    target.kind === 'sketch'
      ? [path.dirname(target.path)]
      : [path.join(target.root, 'src'), path.join(target.root, 'include')]
  return [facadeDirectory, ...own].filter((directory) => existsSync(directory))
}

// Short label for logs: relative when the target lives inside the project.
export function describeTarget(projectRoot, target) {
  const location = target.kind === 'sketch' ? target.path : target.root
  const relative = path.relative(projectRoot, location)
  return relative.startsWith('..') ? location : relative
}
