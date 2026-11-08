import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import type {
  SessionDto,
  TwoFactorEnableResponse,
  TwoFactorSetupResponse,
} from '@sigma/validation';
import { AppHeader } from '../../components/AppHeader';
import { Button } from '../../components/ui/Button';
import { Field, Modal } from '../../components/ui/Modal';
import { toast } from '../../components/ui/toast';
import { http } from '../../lib/api';
import { errorText, useApiMutation } from '../../lib/queries';
import { useAuth } from '../authentication/AuthProvider';

export function SecurityPage() {
  const { user, refresh } = useAuth();
  const key = ['sessions'];
  const sessions = useQuery({
    queryKey: key,
    queryFn: () => http.get<SessionDto[]>('/auth/sessions'),
  });
  const revoke = useApiMutation((id: string) => http.delete(`/auth/sessions/${id}`), [key]);
  const revokeOthers = useApiMutation(
    () => http.post('/auth/sessions/revoke-others'),
    [key],
    () => toast.success('Other sessions signed out'),
  );
  const [setup, setSetup] = useState<TwoFactorSetupResponse | null>(null);
  const [code, setCode] = useState('');
  const [recovery, setRecovery] = useState<string[] | null>(null);
  const [disabling, setDisabling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const start = async () => {
    setError(null);
    setSetup(await http.post<TwoFactorSetupResponse>('/auth/2fa/setup'));
  };
  const enable = async () => {
    try {
      const r = await http.post<TwoFactorEnableResponse>('/auth/2fa/enable', { code });
      setSetup(null);
      setCode('');
      setRecovery(r.recoveryCodes);
      await refresh();
    } catch (e) {
      setError(errorText(e));
    }
  };
  const disable = async () => {
    try {
      await http.post('/auth/2fa/disable', { code });
      setDisabling(false);
      setCode('');
      await refresh();
      toast.success('Two-factor authentication disabled');
    } catch (e) {
      setError(errorText(e));
    }
  };

  return (
    <div className="min-h-full bg-ink-900 text-ink-100">
      <AppHeader crumbs={[{ label: 'Security' }]} />
      <main className="mx-auto max-w-3xl px-6 py-8">
        <h1 className="text-xl font-semibold">Security</h1>
        <section className="mt-6 rounded-xl border border-ink-700 bg-ink-850 p-5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-[14px] font-semibold">Two-factor authentication</h2>
              <p className="mt-1 text-[12px] text-ink-400">
                {user?.twoFactorEnabled
                  ? 'Enabled. A code from your authenticator app is required at sign-in.'
                  : 'Add a second step at sign-in using any TOTP authenticator app.'}
              </p>
            </div>
            {user?.twoFactorEnabled ? (
              <Button variant="danger" onClick={() => setDisabling(true)}>
                Disable
              </Button>
            ) : (
              <Button variant="primary" data-testid="enable-2fa" onClick={() => void start()}>
                Enable
              </Button>
            )}
          </div>
        </section>
        <section className="mt-6 rounded-xl border border-ink-700 bg-ink-850 p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-[14px] font-semibold">Sessions</h2>
            <Button variant="secondary" onClick={() => revokeOthers.mutate(undefined as never)}>
              Sign out other sessions
            </Button>
          </div>
          <table className="w-full text-left text-[12px]">
            <thead className="text-[11px] uppercase text-ink-400">
              <tr>
                <th className="py-2">Device</th>
                <th>IP</th>
                <th>Last active</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {sessions.data?.map((s) => (
                <tr
                  key={s.id}
                  className="border-t border-ink-700"
                  data-testid={s.current ? 'session-current' : 'session-other'}
                >
                  <td className="py-2">
                    {s.userAgent?.slice(0, 60) ?? 'Unknown'}
                    {s.current && (
                      <span className="ml-1 rounded bg-emerald-500/20 px-1 text-[10px] text-emerald-300">
                        this session
                      </span>
                    )}
                  </td>
                  <td className="text-ink-400">{s.ip ?? '—'}</td>
                  <td className="text-ink-400">{new Date(s.lastSeenAt).toLocaleString()}</td>
                  <td className="text-right">
                    {!s.current && (
                      <button
                        className="rounded px-2 py-1 text-red-300 hover:bg-ink-700"
                        onClick={() => revoke.mutate(s.id)}
                      >
                        Sign out
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </main>
      {setup && (
        <Modal title="Set up two-factor authentication" onClose={() => setSetup(null)}>
          <p className="mb-2 text-[12px] text-ink-300">
            Scan this in your authenticator app, or enter the key manually.
          </p>
          <QrCode value={setup.otpauthUrl} />
          <div
            className="mb-3 select-all break-all rounded-md bg-ink-800 px-3 py-2 font-mono text-[12px]"
            data-testid="totp-secret"
          >
            {setup.secret}
          </div>
          <Field label="6-digit code from the app">
            <input
              className="field h-9"
              inputMode="numeric"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              data-testid="totp-code"
            />
          </Field>
          {error && (
            <div role="alert" className="mb-3 text-[12px] text-red-300">
              {error}
            </div>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setSetup(null)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={() => void enable()} disabled={code.length < 6}>
              Turn on
            </Button>
          </div>
        </Modal>
      )}
      {recovery && (
        <Modal title="Recovery codes" onClose={() => setRecovery(null)}>
          <p className="mb-3 text-[12px] text-ink-300">
            Keep these somewhere safe. Each code works once if you lose your authenticator.
          </p>
          <div
            className="mb-4 grid grid-cols-2 gap-1 rounded-md bg-ink-800 p-3 font-mono text-[12px]"
            data-testid="recovery-codes"
          >
            {recovery.map((c) => (
              <span key={c}>{c}</span>
            ))}
          </div>
          <div className="flex justify-end">
            <Button variant="primary" onClick={() => setRecovery(null)}>
              Done
            </Button>
          </div>
        </Modal>
      )}
      {disabling && (
        <Modal title="Disable two-factor authentication" onClose={() => setDisabling(false)}>
          <Field label="Current code or a recovery code">
            <input className="field h-9" value={code} onChange={(e) => setCode(e.target.value)} />
          </Field>
          {error && (
            <div role="alert" className="mb-3 text-[12px] text-red-300">
              {error}
            </div>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setDisabling(false)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={() => void disable()}>
              Disable
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}

/** Tiny QR renderer (byte mode, error level L, versions 1–10) sufficient for otpauth URLs. */
function QrCode({ value }: { value: string }) {
  const modules = encodeQr(value);
  if (!modules)
    return (
      <div className="mb-3 text-[11px] text-ink-500">QR code unavailable; use the manual key.</div>
    );
  const n = modules.length;
  const size = 176;
  const cell = size / (n + 8);
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className="mb-3 rounded bg-white p-1"
      aria-label="QR code"
    >
      {modules.map((row, y) =>
        row.map((on, x) =>
          on ? (
            <rect
              key={`${x}-${y}`}
              x={(x + 4) * cell}
              y={(y + 4) * cell}
              width={cell}
              height={cell}
              fill="#000"
            />
          ) : null,
        ),
      )}
    </svg>
  );
}

// --- Minimal QR encoder (byte mode, EC level L). Adapted from the public-domain "qr-tiny" approach.
function encodeQr(text: string): boolean[][] | null {
  const data = new TextEncoder().encode(text);
  const CAP = [17, 32, 53, 78, 106, 134, 154, 192, 230, 271];
  const EC = [7, 10, 15, 20, 26, 18, 20, 24, 30, 18];
  const BLOCKS = [1, 1, 1, 1, 1, 2, 2, 2, 2, 4];
  const version = CAP.findIndex((c) => c >= data.length) + 1;
  if (version === 0) return null;
  const size = version * 4 + 17;
  const totalCodewords = Math.floor([26, 44, 70, 100, 134, 172, 196, 242, 292, 346][version - 1]!);
  const ecPerBlock = EC[version - 1]!;
  const blocks = BLOCKS[version - 1]!;
  const dataCodewords = totalCodewords - ecPerBlock * blocks;
  // bit stream
  const bits: number[] = [];
  const push = (v: number, len: number) => {
    for (let i = len - 1; i >= 0; i--) bits.push((v >> i) & 1);
  };
  push(0b0100, 4);
  push(data.length, version < 10 ? 8 : 16);
  for (const b of data) push(b, 8);
  push(0, Math.min(4, dataCodewords * 8 - bits.length));
  while (bits.length % 8) bits.push(0);
  const cw: number[] = [];
  for (let i = 0; i < bits.length; i += 8) cw.push(parseInt(bits.slice(i, i + 8).join(''), 2));
  for (let pad = 0; cw.length < dataCodewords; pad++) cw.push(pad % 2 ? 0x11 : 0xec);
  // Reed-Solomon
  const exp = new Array<number>(512).fill(0);
  const log = new Array<number>(256).fill(0);
  for (let i = 0, x = 1; i < 255; i++) {
    exp[i] = x;
    log[x] = i;
    x = x << 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) exp[i] = exp[i - 255]!;
  const mul = (a: number, b: number) => (a && b ? exp[log[a]! + log[b]!]! : 0);
  let gen = [1];
  for (let i = 0; i < ecPerBlock; i++) {
    const next = new Array<number>(gen.length + 1).fill(0);
    for (let j = 0; j < gen.length; j++) {
      next[j]! ^= gen[j]!;
      next[j + 1]! ^= mul(gen[j]!, exp[i]!);
    }
    gen = next;
  }
  const short = Math.floor(dataCodewords / blocks);
  const longCount = dataCodewords % blocks;
  const dataBlocks: number[][] = [];
  const ecBlocks: number[][] = [];
  let offset = 0;
  for (let b = 0; b < blocks; b++) {
    const len = short + (b >= blocks - longCount ? 1 : 0);
    const block = cw.slice(offset, offset + len);
    offset += len;
    const rem = new Array<number>(ecPerBlock).fill(0);
    for (const d of block) {
      const f = d ^ rem.shift()!;
      rem.push(0);
      for (let j = 0; j < ecPerBlock; j++) rem[j]! ^= mul(gen[j + 1]!, f);
    }
    dataBlocks.push(block);
    ecBlocks.push(rem);
  }
  const out: number[] = [];
  for (let i = 0; i < short + 1; i++) for (const b of dataBlocks) if (i < b.length) out.push(b[i]!);
  for (let i = 0; i < ecPerBlock; i++) for (const b of ecBlocks) out.push(b[i]!);
  // matrix
  const m: (boolean | null)[][] = Array.from({ length: size }, () =>
    Array<boolean | null>(size).fill(null),
  );
  const setFinder = (x: number, y: number) => {
    for (let dy = -1; dy <= 7; dy++)
      for (let dx = -1; dx <= 7; dx++) {
        const xx = x + dx,
          yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= size || yy >= size) continue;
        const on =
          dx >= 0 &&
          dx <= 6 &&
          dy >= 0 &&
          dy <= 6 &&
          (dx === 0 ||
            dx === 6 ||
            dy === 0 ||
            dy === 6 ||
            (dx >= 2 && dx <= 4 && dy >= 2 && dy <= 4));
        m[yy]![xx] = on;
      }
  };
  setFinder(0, 0);
  setFinder(size - 7, 0);
  setFinder(0, size - 7);
  for (let i = 8; i < size - 8; i++) {
    m[6]![i] = i % 2 === 0;
    m[i]![6] = i % 2 === 0;
  }
  const ALIGN: Record<number, number[]> = {
    2: [6, 18],
    3: [6, 22],
    4: [6, 26],
    5: [6, 30],
    6: [6, 34],
    7: [6, 22, 38],
    8: [6, 24, 42],
    9: [6, 26, 46],
    10: [6, 28, 50],
  };
  for (const cy of ALIGN[version] ?? [])
    for (const cx of ALIGN[version] ?? []) {
      if (m[cy]![cx] !== null) continue;
      for (let dy = -2; dy <= 2; dy++)
        for (let dx = -2; dx <= 2; dx++)
          m[cy + dy]![cx + dx] = Math.max(Math.abs(dx), Math.abs(dy)) !== 1;
    }
  for (let i = 0; i < 9; i++) {
    if (m[8]![i] === null) m[8]![i] = false;
    if (m[i]![8] === null) m[i]![8] = false;
  }
  for (let i = size - 8; i < size; i++) {
    if (m[8]![i] === null) m[8]![i] = false;
    if (m[i]![8] === null) m[i]![8] = false;
  }
  m[size - 8]![8] = true;
  if (version >= 7)
    for (let i = 0; i < 6; i++)
      for (let j = 0; j < 3; j++) {
        m[i]![size - 11 + j] = false;
        m[size - 11 + j]![i] = false;
      }
  const dataBits: number[] = [];
  for (const c of out) for (let i = 7; i >= 0; i--) dataBits.push((c >> i) & 1);
  let bi = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right--;
    for (let vert = 0; vert < size; vert++) {
      for (let j = 0; j < 2; j++) {
        const x = right - j;
        const upward = ((right + 1) & 2) === 0;
        const y = upward ? size - 1 - vert : vert;
        if (m[y]![x] !== null) continue;
        const bit = dataBits[bi++] ?? 0;
        m[y]![x] = (bit === 1) !== ((x + y) % 2 === 0);
      }
    }
  }
  // format info for EC L, mask 0: 111011111000100
  const fmt = 0b111011111000100;
  for (let i = 0; i < 15; i++) {
    const on = ((fmt >> i) & 1) === 1;
    if (i < 6) m[i]![8] = on;
    else if (i < 8) m[i + 1]![8] = on;
    else m[size - 15 + i]![8] = on;
    if (i < 8) m[8]![size - 1 - i] = on;
    else if (i < 9) m[8]![15 - i] = on;
    else m[8]![14 - i] = on;
  }
  if (version >= 7) {
    const v = version;
    let bitsV = v << 12;
    const g = 0b1111100100101;
    for (let i = 17; i >= 12; i--) if ((bitsV >> i) & 1) bitsV ^= g << (i - 12);
    const info = (v << 12) | bitsV;
    for (let i = 0; i < 18; i++) {
      const on = ((info >> i) & 1) === 1;
      m[Math.floor(i / 3)]![size - 11 + (i % 3)] = on;
      m[size - 11 + (i % 3)]![Math.floor(i / 3)] = on;
    }
  }
  return m.map((row) => row.map((v) => v === true));
}
