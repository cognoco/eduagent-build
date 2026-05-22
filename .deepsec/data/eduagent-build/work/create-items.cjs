const fs=require('fs');
const {api,sleep,H2,P,LI,rt,DB}=require('./lib.cjs');
const MENTOMATE='3658bce9-1f7c-8128-9f9b-fa7fcf75a13b';
const RUN='20260516050543-3902c61be7bd5834';
const findings=JSON.parse(fs.readFileSync('work/findings.json','utf8'));
const wps=JSON.parse(fs.readFileSync('work/created-wps.json','utf8'));
const out=fs.existsSync('work/created-items.json')?JSON.parse(fs.readFileSync('work/created-items.json','utf8')):{};

const prioOf=s=>(s==='HIGH'||s==='HIGH_BUG')?'P1':'P2';
const firstSentence=t=>{const m=t.match(/^.*?[.!?](\s|$)/);return (m?m[0]:t).trim();};

(async()=>{
  let done=0,fail=0;
  for(const f of findings){
    if(out[f.ds]){done++;continue;}
    const lines=(f.lineNumbers||[]).join(', ');
    const prio=prioOf(f.severity);
    const wp=wps[f.family];
    const foundIn='DeepSec scan '+RUN+' (2026-05-16) · '+f.filePath+':'+lines+' · '+f.vulnSlug+' · '+f.ds;
    const children=[
      H2('Brief'),P(f.description),
      H2('Recommended remediation'),P(f.recommendation),
      H2('DeepSec finding'),
      LI('Finding ID: '+f.ds),
      LI('Scan run: '+RUN+' (2026-05-16, deepsec process / gpt-5.5)'),
      LI('File: '+f.filePath+(lines?' — lines '+lines:'')),
      LI('Vulnerability class: '+f.vulnSlug),
      LI('Severity: '+f.severity+' · Confidence: '+f.confidence),
      H2('Notes'),
      P('Captured from the DeepSec scan artefact .deepsec/data/eduagent-build/reports/report.json. Part of bundle '+wp.wi+' ('+f.family+'). Acceptance Criteria and Execution Path are set during triage/refinement.'),
    ];
    const props={
      'Name':{title:rt(f.title)},
      'Description':{rich_text:rt(f.vulnSlug+' · '+f.filePath+(lines?' (lines '+lines+')':''))},
      'Layer':{select:{name:'Item'}},
      'Type':{select:{name:'Bug'}},
      'Priority':{select:{name:prio}},
      'Tags':{multi_select:[{name:'security'}]},
      'Stage':{select:{name:'Captured'}},
      'State':{select:{name:'Active'}},
      'Execution Path':{select:{name:'Unset'}},
      'Project':{relation:[{id:MENTOMATE}]},
      'Parent item':{relation:[{id:wp.pageId}]},
      'Found In':{rich_text:rt(foundIn)},
    };
    if(prio==='P1') props['Risk/Impact']={rich_text:rt(f.severity+' severity, '+f.confidence+' confidence. '+firstSentence(f.description))};
    try{
      const page=await api('POST','/pages',{parent:{database_id:DB},properties:props,children});
      const uid=page.properties.ID?.unique_id||{};
      out[f.ds]={wi:(uid.prefix||'WI')+'-'+uid.number,pageId:page.id,url:page.url,family:f.family,wp:wp.wi,severity:f.severity,prio,filePath:f.filePath,slug:f.vulnSlug,title:f.title};
      done++;
      if(done%20===0){fs.writeFileSync('work/created-items.json',JSON.stringify(out,null,2));console.log('progress '+done+'/236');}
    }catch(e){fail++;console.error('FAIL '+f.ds+': '+e.message);}
    await sleep(360);
  }
  fs.writeFileSync('work/created-items.json',JSON.stringify(out,null,2));
  console.log('DONE created='+done+' failed='+fail+' total='+Object.keys(out).length);
})().catch(e=>{fs.writeFileSync('work/created-items.json',JSON.stringify(out,null,2));console.error('FATAL',e.message);process.exit(1);});
