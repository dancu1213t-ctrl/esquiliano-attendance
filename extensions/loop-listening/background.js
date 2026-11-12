const APP_ORIGIN='https://attendance.esquilianoconsulting.com';
const API='https://hunptuwwaxvpigsnrsbl.supabase.co/rest/v1/rpc/att_music_publish';
const KEY='sb_publishable_3dUJXZXabkm-83g3GpdwBg_9LgDK3_L';
let running=false,again=false,last=null,lastTick=0;
async function state(message,clocked=false){await chrome.storage.local.set({message,clocked});}
async function publish(token,track){
  const response=await fetch(API,{method:'POST',headers:{apikey:KEY,'Content-Type':'application/json'},body:JSON.stringify({token_value:token,video_value:track?.id||null,title_value:track?.title||'',playing:!!track?.playing}),signal:AbortSignal.timeout(8000)});
  if(!response.ok){
    if(response.status===400||response.status===401||response.status===403)throw Error('Reconnect this extension from your Loop profile.');
    throw Error('Connection unavailable. Listening status will expire automatically.');
  }
  return response.json();
}
async function tick(){
  if(running){again=true;return;}
  const config=await chrome.storage.local.get(['token','enabled']);
  if(!config.token||!config.enabled)return;
  if(Date.now()-lastTick<1000)return;
  lastTick=Date.now();running=true;
  try{
    const gate=await publish(config.token,last);
    if(!gate.clocked_in){last=null;await state('Ready · sharing starts when you clock in.');return;}
    const tabs=await chrome.tabs.query({url:['https://www.youtube.com/*','https://music.youtube.com/*']});
    const candidates=await Promise.all(tabs.map(async tab=>{
      try{
        const track=await chrome.tabs.sendMessage(tab.id,{type:'read-track'});
        return track?.playing?{...track,tabId:tab.id,active:tab.active}:null;
      }catch{return null;}
    }));
    const tracks=candidates.filter(Boolean);
    const chosen=tracks.find(track=>track.tabId===last?.tabId)||tracks.find(track=>track.active)||tracks[0]||null;
    await publish(config.token,chosen);
    last=chosen;
    await state(chosen?'Sharing your YouTube track in Loop.':'Clocked in · play something on YouTube.',true);
  }catch(error){await state(error.message);}
  finally{
    running=false;
    if(again){again=false;setTimeout(tick,1100);}
  }
}
chrome.runtime.onMessage.addListener((message,sender,respond)=>{
  const appSender=sender.tab&&sender.url?.startsWith(APP_ORIGIN+'/');
  if(message.type==='pair'&&appSender){
    (async()=>{
      if(!/^[a-f0-9]{64}$/.test(message.token))throw Error('Invalid connection.');
      const previous=await chrome.storage.local.get('token');
      if(previous.token&&previous.token!==message.token)await publish(previous.token,null).catch(()=>{});
      last=null;
      await chrome.storage.local.set({token:message.token,enabled:true,message:'Connecting…',clocked:false});
      await chrome.alarms.create('loop-listening',{periodInMinutes:.5});
      respond({ok:true});tick();
    })().catch(error=>respond({ok:false,error:error.message}));
    return true;
  }
  if(message.type==='installed'&&appSender){respond({ok:true});return;}
  if(message.type==='playback-changed'&&sender.tab&&/^https:\/\/(www|music)\.youtube\.com\//.test(sender.url||'')){tick();respond({ok:true});return;}
  if(message.type==='toggle-sharing'&&!sender.tab){
    (async()=>{
      const config=await chrome.storage.local.get(['token','enabled']);
      if(!config.token){respond({ok:false});return;}
      await chrome.storage.local.set({enabled:!config.enabled});
      if(config.enabled){await publish(config.token,null).catch(()=>{});last=null;await state('Sharing paused.');}
      else tick();
      respond({ok:true});
    })();
    return true;
  }
});
chrome.alarms.onAlarm.addListener(alarm=>{if(alarm.name==='loop-listening')tick();});
chrome.runtime.onInstalled.addListener(()=>{chrome.alarms.create('loop-listening',{periodInMinutes:.5});tick();});
chrome.runtime.onStartup.addListener(()=>{chrome.alarms.create('loop-listening',{periodInMinutes:.5});tick();});
