const assert=require('assert'),W=require('../staff-week.js');
const e=(id,action,time)=>({id,action,happened_at:time});
assert.equal(W.monday('2026-11-08'),'2026-11-02');assert.equal(W.addDays('2026-12-31',1),'2027-01-01');
const records=[e('1','IN','2026-11-02T14:00:00Z'),e('2','OUT','2026-11-02T18:00:00Z'),e('3','IN','2026-11-02T19:00:00Z'),e('4','OUT','2026-11-02T23:00:00Z'),e('5','IN','2026-11-04T04:00:00Z'),e('6','OUT','2026-11-04T08:00:00Z'),e('7','IN','2026-11-05T14:00:00Z')];
const shifts=W.pair([...records].reverse());assert.equal(shifts.length,4);assert.equal(shifts[3].out,null);
const day=Date.parse('2026-11-02T06:00:00Z');assert.equal(shifts.reduce((sum,s)=>sum+W.minutes(s,day,day+864e5),0),480);
const night=shifts[2],tuesday=Date.parse('2026-11-03T06:00:00Z');assert.equal(W.minutes(night,tuesday,tuesday+864e5),120);assert.equal(W.minutes(night,tuesday+864e5,tuesday+2*864e5),120);assert.equal(W.minutes(shifts[3],0,Date.now()),0);assert.equal(W.duration(480),'8h');assert.equal(W.duration(90),'1h 30m');
console.log('PASS weekly dates, split shifts, breaks, overnight allocation and exclusion of open shifts from confirmed hours');

const fs=require('fs'),vm=require('vm'),path=require('path');
const code=fs.readFileSync(path.join(__dirname,'../staff.js'),'utf8');
const fn=code.slice(code.indexOf('function durationToTime()'),code.indexOf('async function save('));
const inputs={staffStart:{value:'2026-11-03T08:00:00'},staffDuration:{value:'7.51'},staffEnd:{value:''}};
const ctx={el:id=>inputs[id],Date,Number,Math};vm.createContext(ctx);vm.runInContext(fn,ctx);ctx.durationToTime();assert.equal(inputs.staffEnd.value,'2026-11-03T15:30:36');
console.log('PASS decimal hours preserve exact shift duration');

