// Public, approved Apps Script snapshot only. No Google tokens in the browser.
export function validBridgeUrl(value) {
  try {
    const url=new URL(value);
    return url.protocol==='https:' && url.hostname==='script.google.com' &&
      /^\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(url.pathname) && !url.username && !url.password && !url.search && !url.hash;
  } catch { return false; }
}
export function validatePayload(data) {
  if(data?.version!==1 || !data.source || !Array.isArray(data.accounts) || data.accounts.length!==11 ||
    !['profiles','posts','samples','requests','queue'].every(k=>Array.isArray(data[k])) || !data.details)
    throw new Error('Invalid radar snapshot');
  if([...data.posts,...data.samples].some(p=>typeof p.id!=='string'||!/^\d+$/.test(p.id)))
    throw new Error('Unsafe post ID');
  return data;
}
export function getBridgeSnapshot(url,timeoutMs=25000) {
  if(!validBridgeUrl(url))return Promise.reject(new Error('Invalid Apps Script URL'));
  return new Promise((resolve,reject)=>{
    const script=document.createElement('script');
    const cleanup=()=>{clearTimeout(timer);script.remove();delete window.whollinRadarReceive;};
    const timer=setTimeout(()=>{cleanup();reject(new Error('Apps Script snapshot timeout'));},timeoutMs);
    window.whollinRadarReceive=payload=>{cleanup();try{resolve(validatePayload(payload));}catch(error){reject(error);}};
    script.onerror=()=>{cleanup();reject(new Error('Apps Script snapshot unavailable'));};
    script.src=url+'?callback=whollinRadarReceive';script.referrerPolicy='no-referrer';
    document.head.append(script);
  });
}
export async function loadRadarData() {
  const configResponse=await fetch('./config.json',{cache:'no-cache'});
  if(!configResponse.ok)throw new Error('Site connection config is missing');
  const config=await configResponse.json();
  let fallback=false;
  if(config.appsScriptUrl){
    try{return await getBridgeSnapshot(config.appsScriptUrl);}catch{fallback=true;}
  }
  const response=await fetch('./data.json',{cache:'no-cache'});
  if(!response.ok)throw new Error('Fallback data unavailable');
  const data=validatePayload(await response.json());
  if(fallback)data.source.bridgeFailed=true;
  return data;
}
