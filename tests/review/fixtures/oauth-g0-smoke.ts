/** Child-process canary: synthetic values only; stdout must contain a fixed summary. */
import { createServer } from 'node:http';
import { inspect } from 'node:util';
import { SyntheticOAuthHarness } from '../../helpers/bp5-oauth-harness.js';

const secrets = ['G0_ACCESS_CANARY', 'G0_REFRESH_CANARY', 'G0_CONSUMER_CANARY', 'G0_CODE_CANARY'];
const server = createServer((req, res) => {
  let body = '';
  req.on('data', chunk => { body += chunk; });
  req.on('end', () => {
    secrets.push(new URLSearchParams(body).get('code_verifier')!);
    res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({
      access_token: secrets[0], refresh_token: secrets[1], token_type: 'Bearer', expires_in: 120,
      scope: 'bp5_review_read',
    }));
  });
});
let harness: SyntheticOAuthHarness | undefined;
let passed = false;
try {
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw Error();
  harness = await SyntheticOAuthHarness.start({ authorizationOrigin: `http://127.0.0.1:${address.port}`, callbackPort: 0 });
  await harness.withAuthorizationRequest(async request => {
    const auth = new URL(request);
    secrets.push(auth.searchParams.get('state')!);
    const callback = new URL(auth.searchParams.get('redirect_uri')!);
    callback.search = new URLSearchParams({ state: auth.searchParams.get('state')!, code: secrets[3] }).toString();
    const response = await fetch(callback);
    if (response.status !== 200) throw Error();
    const page = await response.text();
    if (secrets.some(secret => page.includes(secret))) throw Error();
  });
  if ((await harness.completion).status !== 'ready') throw Error();
  const result = await harness.useToken(async () => { throw Error(secrets[2]); });
  const diagnostics = inspect(harness) + JSON.stringify(harness) + JSON.stringify(result);
  if (secrets.some(secret => diagnostics.includes(secret))) throw Error();
  passed = true;
} catch {
  // Deliberately suppress raw errors/URLs/credentials, including on test failure.
} finally {
  await harness?.dispose();
  server.closeAllConnections();
  await new Promise<void>(resolve => server.close(() => resolve()));
}
process.stdout.write(JSON.stringify({ status: passed ? 'passed' : 'failed' }) + '\n');
process.exitCode = passed ? 0 : 1;
