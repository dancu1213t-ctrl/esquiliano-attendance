/* Loop's local sounds. System push sounds remain controlled by the device. */
window.LoopSounds=(()=>{
 let audio,ringTimer,last=0;const accounts=new Map();
 const read=()=>localStorage.getItem('esquiliano.loop.sounds')!=='off';
 function paint(){for(const b of document.querySelectorAll('[data-loop-sound]')){b.textContent=read()?'Loop sounds: On':'Loop sounds: Off';b.setAttribute('aria-pressed',String(read()))}}
 async function unlock(){try{if(!audio){const Audio=window.AudioContext||window.webkitAudioContext;if(Audio)audio=new Audio()}if(audio?.state==='suspended')await audio.resume()}catch{}}
 function tone(frequency,start,duration,volume=.07){
  if(!audio||audio.state!=='running'||!read())return;
  const oscillator=audio.createOscillator(),gain=audio.createGain(),time=audio.currentTime+start;
  oscillator.type='sine';oscillator.frequency.value=frequency;
  gain.gain.setValueAtTime(0,time);gain.gain.linearRampToValueAtTime(volume,time+.012);gain.gain.exponentialRampToValueAtTime(.001,time+duration);
  oscillator.connect(gain);gain.connect(audio.destination);oscillator.start(time);oscillator.stop(time+duration+.02);
 }
 function message(force=false){if(!read()||!force&&(document.hidden||Date.now()-last<1200))return;last=Date.now();tone(660,0,.14);tone(880,.12,.22)}
 function ring(){stop();const play=()=>{if(document.hidden||!read())return;tone(523,0,.24,.06);tone(659,.28,.24,.06);tone(784,.56,.3,.06)};play();ringTimer=setInterval(play,2500)}
 function stop(){clearInterval(ringTimer);ringTimer=null}
 document.addEventListener('pointerdown',unlock,{passive:true});
 document.addEventListener('keydown',unlock,{passive:true});
 document.addEventListener('click',async e=>{
  if(e.target.closest('[data-loop-sound]')){localStorage.setItem('esquiliano.loop.sounds',read()?'off':'on');paint();if(read()){await unlock();message(true)}else stop()}
  if(e.target.closest('[data-loop-sound-test]')){await unlock();if(read())message(true);else toast('Turn on Loop sounds first')}
 });
 function receive(note,id){
  const seen=accounts.get(id);if(seen?.has(note.id))return;
  if(seen)seen.add(note.id);
  if(note.actor_id===id&&/^Message from /i.test(note.title)||/^Incoming (voice|video) call/.test(note.title))return;
  if(Date.now()-Date.parse(note.created_at)<30000)message();
 }
 function observe(rows,id){
  if(!accounts.has(id)){accounts.set(id,new Set(rows.map(row=>row.id)));return}
  for(const note of rows)receive(note,id);
 }
 paint();return {unlock,message,ring,stop,receive,observe};
})();
