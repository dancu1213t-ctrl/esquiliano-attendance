(() => {
  const dialog = $('scheduleDialog');
  const form = $('scheduleForm');
  const person = $('schedulePerson');
  const date = $('scheduleDate');
  const extraDates = [$('scheduleDate2'), $('scheduleDate3')];
  const dateFields = [date, ...extraDates];
  const start = $('scheduleStart');
  const end = $('scheduleEnd');
  const off = $('scheduleOff');
  const save = $('scheduleSave');
  const remove = $('scheduleRemove');
  const status = $('scheduleStatus');
  let revision = 0;

  const saved = $('savedScheduleDetails');
  const list = $('savedScheduleList');
  const listStatus = $('savedScheduleStatus');
  const previous = $('savedSchedulePrevious');
  const next = $('savedScheduleNext');
  const pageSize = 20;
  let page = 0;
  let listRevision = 0;

  async function loadSaved() {
    const request = ++listRevision;
    previous.disabled = next.disabled = true;
    list.replaceChildren();
    listStatus.textContent = 'Loading schedules…';
    try {
      const rows = check(await adminClient.from('att_planned_shifts')
        .select('employee_id,work_date,starts_at,ends_at,employee:att_profiles!att_planned_shifts_employee_id_fkey(name)')
        .order('work_date',{ascending:false}).order('employee_id')
        .range(page*pageSize,(page+1)*pageSize));
      if(request !== listRevision || !dialog.open)return;
      if(!rows.length && page>0){page--;return loadSaved();}
      const dateFormat = new Intl.DateTimeFormat('en',{dateStyle:'medium',timeZone:'UTC'});
      const timeFormat = new Intl.DateTimeFormat('en',{timeStyle:'short',timeZone:'UTC'});
      const formatTime = value => timeFormat.format(new Date('2000-01-01T'+value+'Z'));
      for(const shift of rows.slice(0,pageSize)){
        const row = document.createElement('li');
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'text-button';
        const hours = shift.starts_at ? formatTime(shift.starts_at)+'–'+formatTime(shift.ends_at) : 'Day off';
        button.textContent = (shift.employee?.name || 'Employee')+' · '+dateFormat.format(new Date(shift.work_date+'T00:00:00Z'))+' · '+hours+' ›';
        button.addEventListener('click',()=>{
          if(person.disabled)return;
          if(!Array.from(person.options).some(option=>option.value===shift.employee_id)){
            person.add(new Option(shift.employee?.name || 'Employee',shift.employee_id));
          }
          person.value = shift.employee_id;
          date.value = shift.work_date;
          extraDates.forEach(field=>{field.value='';});
          saved.open = false;
          date.focus();
          loadShift();
        });
        row.append(button);
        list.append(row);
      }
      listStatus.textContent = rows.length?'':'No saved schedules.';
      previous.disabled = page===0;
      next.disabled = rows.length<=pageSize;
    } catch(error) {
      if(request===listRevision && dialog.open)listStatus.textContent=error.message;
    }
  }

  saved.addEventListener('toggle',()=>{if(saved.open && dialog.open)loadSaved();});
  previous.addEventListener('click',()=>{page--;loadSaved();});
  next.addEventListener('click',()=>{page++;loadSaved();});

  function syncTimes() {
    for (const field of [start, end]) {
      field.disabled = off.checked;
      field.required = !off.checked;
    }
  }

  async function loadShift() {
    const request = ++revision;
    const employee = person.value;
    const day = date.value;
    save.disabled = remove.disabled = true;
    status.textContent = '';
    if (!admin || !employee || !day) return;
    try {
      const row = check(await adminClient.from('att_planned_shifts')
        .select('starts_at,ends_at').eq('employee_id', employee).eq('work_date', day).maybeSingle());
      if (request !== revision || !dialog.open) return;
      off.checked = !!row && row.starts_at === null;
      start.value = row?.starts_at?.slice(0,5) || '08:00';
      end.value = row?.ends_at?.slice(0,5) || '17:00';
      syncTimes();
      save.disabled = false;
      remove.disabled = !row;
      status.textContent = row ? 'Saved schedule loaded.' : 'No shift scheduled for this date.';
    } catch (error) {
      if (request === revision) status.textContent = error.message;
    }
  }

  $('openSchedule').addEventListener('click', async () => {
    if (!admin) return;
    saved.open = false;
    page = 0;
    dialog.showModal();
    person.replaceChildren();
    date.value = dayKey();
    extraDates.forEach(field => { field.value = ''; });
    save.disabled = remove.disabled = true;
    status.textContent = 'Loading staff…';
    try {
      const staff = check(await adminClient.from('att_profiles').select('id,name').eq('active',true).order('name'));
      if (!dialog.open) return;
      for (const employee of staff) person.add(new Option(employee.name, employee.id));
      await loadShift();
    } catch (error) {
      status.textContent = error.message;
    }
  });
  dialog.addEventListener('close', () => { revision++; listRevision++; });
  person.addEventListener('change', loadShift);
  date.addEventListener('change', loadShift);
  off.addEventListener('change', syncTimes);

  async function changeShift(deleting) {
    if (!admin || !person.value || !date.value) return;
    const employee_id = person.value;
    const dates = deleting ? [date.value] : dateFields.map(field => field.value).filter(Boolean);
    if (!deleting && dates.length > 1) {
      const mondayOf = value => {
        const day = new Date(value+'T00:00:00Z');
        return day.getTime() - ((day.getUTCDay()+6)%7)*86400000;
      };
      if (new Set(dates).size !== dates.length || dates.some(day => day < dayKey() || mondayOf(day) !== mondayOf(dates[0]))) {
        status.textContent = 'Choose distinct dates from today onward in the same Monday–Sunday week.';
        return;
      }
    }
    const request = ++revision;
    save.disabled = remove.disabled = true;
    for (const field of [person,...dateFields]) field.disabled = true;
    try {
      const table = adminClient.from('att_planned_shifts');
      if (deleting) {
        check(await table.delete().eq('employee_id',employee_id).eq('work_date',dates[0]));
      } else {
        check(await table.upsert(dates.map(work_date => ({
          employee_id, work_date, updated_by:admin.id,
          starts_at:off.checked ? null : start.value,
          ends_at:off.checked ? null : end.value
        })), {onConflict:'employee_id,work_date'}));
      }
      if (request !== revision) return;
      extraDates.forEach(field => { field.value = ''; });
      await loadShift();
      if (saved.open && dialog.open) loadSaved();
      if (dialog.open) status.textContent = deleting ? 'Schedule removed.' : dates.length+' date'+(dates.length===1?'':'s')+' saved.';
    } catch (error) {
      if (request === revision) {
        status.textContent = error.message;
        save.disabled = false;
        remove.disabled = deleting;
      }
    } finally {
      for (const field of [person,...dateFields]) field.disabled = false;
    }
  }
  form.addEventListener('submit', event => {
    event.preventDefault();
    if (!off.checked && start.value >= end.value) {
      status.textContent = 'The end time must be after the start time.';
      return;
    }
    changeShift(false);
  });
  remove.addEventListener('click', () => changeShift(true));
})();
