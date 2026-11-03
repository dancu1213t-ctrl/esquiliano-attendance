const fs=require('fs'),vm=require('vm'),assert=require('assert'),path=require('path');
const source=fs.readFileSync(path.join(__dirname,'../supabase/functions/attendance-admin/index.ts'),'utf8');
assert(!/\bconst URL\s*=/.test(source),'Never shadow the global URL constructor');
const dispatch=source.slice(source.indexOf('async function dispatch('),source.indexOf('Deno.serve')).replace('actor:string,onlyId?:string','actor,onlyId').replace('(e as {statusCode?:number})','e');
async function run(fail){let delivered=0,marked=0,removed=0;const notes=[{id:'test',user_id:'worker',title:'Test',body:'Test'}],subs=[{id:'sub',subscription:{endpoint:'https://fcm.googleapis.com/fcm/send/test'}}];
function query(table){const q={select(){return q},eq(){return q},is(){return q},gte(){return q},order(){return q},limit(){return q},update(){marked++;return q},delete(){removed++;return q},then(resolve){return Promise.resolve({data:table==='att_notifications'?notes:subs,error:null}).then(resolve)}};return q}
const c={URL,Date,console:{error(){}},Deno:{env:{get:()=> 'configured'}},db:{from:query},webpush:{setVapidDetails(){},async sendNotification(){if(fail)throw {statusCode:fail};delivered++}}};vm.createContext(c);vm.runInContext(dispatch,c);const result=await c.dispatch('sender');return {result,delivered,marked,removed}}
(async()=>{let t=await run();assert.equal(t.delivered,1);assert.equal(t.marked,1);assert.equal(t.result.delivered,1);t=await run(500);assert.equal(t.marked,0);assert.equal(t.result.failed,1);t=await run(410);assert.equal(t.removed,1);console.log('PASS push endpoint parsed, transport called, failed delivery retained, expired subscription removed')})().catch(e=>{console.error(e);process.exit(1)});

