import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { callAirnode, createPayer, logTransaction } from '../airnode/client.ts';
import { check } from '../check.ts';
import { formatResult, parseTaskInput } from './format.ts';
import { advancePaid, createMps, readRegistration, type PaidState } from './paid.ts';
import { coworkerCore, sokosumi } from './sokosumi.ts';

// The SecondSource Coworker. Polls Sokosumi Preprod for Tasks assigned to COWORKER_ID and answers each with a check.
// Without a confirmed Masumi registration it runs Tasks unpaid; with PAID_TASKS_ENABLED=true and a registration in
// masumi/registration.json it asks for 1 tUSDM in escrow first and logs the result hash on Cardano.
const coworkerId = process.env.COWORKER_ID;
if (!coworkerId) throw new Error('Set COWORKER_ID in .env (see docs/masumi-setup.md)');
const paidEnabled = process.env.PAID_TASKS_ENABLED === 'true';
const once = process.argv.includes('--once');
mkdirSync('.local/tasks', { recursive: true });

interface Journal {
  phase?: 'starting' | 'started' | 'check-pending' | 'result-saved' | 'complete-pending' | 'completed' | 'failed';
  input?: string;
  name?: string;
  result?: string;
  resultHash?: string;
  paid?: PaidState;
  error?: string;
  loggedTxs?: string[];
}
const journalPath = (id: string) => `.local/tasks/${id}.json`;
const load = (id: string): Journal => (existsSync(journalPath(id)) ? JSON.parse(readFileSync(journalPath(id), 'utf8')) : {});
const save = (id: string, j: Journal) => writeFileSync(journalPath(id), JSON.stringify(j, null, 2));

const pay = createPayer();
const runCheck = async (description: string, name: string) => {
  const result = await check(parseTaskInput(description, name), (source, request) => callAirnode(source, request, pay, { maxAgeSeconds: 300 }));
  mkdirSync('runs', { recursive: true });
  writeFileSync(`runs/task-${result.checkedAt.replace(/[:.]/g, '-')}.json`, JSON.stringify(result, null, 2));
  console.log(`  ${result.verdict} (${result.confidence}), ${result.attestations.length} attestations, ${result.costAusd} aUSD`);
  return { text: formatResult(result), checkResultHash: result.resultHash };
};

const mps = createMps();
let core: Promise<import('./sokosumi.ts').CoreClient> | undefined;
const getCore = () => (core ??= coworkerCore(coworkerId));

const handle = async (task: { id: string; status: string }) => {
  let j = load(task.id);
  if (j.phase === 'completed' || j.phase === 'failed') return;

  if (task.status === 'READY' && !j.phase) {
    save(task.id, { phase: 'starting' });
    const started = sokosumi<{ description: string | null; name: string }>(['runtime', 'start', task.id, '--personal', '--coworker-id', coworkerId]);
    j = { phase: 'started', input: started.description ?? '', name: started.name };
    save(task.id, j);
    console.log(`Started ${task.id}: ${started.name}`);
  }
  if (j.phase === 'starting' || j.phase?.endsWith('-pending') && !j.paid) {
    throw new Error(`Task ${task.id} is in uncertain phase ${j.phase}. Inspect it before recovering.`);
  }

  const registration = readRegistration();
  if (j.phase === 'started' && (j.paid || (paidEnabled && registration))) {
    try {
      parseTaskInput(j.input ?? '', j.name);
    } catch (e) {
      // Don't ask for money for a brief we cannot run.
      sokosumi(['tasks', 'comment', task.id, '--comment', `SecondSource needs a headline: ${(e as Error).message}`]);
      save(task.id, { ...j, phase: 'failed', error: (e as Error).message });
      return;
    }
    const paid = await advancePaid(task.id, j.input ?? '', j.paid ?? {}, {
      core: getCore,
      mps,
      registration: () => registration!,
      run: (input) => runCheck(input, j.name ?? ''),
      save: (p) => save(task.id, { ...j, paid: p }),
    });
    j = { ...j, paid };
    // Log each confirmed Cardano transaction of this escrow (funds locked, result submitted) once.
    const tx = paid.observed?.CurrentTransaction;
    if (tx?.status === 'Confirmed' && tx.txHash && !(j.loggedTxs ?? []).includes(tx.txHash)) {
      logTransaction('Cardano Preprod', `https://preprod.cardanoscan.io/transaction/${tx.txHash}`, `Masumi escrow ${tx.newOnChainState} for Task ${task.id}`);
      j.loggedTxs = [...(j.loggedTxs ?? []), tx.txHash];
    }
    if (paid.stage === 'completed') j.phase = 'completed';
    save(task.id, j);
    console.log(`  ${task.id} paid stage: ${paid.stage}`);
    return;
  }

  if (j.phase === 'started') {
    save(task.id, { ...j, phase: 'check-pending' });
    try {
      const { text } = await runCheck(j.input ?? '', j.name ?? '');
      j = { ...j, phase: 'result-saved', result: text };
    } catch (e) {
      j = { ...j, phase: 'result-saved', result: `SecondSource could not run this check: ${(e as Error).message}` };
    }
    save(task.id, j);
  }
  if (j.phase === 'result-saved') {
    const file = `.local/tasks/${task.id}.txt`;
    writeFileSync(file, j.result ?? '');
    save(task.id, { ...j, phase: 'complete-pending' });
    sokosumi(['runtime', 'complete', task.id, '--personal', '--coworker-id', coworkerId, '--result-file', file]);
    save(task.id, { ...j, phase: 'completed' });
    console.log(`Completed ${task.id}`);
  }
};

console.log(`SecondSource Coworker ${coworkerId} polling Sokosumi Preprod${paidEnabled ? ' (paid Tasks on)' : ''}`);
for (;;) {
  try {
    const { tasks } = sokosumi<{ tasks: { id: string; status: string; coworkerId?: string }[] }>(['tasks', 'list', '--coworker-id', coworkerId]);
    for (const t of tasks.filter((t) => t.coworkerId === undefined || t.coworkerId === coworkerId)) {
      if (!['READY', 'RUNNING'].includes(t.status)) continue;
      try {
        await handle(t);
      } catch (e) {
        console.error(`Task ${t.id} blocked: ${(e as Error).message.slice(0, 300)}`);
      }
    }
  } catch (e) {
    console.error(`Polling failed: ${(e as Error).message.slice(0, 300)}`);
  }
  if (once) break;
  await new Promise((r) => setTimeout(r, 5000));
}
