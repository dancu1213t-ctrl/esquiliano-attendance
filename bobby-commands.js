(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.BobbyCommands=factory()})(typeof window!=='undefined'?window:this,()=>{
 const normalize=s=>s.toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
 function plan(question,s){const q=normalize(question),command=/\b(please|kindly|remind|tell|send|message|clock|clockout|clockin|check|cancel|tasks|schedule)\b/.test(q),clockOut=/\b(clock out|clockout|clocked out|cocked out)\b/.test(q),clockIn=/\b(clock in|clockin)\b/.test(q);if(!command)return null;
 if(/\b(tasks|scheduled tasks|cancel task)\b/.test(q))return {kind:'tasks'};
 if(/\b(everyone|everybody|all|team)\b/.test(q)&&clockOut&&/\b(check|at 4|4 pm|4 p m|schedule|tomorrow)\b/.test(q)){const date=question.match(/\b\d{4}-\d{2}-\d{2}\b/)?.[0]||(/\btoday\b/.test(q)?s.today:new Date(Date.parse(s.today+'T12:00:00Z')+86400000).toISOString().slice(0,10));return {kind:'schedule',date,reason:'Check active staff and clock out eligible open shifts at 4 p.m. once on '+date};}
 const messaging=/\b(remind|tell|send|message)\b/.test(q),action=messaging?'message':(/\b(please|kindly|bobby)\b/.test(q)||/^(clock out|clock in|clockout|clockin)\b/.test(q))&&(clockOut||clockIn)?'clock':null;if(!action)return null;
 const people=s.people.filter(p=>p.active),matches=people.filter(p=>[p.name,p.employee_id,...p.name.split(/\s+/).slice(0,1).filter(x=>x.length>2)].some(alias=>(' '+q+' ').includes(' '+normalize(alias)+' ')));
 const everyone=/\b(everyone|everybody|all staff|all workers|team)\b/.test(q);let selected=everyone&&messaging?people.filter(p=>p.id!==s.admin_id):everyone&&clockOut?people.filter(p=>s.latest.some(e=>e.user_id===p.id&&e.action==='IN')):matches;
 if(selected.length!==1&&!everyone)return {kind:'clarify',text:selected.length?'More than one person matches. Use the employee ID.':'Who should I act for? Use their name or employee ID.'};
 if(!selected.length)return {kind:'clarify',text:'No active recipients matched.'};if(messaging&&/\b(tomorrow|later|at \d|in \d)\b/.test(q))return {kind:'clarify',text:'I can send a message or reminder now. Scheduled reminders are not supported; the scheduled task available is a one-time 4 p.m. clock-out check.'};
 if(action==='clock'){const t=question.match(/\bat\s+(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)?/i);let time=null;if(t){let h=Number(t[1]);if(t[3])h=h%12+(/^p/i.test(t[3])?12:0);else if(clockOut&&h<8)h+=12;if(h>23||Number(t[2]||0)>59)return {kind:'clarify',text:'Use a valid time, for example 4 p.m.'};const date=question.match(/\b\d{4}-\d{2}-\d{2}\b/)?.[0]||(/\byesterday\b/.test(q)?new Date(Date.parse(s.today+'T12:00:00Z')-86400000).toISOString().slice(0,10):s.today);time=date+'T'+String(h).padStart(2,'0')+':'+(t[2]||'00')+':00'}return {kind:'clock',action:clockOut?'OUT':'IN',targets:selected,time,reason:question.trim(),summary:(clockOut?'Clock out ':'Clock in ')+selected.map(p=>p.name).join(', ')}};
 let body='';if(/\bremind\b/.test(q)&&(clockOut||clockIn))body='Please remember to clock '+(clockOut?'out':'in')+'.';else{
 const aliases=selected.flatMap(p=>[p.name,...p.name.split(/\s+/),p.employee_id]).sort((a,b)=>b.length-a.length),lower=question.toLowerCase();let end=0;for(const alias of aliases){const at=lower.indexOf(alias.toLowerCase());if(at>=0){end=at+alias.length;break}}
 if(end)body=question.slice(end).replace(/^[\s,:-]*(?:that\s+|to\s+)?/i,'').trim();if(/^come\b/i.test(body))body='Please '+body[0].toLowerCase()+body.slice(1);body=body.replace(/[.!]?$/,'');if(body)body+='.';
 }
 if(!body)return {kind:'clarify',text:'What message should I send? For example: Tell Orlando to come to the office.'};
 return {kind:'message',targets:selected,body,summary:'Message '+selected.map(p=>p.name).join(', ')};
 }
 return {plan};
});
