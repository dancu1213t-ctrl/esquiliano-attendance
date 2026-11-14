import {createClient} from 'https://esm.sh/@supabase/supabase-js@2';
const origins=new Set(['https://attendance.esquilianoconsulting.com','https://attendance.swiftshopow.com']);
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const db=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}});
function b64(bytes:Uint8Array){return btoa(String.fromCharCode(...bytes)).replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_')}
const encode=(value:unknown)=>b64(new TextEncoder().encode(JSON.stringify(value)));
Deno.serve(async req=>{
 const origin=req.headers.get('origin')||'';
 const reply=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store','Vary':'Origin','Access-Control-Allow-Origin':origins.has(origin)?origin:'https://attendance.esquilianoconsulting.com','Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info','Access-Control-Allow-Methods':'POST,OPTIONS'}});
 if(req.method==='OPTIONS')return reply({},origins.has(origin)?200:403);
 if(req.method!=='POST'||origin&&!origins.has(origin))return reply({error:'Request not allowed'},403);
 try{
  const jwt=req.headers.get('authorization')?.replace(/^Bearer /i,'');if(!jwt)return reply({error:'Sign in required'},401);
  const {data:{user},error:authError}=await db.auth.getUser(jwt);if(authError||!user)return reply({error:'Sign in required'},401);
  const input=await req.json();if(!uuid.test(input.call_id)||!uuid.test(input.device))return reply({error:'Invalid call'},400);
  const [{data:profile},{data:call}]=await Promise.all([db.from('att_profiles').select('id,active').eq('id',user.id).maybeSingle(),db.from('loop_calls').select('caller_id,callee_id,caller_device,callee_device,state,video,caller_seen,callee_seen').eq('id',input.call_id).maybeSingle()]);
  if(!profile?.active||!call||!['accepted','connected'].includes(call.state)||!((call.caller_id===user.id&&call.caller_device===input.device)||(call.callee_id===user.id&&call.callee_device===input.device)))return reply({error:'Call unavailable'},403);
  if(Date.now()-Date.parse(call.caller_seen)>90000||Date.now()-Date.parse(call.callee_seen)>90000)return reply({error:'Call expired'},403);
  const key=Deno.env.get('LIVEKIT_API_KEY'),secret=Deno.env.get('LIVEKIT_API_SECRET'),url=Deno.env.get('LIVEKIT_URL');
  if(!key||!secret||!url)return reply({error:'Calling service setup is not complete yet.'},503);
  if(!/^wss:\/\/[a-z0-9-]+\.livekit\.cloud\/?$/i.test(url))return reply({error:'Calling service URL needs administrator setup.'},503);
  const now=Math.floor(Date.now()/1000),payload={iss:key,sub:user.id,iat:now,nbf:now-5,exp:now+120,video:{room:'loop-'+input.call_id,roomJoin:true,canPublish:true,canSubscribe:true,canPublishData:false,canPublishSources:call.video?['microphone','camera']:['microphone']}};
  const unsigned=encode({alg:'HS256',typ:'JWT'})+'.'+encode(payload),hmac=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  const signature=await crypto.subtle.sign('HMAC',hmac,new TextEncoder().encode(unsigned));
  return reply({url,token:unsigned+'.'+b64(new Uint8Array(signature))});
 }catch{return reply({error:'Calling service is temporarily unavailable. Try again.'},503)}
});
