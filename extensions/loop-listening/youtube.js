function notify(){chrome.runtime.sendMessage({type:'playback-changed'}).catch(()=>{});}
document.addEventListener('play',notify,true);
document.addEventListener('pause',notify,true);
document.addEventListener('ended',notify,true);
document.addEventListener('yt-navigate-finish',notify);
chrome.runtime.onMessage.addListener((message,sender,respond)=>{
  if(message.type!=='read-track')return;
  const video=document.querySelector('video');
  const id=new URL(location.href).searchParams.get('v');
  if(!video||video.paused||video.ended||!id||!/^[a-zA-Z0-9_-]{11}$/.test(id)){respond({playing:false});return;}
  const ad=!!document.querySelector('.ad-showing');
  const title=(document.querySelector('ytmusic-player-bar .title')?.textContent||
    document.querySelector('ytd-watch-metadata h1 yt-formatted-string')?.textContent||
    document.querySelector('h1.ytd-watch-metadata')?.textContent||
    document.title.replace(/ - YouTube(?: Music)?$/,'')).trim().slice(0,200);
  respond({playing:!ad&&!!title,id,title});
});
