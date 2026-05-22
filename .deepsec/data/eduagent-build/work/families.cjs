const fs = require('fs');
const findings = JSON.parse(fs.readFileSync('work/findings.json','utf8'));

// family key -> {slug list}
const fam = {
  'WP-ACL':   ['acl-check','missing-auth','auth-bypass','other-guard-bypass','other-stale-authorization','other-stale-instance-action'],
  'WP-XTEN':  ['cross-tenant-id'],
  'WP-COST':  ['expensive-api-abuse','rate-limit-bypass','other-resource-exhaustion','other-quota-accounting'],
  'WP-RACE':  ['other-race-condition','other-atomicity-bug','other-non-atomic-persistence','other-non-atomic-consent-delete','other-state-corruption','other-session-state-corruption','other-settings-state-corruption','other-state-integrity','other-event-ordering'],
  'WP-LLM':   ['other-prompt-injection','other-llm-prompt-injection','other-llm-system-prompt-injection','other-prompt-injection-bypass','other-llm-state-injection','other-llm-state-integrity','other-llm-output-validation','other-llm-prompt-privilege-escalation','other-safety-filter-bypass','other-fragile-llm-parsing','other-markdown-link-injection'],
  'WP-CONSENT':['other-consent-bypass','other-consent-gate-bypass','other-consent-withdrawal-processing','other-expired-consent-link','other-privacy-control-bypass','other-privacy-preference-bypass','other-age-gate-bypass','other-coppa-age-boundary'],
  'WP-CICD':  ['other-ci-supply-chain','github-workflow-security','secrets-exposure','other-supply-chain','other-ci-pwn-request','secret-in-log'],
  'WP-LOGIC': ['other-logic-bug','other-cleanup-logic','other-false-success','other-silent-fallback'],
  'WP-DATA':  ['other-data-loss','other-data-deletion','other-durable-job-loss','other-dropped-background-events','other-stale-workflow-data-loss','other-worker-db-pool-lifecycle','other-production-outage','other-deploy-migration-drift'],
  'WP-WEBHOOK':['other-webhook-auth-misconfiguration','other-webhook-auth-wall','other-billing-bypass','other-duplicate-submission','other-duplicate-submit','other-account-takeover'],
  'WP-DISCLOSE':['other-info-disclosure','other-internal-state-disclosure'],
  'WP-INPUT': ['path-traversal','other-csv-injection','other-parameter-pollution-runtime-crash','other-nonfinite-numeric-corruption','insecure-crypto'],
  'WP-SCORE': ['other-score-inflation','other-score-tampering','other-progress-integrity'],
  'WP-STALE': ['other-stale-state','other-stale-cache','other-stale-async-result','other-navigation-state-loss','other-archived-profile-notification','other-audit-bypass'],
};
const slug2fam = {};
for (const [f,slugs] of Object.entries(fam)) for (const s of slugs) slug2fam[s]=f;

const counts = {};
const unmapped = [];
for (const x of findings) {
  const f = slug2fam[x.vulnSlug];
  if (!f) unmapped.push(x.vulnSlug);
  x.family = f || 'UNMAPPED';
  counts[x.family] = (counts[x.family]||0)+1;
}
fs.writeFileSync('work/findings.json', JSON.stringify(findings,null,2));
console.log('family counts:');
for (const [k,v] of Object.entries(counts).sort((a,b)=>b[1]-a[1])) console.log('  '+k+': '+v);
console.log('total mapped:', findings.length - (counts.UNMAPPED||0), 'unmapped slugs:', [...new Set(unmapped)]);
