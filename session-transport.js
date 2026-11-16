/* Keep protected requests authenticated, including after laptop sleep and reconnects. */
(function(root){
 function create(getClient,{fetchImpl=root.fetch.bind(root),onMissing=()=>{},now=()=>Date.now()}={}){
  let recovery=null,missing=false;
  async function session(force=false){
   if(recovery)return recovery;
   recovery=(async()=>{
    const client=getClient();if(!client)throw Error('Sign in again to continue.');
    const result=force?await client.auth.refreshSession():await client.auth.getSession();
    if(result.error)throw result.error;
    const value=result.data?.session;
    if(!value?.access_token){if(!missing){missing=true;onMissing()}throw Error('Your session ended. Please sign in again.')}
    missing=false;
    if(!force&&value.expires_at&&value.expires_at*1000<=now()+30000){
     const renewed=await client.auth.refreshSession();if(renewed.error)throw renewed.error;
     if(!renewed.data?.session?.access_token){if(!missing){missing=true;onMissing()}throw Error('Your session ended. Please sign in again.')}
     return renewed.data.session;
    }
    return value;
   })();
   try{return await recovery}finally{recovery=null}
  }
  return async function(input,init){
   const url=new URL(typeof input==='string'?input:input.url);
   // Auth calls must bypass the guard: refreshSession itself uses this fetch.
   if(!/\/(rest|functions|storage)\/v1(?:\/|$)/.test(url.pathname)||url.pathname.includes('/object/public/'))return fetchImpl(input,init);
   const active=await session();
   const headers=new Headers(init?.headers||(typeof input==='object'?input.headers:undefined));
   headers.set('Authorization','Bearer '+active.access_token);
   const options={...init,headers};
   let response=await fetchImpl(input,options);
   if(response.status===401){
    const next=await session(true);
    // Only retry a rejected request when refresh produced a different token.
    if(next.access_token!==active.access_token){headers.set('Authorization','Bearer '+next.access_token);response=await fetchImpl(input,{...init,headers})}
   }
   return response;
  };
 }
 root.SessionTransport={create};
 if(typeof module==='object'&&module.exports)module.exports={create};
})(typeof window==='object'?window:globalThis);
