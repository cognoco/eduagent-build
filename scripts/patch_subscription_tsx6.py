import sys
sys.stdout.reconfigure(encoding='utf-8')

with open('apps/mobile/src/app/(app)/subscription.tsx', encoding='utf-8') as f:
    content = f.read()

original_len = len(content)
misses = []

def patch(old, new, label=''):
    global content
    if old in content:
        content = content.replace(old, new, 1)
        print(f'OK: {(label or old[:50])!r}')
        return True
    else:
        misses.append(label or old[:50])
        print(f'MISS: {(label or old[:50])!r}')
        return False

# The "no offerings" fallback text has two branches in a ternary:
# offeringsError ? `We could not load...` : `You're on the...`
# Both use TIER_LABELS and TIER_LIMITS

patch(
    "        {offeringsError\n                    ? `We could not load purchase options right now. You're on the ${TIER_LABELS[tier]} plan with ${TIER_LIMITS[tier]}.`\n                    : `You're on the ${TIER_LABELS[tier]} plan with ${TIER_LIMITS[tier]}. Here's what each plan includes — store purchasing isn't available on this device yet.`}",
    "        {offeringsError\n                    ? t('subscriptionScreen.plans.offeringsError', { tier: t(TIER_LABEL_KEYS[tier]), limits: t(TIER_LIMIT_KEYS[tier]) })\n                    : t('subscriptionScreen.plans.offeringsWebOnly', { tier: t(TIER_LABEL_KEYS[tier]), limits: t(TIER_LIMIT_KEYS[tier]) })}",
    'plans.offeringsError + offeringsWebOnly',
)

# Also need to check if "Current plan" section header placeholder got duplicated
# The patch in tsx5 adds t() call INSIDE the tag but doesn't close the tag, leaving a duplicate text
# Check what happened:
idx = content.find("currentPlan.sectionHeader")
if idx >= 0:
    print(f'Found currentPlan.sectionHeader at {idx}:')
    print(repr(content[max(0,idx-100):idx+300]))

print(f'\nOriginal: {original_len}, New: {len(content)}, Delta: {len(content) - original_len}')
if misses:
    print(f'MISSES ({len(misses)}): {misses}')
else:
    print('All patches applied!')

with open('apps/mobile/src/app/(app)/subscription.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
print('Written')
