window.addEventListener('message',async event=>{
  if(event.source!==window||event.origin!==location.origin)return;
  const message=event.data;
  if(!message||!['loop-music-ping','loop-music-connect'].includes(message.type))return;
  try{
    const response=await chrome.runtime.sendMessage(message.type==='loop-music-ping'?{type:'installed'}:{type:'pair',token:message.token});
    window.postMessage({type:message.type==='loop-music-ping'?'loop-music-ready':'loop-music-connected',request:message.request,...response},location.origin);
  }catch{
    window.postMessage({type:'loop-music-connected',request:message.request,ok:false,error:'Reload this page after installing the extension.'},location.origin);
  }
});
