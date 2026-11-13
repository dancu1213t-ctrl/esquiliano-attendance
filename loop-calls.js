window.LoopCalls=(()=>{
 const $=id=>document.getElementById(id),terminal=s=>!['ringing','accepted','connected'].includes(s);
 const paths={phone:'<path d="M22 16.9v3a2 2 0 0 1-2.2 2A19.8 19.8 0 0 1 3.1 5.2 2 2 0 0 1 5.1 3h3a2 2 0 0 1 2 1.7c.1 1 .4 2 .7 2.9a2 2 0 0 1-.5 2.1L9 11a16 16 0 0 0 4 4l1.3-1.3a2 2 0 0 1 2.1-.5c.9.3 1.9.6 2.9.7a2 2 0 0 1 2.7 2Z"/>',video:'<rect x="3" y="5" width="12" height="14" rx="3"/><path d="m15 10 6-4v12l-6-4"/>',mic:'<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3M8 22h8"/>',end:'<path d="M3 14c5-5 13-5 18 0v5l-5-1v-4M3 14v5l5-1v-4"/>',history:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'};
 const icon=k=>'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">'+paths[k]+'</svg>';
 let owner='',generation=0,client,device='',call=null,pc,local,remote,pollBusy=false,busy=false,starting=false,lastSignal=0,history=[],directory=[],ringing='',heartbeat=0,connectedSent=false,offerSent=false,queuedIce=[],signalQueue=Promise.resolve(),timer,sessionReady=false;
 const controls={};
 function button(id,label,key,handler){const b=document.createElement('button');b.id=id;b.type='button';b.className='loop-call-icon';b.setAttribute('aria-label',label);b.title=label;b.innerHTML=icon(key);b.onclick=handler;return b}
 function inject(){
  const dialog=document.createElement('dialog');dialog.id='loopCallDialog';dialog.className='loop-call-dialog';dialog.setAttribute('aria-labelledby','loopCallName');
  dialog.innerHTML='<div class="loop-call-top"><span id="loopCallKind">Loop call</span><button id="loopCallMinimize" class="text-button" aria-label="Minimize call">−</button></div><div class="loop-call-person"><span id="loopCallAvatar" class="avatar"></span><h2 id="loopCallName"></h2><p id="loopCallState" role="status"></p></div><div id="loopCallStage" class="loop-call-stage hidden"><video id="loopCallRemote" autoplay playsinline></video><video id="loopCallLocal" autoplay playsinline muted></video></div><button id="loopCallPlay" class="secondary hidden">Tap to hear call</button><p id="loopCallError" class="loop-call-error" role="alert"></p><div id="loopCallControls" class="loop-call-controls"></div>';
  document.body.append(dialog);
  const historyDialog=document.createElement('dialog');historyDialog.id='loopCallHistory';historyDialog.className='loop-call-history';historyDialog.innerHTML='<div class="loop-dialog-heading"><h2>Recent calls</h2><form method="dialog"><button class="text-button">Close</button></form></div><div id="loopCallHistoryList"></div>';document.body.append(historyDialog);
  const chip=button('loopCallChip','Return to call','phone',()=>openDialog());chip.classList.add('loop-call-chip','hidden');document.body.append(chip);
  $('loopCallMinimize').onclick=()=>{$('loopCallDialog').close();$('loopCallChip').classList.remove('hidden')};
  $('loopCallDialog').addEventListener('cancel',e=>{e.preventDefault();$('loopCallMinimize').click()});
  $('loopCallPlay').onclick=()=>{$('loopCallRemote').play().then(()=>$('loopCallPlay').classList.add('hidden')).catch(()=>{})};
  controls.accept=button('loopCallAccept','Answer call','phone',accept);controls.accept.classList.add('answer');
  controls.decline=button('loopCallDecline','Decline call','end',()=>finish('decline'));
  controls.mute=button('loopCallMute','Mute microphone','mic',()=>{const track=local?.getAudioTracks()[0];if(track){track.enabled=!track.enabled;controls.mute.classList.toggle('off',!track.enabled);controls.mute.setAttribute('aria-pressed',String(!track.enabled));controls.mute.setAttribute('aria-label',track.enabled?'Mute microphone':'Unmute microphone')}});
  controls.camera=button('loopCallCamera','Turn camera off','video',()=>{const track=local?.getVideoTracks()[0];if(track){track.enabled=!track.enabled;controls.camera.classList.toggle('off',!track.enabled);controls.camera.setAttribute('aria-pressed',String(!track.enabled));controls.camera.setAttribute('aria-label',track.enabled?'Turn camera off':'Turn camera on')}});
  controls.end=button('loopCallEnd','End call','end',()=>finish('end'));
  controls.close=button('loopCallClose','Close call','end',()=>cleanup());
 }
 function openDialog(){if(!$('loopCallDialog').open)$('loopCallDialog').showModal();$('loopCallChip').classList.add('hidden')}
 function clearMedia(){clearTimeout(timer);controls.mute?.classList.remove('off');controls.camera?.classList.remove('off');controls.mute?.setAttribute('aria-pressed','false');controls.camera?.setAttribute('aria-pressed','false');controls.mute?.setAttribute('aria-label','Mute microphone');controls.camera?.setAttribute('aria-label','Turn camera off');pc?.close();pc=null;local?.getTracks().forEach(t=>t.stop());local=null;remote=null;$('loopCallLocal').srcObject=null;$('loopCallRemote').srcObject=null;LoopSounds.stop();ringing='';offerSent=false;connectedSent=false;queuedIce=[];lastSignal=0;signalQueue=Promise.resolve();$('loopCallPlay').classList.add('hidden')}
 function cleanup(){clearMedia();call=null;busy=false;starting=false;$('loopCallDialog').close();$('loopCallChip').classList.add('hidden')}
 function paint(text){
  if(!call)return;
  const incoming=call.callee_id===owner,person=directory.find(p=>p.id===(incoming?call.caller_id:call.callee_id));
  initAvatar('loopCallAvatar',person||{name:'Colleague'});$('loopCallName').textContent=person?.name||'Colleague';
  $('loopCallKind').textContent=(call.video?'Video':'Voice')+' · Loop';
  $('loopCallState').textContent=text||(call.state==='ringing'?(incoming?'Incoming call…':'Calling…'):call.state==='accepted'?'Connecting…':call.state==='connected'?'Connected':call.state==='missed'?'No answer':call.state==='declined'?'Call declined':call.state==='failed'?'Call could not connect':'Call ended');
  const root=$('loopCallControls');root.replaceChildren();
  if(terminal(call.state)){root.append(controls.close);return}
  if(incoming&&call.state==='ringing')root.append(controls.decline,controls.accept);
  else{if(local){root.append(controls.mute);if(call.video)root.append(controls.camera)}root.append(controls.end)}
  root.querySelectorAll('button').forEach(b=>b.disabled=busy&&!(starting&&b===controls.end));
  $('loopCallStage').classList.toggle('hidden',!call.video||!local);
  if(call.state==='ringing'&&incoming&&ringing!==call.id){LoopSounds.ring();ringing=call.id}
  if(call.state!=='ringing'){LoopSounds.stop();ringing=''}
 }
 async function rpc(name,args){const response=await client.rpc(name,args);if(response.error)throw Error(response.error.message);return response.data}
 function usable(){if(preview)throw Error('Calling is available in the live app');if(!window.isSecureContext||!navigator.mediaDevices?.getUserMedia||!window.RTCPeerConnection)throw Error('Calls need HTTPS and a browser with microphone support')}
 async function media(video,version){usable();let stream;try{stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true},video:video?{facingMode:'user',width:{ideal:960},height:{ideal:540}}:false})}catch(e){throw Error(e.name==='NotAllowedError'?'Allow '+(video?'camera and microphone':'microphone')+' access in browser settings to call.':e.name==='NotFoundError'?'No microphone or camera was found.':'The microphone or camera could not open. Close other calls and try again.')}
  if(version!==generation||!call){stream.getTracks().forEach(t=>t.stop());throw Error('Call cancelled')}
  local=stream;$('loopCallLocal').srcObject=stream;$('loopCallLocal').play().catch(()=>{});
  return stream;
 }
 async function start(person,video=false){
  sync();if(starting||busy||call&&!terminal(call.state)){toast('Finish your current call first');return}
  try{usable()}catch(e){toast(e.message);return}
  await LoopSounds.unlock();starting=true;busy=true;const version=generation;
  call={id:crypto.randomUUID(),caller_id:owner,callee_id:person.id,video,state:'ringing',caller_device:device};directory=[...directory.filter(p=>p.id!==person.id),person];$('loopCallError').textContent='';paint('Opening '+(video?'camera and microphone…':'microphone…'));openDialog();
  let saved=false;
  try{await media(video,version);if(version!==generation)return;const row=await rpc('loop_call_start',{target:person.id,video_call:video,device,request_id:call.id});saved=true;if(version!==generation)return;call={...row,saved:true};heartbeat=0;paint();client.functions.invoke('attendance-admin',{body:{action:'dispatch'}}).catch(()=>{});await poll()}
  catch(e){if(version===generation){if(saved)await finish('fail');else{clearMedia();call.state='failed';$('loopCallError').textContent=e.message;paint()}}}
  finally{if(version===generation){busy=false;starting=false;paint()}}
 }
 async function accept(){
  if(busy||!call)return;busy=true;const version=generation,id=call.id;await LoopSounds.unlock();LoopSounds.stop();paint('Opening '+(call.video?'camera and microphone…':'microphone…'));
  try{await media(call.video,version);if(version!==generation||call?.id!==id)return;call=await rpc('loop_call_action',{call_id:id,device,action:'accept'});await connect(version);paint()}
  catch(e){if(version===generation){clearMedia();$('loopCallError').textContent=e.message;await finish('decline')}}
  finally{if(version===generation){busy=false;paint()}}
 }
 async function signal(kind,payload){const id=call?.id,c=client,v=generation;if(!id)return;const task=async()=>{if(v!==generation||call?.id!==id||terminal(call.state))return;const r=await c.rpc('loop_call_signal',{call_id:id,device,signal_kind:kind,signal_data:payload});if(r.error)throw Error(r.error.message)};signalQueue=signalQueue.then(task);return signalQueue}
 async function connect(version){
  if(pc||!local||!call||version!==generation)return;
  const id=call.id;
  const servers=Array.isArray(cfg.callIceServers)&&cfg.callIceServers.length?cfg.callIceServers:[{urls:'stun:stun.l.google.com:19302'},{urls:'stun:stun1.l.google.com:19302'}];
  pc=new RTCPeerConnection({iceServers:servers});const connection=pc;remote=new MediaStream();$('loopCallRemote').srcObject=remote;
  local.getTracks().forEach(track=>connection.addTrack(track,local));
  connection.onicecandidate=e=>{if(e.candidate)signal('ice',e.candidate.toJSON()).catch(connectionError)};
  connection.ontrack=e=>{if(version!==generation||call?.id!==id)return;if(!remote.getTracks().some(t=>t.id===e.track.id))remote.addTrack(e.track);$('loopCallRemote').play().then(()=>$('loopCallPlay').classList.add('hidden')).catch(()=>$('loopCallPlay').classList.remove('hidden'))};
  connection.onconnectionstatechange=async()=>{
   if(version!==generation||call?.id!==id)return;
   if(connection.connectionState==='connected'&&!connectedSent){connectedSent=true;try{call=await rpc('loop_call_action',{call_id:id,device,action:'connected'});paint()}catch(e){connectionError(e)}}
   if(connection.connectionState==='failed')connectionError(Error('These networks could not connect directly. A relay service is needed for this call.'));
   if(connection.connectionState==='disconnected')paint('Connection interrupted…');
  };
  if(call.caller_id===owner&&!offerSent){offerSent=true;await connection.setLocalDescription(await connection.createOffer());await signal('offer',{type:connection.localDescription.type,sdp:connection.localDescription.sdp})}
  clearTimeout(timer);timer=setTimeout(()=>{if(call?.id===id&&pc?.connectionState!=='connected')connectionError(Error('Call could not connect. Try the same Wi-Fi; reliable calls across networks need a relay service.'))},30000);
 }
 async function processSignals(rows){
  for(const entry of rows){
   if(!pc||entry.id<=lastSignal)continue;
   if(entry.kind==='offer'&&!pc.remoteDescription){await pc.setRemoteDescription(entry.payload);for(const candidate of queuedIce)await pc.addIceCandidate(candidate);queuedIce=[];await pc.setLocalDescription(await pc.createAnswer());await signal('answer',{type:pc.localDescription.type,sdp:pc.localDescription.sdp})}
   else if(entry.kind==='answer'&&!pc.remoteDescription){await pc.setRemoteDescription(entry.payload);for(const candidate of queuedIce)await pc.addIceCandidate(candidate);queuedIce=[]}
   else if(entry.kind==='ice'){if(pc.remoteDescription)await pc.addIceCandidate(entry.payload);else queuedIce.push(entry.payload)}
   lastSignal=entry.id;
  }
 }
 async function connectionError(error){if(!call||terminal(call.state))return;$('loopCallError').textContent=error.message;await finish('fail')}
 async function finish(action){
  if(!call)return;if(starting&&!call.saved){generation++;cleanup();return}const id=call.id,version=generation;busy=true;clearTimeout(timer);
  try{call=await rpc('loop_call_action',{call_id:id,device,action});if(version!==generation)return;clearMedia();paint()}
  catch(e){if(version===generation){clearMedia();call.state='failed';$('loopCallError').textContent=e.message;paint()}}
  finally{if(version===generation){busy=false;paint()}}
 }
 function historyPaint(){const root=$('loopCallHistoryList');root.replaceChildren();if(!history.length){const p=document.createElement('p');p.className='empty';p.textContent='No calls yet';root.append(p)}for(const row of history){const item=document.createElement('article');item.className='loop-call-history-row';const avatar=document.createElement('span');avatar.className='avatar';initAvatar(avatar,{name:row.peer_name,photo:directory.find(p=>p.id===(row.caller_id===owner?row.callee_id:row.caller_id))?.photo});const info=document.createElement('div'),name=document.createElement('strong'),detail=document.createElement('small');name.textContent=row.peer_name;const duration=row.connected_at&&row.ended_at?Math.max(0,Math.floor((Date.parse(row.ended_at)-Date.parse(row.connected_at))/1000)):0;detail.textContent=(row.caller_id===owner?'Outgoing':'Incoming')+' '+(row.video?'video':'voice')+' · '+row.state+(duration?' · '+Math.floor(duration/60)+'m '+duration%60+'s':'');info.append(name,detail);const time=document.createElement('time');time.textContent=new Date(row.created_at).toLocaleString('en-US',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'});item.append(avatar,info,time);root.append(item)}}
 async function poll(){
  if(pollBusy||!owner||!navigator.onLine||preview||starting)return;
  pollBusy=true;const version=generation;
  try{
   const data=await rpc('loop_call_poll',{device,after_signal:lastSignal});
   if(version!==generation||starting||busy)return;sessionReady=true;history=data.history||[];
   if($('loopCallHistory').open)historyPaint();
   const next=data.active;
   if(next){
    const mine=next.caller_id===owner?next.caller_device===device:next.state==='ringing'||next.callee_device===device;
    if(!mine){if(call?.id===next.id){cleanup();toast('Call answered on another device')}return}
    if(!call||terminal(call.state)){
     call=next;lastSignal=0;$('loopCallError').textContent='';if(!directory.length){const r=await client.rpc('loop_directory');if(version!==generation)return;directory=r.data||[]}openDialog();
    }else if(call.id!==next.id)return;else call=next;
    paint();
    if(call.state!=='ringing'){
     if(!local){await finish('fail');return}
     await connect(version);await processSignals(data.signals||[]);
    }
    if(Date.now()-heartbeat>15000&&!(call.callee_id===owner&&call.state==='ringing')){
     heartbeat=Date.now();const row=await rpc('loop_call_action',{call_id:call.id,device,action:'heartbeat'});if(version===generation&&call)call=row;
    }
   }else if(call&&!terminal(call.state)){
    const ended=history.find(row=>row.id===call.id);if(ended)call={...call,...ended};else call.state='ended';clearTimeout(timer);clearMedia();paint();
   }
  }catch(e){if(version===generation&&call&&!terminal(call.state)){$('loopCallError').textContent='Reconnecting to calling service…';if(pc?.connectionState==='failed')await connectionError(e)}}
  finally{pollBusy=false}
 }
 function mount(person,head){
  if(!person)return;
  const actions=document.createElement('div');actions.className='loop-call-header-actions';
  actions.append(button('loopVoiceCall','Voice call '+person.name,'phone',()=>start(person,false)),button('loopVideoCall','Video call '+person.name,'video',()=>start(person,true)));
  head.append(actions);
 }
 function sync(){
  const id=currentProfile()?.id||'';if(id===owner)return;
  const old=call,oldClient=client,oldDevice=device;
  if(old&&!terminal(old.state)&&oldClient&&oldDevice)oldClient.rpc('loop_call_action',{call_id:old.id,device:oldDevice,action:old.callee_id===owner&&old.state==='ringing'?'decline':'end'}).then(()=>{}).catch(()=>{});
  generation++;cleanup();owner=id;client=id?clientForProfile():null;history=[];directory=[];sessionReady=false;heartbeat=0;
  let saved=sessionStorage.getItem('esquiliano.loop.call.device');if(!saved){saved=crypto.randomUUID();sessionStorage.setItem('esquiliano.loop.call.device',saved)}device=saved;
  if(id)poll();
 }
 inject();
 const historyButton=button('loopCallHistoryButton','Recent Loop calls','history',async()=>{sync();await poll();historyPaint();$('loopCallHistory').showModal()});
 $('loopHeaderSearch').before(historyButton);
 setInterval(()=>{sync();if(owner&&(!document.hidden||call&&!terminal(call.state)))poll()},2000);
 document.addEventListener('visibilitychange',()=>{if(!document.hidden){sync();poll()}});
 window.addEventListener('online',poll);queueMicrotask(sync);
 return {mount,sync,start};
})();
