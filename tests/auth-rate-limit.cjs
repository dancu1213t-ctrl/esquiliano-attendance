global.self = globalThis;
const assert = require('node:assert/strict'),
  { create } = require('../session-transport.js'),
  { AuthClient } = require('../vendor/supabase.js');
(async () => {
  let clock = 1_800_000_000_000,
    calls = 0;
  const origin = 'https://cooldown-test.supabase.co',
    url = origin + '/auth/v1/token?grant_type=refresh_token';
  const transport = create(() => null, {
    now: () => clock,
    fetchImpl: async () => {
      calls++;
      return new Response('{"msg":"rate limited"}', {
        status: 429,
        headers: { 'Retry-After': '20' },
      });
    },
  });
  await assert.rejects(transport(url), /wait 20 seconds/);
  assert.equal(calls, 1);
  await assert.rejects(transport(url), /wait 20 seconds/);
  assert.equal(calls, 1);
  const otherAccount = create(() => null, {
    now: () => clock,
    fetchImpl: async () => {
      calls++;
      return new Response('{}');
    },
  });
  const password = await otherAccount(origin + '/auth/v1/token?grant_type=password');
  assert.equal(password.status, 429);
  assert.equal(calls, 1);
  assert.equal(password.headers.get('Retry-After'), '20');
  clock += 21000;
  assert.equal((await otherAccount(origin + '/auth/v1/token?grant_type=password')).status, 200);
  assert.equal(calls, 2);
  let forced = 0;
  const session = { access_token: 'unchanged', expires_at: clock / 1000 + 3600 };
  const rejected = create(
    () => ({
      auth: {
        getSession: async () => ({ data: { session } }),
        refreshSession: async () => {
          forced++;
          return { data: { session } };
        },
      },
    }),
    { now: () => clock, fetchImpl: async () => new Response('{}', { status: 401 }) },
  );
  await rejected(origin + '/rest/v1/rpc/loop_directory');
  await rejected(origin + '/rest/v1/rpc/loop_call_poll');
  assert.equal(forced, 1);
  clock += 31000;
  await rejected(origin + '/rest/v1/rpc/loop_directory');
  assert.equal(forced, 2);
  // Use the actual bundled GoTrue client to verify a rate-limited refresh keeps the saved session.
  const realNow = Date.now,
    realError = console.error;
  clock = realNow();
  const token =
    'eyJhbGciOiJIUzI1NiJ9.' +
    Buffer.from(
      JSON.stringify({ sub: 'rate-test', exp: Math.floor(clock / 1000) + 3600 }),
    ).toString('base64url') +
    '.test';
  const saved = {
    access_token: token,
    refresh_token: 'test-refresh-not-real',
    expires_at: Math.floor(clock / 1000) + 3600,
    expires_in: 3600,
    token_type: 'bearer',
    user: { id: 'rate-test' },
  };
  const memory = new Map([['rate-test', JSON.stringify(saved)]]);
  let removals = 0;
  const storage = {
    getItem: (k) => memory.get(k) || null,
    setItem: (k, v) => memory.set(k, v),
    removeItem: (k) => {
      removals++;
      memory.delete(k);
    },
  };
  const rateFetch = create(() => null, {
    now: () => clock,
    fetchImpl: async () => {
      clock += 40000;
      return new Response('{"error_code":"over_request_rate_limit","msg":"Too many requests"}', {
        status: 429,
      });
    },
  });
  const client = new AuthClient({
    url: 'https://sdk-rate-test.supabase.co/auth/v1',
    storageKey: 'rate-test',
    storage,
    persistSession: true,
    autoRefreshToken: false,
    detectSessionInUrl: false,
    fetch: rateFetch,
  });
  await client.initialize();
  try {
    Date.now = () => clock;
    console.error = () => {};
    const result = await client.refreshSession();
    assert.equal(result.error?.name, 'AuthRetryableFetchError');
    assert(memory.has('rate-test'));
    assert.equal(removals, 0);
    const recovered = await client.getSession();
    assert.equal(recovered.data.session.access_token, token);
  } finally {
    Date.now = realNow;
    console.error = realError;
  }
  console.log(
    'Auth rate-limit tests passed: shared cooldown, wait message, recovery, bounded 401 refreshes, and actual SDK session preservation.',
  );
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
