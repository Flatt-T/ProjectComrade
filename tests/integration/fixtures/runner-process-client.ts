import { fork } from 'node:child_process';
import { once } from 'node:events';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { WorkerRequest, WorkerState } from './mmo-runner-process.js';

export function startProcessWorker(regionId: string, workerId: string, wallTime: number) {
  const require = createRequire(new URL('../../../apps/service/package.json', import.meta.url));
  const loader = pathToFileURL(require.resolve('tsx')).href;
  const child = fork(fileURLToPath(new URL('./mmo-runner-process.ts', import.meta.url)),
    [regionId, workerId, String(wallTime)], {
      execArgv: ['--import', loader],
      env: { ...process.env, MMO_DATABASE_URL: process.env.MMO_TEST_DATABASE_URL },
      stdio: ['ignore', 'ignore', 'inherit', 'ipc'],
    });
  async function request(message: WorkerRequest): Promise<WorkerState> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);
    try {
      const result = Promise.race([
        once(child, 'message', { signal: controller.signal }).then(([reply]) =>
          reply as { state?: WorkerState; error?: string }),
        once(child, 'exit', { signal: controller.signal }).then(([code, signal]) => {
          throw new Error(`Replay worker exited before ${message.type} (${code ?? signal})`);
        }),
      ]);
      child.send(message);
      const reply = await result;
      if (!reply.state) throw new Error(reply.error ?? 'Replay worker returned no state');
      return reply.state;
    } finally {
      clearTimeout(timer);
      controller.abort();
    }
  }
  return { child, request };
}
