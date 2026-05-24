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
        print(f'OK: {label or old[:60]!r}')
    else:
        misses.append(label or old[:60])
        print(f'MISS: {label or old[:60]!r}')

# Fix 1: "Current plan" section header - left as comment placeholder + raw text
patch(
    '{/* sectionHeader rendered below */}\n            Current plan',
    "{t('subscriptionScreen.currentPlan.sectionHeader')}",
    'currentPlan.sectionHeader',
)

# Fix 2: Cancellation notice title
patch(
    '                Subscription ending\n              </Text>',
    "                {t('subscriptionScreen.cancellationNotice.title')}\n              </Text>",
    'cancellationNotice.title',
)

# Fix 3: Cancellation notice body - complex template with date
patch(
    """                Your subscription has been cancelled. You can continue using all
                features until{' '}
                {new Date(subscription.currentPeriodEnd).toLocaleDateString(
                  undefined,
                  { year: 'numeric', month: 'long', day: 'numeric' },
                )}
                . After that, your account will revert to the Free tier.""",
    """                {t('subscriptionScreen.cancellationNotice.body', {
                  date: new Date(subscription.currentPeriodEnd).toLocaleDateString(
                    undefined,
                    { year: 'numeric', month: 'long', day: 'numeric' },
                  ),
                })}""",
    'cancellationNotice.body',
)

# Fix 4: "Check later" platformAlert title in top-up section (the topUpPollTimeout branch)
patch(
    "                    platformAlert(\n                      'Check later',\n                      'Credits will appear shortly — tap refresh to check.',\n                    );",
    "                    platformAlert(\n                      t('subscriptionScreen.alerts.topUpCheckLaterTitle'),\n                      t('subscriptionScreen.alerts.topUpCheckLaterBody'),\n                    );",
    'topUpCheckLater alert',
)

# Fix 5: Opens App Store / Opens Google Play
patch(
    "                      ? 'Opens App Store subscriptions'\n                      : 'Opens Google Play subscriptions'",
    "                      ? t('subscriptionScreen.manageBilling.opensAppStore')\n                      : t('subscriptionScreen.manageBilling.opensGooglePlay')",
    'opensAppStore/opensGooglePlay',
)

print(f'\nOriginal: {original_len}, New: {len(content)}, Delta: {len(content) - original_len}')
if misses:
    print('MISSES:', misses)
else:
    print('All patches applied successfully')

with open('apps/mobile/src/app/(app)/subscription.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
print('Written')
