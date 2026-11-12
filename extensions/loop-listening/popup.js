async function render(){
  const config=await chrome.storage.local.get(['token','enabled','message']);
  document.getElementById('state').textContent=config.token?(config.message||'Connected'):'Connect this extension from your Loop profile.';
  const toggle=document.getElementById('toggle');toggle.hidden=!config.token;toggle.textContent=config.enabled?'Pause sharing':'Resume sharing';
}
document.getElementById('connect').onclick=()=>chrome.tabs.create({url:'https://attendance.esquilianoconsulting.com/?view=profile'});
document.getElementById('toggle').onclick=async()=>{await chrome.runtime.sendMessage({type:'toggle-sharing'});await render();};
chrome.storage.onChanged.addListener(render);render();
