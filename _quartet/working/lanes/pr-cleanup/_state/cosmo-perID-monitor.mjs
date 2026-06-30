// Per-ID WS-27 monitor (robust vs relation drift). Emits on Stage change + Executing-unclaimed alarm.
import {readFileSync,writeFileSync,existsSync} from 'fs';
const TOKEN=process.env.NOTION_TOKEN, DB='f170be9e-04ae-45d4-9618-28f2438666bd';
const WIS=[560,902,1059,1071,1075,1087,1132,1165,1166];
const STATE='_quartet/working/lanes/pr-cleanup/_state/.perID-seen.json';
const rt=p=>(p?.rich_text||[]).map(t=>t.plain_text).join('');
const sel=p=>p?.select?.name||p?.status?.name||'';
let seen=existsSync(STATE)?JSON.parse(readFileSync(STATE,'utf8')):{};
async function read(num){
  const r=await fetch(`https://api.notion.com/v1/databases/${DB}/query`,{method:'POST',headers:{Authorization:`Bearer ${TOKEN}`,'Notion-Version':'2022-06-28','Content-Type':'application/json'},body:JSON.stringify({filter:{property:'ID',unique_id:{equals:num}},page_size:1})});
  if(!r.ok)return null; const d=await r.json(); const p=d.results?.[0]?.properties; if(!p)return null;
  return {stage:sel(p['Stage']), claimed:rt(p['Claimed By']).trim()};
}
async function tick(){
  for(const n of WIS){
    const s=await read(n); if(!s)continue;
    const key=`WI-${n}`, prev=seen[key]||{};
    if(s.stage!==prev.stage){ console.log(`${new Date().toISOString()} ${key} Stage ${prev.stage||'?'} -> ${s.stage} (claimed='${s.claimed||'NONE'}')`); }
    // alarm: Executing with empty claim
    const alarm = s.stage==='Executing' && !s.claimed;
    if(alarm && !prev.alarm){ console.log(`${new Date().toISOString()} ALARM ${key} Executing+UNCLAIMED`); }
    seen[key]={stage:s.stage, claimed:s.claimed, alarm};
  }
  writeFileSync(STATE,JSON.stringify(seen,null,2));
}
// baseline (no emit) then loop
await tick();
console.log(`${new Date().toISOString()} per-ID monitor armed: ${WIS.length} WIs baselined`);
while(true){ await new Promise(r=>setTimeout(r,90000)); try{await tick();}catch(e){console.log(`${new Date().toISOString()} poll-error ${e.message}`);} }
