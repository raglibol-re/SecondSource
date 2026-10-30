import { execFileSync, execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

// Calls the Sokosumi CLI (npm i -g @masumi_network/sokosumi) on Preprod. It runs the CLI's own script with this Node, so
// arguments with spaces work on Windows without a shell.
let bin: string | undefined;
const cliRoot = () => join(execSync('npm root -g', { encoding: 'utf8' }).trim(), '@masumi_network', 'sokosumi');
const cliBin = () => {
  if (bin) return bin;
  const root = cliRoot();
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as { bin: string | Record<string, string> };
  bin = join(root, typeof pkg.bin === 'string' ? pkg.bin : pkg.bin.sokosumi!);
  return bin;
};

export const sokosumi = <T = unknown>(args: string[]): T =>
  JSON.parse(
    execFileSync(process.execPath, [cliBin(), '--preprod', ...args, '--json'], { encoding: 'utf8', timeout: 60_000, maxBuffer: 8 * 1024 * 1024 })
  ) as T;

// The paid path posts a masumiPayment event as the Coworker. The CLI has no command for that, so, like Masumi's own
// reference worker, load the CLI's runtime HTTP client and credential store.
export interface CoreClient {
  get(path: string): Promise<{ data: any }>;
  post(path: string, body: unknown): Promise<{ data: any }>;
}
export const coworkerCore = async (coworkerId: string): Promise<CoreClient> => {
  const src = join(cliRoot(), 'dist', 'src');
  const load = (p: string) => import(pathToFileURL(join(src, p)).href);
  const [{ readRuntimeCredential }, { createCoworkerHttpClient }] = await Promise.all([load('coworker/runtime-credentials.js'), load('api/http-client.js')]);
  return createCoworkerHttpClient({ apiKey: readRuntimeCredential(coworkerId) }) as CoreClient;
};
