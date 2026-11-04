const assert=require('node:assert/strict'),C=require('../bobby-commands');const s={today:'2026-11-03',admin_id:'a',latest:[],people:[{id:'a',name:'Administrator',employee_id:'ADM',active:true},{id:'b',name:'Test Worker',employee_id:'TST-1',active:true},{id:'c',name:'Sample Person',employee_id:'TST-2',active:true}]};
assert.equal(C.plan('Is Test Worker clocked in?',s),null);assert.equal(C.plan('Bobby please clock out Test Worker she forgot',s).action,'OUT');assert.equal(C.plan('Clock out Test Worker at 4 pm',s).time,'2026-11-03T16:00:00');assert.equal(C.plan('Kindly remind Test Worker to clock out',s).body,'Please remember to clock out.');assert.equal(C.plan('Kindly tell mr Sample to come to the office',s).body,'Please come to the office.');assert.equal(C.plan('Check that everyone cocked out at 5 if not clock out for them',s).date,'2026-11-04');assert.equal(C.plan('Check everyone clocked out at 5 on 2026-11-10',s).date,'2026-11-10');assert.equal(C.plan('Show my tasks',s).kind,'tasks');assert.equal(C.plan('Please clock out Unknown Person',s).kind,'clarify');console.log('PASS read questions stay read-only, named commands, reminder/body, explicit time, chosen-day schedule and unknown recipient');

assert.equal(C.plan('Check everyone clocked out at 4',s).kind,'clarify');

assert.equal(C.plan('Bobby remind Test Worker to bring his table tommorow',s).body,'Please remember to bring your table tomorrow.');
assert.equal(C.plan('Bobby remind Test Worker to bring my table tomorrow',s).body,'Please remember to bring my table tomorrow.');
assert.equal(C.plan('Tell Test Worker that he needs his ID',s).body,'You need your ID.');
assert.equal(C.plan('Tell Sample that she is expected to bring her laptop tomorrow',s).body,'You are expected to bring your laptop tomorrow.');
assert.equal(C.plan('Tell Test Worker I will call him tomorrow',s).body,'I will call you tomorrow.');
assert.equal(C.plan("Remind Test Worker to bring Sample's table tomorrow",s).body,"Please remember to bring Sample's table tomorrow.");
assert.equal(C.plan('Tell Test Worker that Sample needs his table',s).kind,'clarify');
assert.equal(C.plan('Tell Test Worker that John needs his table',s).kind,'clarify');
assert.equal(C.plan('Tell Test Worker exactly "Bring his table tomorrow."',s).body,'Bring his table tomorrow.');
assert.equal(C.plan('Remind Test Worker tomorrow to bring his table',s).kind,'clarify');
assert.equal(C.plan('Tell Test Worker to remind everyone to clock out at 5',s).kind,'message');
assert.deepEqual(C.plan("Tell Test Worker to bring Sample's table",s).targets.map(p=>p.id),['b']);
console.log('PASS direct recipient pronouns, admin my/I, future message content, other-person ownership, exact quotes and ambiguity checks');
