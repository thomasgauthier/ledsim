import { existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import process from 'node:process'

const projectRoot = path.resolve(import.meta.dirname, '..')
const sdkDirectory = path.join(projectRoot, '.emsdk')

function run(command, arguments_, cwd = projectRoot) {
  const result = spawnSync(command, arguments_, {
    cwd,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  })

  if (result.error) throw result.error
  if (result.status !== 0) process.exit(result.status ?? 1)
}

if (!existsSync(sdkDirectory)) {
  run('git', [
    'clone',
    '--depth=1',
    'https://github.com/emscripten-core/emsdk.git',
    sdkDirectory,
  ])
}

const emsdk = path.join(sdkDirectory, process.platform === 'win32' ? 'emsdk.bat' : 'emsdk')
run(emsdk, ['install', 'latest'], sdkDirectory)
run(emsdk, ['activate', 'latest'], sdkDirectory)
