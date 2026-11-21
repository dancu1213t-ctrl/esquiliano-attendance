/* Keep protected requests authenticated, including after laptop sleep and reconnects. */
(function (root) {
  const authCooldowns = new Map();
  function create(
    getClient,
    { fetchImpl = root.fetch.bind(root), onMissing = () => {}, now = () => Date.now() } = {},
  ) {
    let recovery = null,
      missing = false,
      lastForcedAt = -Infinity;
    const actualFetch = fetchImpl;
    fetchImpl = async (input, init) => {
      const url = new URL(typeof input === 'string' ? input : input.url);
      if (!url.pathname.endsWith('/auth/v1/token')) return actualFetch(input, init);
      const key = 'esquiliano.auth.cooldown.' + url.origin,
        refresh = url.searchParams.get('grant_type') === 'refresh_token';
      let until = authCooldowns.get(key) || 0;
      try {
        until = Math.max(
          until,
          Math.min(Number(root.localStorage?.getItem(key)) || 0, now() + 300000),
        );
      } catch {}
      const limited = () => {
        const seconds = Math.max(1, Math.ceil((until - now()) / 1000)),
          message =
            'The sign-in service is busy. Please wait ' + seconds + ' seconds and try again.';
        // GoTrue treats a thrown fetch error as retryable and preserves an existing session.
        if (refresh) throw Error(message);
        return new Response(JSON.stringify({ code: 'over_request_rate_limit', msg: message }), {
          status: 429,
          headers: { 'Content-Type': 'application/json', 'Retry-After': String(seconds) },
        });
      };
      if (until > now()) return limited();
      const response = await actualFetch(input, init);
      if (response.status !== 429) return response;
      const header = response.headers.get('Retry-After'),
        numeric = header === null ? NaN : Number(header),
        date = Date.parse(header || '');
      const delay = Number.isFinite(numeric)
        ? numeric * 1000
        : Number.isFinite(date)
          ? date - now()
          : 60000;
      until = now() + Math.max(1000, Math.min(300000, delay));
      authCooldowns.set(key, until);
      try {
        root.localStorage?.setItem(key, String(until));
      } catch {}
      return limited();
    };
    async function session(force = false) {
      if (recovery) return recovery;
      recovery = (async () => {
        const client = getClient();
        if (!client) throw Error('Sign in again to continue.');
        const result = force ? await client.auth.refreshSession() : await client.auth.getSession();
        if (result.error) throw result.error;
        const value = result.data?.session;
        if (!value?.access_token) {
          if (!missing) {
            missing = true;
            onMissing();
          }
          throw Error('Your session ended. Please sign in again.');
        }
        missing = false;
        if (!force && value.expires_at && value.expires_at * 1000 <= now() + 30000) {
          const renewed = await client.auth.refreshSession();
          if (renewed.error) throw renewed.error;
          if (!renewed.data?.session?.access_token) {
            if (!missing) {
              missing = true;
              onMissing();
            }
            throw Error('Your session ended. Please sign in again.');
          }
          return renewed.data.session;
        }
        return value;
      })();
      try {
        return await recovery;
      } finally {
        recovery = null;
      }
    }
    return async function (input, init) {
      const url = new URL(typeof input === 'string' ? input : input.url);
      // Auth calls must bypass the guard: refreshSession itself uses this fetch.
      if (
        !/\/(rest|functions|storage)\/v1(?:\/|$)/.test(url.pathname) ||
        url.pathname.includes('/object/public/')
      )
        return fetchImpl(input, init);
      const active = await session();
      const headers = new Headers(
        init?.headers || (typeof input === 'object' ? input.headers : undefined),
      );
      headers.set('Authorization', 'Bearer ' + active.access_token);
      const options = { ...init, headers };
      let response = await fetchImpl(input, options);
      if (response.status === 401) {
        let next = await session();
        if (next.access_token === active.access_token && now() - lastForcedAt >= 30000) {
          lastForcedAt = now();
          next = await session(true);
        }
        // Only retry a rejected request when refresh produced a different token.
        if (next.access_token !== active.access_token) {
          headers.set('Authorization', 'Bearer ' + next.access_token);
          response = await fetchImpl(input, { ...init, headers });
        }
      }
      return response;
    };
  }
  root.SessionTransport = { create };
  if (typeof module === 'object' && module.exports) module.exports = { create };
})(typeof window === 'object' ? window : globalThis);
