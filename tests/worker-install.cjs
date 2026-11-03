const fs=require('fs'),vm=require('vm'),assert=require('assert'),path=require('path');
const source=fs.readFileSync(path.join(__dirname,'../sw.js'),'utf8');
async function checkInstall({failAsset=false,stall=false,cacheUnavailable=false}={}){
 const handlers={},added=[],timers=new Map();let skipped=0,claimed=0,timerId=0;
 const cache={add:async url=>{added.push(url);if(failAsset&&url.includes('favicon'))throw Error('Logo unavailable');if(stall)return new Promise(()=>{})}};
 const ctx={self:{addEventListener:(event,fn)=>handlers[event]=fn,skipWaiting:async()=>{skipped++},clients:{claim:async()=>{claimed++}}},caches:{open:async()=>{if(cacheUnavailable)throw Error('Cache unavailable');return cache},keys:async()=>{if(cacheUnavailable)throw Error('Cache unavailable');return []},delete:async()=>true},Promise,Set,setTimeout:fn=>{timers.set(++timerId,fn);return timerId},clearTimeout:id=>timers.delete(id)};
 vm.createContext(ctx);vm.runInContext(source,ctx);let installing;handlers.install({waitUntil:p=>installing=p});
 await new Promise(setImmediate);if(stall)for(const fn of [...timers.values()])fn();await installing;
 assert.equal(skipped,1);assert.equal(new Set(added).size,added.length,'Precache contains duplicate requests');
 let activation;handlers.activate({waitUntil:p=>activation=p});await activation;assert.equal(claimed,1);
}
(async()=>{await checkInstall();await checkInstall({failAsset:true});await checkInstall({stall:true});await checkInstall({cacheUnavailable:true});console.log('PASS worker activates with unique assets, missing logo, stalled downloads or unavailable cache')})().catch(e=>{console.error(e);process.exit(1)});

