window.Subscriptions=(()=>{
  const el=id=>document.getElementById(id);
  const make=(tag,text,cls)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;if(cls)node.className=cls;return node;};
  const manager=()=>currentProfile()?.active && currentProfile()?.employee_id?.toUpperCase()==='DCU-002';
  const access=()=>!!admin||manager();
  const client=()=>manager()?clientForProfile():adminClient;
  let rows=[],sequence=0,editing=null,saving=false;

  function sync(){
    el('openSubscriptions').classList.toggle('hidden',!admin);
    el('manageSubscriptions').classList.toggle('hidden',!manager());
    if(!access()){
      sequence++;rows=[];el('subscriptionCards').replaceChildren();
      el('subscriptionEditor').close();el('subscriptionImageDialog').close();
      if(activeView==='subscriptions')show('clock');
    }
  }
  function effectiveStatus(row){
    if(row.payment_status==='past_due'||(row.payment_status!=='paid'&&row.due_date&&row.due_date<dayKey()))return 'past_due';
    return row.payment_status;
  }
  async function documentView(row,kind){
    const c=client(),profileId=currentProfile()?.id;
    el('subscriptionMessage').textContent='';
    try{
      const result=check(await c.storage.from('subscription-documents').createSignedUrl(row[kind+'_path'],120));
      if(!access()||c!==client()||profileId!==currentProfile()?.id)return;
      el('subscriptionImage').src=result.signedUrl;
      el('subscriptionImage').alt=row.name+' '+kind;
      el('subscriptionImageTitle').textContent=row.name+' · '+(kind==='bill'?'Bill':'Receipt');
      el('subscriptionImageDialog').showModal();
    }catch(error){el('subscriptionMessage').textContent=error.message;}
  }
  function render(){
    const cards=rows.map(row=>{
      const card=make('article',undefined,'panel subscription-card');
      const heading=make('div',undefined,'subscription-card-heading');
      const monogram=make('span',row.name.slice(0,1),'subscription-monogram');
      const name=make('h2',row.name);
      const state=effectiveStatus(row);
      const badge=make('span',state==='paid'?'Paid':state==='pending'?'Payment pending':'Past due','subscription-badge '+(state==='paid'&&!row.active?'inactive':state));
      heading.append(monogram,name);card.append(heading);
      const statuses=make('div',undefined,'subscription-statuses');
      statuses.append(make('span',row.active?'Active':'Inactive','subscription-service'),badge);
      card.append(statuses);
      const dateLabel=row.due_date?new Date(row.due_date+'T12:00:00Z').toLocaleDateString('en-US',{timeZone:'UTC',dateStyle:'medium'}):'Not set';
      const detail=make('div',undefined,'subscription-due');
      detail.append(make('small','Next bill due'),make('strong',dateLabel));card.append(detail);
      const documents=make('div',undefined,'subscription-documents');
      for(const kind of ['bill','receipt']){
        const label=kind==='bill'?'See bill':'See receipt';
        const button=make('button',row[kind+'_path']?label+' ↗':(kind==='bill'?'Bill':'Receipt')+' not uploaded','secondary');
        button.type='button';button.disabled=!row[kind+'_path'];
        button.onclick=()=>documentView(row,kind);documents.append(button);
      }
      card.append(documents);
      if(manager()){
        const edit=make('button','Update subscription','text-button');
        edit.type='button';edit.onclick=()=>openEditor(row);card.append(edit);
      }
      return card;
    });
    el('subscriptionCards').replaceChildren(...cards);
    if(!rows.length)el('subscriptionMessage').textContent='No subscriptions found.';
  }
  async function load(){
    const request=++sequence,c=client();
    if(!access()||!c)return;
    el('subscriptionMessage').textContent='Loading subscriptions…';
    try{
      const data=check(await c.from('att_subscriptions').select('*').order('name'));
      if(request!==sequence||!access()||c!==client())return;
      rows=data;
      el('subscriptionMessage').textContent='';render();
    }catch(error){if(request===sequence)el('subscriptionMessage').textContent=error.message;}
  }
  function openEditor(row){
    if(!manager()||saving)return;
    editing={...row};
    el('subscriptionForm').reset();
    el('subscriptionEditorTitle').textContent='Update '+row.name;
    el('subscriptionActive').checked=row.active;
    el('subscriptionPayment').value=row.payment_status;
    el('subscriptionDue').value=row.due_date||'';
    for(const kind of ['Bill','Receipt'])el('subscription'+kind+'Remove').disabled=!row[kind.toLowerCase()+'_path'];
    el('subscriptionSaveStatus').textContent='';
    el('subscriptionEditor').showModal();
  }
  async function upload(input,kind,c,paths){
    const file=input.files[0];
    if(!file)return null;
    if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>5*1024*1024)throw Error('Use a JPEG, PNG or WebP image under 5 MB.');
    const path=editing.id+'/'+crypto.randomUUID()+'.'+({ 'image/jpeg':'jpg','image/png':'png','image/webp':'webp' }[file.type]);
    check(await c.storage.from('subscription-documents').upload(path,file,{contentType:file.type,upsert:false}));
    paths.push(path);return path;
  }
  el('subscriptionForm').addEventListener('submit',async event=>{
    event.preventDefault();
    if(!manager()||!editing||saving)return;
    const c=client(),record=editing,paths=[];
    saving=true;el('subscriptionFields').disabled=true;el('subscriptionEditorClose').disabled=true;
    el('subscriptionSaveStatus').textContent='Saving…';
    let committed=false;
    try{
      const update={active:el('subscriptionActive').checked,payment_status:el('subscriptionPayment').value,due_date:el('subscriptionDue').value||null};
      for(const kind of ['Bill','Receipt']){
        const path=await upload(el('subscription'+kind),kind,c,paths);
        const key=kind.toLowerCase()+'_path';
        update[key]=path||(el('subscription'+kind+'Remove').checked?null:record[key]);
      }
      if(!manager()||c!==client())throw Error('Account changed. Sign in again.');
      const saved=check(await c.from('att_subscriptions').update(update).eq('id',record.id).eq('version',record.version).select('*').maybeSingle());
      if(!saved)throw Error('This subscription was updated elsewhere. Close and reopen it to try again.');
      committed=true;
      el('subscriptionEditor').close();
      await load();
    }catch(error){
      el('subscriptionSaveStatus').textContent=error.message;
    }finally{
      if(!committed&&paths.length)await c.storage.from('subscription-documents').remove(paths).catch(()=>{});
      saving=false;el('subscriptionFields').disabled=false;el('subscriptionEditorClose').disabled=false;
    }
  });
  el('subscriptionEditor').addEventListener('cancel',event=>{if(saving)event.preventDefault();});
  el('subscriptionEditorClose').onclick=()=>{if(!saving)el('subscriptionEditor').close();};
  el('openSubscriptions').onclick=()=>show('subscriptions');
  el('manageSubscriptions').onclick=()=>show('subscriptions');
  el('subscriptionBack').onclick=()=>show(admin?'admin':'profile');
  el('subscriptionRefresh').onclick=load;
  el('subscriptionImageDialog').addEventListener('close',()=>{el('subscriptionImage').removeAttribute('src');});
  setInterval(()=>{if(activeView==='subscriptions'&&!document.hidden&&!saving)load();},30000);
  return {sync,show:load};
})();