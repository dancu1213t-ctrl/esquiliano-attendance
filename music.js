window.Music=(()=>{
  const el=id=>document.getElementById(id);
  let tracks=new Map(),owner='',extensionReady=false,busy=false,lastSuccess=0,request=0,pairing=null;
  function paint(){
    for(const node of document.querySelectorAll('[data-music-user]')){
      const title=tracks.get(node.dataset.musicUser)||'';
      node.textContent=title?'♫ '+title:'';
      node.classList.toggle('hidden',!title);
      node.title=title?'Listening to '+title:'';
    }
  }
  function label(id){
    const node=document.createElement('small');
    node.className='loop-music hidden';node.dataset.musicUser=id;
    const title=tracks.get(id);
    if(title){node.textContent='♫ '+title;node.classList.remove('hidden');node.title='Listening to '+title;}
    return node;
  }
  function sync(){
    const id=currentProfile()?.id||'';
    if(owner!==id){
      owner=id;request++;tracks.clear();lastSuccess=0;paint();
      el('musicConnectionStatus').textContent=id?'Connect the desktop extension to share while clocked in.':'Sign in to connect YouTube.';
      refresh();
    }
    el('musicConnect').disabled=!id||!extensionReady||busy;
    el('musicDisconnect').disabled=!id||busy;
    window.postMessage({type:'loop-music-ping'},location.origin);
  }
  async function refresh(){
    if(!owner||preview||document.hidden||!navigator.onLine)return;
    const id=owner,c=clientForProfile(),sequence=++request;
    try{
      const result=check(await c.rpc('att_music_snapshot'));
      if(sequence!==request||id!==currentProfile()?.id)return;
      tracks=new Map(result.map(row=>[row.user_id,row.title]));lastSuccess=Date.now();paint();
    }catch{
      if(id===owner&&Date.now()-lastSuccess>45000){tracks.clear();paint();}
    }
  }
  window.addEventListener('message',event=>{
    if(event.source!==window||event.origin!==location.origin)return;
    const data=event.data;
    if(data?.type==='loop-music-ready'&&data.ok){
      extensionReady=true;
      el('musicConnect').disabled=!currentProfile()||busy;
    }
    if(data?.type==='loop-music-connected'&&pairing?.id===data.request){
      clearTimeout(pairing.timer);
      const complete=pairing.complete;pairing=null;
      complete(data);
    }
  });
  el('musicConnect').addEventListener('click',async()=>{
    if(!currentProfile()||!extensionReady||busy)return;
    if(preview){el('musicConnectionStatus').textContent='Sign in to the live app to connect.';return;}
    busy=true;sync();
    const c=clientForProfile(),id=currentProfile().id;
    try{
      const token=check(await c.rpc('att_music_connect'));
      if(id!==currentProfile()?.id)throw Error('Account changed. Connect again.');
      const result=await new Promise(resolve=>{
        const nonce=crypto.randomUUID();
        pairing={id:nonce,complete:resolve,timer:setTimeout(()=>{pairing=null;resolve({ok:false,error:'Reload the app after installing the extension.'});},6000)};
        window.postMessage({type:'loop-music-connect',request:nonce,token},location.origin);
      });
      if(!result.ok){await c.rpc('att_music_disconnect');throw Error(result.error||'The extension did not connect.');}
      el('musicConnectionStatus').textContent='Connected. YouTube listening is shared only while clocked in.';
    }catch(error){el('musicConnectionStatus').textContent=error.message;}
    finally{busy=false;sync();}
  });
  async function disconnect(){
    const c=clientForProfile();
    if(!currentProfile()||!c||preview)return;
    check(await c.rpc('att_music_disconnect'));
    tracks.delete(currentProfile().id);paint();
    el('musicConnectionStatus').textContent='YouTube sharing disconnected.';
  }
  el('musicDisconnect').addEventListener('click',async()=>{
    if(busy)return;busy=true;sync();
    try{await disconnect()}catch(error){el('musicConnectionStatus').textContent=error.message}
    finally{busy=false;sync()}
  });
  setInterval(()=>{if(!document.hidden){refresh();if(Date.now()-lastSuccess>45000){tracks.clear();paint();}}},8000);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh()});
  queueMicrotask(sync);
  return {sync,label,refresh,disconnect,titleFor:id=>tracks.get(id)||''};
})();
