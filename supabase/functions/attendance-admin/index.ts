import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';
const PROJECT_URL=Deno.env.get('SUPABASE_URL')!,SERVICE=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,ANON=Deno.env.get('SUPABASE_ANON_KEY')!;
const jobRoles=['','Agent','Marketing Department','Assistant','Manager','Director','Accounting Department'];
const origins=(Deno.env.get('ATTENDANCE_ORIGINS')||'https://attendance.swiftshopow.com').split(',');
const db=createClient(PROJECT_URL,SERVICE,{auth:{persistSession:false,autoRefreshToken:false}});
function result(body:unknown,status=200,origin=''){return new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json','Access-Control-Allow-Origin':origins.includes(origin)?origin:origins[0],'Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info','Access-Control-Allow-Methods':'POST,OPTIONS','Vary':'Origin'}})}
async function dispatch(actor:string,onlyId?:string,onlyEndpoint?:string){
 const priv=Deno.env.get('VAPID_PRIVATE_KEY'),pub=Deno.env.get('VAPID_PUBLIC_KEY');
 if(!priv||!pub)return {pushConfigured:false,delivered:0,failed:0};
 webpush.setVapidDetails(Deno.env.get('VAPID_SUBJECT')||'mailto:admin@esquilianoconsulting.com',pub,priv);
 let query=db.from('att_notifications').select('*').eq('actor_id',actor).is('push_sent_at',null).gte('created_at',new Date(Date.now()-86400000).toISOString()).order('created_at').limit(100);
 if(onlyId)query=query.eq('id',onlyId);
 const {data:notes,error}=await query;if(error)throw error;
 let delivered=0,failed=0;
 for(const n of notes||[]){
  let subscriptions=db.from('att_push').select('id,subscription').eq('user_id',n.user_id);if(onlyEndpoint)subscriptions=subscriptions.eq('endpoint',onlyEndpoint);const {data:subs,error:subError}=await subscriptions;
  if(subError)throw subError;let retry=false;
  for(const s of subs||[]){
   try{const host=new URL(s.subscription.endpoint).hostname;if(!(/(^|\.)(push\.apple\.com|fcm\.googleapis\.com|jmt17\.google\.com|updates\.push\.services\.mozilla\.com|notify\.windows\.com)$/.test(host)))throw Error('Unsupported push endpoint');await webpush.sendNotification(s.subscription,JSON.stringify({id:n.id,title:n.title,body:n.body}),{TTL:86400});delivered++;}
   catch(e){const status=(e as {statusCode?:number}).statusCode;if(status===404||status===410)await db.from('att_push').delete().eq('id',s.id);else{retry=true;failed++;console.error('Push delivery failed',status||'transport');}}
  }
  if(!retry){const {error}=await db.from('att_notifications').update({push_sent_at:new Date().toISOString()}).eq('id',n.id);if(error)throw error;}
 }
 return {pushConfigured:true,delivered,failed};
}
Deno.serve(async req=>{
 const origin=req.headers.get('origin')||'';
 if(req.method==='OPTIONS')return result({},200,origin);
 if(req.method!=='POST'||(origin&&!origins.includes(origin)))return result({error:'Request not allowed'},403,origin);
 try{
  const input=await req.json();
  if(input.action==='lunch-dispatch'){
   if(typeof input.token!=='string'||!/^[0-9a-f-]{36}$/i.test(input.token))return result({error:'Request not allowed'},403,origin);
   const {data:secret,error:secretError}=await db.from('att_schedule_secret').select('token').eq('id',1).single();
   if(secretError||secret?.token!==input.token)return result({error:'Request not allowed'},403,origin);
   const day=new Date(Date.now()-21600000).toISOString().slice(0,10);
   const {data:pending,error}=await db.from('att_notifications').select('id,actor_id').eq('lunch_date',day).is('push_sent_at',null).limit(100);if(error)throw error;
   let delivered=0,failed=0;for(const n of pending||[]){const sent=await dispatch(n.actor_id,n.id);delivered+=sent.delivered;failed+=sent.failed;}
   return result({ok:true,delivered,failed},200,origin);
  }
  const jwt=req.headers.get('authorization')?.replace(/^Bearer /i,'');if(!jwt)return result({error:'Sign in required'},401,origin);
  const client=createClient(PROJECT_URL,ANON,{global:{headers:{Authorization:'Bearer '+jwt}},auth:{persistSession:false}});
  const {data:{user},error:authError}=await client.auth.getUser(jwt);if(authError||!user)return result({error:'Session expired'},401,origin);
  const {data:actor}=await db.from('att_profiles').select('id,role,active').eq('id',user.id).single();if(!actor?.active)return result({error:'Account inactive'},403,origin);
  if(['create','update'].includes(input.action)&&input.jobRole!==undefined&&!jobRoles.includes(input.jobRole))throw Error('Choose a valid job role');if(input.action==='dispatch')return result(await dispatch(user.id),200,origin);
  if(input.action==='push-status'){let subscriptionQuery=db.from('att_push').select('id',{count:'exact',head:true}).eq('user_id',user.id);if(typeof input.endpoint==='string')subscriptionQuery=subscriptionQuery.eq('endpoint',input.endpoint);const {count,error}=await subscriptionQuery;if(error)throw error;return result({pushConfigured:!!Deno.env.get('VAPID_PRIVATE_KEY')&&!!Deno.env.get('VAPID_PUBLIC_KEY'),registered:!!count},200,origin);}
  if(input.action==='test-push'){
   const endpoint=typeof input.endpoint==='string'?input.endpoint:undefined;if(endpoint){const {data:registered,error}=await db.from('att_push').select('id').eq('user_id',user.id).eq('endpoint',endpoint).maybeSingle();if(error)throw error;if(!registered)throw Error('Enable notifications on this device first');}
   const {data:recent}=await db.from('att_notifications').select('id').eq('user_id',user.id).eq('actor_id',user.id).eq('title','Notification test').gte('created_at',new Date(Date.now()-30000).toISOString()).limit(1);if(recent?.length)throw Error('Wait 30 seconds before testing again');
   const {data:note,error}=await db.from('att_notifications').insert({user_id:user.id,actor_id:user.id,title:'Notification test',body:'Esquiliano notifications are working on this device.'}).select('id').single();if(error)throw error;
   return result(await dispatch(user.id,note.id,endpoint),200,origin);
  }

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
