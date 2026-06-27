import { spawnSync } from 'node:child_process';

const candidates = [
  ...(process.env.PYTHON !== undefined ? [[process.env.PYTHON, []]] : []),
  ...(
  process.platform === 'win32'
    ? [
        ['py', ['-3']],
        ['python', []],
        ['python3', []],
      ]
    : [
        ['python3', []],
        ['python', []],
      ]
  ),
];

function hasSupportedPython(command, prefixArgs) {
  const result = spawnSync(
    command,
    [
      ...prefixArgs,
      '-c',
      'import sys; raise SystemExit(0 if sys.version_info >= (3, 11) else 1)',
    ],
    { stdio: 'ignore' },
  );
  return result.status === 0;
}

for (const [command, prefixArgs] of candidates) {
  if (!hasSupportedPython(command, prefixArgs)) {
    continue;
  }
  const result = spawnSync(command, [...prefixArgs, '-m', 'unittest', 'discover', '-s', 'tools/tests'], {
    stdio: 'inherit',
  });
  if (result.error?.code === 'ENOENT') {
    continue;
  }
  if (result.error !== undefined) {
    console.error(result.error.message);
    process.exitCode = 1;
    process.exit();
  }
  process.exitCode = result.status ?? 1;
  process.exit();
}

console.error('Python 3.11+ was not found. Install Python 3.11+ and retry.');
process.exitCode = 1;
