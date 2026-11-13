const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
class Element {
 constructor(){this.children=[];this.open=false;this.classList={add(){},remove(){},toggle(){}};this.attrs={};}
 set innerHTML(v){this.html=v;for(const match of v.matchAll(/id="([^"]+)"/g))elements.set(match[1],new Element());}
 set id(v){this._id=v;elements.set(v,this)} get id(){return this._id}
 append(...nodes){this.children.push(...nodes)} before(){} setAttribute(k,v){this.attrs[k]=v} addEventListener(){} querySelectorAll(){return this.children}
 replaceChildren(...nodes){this.children=nodes} showModal(){this.open=true} close(){this.open=false} play(){return Promise.resolve()}
}
let elements,stopped,callRow,denied,starts,intervals,toast,signals,connections;
function setup(){
 elements=new Map();stopped=0;starts=0;intervals=[];callRow=null;denied=false;signals=[];connections=[];
 const tracks=[{kind:'audio',enabled:true,stop(){stopped++}},{kind:'video',enabled:true,stop(){stopped++}}];
 const stream={getTracks:()=>tracks,getAudioTracks:()=>[tracks[0]],getVideoTracks:()=>[tracks[1]]};
 const document={body:new Element(),getElementById:id=>{if(!elements.has(id))elements.set(id,new Element());return elements.get(id)},createElement:()=>new Element(),addEventListener(){},hidden:false};
 const rpc=async(name,args)=>{
  if(name==='loop_call_start'){starts++;callRow={id:args.request_id,caller_id:'me',callee_id:args.target,video:args.video_call,state:'ringing',caller_device:args.device};return {data:callRow}}
  if(name==='loop_call_poll')return {data:{active:callRow,history:[],signals:callRow?.state==='accepted'?[{id:1,kind:'ice',payload:{candidate:'candidate'}},{id:2,kind:'answer',payload:{type:'answer',sdp:'answer'}}]:[]}};
  if(name==='loop_call_signal'){signals.push(args);return {data:null}}
  if(name==='loop_call_action'){callRow={...callRow,state:args.action==='end'?'ended':args.action==='fail'?'failed':callRow.state};return {data:callRow}}
  return {data:[]};
 };
 class Peer{constructor(){connections.push(this);this.candidates=[]}addTrack(){}close(){this.closed=true}async createOffer(){return {type:'offer',sdp:'offer'}}async setLocalDescription(s){this.localDescription=s}async setRemoteDescription(s){this.remoteDescription=s}async addIceCandidate(c){assert.ok(this.remoteDescription,'ICE must wait for remote SDP');this.candidates.push(c)}}
 const context={console,document,RTCPeerConnection:Peer,MediaStream:class{constructor(){this.tracks=[]}getTracks(){return this.tracks}addTrack(t){this.tracks.push(t)}},preview:false,cfg:{},currentProfile:()=>({id:'me'}),clientForProfile:()=>({rpc,functions:{invoke:async()=>({})}}),navigator:{onLine:true,mediaDevices:{getUserMedia:async()=>{if(denied)throw Object.assign(new Error(),{name:'NotAllowedError'});return stream}}},crypto:{randomUUID:()=> 'device-id'},sessionStorage:{getItem:()=>null,setItem(){}},initAvatar(){},toast:m=>toast=m,LoopSounds:{unlock:async()=>{},stop(){},ring(){}},setInterval:fn=>intervals.push(fn),setTimeout:()=>1,clearTimeout(){},queueMicrotask:fn=>fn()};
 context.window={isSecureContext:true,RTCPeerConnection:class{},addEventListener(){}};
 vm.runInNewContext(fs.readFileSync(require.resolve('../loop-calls.js'),'utf8'),context);
 return context.window.LoopCalls;
}
(async()=>{
 let api=setup();await api.start({id:'them',name:'Colleague'},true);
 assert.equal(starts,1);assert.equal(elements.get('loopCallDialog').open,true);
 callRow.state='accepted';intervals[0]();await new Promise(resolve=>setImmediate(resolve));
 assert.equal(connections.length,1);assert.equal(signals[0].signal_kind,'offer');assert.equal(connections[0].remoteDescription.type,'answer');assert.equal(connections[0].candidates.length,1);
 const mute=elements.get('loopCallMute');mute.onclick();assert.equal(mute.attrs['aria-label'],'Unmute microphone');
 await elements.get('loopCallEnd').onclick();assert.equal(stopped,2,'both devices stop on hangup');assert.equal(callRow.state,'ended');
 api=setup();denied=true;await api.start({id:'them',name:'Colleague'},false);
 assert.equal(starts,0,'denied microphone never rings another employee');
 assert.match(elements.get('loopCallError').textContent,/Allow microphone/);
 console.log('PASS: voice/video request, SDP offer/answer, queued ICE, mute, hangup releases tracks, permission denial avoids placing call');
})().catch(e=>{console.error(e);process.exitCode=1});

