(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.StaffWeek=factory()})(typeof window!=='undefined'?window:this,()=>({
 addDays(key,n){const d=new Date(key+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10)},
 monday(key){const d=new Date(key+'T12:00:00Z'),n=(d.getUTCDay()+6)%7;d.setUTCDate(d.getUTCDate()-n);return d.toISOString().slice(0,10)},
 pair(records){const list=[...records].sort((a,b)=>Date.parse(a.happened_at)-Date.parse(b.happened_at)),out=[];let incoming=null;for(const e of list){if(e.action==='IN')incoming=e;else if(incoming){out.push({in:incoming,out:e});incoming=null}}if(incoming)out.push({in:incoming,out:null});return out},
 minutes(shift,start,end){if(!shift.out)return 0;const from=Math.max(Date.parse(shift.in.happened_at),start),to=Math.min(Date.parse(shift.out.happened_at),end);return Math.max(0,(to-from)/60000)},
 overlaps(shift,start,end){return Date.parse(shift.in.happened_at)<end&&(shift.out?Date.parse(shift.out.happened_at):Date.now())>start},
 duration(minutes){const m=Math.max(0,Math.round(minutes));return Math.floor(m/60)+'h'+(m%60?' '+m%60+'m':'')}
}));

