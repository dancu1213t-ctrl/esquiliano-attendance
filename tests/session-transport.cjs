const assert=require('node:assert/strict');const {create}=require('../session-transport.js');
const endpoint='https://example.supabase.co/rest/v1/rpc/loop_directory';
const token=(value,expires=Date.now()/1000+3600)=>({access_token:value,expires_at:expires});
(async()=>{
 let sent=[],missed=0,refreshes=0,active=null;
 const client={auth:{getSession:async()=>({data:{session:active}}),refreshSession:async()=>{refreshes++;active=token('renewed');return {data:{session:active}}}}};
 let fetcher=create(()=>client,{onMissing:()=>missed++,fetchImpl:async(u,o)=>{sent.push(o);return {status:200}}});
 await assert.rejects(fetcher(endpoint),/session ended/);await assert.rejects(fetcher(endpoint),/session ended/);assert.equal(sent.length,0);assert.equal(missed,1);
 active=token('old',1);await Promise.all([fetcher(endpoint),fetcher(endpoint),fetcher(endpoint)]);assert.equal(refreshes,1);assert(sent.every(o=>o.headers.get('Authorization')==='Bearer renewed'));
 sent=[];active=token('stale');refreshes=0;fetcher=create(()=>client,{fetchImpl:async(u,o)=>{const authorization=o.headers.get('Authorization');sent.push(authorization);return {status:authorization==='Bearer stale'?401:200}}});
 assert.equal((await fetcher(endpoint,{method:'POST',body:'{}'})).status,200);assert.deepEqual(sent,['Bearer stale','Bearer renewed']);assert.equal(refreshes,1);
 let failures=0;fetcher=create(()=>client,{fetchImpl:async()=>{failures++;throw Error('Failed to fetch')}});await assert.rejects(fetcher(endpoint,{method:'POST'}),/Failed to fetch/);assert.equal(failures,1);
 active=null;let bypass=0;fetcher=create(()=>client,{fetchImpl:async()=>{bypass++;return {status:200}}});await fetcher('https://example.supabase.co/auth/v1/token');assert.equal(bypass,1);
 active=token('valid');const abort=new AbortController();let signal;fetcher=create(()=>client,{fetchImpl:async(u,o)=>{signal=o.signal;return {status:200}}});await fetcher(endpoint,{signal:abort.signal});assert.equal(signal,abort.signal);
 client.auth.getSession=async()=>({data:{session:null},error:Error('Temporary network issue')});sent=[];fetcher=create(()=>client,{onMissing:()=>missed++,fetchImpl:async()=>sent.push(1)});await assert.rejects(fetcher(endpoint),/Temporary network/);assert.equal(sent.length,0);assert.equal(missed,1);
 console.log('Session transport: missing-session blocking, single refresh, authenticated retry, mutation no-retry on network failure, auth bypass, abort and transient errors passed.');
})().catch(e=>{console.error(e);process.exitCode=1});
