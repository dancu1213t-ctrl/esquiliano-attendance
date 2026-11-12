window.Departments=(()=>{
  let epoch=0,revision=0,busy=false,rows=[];
  const el=id=>document.getElementById(id);
  const dialog=el('departmentDialog'),list=el('departmentList'),status=el('departmentStatus');
  async function load(selected='General'){
    const run=++epoch,select=el('personDepartment');
    select.replaceChildren(new Option(selected,selected));
    if(preview)return;
    try{
      const departments=check(await adminClient.from('att_departments').select('name').order('name'));
      if(run!==epoch)return;
      select.replaceChildren(...departments.map(d=>new Option(d.name,d.name)));
      select.value=selected;
      if(!select.value)select.value='General';
    }catch(error){toast(error.message)}
  }
  async function refresh(){
    const request=++revision;
    status.textContent='Loading departments…';
    try{
      const data=check(await adminClient.from('att_departments').select('name').order('name'));
      if(!dialog.open||request!==revision||!admin)return;
      rows=data;status.textContent='';render();
    }catch(error){if(request===revision)status.textContent=error.message}
  }
  function render(){
    list.replaceChildren();
    for(const department of rows){
      const row=document.createElement('li');row.className='department-manage-row';
      const input=document.createElement('input');
      input.value=department.name;input.maxLength=80;input.setAttribute('aria-label','Department name · '+department.name);
      const actions=document.createElement('div');actions.className='button-row';
      const rename=document.createElement('button');rename.textContent='Save name';rename.type='button';rename.className='secondary';
      const remove=document.createElement('button');remove.textContent='Remove';remove.type='button';remove.className='text-button';
      if(department.name==='General'){input.disabled=true;rename.disabled=true;remove.disabled=true;}
      rename.onclick=()=>change(async()=>{
        const name=check(await adminClient.rpc('att_department_rename',{old_name:department.name,new_name:input.value.trim()}));
        await load(el('personDepartment').value===department.name?name:el('personDepartment').value);
      },'Department updated.');
      remove.onclick=()=>{
        if(busy)return;
        const replacement=el('departmentReplacement').value;
        if(replacement===department.name){status.textContent='Choose a different replacement department.';return;}
        if(!confirm('Remove '+department.name+'? Staff assigned here will move to '+replacement+'.'))return;
        change(async()=>{
          check(await adminClient.rpc('att_department_remove',{department_name:department.name,reassign_to:replacement}));
          await load(el('personDepartment').value===department.name?replacement:el('personDepartment').value);
        },'Department removed.');
      };
      actions.append(rename,remove);row.append(input,actions);list.append(row);
    }
    const replacement=el('departmentReplacement'),selected=replacement.value||'General';
    replacement.replaceChildren(...rows.map(d=>new Option(d.name,d.name)));
    replacement.value=rows.some(d=>d.name===selected)?selected:'General';
  }
  async function change(action,message){
    if(busy||!admin)return;
    busy=true;el('departmentControls').disabled=true;
    try{await action();await refresh();status.textContent=message}
    catch(error){status.textContent=error.message}
    finally{busy=false;el('departmentControls').disabled=false}
  }
  el('addDepartment').onclick=()=>{
    if(!admin||preview){toast('Sign in as an administrator to manage departments');return;}
    dialog.showModal();refresh();
  };
  el('departmentAddForm').onsubmit=event=>{
    event.preventDefault();
    const name=el('departmentNewName').value.trim();
    if(!name)return;
    change(async()=>{
      const saved=check(await adminClient.rpc('att_department_add',{label:name}));
      await load(saved);el('departmentNewName').value='';
    },'Department added.');
  };
  el('departmentClose').onclick=()=>{if(!busy)dialog.close()};
  dialog.addEventListener('cancel',event=>{if(busy)event.preventDefault()});
  dialog.addEventListener('close',()=>{revision++});
  return {load};
})();
