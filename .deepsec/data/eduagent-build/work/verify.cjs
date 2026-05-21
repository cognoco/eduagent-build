const fs=require('fs');
const {api,sleep}=require('./lib.cjs');
const DB='f170be9e04ae45d4961828f2438666bd';
const items=JSON.parse(fs.readFileSync('work/created-items.json','utf8'));
const wps=JSON.parse(fs.readFileSync('work/created-wps.json','utf8'));
(async()=>{
  // sample 8 item pages + all WPs, check Validity formula + Found In
  const sampleIds=Object.values(items).slice(0,6).map(x=>x.pageId)
    .concat(Object.values(wps).slice(0,3).map(x=>x.pageId));
  let bad=0;
  for(const id of sampleIds){
    const p=await api('GET','/pages/'+id);
    const v=p.properties['Validity']?.formula?.string||'(none)';
    const fi=p.properties['Found In']?.rich_text?.map(r=>r.plain_text).join('')||'';
    const uid=p.properties.ID?.unique_id||{};
    const ok=v.includes('Valid')&&fi.includes('DeepSec');
    if(!ok)bad++;
    console.log((uid.prefix+'-'+uid.number).padEnd(8),'Validity='+v.slice(0,30).padEnd(30),'FoundIn='+(fi?'yes':'NO'));
    await sleep(360);
  }
  console.log('sample issues: '+bad);
  console.log('items='+Object.keys(items).length+' wps='+Object.keys(wps).length);
})().catch(e=>{console.error('FATAL',e.message);process.exit(1);});
