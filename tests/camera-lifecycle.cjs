const fs=require('fs'),vm=require('vm'),assert=require('assert');
const source=fs.readFileSync(require('path').join(__dirname,'../app.js'),'utf8');
const close=source.slice(source.indexOf('function closeCamera(){'),source.indexOf('function clockFeedback('));
const start=source.slice(source.indexOf('async function startCamera(){'),source.indexOf("$('scanDialog').addEventListener('close'"));
let resolveRequest,requests=0,stops=0;const elements={camera:{srcObject:null,play:async()=>{}},scanMessage:{textContent:''}};
const ctx={cameraStream:null,cameraOpening:false,cameraGeneration:0,scanFrame:null,$:id=>elements[id],window:{isSecureContext:true},navigator:{mediaDevices:{getUserMedia:()=>{requests++;return new Promise(r=>resolveRequest=r)}}},cancelAnimationFrame(){},requestAnimationFrame(){return 1}};
vm.createContext(ctx);vm.runInContext(close+start,ctx);
const stream=()=>({getVideoTracks:()=>[{readyState:'live'}],getTracks:()=>[{stop(){stops++}}]});
(async()=>{const opening=ctx.startCamera();await ctx.startCamera();assert.equal(requests,1);resolveRequest(stream());await opening;await ctx.startCamera();assert.equal(requests,1);ctx.closeCamera();assert.equal(stops,1);const pending=ctx.startCamera();ctx.closeCamera();resolveRequest(stream());await pending;assert.equal(stops,2);assert.equal(elements.camera.srcObject,null);console.log('PASS no duplicate camera requests; closing scanner stops active and late-arriving streams')})().catch(e=>{console.error(e);process.exit(1)});
