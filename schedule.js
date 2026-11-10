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
  dialog.addEventListener('close', () => { revision++; });
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
