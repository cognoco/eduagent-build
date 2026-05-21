const fs=require('fs');
const {api,sleep,H2,LI}=require('./lib.cjs');
const findings=JSON.parse(fs.readFileSync('work/findings.json','utf8'));
const wps=JSON.parse(fs.readFileSync('work/created-wps.json','utf8'));
const items=JSON.parse(fs.readFileSync('work/created-items.json','utf8'));

(async()=>{
  // 1. Backfill each WP body with a child-item list
  const byFam={};
  for(const f of findings){const it=items[f.ds];if(it)(byFam[f.family]=byFam[f.family]||[]).push({...it,ds:f.ds});}
  for(const [fam,wp] of Object.entries(wps)){
    const kids=(byFam[fam]||[]).sort((a,b)=>a.ds.localeCompare(b.ds));
    const blocks=[H2('Child Items')];
    for(const k of kids) blocks.push(LI(k.wi+' · '+k.ds+' · '+k.severity+' · '+k.prio+' · '+k.title+' — '+k.filePath));
    for(let i=0;i<blocks.length;i+=90){
      await api('PATCH','/blocks/'+wp.pageId+'/children',{children:blocks.slice(i,i+90)});
      await sleep(380);
    }
    console.log('backfilled '+wp.wi+' '+fam+' ('+kids.length+')');
  }
  // 2. Traceability index
  const rows=findings.map(f=>{const it=items[f.ds]||{};return {ds:f.ds,wi:it.wi||'(missing)',wp:it.wp||wps[f.family]?.wi||'',sev:f.severity,prio:it.prio||'',slug:f.vulnSlug,file:f.filePath,lines:(f.lineNumbers||[]).join(' '),title:f.title};});
  let md='# DeepSec → ZDX Work Item traceability index\n\n';
  md+='Scan run `20260516050543-3902c61be7bd5834` (2026-05-16). '+rows.length+' findings → '+Object.keys(items).length+' Items under '+Object.keys(wps).length+' Work Packages in the ZDX Work Items DB.\n\n';
  md+='## Work Packages\n\n| WP | Family | Items | Priority |\n|---|---|---|---|\n';
  for(const [fam,wp] of Object.entries(wps)) md+='| '+wp.wi+' | '+fam+' | '+wp.count+' | '+wp.prio+' |\n';
  md+='\n## Findings\n\n| DS | WI | WP | Severity | Priority | Class | File | Lines | Title |\n|---|---|---|---|---|---|---|---|---|\n';
  for(const r of rows) md+='| '+r.ds+' | '+r.wi+' | '+r.wp+' | '+r.sev+' | '+r.prio+' | '+r.slug+' | `'+r.file+'` | '+r.lines+' | '+r.title.replace(/\|/g,'\\|')+' |\n';
  fs.writeFileSync('deepsec-to-wi-map.md',md);
  console.log('index written: deepsec-to-wi-map.md ('+rows.length+' rows)');
  const missing=rows.filter(r=>r.wi==='(missing)');
  console.log('missing items: '+missing.length+(missing.length?' -> '+missing.map(m=>m.ds).join(','):''));
})().catch(e=>{console.error('FATAL',e.message);process.exit(1);});
