const TOKEN = process.env.NT;
const DB = 'f170be9e04ae45d4961828f2438666bd';
const NV = '2022-06-28';
const sleep = ms => new Promise(r=>setTimeout(r,ms));
async function api(method, path, body){
  for(let attempt=0;attempt<6;attempt++){
    const res = await fetch('https://api.notion.com/v1'+path,{
      method, headers:{Authorization:'Bearer '+TOKEN,'Notion-Version':NV,'Content-Type':'application/json'},
      body: body?JSON.stringify(body):undefined});
    if(res.status===429){ const ra=+(res.headers.get('retry-after')||2); await sleep(ra*1000); continue; }
    const j = await res.json();
    if(!res.ok){ if(res.status>=500){ await sleep(1500); continue; } throw new Error(method+' '+path+' -> '+res.status+' '+JSON.stringify(j)); }
    return j;
  }
  throw new Error('retries exhausted '+method+' '+path);
}
const H2 = t => ({object:'block',type:'heading_2',heading_2:{rich_text:[{type:'text',text:{content:t.slice(0,2000)}}]}});
const P  = t => ({object:'block',type:'paragraph',paragraph:{rich_text:[{type:'text',text:{content:(t||'—').slice(0,2000)}}]}});
const LI = t => ({object:'block',type:'bulleted_list_item',bulleted_list_item:{rich_text:[{type:'text',text:{content:t.slice(0,2000)}}]}});
const rt = t => t?[{type:'text',text:{content:t.slice(0,2000)}}]:[];
module.exports = {api,sleep,H2,P,LI,rt,DB};
