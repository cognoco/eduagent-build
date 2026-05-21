const fs=require('fs');
const {api,sleep,H2,P,LI,rt,DB}=require('./lib.cjs');
const wpmeta=require('./wpmeta.cjs');
const MENTOMATE='3658bce9-1f7c-8128-9f9b-fa7fcf75a13b';
const RUN='20260516050543-3902c61be7bd5834';
const findings=JSON.parse(fs.readFileSync('work/findings.json','utf8'));

const byFam={};
for(const f of findings){(byFam[f.family]=byFam[f.family]||[]).push(f);}

(async()=>{
  const created={};
  for(const fam of Object.keys(wpmeta)){
    const items=byFam[fam]||[];
    const hasP1=items.some(x=>x.severity==='HIGH'||x.severity==='HIGH_BUG');
    const prio=hasP1?'P1':'P2';
    const m=wpmeta[fam];
    const files=[...new Set(items.map(x=>x.filePath))];
    const sevCount=items.reduce((a,x)=>{a[x.severity]=(a[x.severity]||0)+1;return a;},{});
    const sevStr=Object.entries(sevCount).map(([k,v])=>k+':'+v).join(', ');
    const children=[
      H2('Bundle Rationale'),P(m.rationale),
      H2('Strategy'),P(m.strategy),
      H2('Scope'),P('In scope: '+items.length+' DeepSec findings across '+files.length+' files. See child Items (Sub-items) for the file list.'),
      P('Out of scope: any change beyond remediating the listed findings; broader refactors.'),
      H2('Findings'),P(items.length+' child Items, severity breakdown: '+sevStr+'. Each child links to its DeepSec finding via the Found In field and the DS-NNN traceability index.'),
      H2('Acceptance Criteria'),
      LI('All '+items.length+' child Items individual ACs met'),
      LI('No new lint / type errors introduced'),
      LI('Affected paths have updated/regression test coverage'),
      LI('A re-scan (deepsec) of the affected files reports no recurrence of these vulnerability classes'),
      H2('Risk & Blast Radius'),
      P('Risk class: '+(items.length>20?'risky':'standard')+'. Reason: bundle spans '+files.length+' files; provisional grouping — likely sub-divided into PR-sized packages during refinement.'),
      H2('Notes'),
      P('Provisional Work Package created from the DeepSec scan of 2026-05-16 (run '+RUN+'). Grouped by vulnerability family; final PR-sizing and Execution Path classification happen during triage/refinement.'),
    ];
    const props={
      'Name':{title:rt(m.name)},
      'Description':{rich_text:rt('DeepSec remediation bundle — '+fam+' ('+items.length+' findings)')},
      'Layer':{select:{name:'WP'}},
      'Type':{select:{name:'Bug'}},
      'Priority':{select:{name:prio}},
      'Tags':{multi_select:[{name:'security'}]},
      'Stage':{select:{name:'Captured'}},
      'State':{select:{name:'Active'}},
      'Execution Path':{select:{name:'Unset'}},
      'Project':{relation:[{id:MENTOMATE}]},
      'Found In':{rich_text:rt('DeepSec scan '+RUN+' (2026-05-16) — family '+fam+', '+items.length+' findings')},
    };
    if(prio==='P1') props['Risk/Impact']={rich_text:rt('Security bundle with '+(sevCount.HIGH||0)+' HIGH and '+(sevCount.HIGH_BUG||0)+' HIGH_BUG findings; '+m.rationale.slice(0,300))};
    const page=await api('POST','/pages',{parent:{database_id:DB},properties:props,children});
    const uid=page.properties.ID?.unique_id||{};
    created[fam]={pageId:page.id,url:page.url,wi:(uid.prefix||'WI')+'-'+uid.number,count:items.length,prio};
    console.log(created[fam].wi,fam,'('+items.length+')',prio);
    await sleep(380);
  }
  fs.writeFileSync('work/created-wps.json',JSON.stringify(created,null,2));
  console.log('WPs created:',Object.keys(created).length);
})().catch(e=>{console.error('FATAL',e.message);process.exit(1);});
