const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const {stripTypeScriptTypes}=require('node:module');
const {webcrypto,createHmac}=require('node:crypto');
let handler;
const user='11111111-1111-4111-8111-111111111111',peer='22222222-2222-4222-8222-222222222222',device='33333333-3333-4333-8333-333333333333',callId='44444444-4444-4444-8444-444444444444';
let call={caller_id:user,callee_id:peer,caller_device:device,callee_device:'other',state:'accepted',video:false,caller_seen:new Date().toISOString(),callee_seen:new Date().toISOString()},active=true;
const db={auth:{getUser:async()=>({data:{user:{id:user}}})},from:table=>({select(){return this},eq(){return this},maybeSingle:async()=>({data:table==='att_profiles'?{id:user,active}:call})})};
const env={SUPABASE_URL:'https://test.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'fake',LIVEKIT_API_KEY:'test-key',LIVEKIT_API_SECRET:'test-secret',LIVEKIT_URL:'wss://test.livekit.cloud'};
const context={createClient:()=>db,Deno:{env:{get:key=>env[key]},serve:fn=>handler=fn},crypto:webcrypto,btoa,Uint8Array,TextEncoder,Response,Date,Set};
const source=fs.readFileSync(require.resolve('../supabase/functions/loop-call-token/index.ts'),'utf8').replace(/^import[^\n]+\n/,'');
vm.runInNewContext(stripTypeScriptTypes(source),context);
const request=(body={call_id:callId,device},origin='https://attendance.esquilianoconsulting.com',auth=true)=>new Request('https://test/loop-call-token',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',...(auth?{Authorization:'Bearer test'}:{})},body:JSON.stringify(body)});
(async()=>{
 let response=await handler(request());assert.equal(response.status,200);const data=await response.json(),[head,payload,signature]=data.token.split('.'),grant=JSON.parse(Buffer.from(payload,'base64url'));
 assert.equal(signature,createHmac('sha256','test-secret').update(head+'.'+payload).digest('base64url'));
 assert.equal(grant.sub,user);assert.equal(grant.video.room,'loop-'+callId);assert.deepEqual(grant.video.canPublishSources,['microphone']);assert.equal(grant.video.canPublishData,false);assert.equal(grant.exp-grant.iat,120);
 response=await handler(request(undefined,'https://evil.example'));assert.equal(response.status,403);
 response=await handler(request(undefined,undefined,false));assert.equal(response.status,401);
 response=await handler(request({call_id:callId,device:peer}));assert.equal(response.status,403);
 active=false;assert.equal((await handler(request())).status,403);active=true;
 call.state='ringing';assert.equal((await handler(request())).status,403);call.state='accepted';
 call.caller_seen=new Date(Date.now()-100000).toISOString();assert.equal((await handler(request())).status,403);
 console.log('PASS: valid signed room token, voice-only grants, expiry, origin, auth, device and active-call access checks');
})().catch(e=>{console.error(e);process.exitCode=1});

