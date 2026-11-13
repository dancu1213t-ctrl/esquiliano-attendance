window.Loop=(()=>{
 const el=id=>document.getElementById(id),make=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n};
 const presenceTimeout=32000;
 const listIcons={"search":"<circle cx=\"10.8\" cy=\"10.8\" r=\"7.1\"/><path d=\"m16 16 5 5\"/>","filters":"<path d=\"M4 7h16M4 17h16\"/><circle cx=\"9\" cy=\"7\" r=\"2.5\"/><circle cx=\"15\" cy=\"17\" r=\"2.5\"/>","plus":"<path d=\"M12 4v16M4 12h16\"/>","team":"<path d=\"M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M22 21v-2a4 4 0 0 0-3-3.9\"/><circle cx=\"9\" cy=\"7\" r=\"4\"/><path d=\"M16 3.1a4 4 0 0 1 0 7.8\"/>","chat":"<path d=\"M21 11.5a8.5 8.5 0 0 1-8.5 8.5H4l-3 3v-9.5A8.5 8.5 0 0 1 9.5 5H13a8 8 0 0 1 8 6.5Z\"/><path d=\"M7 10h9M7 14h6\"/>","pin":"<path d=\"m15 3 6 6-4 1-3 5-2 1-4-4 1-2 5-3Z\"/><path d=\"m8 16-5 5\"/>","compose":"<path d=\"M12 5H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7\"/><path d=\"m16 3 5 5-10 10-5 1 1-5Z\"/>"};
 let activeFilter='all',toolsByRoom=new Map(),toolsQuery='',quickKey='',searchTimer,loadAgain=false,pinBusy=false,mentionIndex=0;
 function icon(name){
  const node=make('span',undefined,'loop-icon');
  node.setAttribute('aria-hidden','true');
  node.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">'+(listIcons[name]||'')+'</svg>';
  return node;
 }
 function groupAvatar(){
  const node=make('span',undefined,'avatar loop-avatar loop-group-avatar');
  node.append(icon('team'));return node;
 }
 function setFilter(value){
  activeFilter=value;peopleKey='';renderPeople();
  for(const button of el('loopFilters').querySelectorAll('[data-loop-filter]')){
   const selected=button.dataset.loopFilter===value;
   button.classList.toggle('selected',selected);button.setAttribute('aria-pressed',String(selected));
  }
 }
 function renderQuickPeople(){
  const colleagues=team.filter(person=>person.id!==owner);
  const key=JSON.stringify(colleagues.map(person=>[person.id,person.name,person.photo,presenceLabel(person).className]));
  if(key===quickKey)return;
  quickKey=key;
  const fragment=document.createDocumentFragment();
  const newChat=make('button',undefined,'loop-quick-person');
  newChat.type='button';newChat.append(makeQuickIcon('plus'),make('span','New chat'));
  newChat.onclick=openNewChat;fragment.append(newChat);
  for(const person of colleagues){
   const button=make('button',undefined,'loop-quick-person');
   button.type='button';button.setAttribute('aria-label','Open conversation with '+person.name);
   const photo=avatar(person),indicator=make('i',undefined,'loop-quick-presence');
   const state=presenceLabel(person);
   indicator.classList.toggle('online',state.classList.contains('online'));
   indicator.classList.toggle('standby',state.classList.contains('standby'));
   indicator.setAttribute('aria-hidden','true');photo.append(indicator);
   button.append(photo,make('span',person.name.split(' ')[0]));
   button.onclick=()=>open(dm(person.id));fragment.append(button);
  }
  const teamButton=make('button',undefined,'loop-quick-person');
  teamButton.type='button';teamButton.append(makeQuickIcon('team'),make('span','Team'));
  teamButton.onclick=()=>setFilter('teams');fragment.append(teamButton);
  el('loopQuickPeople').replaceChildren(fragment);
 }
 function makeQuickIcon(name){const node=make('span',undefined,'loop-quick-icon');node.append(icon(name));return node}
 function updatePinControl(){
  const button=el('loopPinConversation');
  if(!button||!room)return;
  const pinned=!!toolsByRoom.get(room)?.pinned;
  button.setAttribute('aria-label',pinned?'Unpin conversation':'Pin conversation');
  button.setAttribute('aria-pressed',String(pinned));
  button.title=pinned?'Unpin conversation':'Pin conversation';
  button.classList.toggle('selected',pinned);button.disabled=pinBusy;
 }
 function installPinControl(){
  const button=make('button',undefined,'loop-pin-control');
  button.id='loopPinConversation';button.type='button';button.append(icon('pin'));
  button.onclick=async()=>{
   if(pinBusy||!room||preview)return;
   const c=context(),selected=room,pinned=!toolsByRoom.get(room)?.pinned;
   pinBusy=true;updatePinControl();
   try{
    check(await c.client.rpc('loop_set_pin',{room_value:selected,pinned}));
    if(!valid(c))return;
    toolsByRoom.set(selected,{...toolsByRoom.get(selected),pinned});
    peopleKey='';renderPeople();updatePinControl();
   }catch(problem){if(valid(c))error(problem)}
   finally{pinBusy=false;updatePinControl()}
  };
  el('loopThreadHeader').append(button);updatePinControl();
 }
 function previewText(message){
  if(!message)return '';
  if(message.body!=='Attachment')return message.body;
  const files=message.attachments||[];
  if(files.length===1&&files[0].sticker)return 'Sticker';
  if(files.length&&files.every(file=>/^image\//.test(file.type)))return files.length===1?'Photo':files.length+' photos';
  return files[0]?.name||'Attachment';
 }
 function openNewChat(){
  el('loopNewChatSearch').value='';renderNewChat();
  el('loopNewChatDialog').showModal();
 }
 function renderNewChat(){
  const query=el('loopNewChatSearch').value.trim().toLowerCase(),fragment=document.createDocumentFragment();
  for(const person of team.filter(person=>person.id!==owner&&(person.name+' '+person.employee_id).toLowerCase().includes(query))){
   const button=make('button',undefined,'loop-new-person');
   button.type='button';const details=make('span');
   details.append(make('strong',person.name),presenceLabel(person));
   button.append(avatar(person),details);
   button.onclick=()=>{el('loopNewChatDialog').close();open(dm(person.id))};fragment.append(button);
  }
  if(!fragment.children.length)fragment.append(make('p','No matching people','empty'));
  el('loopNewChatPeople').replaceChildren(fragment);
 }
 function renderMentionChoices(){
  const input=el('loopText'),prefix=input.value.slice(0,input.selectionStart),match=prefix.match(/(?:^|\s)@([\w-]*)$/);
  const root=el('loopMentionChoices');
  root.replaceChildren();
  if(!match||sending){root.classList.add('hidden');return;}
  const query=match[1].toLowerCase();
  const candidates=team.filter(person=>person.id!==owner&&(person.name+' '+person.employee_id).toLowerCase().includes(query)).slice(0,5);
  root.classList.toggle('hidden',!candidates.length);mentionIndex=0;
  for(const person of candidates){
   const button=make('button',undefined,'loop-mention-person');button.type='button';
   button.append(make('strong',person.name),make('small','@'+person.employee_id));
   button.onclick=()=>{
    const end=input.selectionStart,start=end-match[1].length-1;
    input.setRangeText('@'+person.employee_id+' ',start,end,'end');
    input.dispatchEvent(new Event('input',{bubbles:true}));
    root.classList.add('hidden');input.focus();
   };
   root.append(button);
  }
 }
 function handleMentionKey(event){
  const root=el('loopMentionChoices'),buttons=root.querySelectorAll('button');
  if(root.classList.contains('hidden')||!buttons.length)return false;
  if(event.key==='Escape'){root.classList.add('hidden');event.preventDefault();return true;}
  if(event.key==='ArrowDown'||event.key==='ArrowUp'){
   mentionIndex=(mentionIndex+(event.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length;
   buttons.forEach((button,index)=>button.classList.toggle('selected',index===mentionIndex));
   event.preventDefault();return true;
  }
  if(event.key==='Enter'&&!event.shiftKey&&!event.isComposing){event.preventDefault();buttons[mentionIndex].click();return true;}
  return false;
 }

 const messageActivity=new Map();
 let presence=new Map(), presenceUpdated=0, presenceRequest, peopleKey="", threadLoad=0;
 let owner='',epoch=0,team=[],messages=[],receipts=[],hearts=[],heartBusy=new Set(),listReceipts=[],unreadByRoom=new Map(),room='',channel,channelClient,files=[],sending=false,request=null,loading=false,limit=100,renderKey='',drafts=new Map(),urls=new Map();
 const groups=[['general','General'],['operations','Operations'],['announcements','Announcements']];
 const context=()=>({id:currentProfile()?.id,client:clientForProfile(),epoch}),valid=c=>c.id===currentProfile()?.id&&c.epoch===epoch;
 const peer=r=>r.startsWith('dm:')?team.find(p=>r.split(':').includes(p.id)&&p.id!==owner):null;
 const title=r=>peer(r)?.name||groups.find(g=>g[0]===r)?.[1]||'Conversation';
 const dm=id=>'dm:'+ [owner,id].sort().join(':');
 const participant=r=>!r.startsWith('dm:')||r.split(':').includes(owner);
 function avatar(p){const a=make('span',undefined,'avatar loop-avatar');initAvatar(a,p);return a}
 function sessionChanged(){const id=currentProfile()?.id||'';if(id===owner)return;owner=id;epoch++;toolsByRoom.clear();toolsQuery='';quickKey='';activeFilter='all';for(const button of el('loopFilters').querySelectorAll('[data-loop-filter]')){const selected=button.dataset.loopFilter==='all';button.classList.toggle('selected',selected);button.setAttribute('aria-pressed',String(selected))}el('loopSearch').value='';el('loopOnlyFiles').checked=false;el('loopOnlyOnline').checked=false;el('loopQuickPeople').replaceChildren();el('loopMentionChoices').classList.add('hidden');el('loopThread').classList.remove('has-conversation');el('loopNewChatDialog').close();el('loopProfileDialog').close();el('loopPhotoDialog').close();presenceRequest?.abort();presenceRequest=null;presence.clear();messageActivity.clear();presenceUpdated=0;peopleKey="";room='';team=[];messages=[];receipts=[];hearts=[];heartBusy.clear();listReceipts=[];unreadByRoom.clear();files=[];request=null;drafts.clear();urls.clear();renderKey='';el('loopPeople').replaceChildren();el('loopLog').replaceChildren();el('loopText').value='';el('loopForm').classList.add('hidden');el('loopMedia').classList.add('hidden');if(el('loopForwardDialog').open)el('loopForwardDialog').close();el('loopThreadHeader').replaceChildren(make('p','Select a conversation'));el('loopView').classList.remove('thread-open');window.LoopViewport?.sync();if(channel)channelClient.removeChannel(channel);channel=null;if(id){refreshPresence();load().catch(error)}}
 function error(e){const message=e.message||'Loop could not load';el('loopError').textContent=message;el('loopListStatus').textContent=message}
 async function show(){sessionChanged();if(!owner)return;await load().catch(error);subscribe();}
 function subscribe(){if(channel||preview||!owner)return;channelClient=clientForProfile();channel=channelClient.channel('loop-'+crypto.randomUUID()).on('postgres_changes',{event:'INSERT',schema:'public',table:'ws_messages'},()=>load().catch(error)).on('postgres_changes',{event:'*',schema:'public',table:'loop_receipts'},()=>load().catch(error)).on('postgres_changes',{event:'*',schema:'public',table:'loop_hearts'},()=>{if(room&&activeView==='loop')loadThread().catch(error)}).subscribe()}
 async function load(){
  if(loading){loadAgain=true;return;}
  if(!owner)return;
  loading=true;
  const c=context(),query=el('loopSearch').value.trim().toLowerCase();
  try{
   const [directory,recent,tools]=preview?[
    {data:[demoPerson,{id:'00000000-0000-4000-8000-000000000002',name:'Sample colleague',employee_id:'EMP-002',department:'Accounting Department'}]},
    {data:[]},{data:[]}
   ]:await Promise.all([c.client.rpc('loop_directory'),c.client.rpc('loop_conversations'),c.client.rpc('loop_conversation_tools',{query_value:query})]);
   if(!valid(c))return;
   team=check(directory);
   const summaries=check(recent);
   if(!tools.error&&query===el('loopSearch').value.trim().toLowerCase()){
    toolsByRoom=new Map(tools.data.map(row=>[row.room,row]));toolsQuery=query;
    el('loopListStatus').textContent='';
   }else if(tools.error)el('loopListStatus').textContent='Conversation filters could not refresh. Try again.';
   messages=summaries.map(row=>row.last_message).filter(message=>participant(message.room));
   listReceipts=summaries.flatMap(row=>row.receipt_rows||[]);
   recordActivity(messages,listReceipts);
   unreadByRoom=new Map(summaries.map(row=>[row.room,Number(row.unread_count)]));
   if(!preview){
    const pending=messages.filter(message=>message.sender_id!==owner).map(message=>message.id);
    if(pending.length)check(await c.client.rpc('loop_ack',{ids:pending,seen:false}));
    if(!valid(c))return;
   }
   renderPeople();updateThreadPresence();updatePinControl();
   if(room&&activeView==='loop')await loadThread();
   subscribe();
  }finally{
   loading=false;
   if(loadAgain){loadAgain=false;queueMicrotask(()=>load().catch(error));}
  }
 }
 async function refreshPresence(){
  if(preview||!owner||document.hidden||!document.hasFocus()||!navigator.onLine||presenceRequest)return;
  const c=context(),request=new AbortController();
  presenceRequest=request;
  const timer=setTimeout(()=>request.abort(),6000);
  try{
   const rows=check(await c.client.rpc('loop_presence_status').abortSignal(request.signal));
   if(!valid(c))return;
   presence=new Map(rows.map(row=>[row.user_id,row]));
   presenceUpdated=Date.now();
  }catch(e){
   if(valid(c)&&Date.now()-presenceUpdated>75000)presenceUpdated=0;
  }finally{
   clearTimeout(timer);
   if(presenceRequest===request)presenceRequest=null;
  }
  if(valid(c)){renderPeople();updateThreadPresence()}
 }
 function readingRoom(){return activeView==='loop'&&!document.hidden&&document.hasFocus()&&(matchMedia('(min-width:701px)').matches||el('loopView').classList.contains('thread-open'))}
 function recordActivity(rows,receiptRows){
  const remember=(id,value)=>{
   if(!id||id===owner||!value)return;
   const time=Date.parse(value);
   if(Number.isFinite(time)&&time>(messageActivity.get(id)||0))messageActivity.set(id,time);
  };
  for(const row of rows)remember(row.sender_id,row.created_at);
  for(const receipt of receiptRows)remember(receipt.user_id,receipt.read_at);
 }
 function presenceLabel(person){
  const entry=presence.get(person.id);
  const activity=messageActivity.get(person.id)||0;
  const recentlyActive=Date.now()-activity<=presenceTimeout;
  if(!preview&&!presenceUpdated&&!recentlyActive)return make('small','Status unavailable');
  const online=(entry?.online && Date.now()-Date.parse(entry.last_seen)<=presenceTimeout)||recentlyActive;
  const standby=!online&&entry?.clocked_in;
  const label=make('small',online?'Online':standby?'Standby':'Offline','loop-presence'+(online?' online':standby?' standby':''));
  label.dataset.presenceUser=person.id;
  const lastSeen=Math.max(Date.parse(entry?.last_seen)||0,activity);
  if(!online&&lastSeen){
   label.textContent+=' · Last seen '+new Date(lastSeen).toLocaleString('en-US',{timeZone:settings.timezone,month:'short',day:'numeric',hour:'numeric',minute:'2-digit'});
  }
  return label;
 }
 function updateThreadPresence(){
  const label=el('loopThreadPresence'),person=peer(room);
  if(!label||!person)return;
  const next=presenceLabel(person);
  next.id=label.id;
  if(label.textContent!==next.textContent||label.className!==next.className)label.replaceWith(next);
  for(const current of el('loopProfileDetails').querySelectorAll('[data-presence-user]')){
   const profile=team.find(item=>item.id===current.dataset.presenceUser);
   if(profile){
    const status=presenceLabel(profile);
    if(current.textContent!==status.textContent||current.className!==status.className)current.replaceWith(status);
   }
  }
 }
 function renderPeople(){
  renderQuickPeople();
  const root=el('loopPeople'),query=el('loopSearch').value.trim().toLowerCase();
  const latestByRoom=new Map(messages.map(message=>[message.room,message]));
  let items=[...groups.map(([r,label])=>({r,label})),...team.filter(person=>person.id!==owner).map(person=>({r:dm(person.id),label:person.name,p:person}))];
  const unreadRooms=[...unreadByRoom.values()].filter(count=>count>0).length;
  el('loopUnreadFilterCount').textContent=unreadRooms;
  el('loopUnreadFilterCount').classList.toggle('hidden',!unreadRooms);
  items=items.filter(item=>{
   const tools=toolsByRoom.get(item.r)||{};
   const nameMatch=(item.label+' '+(item.p?.employee_id||'')+' '+(item.p?.department||'')).toLowerCase().includes(query);
   const textMatch=toolsQuery===query&&tools.search_match;
   const matches=!query||nameMatch||textMatch;
   const filterMatches=activeFilter==='all'||
     (activeFilter==='unread'&&(unreadByRoom.get(item.r)||0)>0)||
     (activeFilter==='mentions'&&tools.mentioned)||
     (activeFilter==='teams'&&!item.p)||
     (activeFilter==='pinned'&&tools.pinned);
   return matches&&filterMatches&&(!el('loopOnlyFiles').checked||tools.has_files)&&
     (!el('loopOnlyOnline').checked||(item.p&&presenceLabel(item.p).classList.contains('online')));
  }).sort((a,b)=>{
   const pinDifference=Number(!!toolsByRoom.get(b.r)?.pinned)-Number(!!toolsByRoom.get(a.r)?.pinned);
   return pinDifference||(latestByRoom.get(b.r)?.created_at||'').localeCompare(latestByRoom.get(a.r)?.created_at||'')||a.label.localeCompare(b.label);
  });
  const key=JSON.stringify([room,activeFilter,query,toolsQuery,el('loopOnlyFiles').checked,el('loopOnlyOnline').checked,items.map(item=>[
   item.r,item.label,item.p?.photo,item.p&&presenceLabel(item.p).textContent,unreadByRoom.get(item.r),
   latestByRoom.get(item.r),toolsByRoom.get(item.r),
   latestByRoom.get(item.r)?.sender_id===owner?delivery(latestByRoom.get(item.r),listReceipts):null
  ])]);
  if(key===peopleKey)return;
  peopleKey=key;
  const fragment=document.createDocumentFragment();
  for(const item of items){
   const tools=toolsByRoom.get(item.r)||{},latest=latestByRoom.get(item.r);
   const last=activeFilter==='mentions'?(tools.mention_message||latest):
     query&&toolsQuery===query&&tools.search_message?tools.search_message:latest;
   const unread=unreadByRoom.get(item.r)||0;
   const button=make('button',undefined,'loop-person'+(room===item.r?' selected':'')+(unread?' unread':''));
   button.type='button';
   button.setAttribute('aria-label',item.label+(unread?', '+unread+' unread messages':''));
   const info=make('span',undefined,'loop-person-info');
   info.append(make('strong',item.label));
   if(item.p)info.append(presenceLabel(item.p),window.Music.label(item.p.id));
   const preview=make('span',undefined,'loop-preview');
   if(last?.sender_id===owner&&last.id===latest?.id){
    const [marks,label,cls]=delivery(last,listReceipts),receipt=make('span',marks,'loop-receipt'+cls);
    receipt.title=label;receipt.setAttribute('aria-label',label);preview.append(receipt);
   }
   preview.append(make('small',last?previewText(last):(item.p?'Start a conversation':'Office channel')));
   info.append(preview);
   const side=make('span',undefined,'loop-person-side');
   if(last)side.append(make('time',new Date(last.created_at).toLocaleTimeString('en-US',{timeZone:settings.timezone,hour:'numeric',minute:'2-digit'})));
   if(tools.pinned){const pin=icon('pin');pin.classList.add('loop-list-pin');pin.title='Pinned conversation';side.append(pin)}
   if(unread){const badge=make('span',unread>99?'99+':String(unread),'loop-unread-count');badge.setAttribute('aria-hidden','true');side.append(badge)}
   button.append(item.p?avatar(item.p):groupAvatar(),info,side);
   button.onclick=()=>open(item.r);fragment.append(button);
  }
  if(!items.length){
   const empty=make('div',undefined,'loop-list-empty');
   empty.append(icon(activeFilter==='mentions'?'chat':'search'),make('strong',query?'No matching conversations':activeFilter==='unread'?'You’re all caught up':activeFilter==='mentions'?'No mentions yet':activeFilter==='pinned'?'No pinned conversations':'No conversations here'));
   if(activeFilter==='mentions')empty.append(make('p','Use @ followed by a name or employee ID in a message.'));
   if(activeFilter==='pinned')empty.append(make('p','Open a conversation and tap the pin.'));
   fragment.append(empty);
  }
  root.replaceChildren(fragment);updatePinControl();
 }
 function openProfile(person){
  if(!person)return;
  const details=el('loopProfileDetails');
  details.replaceChildren(avatar(person),make('h2',person.name),make('p',person.department||'General'));
  if(person.job_role&&person.job_role!==person.department)details.append(make('p',person.job_role));
  if(person.employee_id)details.append(make('small','Staff ID · '+person.employee_id));
  details.append(presenceLabel(person),window.Music.label(person.id));
  el('loopText').blur();
  el('loopProfileDialog').showModal();
 }
 function open(r){if(sending){toast('Wait for your message to finish sending');return}if(room)drafts.set(room,{text:el('loopText').value,files});room=r;const draft=drafts.get(r);files=draft?.files||[];el('loopText').value=draft?.text||'';request=null;limit=100;renderKey='';el('loopLog').replaceChildren();el('loopError').textContent='';el('loopView').classList.add('thread-open');window.LoopViewport?.sync();const head=el('loopThreadHeader'),back=make('button','←','icon-button'),p=peer(r),info=make('div');back.type='button';back.setAttribute('aria-label','Back to conversations');back.onclick=()=>{el('loopText').blur();el('loopView').classList.remove('thread-open');window.LoopViewport?.sync();renderPeople();load().catch(error)};window.LoopViewport?.sync();info.append(make('strong',title(r)),make('small',p?.job_role||p?.department||'Office channel'));if(p){const status=presenceLabel(p);status.id='loopThreadPresence';info.append(status,window.Music.label(p.id))}if(p){
 const button=make('button',undefined,'loop-profile-button');
 button.type='button';button.setAttribute('aria-label','View profile for '+p.name);
 button.append(avatar(p),info,make('span','›','loop-profile-arrow'));
 button.onclick=()=>openProfile(peer(room));
 head.replaceChildren(back,button);
}else head.replaceChildren(back,avatar({name:title(r)}),info);el('loopThread').classList.add('has-conversation');el('loopMentionChoices').classList.add('hidden');installPinControl();el('loopForm').classList.toggle('hidden',r==='announcements'&&currentProfile()?.role!=='admin');renderPending();renderPeople();loadThread().catch(error)}
 async function openPerson(id){await show();showView();open(dm(id))}function showView(){showApp('loop')}const showApp=view=>window.navigateLoop(view);
 function delivery(m,source=receipts){const expected=m.room.startsWith('dm:')?m.room.split(':').slice(1).filter(id=>id!==owner).map(id=>({id})):team.filter(p=>p.id!==owner);const rows=source.filter(r=>r.message_id===m.id);if(expected.length&&expected.every(p=>rows.some(r=>r.user_id===p.id&&r.read_at)))return ['✓✓','Read',' read'];if(expected.length&&expected.every(p=>rows.some(r=>r.user_id===p.id)))return ['✓✓','Received',''];return ['✓','Sent','']}
 function readTime(m){if(delivery(m)[1]!=='Read')return null;const times=receipts.filter(r=>r.message_id===m.id&&r.user_id!==owner&&r.read_at).map(r=>Date.parse(r.read_at)).filter(Number.isFinite);return times.length?new Date(Math.max(...times)).toISOString():null}
 async function loadThread(){const c=context(),selectedRoom=room,loadId=++threadLoad;if(!selectedRoom)return;const rows=preview?[]:check(await c.client.from('ws_messages').select('*').eq('room',selectedRoom).order('created_at',{ascending:false}).order('id',{ascending:false}).limit(limit));if(!valid(c)||room!==selectedRoom||loadId!==threadLoad)return;const incoming=rows.filter(m=>m.sender_id!==owner).map(m=>m.id);if(!preview&&rows.length&&readingRoom())check(await c.client.rpc('loop_read_through',{room_value:selectedRoom,last_id:rows[0].id}));else if(!preview&&incoming.length)check(await c.client.rpc('loop_ack',{ids:incoming,seen:false}));if(!valid(c)||room!==selectedRoom||loadId!==threadLoad)return;const ids=rows.map(message=>message.id);
 const [nextReceipts,nextHearts]=ids.length&&!preview?await Promise.all([
  c.client.from('loop_receipts').select('*').in('message_id',ids),
  c.client.from('loop_hearts').select('*').in('message_id',ids)
 ]):[{data:[]},{data:[]}];
 if(!valid(c)||room!==selectedRoom||loadId!==threadLoad)return;
 receipts=check(nextReceipts);
 recordActivity(rows,receipts);
 updateThreadPresence();
 hearts=check(nextHearts);
 if(readingRoom())unreadByRoom.set(selectedRoom,0);
 const loadedIds=new Set(ids);
 listReceipts=[...listReceipts.filter(r=>!loadedIds.has(r.message_id)),...receipts];
 renderPeople();
 const key=JSON.stringify([rows,receipts]);if(key===renderKey){paintHearts();return;}renderKey=key;const root=el('loopLog'),atBottom=root.scrollHeight-root.scrollTop-root.clientHeight<100||!root.children.length,oldHeight=root.scrollHeight,oldTop=root.scrollTop;root.replaceChildren();let day='';for(const m of [...rows].reverse()){const date=new Date(m.created_at).toLocaleDateString('en-US',{timeZone:settings.timezone,month:'short',day:'numeric'});if(date!==day){root.append(make('div',date,'loop-date'));day=date}const own=m.sender_id===owner,bubble=make('article',undefined,'loop-bubble'+(own?' own':''));wireMessage(bubble,m);if(m.is_forwarded)bubble.append(make('small','↗ Forwarded','loop-forwarded'));if(m.body==='Attachment'&&m.attachments?.length===1&&m.attachments[0].sticker)bubble.classList.add('sticker');if(!own&&!room.startsWith('dm:'))bubble.append(make('strong',team.find(p=>p.id===m.sender_id)?.name||'Team member','loop-by'));if(m.body!=='Attachment'||!m.attachments?.length)bubble.append(make('p',m.body));for(const f of m.attachments||[]){const a=make('button',f.name,'loop-file');a.type='button';a.onclick=()=>download(f,c);if(!f.sticker&&!/^image\/(jpeg|png|webp|gif)$/.test(f.type))bubble.append(a);if(/^image\/(jpeg|png|webp|gif)$/.test(f.type)){const image=make('img');image.alt=f.name;image.loading='lazy';image.decoding='async';
 if(f.sticker){image.className='loop-sticker-image';bubble.append(image)}
 else{
  const photo=make('button',undefined,'loop-photo-button');
  photo.type='button';photo.setAttribute('aria-label','Open photo '+f.name);
  photo.append(image);bubble.append(photo);
  photo.onclick=async()=>{try{
   const url=await signed(f.path,c);
   if(!valid(c)||room!==selectedRoom)return;
   const full=el('loopPhotoFull');full.src=url;full.alt=f.name;
   el('loopPhotoTitle').textContent=f.name;
   if(!el('loopPhotoDialog').open)el('loopPhotoDialog').showModal();
  }catch(e){if(valid(c))error(e)}};
 }
 signed(f.path,c).then(url=>{if(valid(c)&&room===selectedRoom&&image.isConnected)image.src=url}).catch(()=>{image.alt='Preview unavailable · '+f.name});}}const meta=make('div',undefined,'loop-message-meta');meta.append(make('time',new Date(m.created_at).toLocaleTimeString('en-US',{timeZone:settings.timezone,hour:'numeric',minute:'2-digit'})));if(own){const [marks,label,cls]=delivery(m),receipt=make('span',marks,'loop-receipt'+cls);receipt.setAttribute('aria-label',label);receipt.title=label;meta.append(receipt)}const tools=make('span',undefined,'loop-message-tools'),like=make('button','♡','loop-message-action loop-like'),forward=make('button','↗','loop-message-action');like.type=forward.type='button';paintLike(like,m.id);forward.setAttribute('aria-label','Forward message');like.onclick=()=>likeMessage(m);forward.onclick=()=>openForward(m);tools.append(like,forward);meta.prepend(tools);bubble.append(meta);root.append(bubble);if(own){const read=readTime(m);if(read){const caption=make('time',undefined,'loop-read-time');caption.dateTime=read;const sameDay=new Date(read).toLocaleDateString('en-US',{timeZone:settings.timezone})===new Date().toLocaleDateString('en-US',{timeZone:settings.timezone});caption.textContent='Read '+new Date(read).toLocaleString('en-US',{timeZone:settings.timezone,...(sameDay?{}:{month:'short',day:'numeric'}),hour:'numeric',minute:'2-digit',hour12:true});root.append(caption)}}}if(!rows.length)root.append(make('p','Start the conversation','empty'));el('loopOlder').classList.toggle('hidden',rows.length<limit);if(atBottom)root.scrollTop=root.scrollHeight;else root.scrollTop=oldTop+(root.scrollHeight-oldHeight);}
 async function signed(path,c){const cached=urls.get(path);if(cached&&cached.until>Date.now())return cached.url;const data=check(await c.client.storage.from('loop-files').createSignedUrl(path,300));if(!valid(c))throw Error('Account changed');urls.set(path,{url:data.signedUrl,until:Date.now()+240000});return data.signedUrl}
 async function download(f,c){try{const blob=check(await c.client.storage.from('loop-files').download(f.path));if(!valid(c))return;const url=URL.createObjectURL(blob),a=make('a');a.href=url;a.download=f.name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000)}catch(e){error(e)}}
 const types=['image/jpeg','image/png','image/webp','image/gif','application/pdf','text/plain','text/csv','application/zip','application/x-zip-compressed','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/vnd.ms-powerpoint','application/vnd.openxmlformats-officedocument.presentationml.presentation'];
 async function preparePhoto(file){
  if(!/^image\/(jpeg|png|webp)$/.test(file.type)||file.size<=512*1024)return file;
  const url=URL.createObjectURL(file);
  try{
   const image=new Image();
   image.src=url;
   await image.decode();
   const scale=Math.min(1,1920/Math.max(image.naturalWidth,image.naturalHeight));
   const canvas=document.createElement('canvas');
   canvas.width=Math.max(1,Math.round(image.naturalWidth*scale));
   canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));
   canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);
   const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/webp',0.88));
   if(!blob||blob.type!=='image/webp'||blob.size>=file.size)return file;
   return new File([blob],file.name.replace(/\.[^.]+$/,'')+'.webp',{type:blob.type});
  }catch{return file}finally{URL.revokeObjectURL(url)}
 }
 function selectFiles(input){if(sending)return;try{const incoming=[...input.files];if(files.length+incoming.length>5)throw Error('Attach up to five files');for(const f of incoming){if(f.size>20*1024*1024)throw Error('Files must be under 20 MB');if(!types.includes(f.type))throw Error('Use an image, GIF, PDF, Office document, ZIP, CSV or text file')}files.push(...incoming);request=null;renderPending()}catch(e){error(e)}finally{input.value=''}}
 function renderPending(){const root=el('loopPending');root.replaceChildren();files.forEach((f,i)=>{const chip=make('span',undefined,'loop-file-chip'),b=make('button','×','text-button');b.type='button';b.setAttribute('aria-label','Remove '+f.name);b.onclick=()=>{if(sending)return;files.splice(i,1);request=null;renderPending()};chip.append(make('span',f.name),b);root.append(chip)})}
 el('loopForm').onsubmit=async e=>{e.preventDefault();if(sending)return;const text=el('loopText').value.trim();if(!text&&!files.length)return;if(preview){error(Error('Preview only — message was not sent'));return}const c=context(),target=room;if(!target)return;sending=true;el('loopMentionChoices').classList.add('hidden');el('loopSend').disabled=true;el('loopError').textContent=files.length?'Uploading attachments…':'';const selected=[...files];if(!request||request.room!==target||request.text!==text)request={id:crypto.randomUUID(),room:target,text,uploaded:[]};const pending=request;try{for(let i=pending.uploaded.length;i<selected.length;i++){const f=await preparePhoto(selected[i]),path=c.id+'/'+pending.id+'/'+i+'-'+f.name.replace(/[^a-zA-Z0-9._-]/g,'_').slice(-120);if(!valid(c))throw Error('Account changed');const uploaded=await c.client.storage.from('loop-files').upload(path,f,{contentType:f.type,upsert:false});if(uploaded.error&&!/already exists|duplicate/i.test(uploaded.error.message))throw uploaded.error;if(!valid(c))return;pending.uploaded.push({path,name:f.name.slice(0,200),type:f.type,size:f.size,sticker:!!f.loopSticker})}if(!valid(c))return;check(await c.client.rpc('loop_send',{request_id:pending.id,room_value:target,message_text:text,files:pending.uploaded}));if(!valid(c))return;el('loopError').textContent='';files=[];request=null;drafts.delete(target);if(el('loopText').value.trim()===text)el('loopText').value='';renderPending();c.client.functions.invoke('attendance-admin',{body:{action:'dispatch'}}).catch(()=>{});renderKey='';await loadThread();await load()}catch(e){if(valid(c))error(e)}finally{sending=false;el('loopSend').disabled=false;}};
 el('loopSend').addEventListener('pointerdown',e=>{if(document.activeElement===el('loopText'))e.preventDefault()});
 el('loopText').addEventListener('keydown',e=>{if(handleMentionKey(e))return;if(e.key!=='Enter'||e.shiftKey||e.ctrlKey||e.altKey||e.metaKey||e.isComposing||e.keyCode===229||!matchMedia('(hover: hover) and (pointer: fine)').matches)return;e.preventDefault();if(!e.repeat&&!sending)el('loopForm').requestSubmit()});
 el('loopText').oninput=()=>{if(!sending)request=null};el('loopSearch').oninput=()=>{peopleKey='';renderPeople();clearTimeout(searchTimer);searchTimer=setTimeout(()=>load().catch(error),250)};el('loopAttach').onclick=()=>{if(!sending)el('loopFiles').click()};el('loopGif').onclick=()=>{if(!sending){el('loopMedia').classList.toggle('hidden');el('loopEmoji').classList.add('hidden')}};el('loopFiles').onchange=e=>selectFiles(e.target);el('loopGifFile').onchange=e=>selectFiles(e.target);el('loopOlder').onclick=()=>{limit=Math.min(1000,limit+100);renderKey='';loadThread().catch(error)};
 for(const emoji of ['😀','😊','👍','👏','🙌','✅','🙏','🎉','❤️','💼','📌','📅','☕','👋','💪','🙂','😂','🤝','⭐','💯']){const b=make('button',emoji);b.type='button';b.onclick=()=>{if(sending)return;if(el('loopText').value.length+emoji.length>2000)return;el('loopText').setRangeText(emoji,el('loopText').selectionStart,el('loopText').selectionEnd,'end');request=null;el('loopEmoji').classList.add('hidden');el('loopText').focus()};el('loopEmoji').append(b)}el('loopEmojiButton').onclick=()=>{el('loopEmoji').classList.toggle('hidden');el('loopMedia').classList.add('hidden')};

 function paintLike(button,id){const reactions=hearts.filter(h=>h.message_id===id),mine=reactions.some(h=>h.user_id===owner);button.textContent=reactions.length?'♥'+(reactions.length>1?' '+reactions.length:''):'♡';button.classList.toggle('liked',reactions.length>0);button.classList.toggle('mine',mine);button.setAttribute('aria-label',mine?'Unlike message':'Like message');button.setAttribute('aria-pressed',String(mine));button.title=reactions.length+' '+(reactions.length===1?'like':'likes')}
 function paintHearts(){for(const bubble of el('loopLog').querySelectorAll('[data-loop-message]')){const button=bubble.querySelector('.loop-like');if(button)paintLike(button,bubble.dataset.loopMessage)}}
 async function likeMessage(m){if(preview){toast('Likes are available in the live app');return}if(heartBusy.has(m.id))return;const c=context(),liked=!hearts.some(h=>h.message_id===m.id&&h.user_id===c.id);heartBusy.add(m.id);try{check(await c.client.rpc('loop_heart',{mid:m.id,liked}));if(valid(c))await loadThread()}catch(e){if(valid(c))error(e)}finally{heartBusy.delete(m.id)}}
 function wireMessage(bubble,m){bubble.dataset.loopMessage=m.id;let last=0,lastX=0,lastY=0,touchLike=0;bubble.addEventListener('pointercancel',()=>{last=0});bubble.addEventListener('pointerup',e=>{if(e.pointerType!=='touch'||e.target.closest('button,a'))return;const now=Date.now();if(now-last<320&&Math.abs(e.clientX-lastX)<24&&Math.abs(e.clientY-lastY)<24){touchLike=now;last=0;likeMessage(m)}else{last=now;lastX=e.clientX;lastY=e.clientY}});bubble.addEventListener('dblclick',e=>{if(e.target.closest('button,a')||Date.now()-touchLike<650)return;likeMessage(m)});}
 let forwardSource=null,forwardTargets=new Set(),forwardPending=null,forwardBusy=false;
 function openForward(m){forwardSource=m;forwardTargets.clear();forwardPending=null;el('loopForwardSearch').value='';el('loopForwardPreview').textContent=m.body==='Attachment'?(m.attachments||[]).map(f=>f.name).join(', '):m.body;el('loopForwardError').textContent='';renderForward();el('loopForwardDialog').showModal()}
 function renderForward(){const root=el('loopForwardPeople'),q=el('loopForwardSearch').value.trim().toLowerCase();root.replaceChildren();for(const p of team.filter(p=>p.id!==owner&&(p.name+' '+(p.department||'')).toLowerCase().includes(q))){const row=make('label',undefined,'loop-forward-person'),input=make('input');input.type='checkbox';input.checked=forwardTargets.has(p.id);input.disabled=forwardBusy;input.onchange=()=>{if(input.checked&&forwardTargets.size>=20){input.checked=false;el('loopForwardError').textContent='Choose up to 20 people';return}if(input.checked)forwardTargets.add(p.id);else forwardTargets.delete(p.id);forwardPending=null;el('loopForwardSend').disabled=!forwardTargets.size;el('loopForwardSend').textContent='Forward'+(forwardTargets.size?' · '+forwardTargets.size:'')};const info=make('span');info.append(make('strong',p.name),make('small',p.department||'General'));row.append(input,avatar(p),info);root.append(row)}el('loopForwardSend').disabled=forwardBusy||!forwardTargets.size;el('loopForwardSend').textContent='Forward'+(forwardTargets.size?' · '+forwardTargets.size:'')}
 el('loopForwardSearch').oninput=renderForward;el('loopForwardClose').onclick=()=>{if(!forwardBusy)el('loopForwardDialog').close()};
 el('loopForwardForm').onsubmit=async e=>{e.preventDefault();if(forwardBusy||!forwardSource||!forwardTargets.size)return;const c=context(),targets=[...forwardTargets].sort(),fingerprint=JSON.stringify([forwardSource.id,targets]);if(preview){el('loopForwardError').textContent='Preview only — message was not forwarded';return}if(!forwardPending||forwardPending.fingerprint!==fingerprint)forwardPending={id:crypto.randomUUID(),fingerprint};forwardBusy=true;renderForward();el('loopForwardClose').disabled=true;try{check(await c.client.rpc('loop_forward',{request:forwardPending.id,source:forwardSource.id,targets}));if(!valid(c))return;el('loopForwardDialog').close();forwardPending=null;toast('Forwarded to '+targets.length+(targets.length===1?' person':' people'));c.client.functions.invoke('attendance-admin',{body:{action:'dispatch'}}).catch(()=>{});await load()}catch(e){if(valid(c))el('loopForwardError').textContent=e.message||'Forwarding failed'}finally{forwardBusy=false;el('loopForwardClose').disabled=false;renderForward()}};
 el('loopUploadGif').onclick=()=>{if(!sending)el('loopGifFile').click()};el('loopMediaClose').onclick=()=>el('loopMedia').classList.add('hidden');
 for(let i=0;i<31;i++){const button=make('button'),image=make('img');button.type='button';button.setAttribute('aria-label','Add sticker '+(i+1));image.src='assets/stickers/'+i+'.webp';image.alt='Sticker '+(i+1);image.loading='lazy';button.append(image);button.onclick=async()=>{if(sending)return;if(files.length>=5){error(Error('Attach up to five files'));return}const c=context();button.disabled=true;try{const response=await fetch(image.src);if(!response.ok)throw Error('Sticker could not load');const blob=await response.blob();if(!valid(c))return;const file=new File([blob],'Sticker '+(i+1)+'.webp',{type:'image/webp'});file.loopSticker=true;files.push(file);request=null;renderPending();el('loopMedia').classList.add('hidden')}catch(e){error(e)}finally{button.disabled=false}};el('loopStickerGrid').append(button)}


 el('loopText').addEventListener('input',renderMentionChoices);
 el('loopFilters').addEventListener('click',event=>{
  const button=event.target.closest('[data-loop-filter]');
  if(button)setFilter(button.dataset.loopFilter);
 });
 el('loopNewChat').onclick=openNewChat;el('loopNewChatFloating').onclick=openNewChat;
 el('loopNewChatSearch').oninput=renderNewChat;
 el('loopHeaderSearch').onclick=()=>{
  el('loopView').classList.remove('thread-open');window.LoopViewport?.sync();el('loopSearch').focus();
 };
 el('loopFilterToggle').onclick=()=>{
  const expanded=el('loopAdvancedFilters').classList.contains('hidden');
  el('loopAdvancedFilters').classList.toggle('hidden',!expanded);
  el('loopFilterToggle').setAttribute('aria-expanded',String(expanded));
 };
 for(const id of ['loopOnlyFiles','loopOnlyOnline'])el(id).onchange=()=>{peopleKey='';renderPeople()};

 setInterval(()=>{sessionChanged();if(owner&&!document.hidden&&navigator.onLine){refreshPresence();load().catch(()=>{})}},8000);document.addEventListener('visibilitychange',()=>{if(!document.hidden&&owner){refreshPresence();load().catch(()=>{})}});window.addEventListener('focus',()=>{refreshPresence();if(activeView==='loop'&&room)loadThread().catch(()=>{})});window.addEventListener('online',refreshPresence);queueMicrotask(sessionChanged);return {show,sessionChanged,openPerson};
})();
