window.Subscriptions=(()=>{
  const el=id=>document.getElementById(id);
  const make=(tag,text,cls)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;if(cls)node.className=cls;return node;};
  const manager=()=>currentProfile()?.active && currentProfile()?.employee_id?.toUpperCase()==='DCU-002';
  const access=()=>!!admin||manager();
  const client=()=>manager()?clientForProfile():adminClient;
  let rows=[],receipts=[],sequence=0,editing=null,saving=false,submission=null,submitting=false,reviewing=false,receiptUpload=null;

  function sync(){
    el('openSubscriptions').classList.toggle('hidden',!admin);
    el('manageSubscriptions').classList.toggle('hidden',!manager());
    if(!access()){
      sequence++;rows=[];receipts=[];el('receiptSubmissionDialog').close();el('subscriptionCards').replaceChildren();
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
      if(row.image_path){
        const image=make('img');image.alt=row.name;monogram.replaceChildren(image);
        const c=client();
        c.storage.from('subscription-documents').createSignedUrl(row.image_path,120).then(result=>{
          if(!result.error&&c===client()&&access()&&image.isConnected)image.src=result.data.signedUrl;
        });
      }
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
      if(admin){
        const submit=make('button','Submit payment receipt','secondary');
        submit.type='button';submit.className+=' subscription-submit';
        submit.onclick=()=>{
          submission=row;receiptUpload=null;el('receiptSubmissionForm').reset();
          el('receiptSubmissionTitle').textContent='Submit receipt · '+row.name;
          el('receiptSubmissionStatus').textContent='';
          el('receiptSubmissionDialog').showModal();
        };
        card.append(submit);
      }
      for(const receipt of receipts.filter(item=>item.subscription_id===row.id&&(manager()||item.submitted_by===admin?.id))){
        const entry=make('div',undefined,'subscription-review');
        entry.append(make('strong',receipt.status==='pending'?(manager()?'Awaiting your review':'Awaiting DCU-002 approval'):receipt.status==='approved'?'Receipt approved':'Receipt rejected'));
        entry.append(make('small',new Date(receipt.created_at).toLocaleString('en-US',{timeZone:settings.timezone,dateStyle:'medium',timeStyle:'short'})));
        const buttons=make('div',undefined,'button-row');
        const view=make('button','View receipt','text-button');view.type='button';
        view.onclick=()=>documentView({name:row.name,receipt_path:receipt.image_path},'receipt');
        buttons.append(view);
        if(manager()&&receipt.status==='pending'){
          for(const [decision,label] of [['approved','Approve receipt'],['rejected','Reject']]){
            const button=make('button',label,'secondary');button.type='button';
            button.onclick=()=>reviewReceipt(receipt,decision,button);
            buttons.append(button);
          }
        }
        entry.append(buttons);card.append(entry);
      }
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
      const [services,submissions]=await Promise.all([
        c.from('att_subscriptions').select('*').order('name'),
        c.from('att_subscription_receipts').select('*').order('created_at',{ascending:false})
      ]);
      const data=check(services),submitted=check(submissions);
      if(request!==sequence||!access()||c!==client())return;
      rows=data;receipts=submitted;
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
    for(const kind of ['Bill','Receipt','Image'])el('subscription'+kind+'Remove').disabled=!row[kind.toLowerCase()+'_path'];
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
  async function reviewReceipt(receipt,decision,button){
    if(!manager()||reviewing)return;
    reviewing=true;button.disabled=true;el('subscriptionMessage').textContent='Saving review…';
    try{
      check(await client().rpc('att_review_subscription_receipt',{receipt:receipt.id,decision}));
      await load();
      el('subscriptionMessage').textContent=decision==='approved'?'Receipt approved. Use Update subscription to change the payment status.':'Receipt rejected.';
    }catch(error){el('subscriptionMessage').textContent=error.message;}
    finally{reviewing=false;button.disabled=false;}
  }
  el('receiptSubmissionForm').addEventListener('submit',async event=>{
    event.preventDefault();
    if(!admin||!submission||submitting)return;
    const c=adminClient,person=admin.id,service=submission.id,file=el('receiptSubmissionFile').files[0];
    if(!file||!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>5242880){
      el('receiptSubmissionStatus').textContent='Choose a JPEG, PNG or WebP image under 5 MB.';return;
    }
    submitting=true;el('receiptSubmissionFields').disabled=true;el('receiptSubmissionClose').disabled=true;
    el('receiptSubmissionStatus').textContent='Uploading receipt…';
    if(!receiptUpload||receiptUpload.service!==service||receiptUpload.file!==file||receiptUpload.person!==person){
      receiptUpload={service,file,person,path:person+'/'+crypto.randomUUID()+'.'+({'image/jpeg':'jpg','image/png':'png','image/webp':'webp'}[file.type]),uploaded:false};
    }
    const draft=receiptUpload,path=draft.path;
    let uploaded=false,attempted=false;
    try{
      if(!draft.uploaded){
        check(await c.storage.from('subscription-documents').upload(path,file,{contentType:file.type,upsert:false}));
        draft.uploaded=true;
      }
      uploaded=true;
      if(admin?.id!==person)throw Error('Account changed. Sign in again.');
      attempted=true;
      check(await c.rpc('att_submit_subscription_receipt',{service,path}));
      receiptUpload=null;el('receiptSubmissionDialog').close();await load();
      el('subscriptionMessage').textContent='Receipt sent to DCU-002 for approval.';
    }catch(error){
      if(uploaded&&!attempted)await c.storage.from('subscription-documents').remove([path]).catch(()=>{});
      el('receiptSubmissionStatus').textContent=error.message+(attempted?' Refresh to check whether it was received before trying again.':'');
    }finally{
      submitting=false;el('receiptSubmissionFields').disabled=false;el('receiptSubmissionClose').disabled=false;
    }
  });
  el('receiptSubmissionClose').onclick=()=>{if(!submitting)el('receiptSubmissionDialog').close();};
  el('receiptSubmissionDialog').addEventListener('cancel',event=>{if(submitting)event.preventDefault();});
  el('subscriptionForm').addEventListener('submit',async event=>{
    event.preventDefault();
    if(!manager()||!editing||saving)return;
    const c=client(),record=editing,paths=[];
    saving=true;el('subscriptionFields').disabled=true;el('subscriptionEditorClose').disabled=true;
    el('subscriptionSaveStatus').textContent='Saving…';
    let committed=false,writeAttempted=false;
    try{
      const update={active:el('subscriptionActive').checked,payment_status:el('subscriptionPayment').value,due_date:el('subscriptionDue').value||null};
      for(const kind of ['Bill','Receipt','Image']){
        const path=await upload(el(kind==='Image'?'subscriptionProfileImage':'subscription'+kind),kind,c,paths);
        const key=kind.toLowerCase()+'_path';
        update[key]=path||(el('subscription'+kind+'Remove').checked?null:record[key]);
      }
      if(!manager()||c!==client())throw Error('Account changed. Sign in again.');
      writeAttempted=true;
      const saved=check(await c.rpc('att_save_subscription',{service:record.id,expected_version:record.version,changes:update,notify_admins:el('subscriptionNotifyAdmins').checked}));
      if(!saved)throw Error('This subscription was updated elsewhere. Close and reopen it to try again.');
      committed=true;
      el('subscriptionEditor').close();
      await load();
    }catch(error){
      el('subscriptionSaveStatus').textContent=error.message;
    }finally{
      if(!committed&&!writeAttempted&&paths.length)await c.storage.from('subscription-documents').remove(paths).catch(()=>{});
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