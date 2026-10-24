// toktx (KTX-Software) lookup and the encode settings shared by the texture pipelines.

import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

/** toktx arguments per kind of map: colour data is sRGB, the rest linear. */
export const ENCODE = {
  albedo: ['--encode', 'etc1s', '--clevel', '2', '--qlevel', '160', '--assign_oetf', 'srgb'],
  orm: ['--encode', 'etc1s', '--clevel', '2', '--qlevel', '160', '--assign_oetf', 'linear'],
  normal: [
    '--encode',
    'uastc',
    '--uastc_quality',
    '2',
    '--uastc_rdo_l',
    '2',
    '--zcmp',
    '18',
    '--assign_oetf',
    'linear',
  ],
};

/** Path of toktx: KTX_BIN, the per-user and machine-wide installs, then PATH. Exits if missing. */
export function findToktx() {
  const exe = process.platform === 'win32' ? 'toktx.exe' : 'toktx';
  const candidates = [
    process.env.KTX_BIN && join(process.env.KTX_BIN, exe),
    process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, 'KTX-Software', 'bin', exe),
    process.env.ProgramFiles && join(process.env.ProgramFiles, 'KTX-Software', 'bin', exe),
  ].filter(Boolean);
  for (const c of candidates) if (existsSync(c)) return c;
  try {
    execFileSync(exe, ['--version'], { stdio: 'ignore' });
    return exe;
  } catch {
    console.error(
      'toktx not found. Install KTX-Software 4.x (https://github.com/KhronosGroup/KTX-Software/releases),\n' +
        'then put its bin folder on PATH or set KTX_BIN to it.',
    );
    process.exit(1);
  }
}

/** Encodes `png` to KTX2 at `out` as a `kind` map (a key of ENCODE), with mipmaps. */
export function encodeKtx2(toktx, kind, png, out, targetType = 'RGB') {
  execFileSync(
    toktx,
    ['--t2', '--genmipmap', '--target_type', targetType, ...ENCODE[kind], out, png],
    {
      stdio: ['ignore', 'ignore', 'inherit'],
    },
  );
}
