import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';
const URL=Deno.env.get('SUPABASE_URL')!,SERVICE=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,ANON=Deno.env.get('SUPABASE_ANON_KEY')!;
const jobRoles=['','Agent','Marketing Department','Assistant','Manager','Director','Accounting Department'];
const origins=(Deno.env.get('ATTENDANCE_ORIGINS')||'https://attendance.swiftshopow.com').split(',');
const db=createClient(URL,SERVICE,{auth:{persistSession:false,autoRefreshToken:false}});
function result(body:unknown,status=200,origin=''){return new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json','Access-Control-Allow-Origin':origins.includes(origin)?origin:origins[0],'Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info','Access-Control-Allow-Methods':'POST,OPTIONS','Vary':'Origin'}})}
async function dispatch(actor:string){
 const priv=Deno.env.get('VAPID_PRIVATE_KEY'),pub=Deno.env.get('VAPID_PUBLIC_KEY');
 if(!priv||!pub)return {pushConfigured:false};
 webpush.setVapidDetails(Deno.env.get('VAPID_SUBJECT')||'mailto:admin@esquilianoconsulting.com',pub,priv);
 const {data:notes,error}=await db.from('att_notifications').select('*').eq('actor_id',actor).is('push_sent_at',null).gte('created_at',new Date(Date.now()-300000).toISOString()).limit(100);
 if(error)throw error;
 for(const n of notes||[]){
  const {data:subs}=await db.from('att_push').select('id,subscription').eq('user_id',n.user_id);
  for(const s of subs||[]){
   try{const host=new URL(s.subscription.endpoint).hostname;if(!(/(^|\.)(push\.apple\.com|fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|notify\.windows\.com)$/.test(host)))continue;await webpush.sendNotification(s.subscription,JSON.stringify({id:n.id,title:n.title,body:n.body}),{TTL:300});}
   catch(e){if([404,410].includes(e.statusCode))await db.from('att_push').delete().eq('id',s.id);else console.error('Push delivery failed',n.id);}
  }
  await db.from('att_notifications').update({push_sent_at:new Date().toISOString()}).eq('id',n.id);
 }
 return {pushConfigured:true};
}
Deno.serve(async req=>{
 const origin=req.headers.get('origin')||'';
 if(req.method==='OPTIONS')return result({},200,origin);
 if(req.method!=='POST'||(origin&&!origins.includes(origin)))return result({error:'Request not allowed'},403,origin);
 try{
  const jwt=req.headers.get('authorization')?.replace(/^Bearer /i,'');if(!jwt)return result({error:'Sign in required'},401,origin);
  const client=createClient(URL,ANON,{global:{headers:{Authorization:'Bearer '+jwt}},auth:{persistSession:false}});
  const {data:{user},error:authError}=await client.auth.getUser(jwt);if(authError||!user)return result({error:'Session expired'},401,origin);
  const {data:actor}=await db.from('att_profiles').select('id,role,active').eq('id',user.id).single();if(!actor?.active)return result({error:'Account inactive'},403,origin);
  const input=await req.json();if(['create','update'].includes(input.action)&&input.jobRole!==undefined&&!jobRoles.includes(input.jobRole))throw Error('Choose a valid job role');if(input.action==='dispatch')return result(await dispatch(user.id),200,origin);
  if(actor.role!=='admin')return result({error:'Administrator required'},403,origin);
  let target=String(input.id||'');
  if(input.action==='create'){
   const employeeId=String(input.employeeId||'').trim().toUpperCase(),name=String(input.name||'').trim(),code=String(input.code||'');
   if(!/^[A-Z0-9_-]{2,30}$/.test(employeeId)||!name||name.length>100||code.length<8||code.length>32||!['employee','admin'].includes(input.role))throw Error('Check employee ID, name, role and access code');
   const {data,error}=await db.auth.admin.createUser({email:employeeId.toLowerCase()+'@attendance.esquiliano.invalid',password:code,email_confirm:true});if(error)throw error;
   target=data.user.id;
   const {error:profileError}=await db.from('att_profiles').insert({id:target,employee_id:employeeId,name,role:input.role,job_role:input.jobRole||'',active:true});
   if(profileError){await db.auth.admin.deleteUser(target);throw profileError;}
  }else if(input.action==='update'){
   const {data:current}=await db.from('att_profiles').select('*').eq('id',target).single();if(!current)throw Error('Person not found');
   const name=String(input.name||'').trim();if(!name||name.length>100||!['employee','admin'].includes(input.role)||typeof input.active!=='boolean')throw Error('Check person details');
   if(target===user.id&&(!input.active||input.role!=='admin'))throw Error('Keep your own administrator account active');
   const {error}=await db.from('att_profiles').update({name,role:input.role,active:input.active,...(input.jobRole!==undefined?{job_role:input.jobRole}:{})}).eq('id',target);if(error)throw error;
  }else if(input.action==='reset-code'){
   const code=String(input.code||'');if(code.length<8||code.length>32)throw Error('Use 8–32 characters');
   const {error}=await db.auth.admin.updateUserById(target,{password:code});if(error)throw error;
   await db.from('att_devices').update({active:false}).eq('user_id',target);
  }else if(input.action==='announce'){
   const title=String(input.title||'').trim(),body=String(input.body||'').trim();if(!title||title.length>80||!body||body.length>500)throw Error('Check title and message');
   let q=db.from('att_profiles').select('id').eq('active',true);if(input.target)q=q.eq('id',input.target);
   const {data:people,error}=await q;if(error)throw error;
   const {error:sendError}=await db.from('att_notifications').insert((people||[]).map(p=>({user_id:p.id,title,body,actor_id:user.id})));if(sendError)throw sendError;
   await dispatch(user.id);
  }else throw Error('Unknown action');
  await db.from('att_audit').insert({actor:user.id,action:input.action.toUpperCase(),target:target||null});
  return result({ok:true,id:target},200,origin);
 }catch(e){console.error('Attendance operation failed');return result({error:e.message||'Operation failed'},400,origin);}
});
