import sys
sys.stdout.reconfigure(encoding='utf-8')

with open('apps/mobile/src/app/(app)/subscription.tsx', encoding='utf-8') as f:
    content = f.read()

original_len = len(content)
patches = []

# --- Header back/title ---
patches.append((
    '          accessibilityLabel="Go back"\n          accessibilityRole="button"\n        >\n          <Text className="text-primary text-body font-semibold">Back</Text>\n        </Pressable>\n        <Text className="text-h2 font-bold text-text-primary">\n          Subscription\n        </Text>',
    '          accessibilityLabel={t(\'subscriptionScreen.backAccessibilityLabel\')}\n          accessibilityRole="button"\n        >\n          <Text className="text-primary text-body font-semibold">{t(\'subscriptionScreen.back\')}</Text>\n        </Pressable>\n        <Text className="text-h2 font-bold text-text-primary">\n          {t(\'subscriptionScreen.title\')}\n        </Text>',
))

# --- Loading error text ---
patches.append((
    '          <Text className="text-body text-text-secondary text-center mb-4">\n            Unable to load subscription details. Please try again.\n          </Text>',
    '          <Text className="text-body text-text-secondary text-center mb-4">\n            {t(\'subscriptionScreen.loading.error\')}\n          </Text>',
))

# --- Retry button accessibilityLabel and text ---
patches.append((
    '            testID="subscription-retry-button"\n            accessibilityLabel="Retry loading subscription"\n            accessibilityRole="button"',
    '            testID="subscription-retry-button"\n            accessibilityLabel={t(\'subscriptionScreen.loading.retryAccessibilityLabel\')}\n            accessibilityRole="button"',
))
patches.append((
    '              <Text className="text-text-inverse text-body font-semibold">\n                Retry\n              </Text>',
    '              <Text className="text-text-inverse text-body font-semibold">\n                {t(\'subscriptionScreen.loading.retry\')}\n              </Text>',
))

# --- Current plan section header ---
patches.append((
    '          {/* Current plan */}\n          <Text className="text-body-sm font-semibold text-text-primary opacity-70 tracking-wide mb-2 mt-4">',
    '          {/* Current plan */}\n          <Text className="text-body-sm font-semibold text-text-primary opacity-70 tracking-wide mb-2 mt-4">\n            {/* sectionHeader rendered below */}',
))

with open('apps/mobile/src/app/(app)/subscription.tsx', encoding='utf-8') as f:
    content = f.read()

# Apply all patches
for old, new in patches:
    if old in content:
        content = content.replace(old, new)
        print(f'OK: patched {old[:50]!r}')
    else:
        print(f'MISS: {old[:60]!r}')

# Now do bulk replacements using simpler patterns
replacements = [
    # Current plan section header text node
    ('opacity-70 tracking-wide mb-2 mt-4">\n            Current plan', 'opacity-70 tracking-wide mb-2 mt-4">\n            {t(\'subscriptionScreen.currentPlan.sectionHeader\')}'),
    # Status badges
    ("? 'Cancelling'\n                    : status === 'past_due'\n                      ? 'Past due'\n                      : status === 'expired'\n                        ? 'Expired'\n                        : status === 'trial'\n                          ? t('subscription.statusBadge.trial')\n                          : 'Active'",
     "? t('subscriptionScreen.currentPlan.statusCancelling')\n                    : status === 'past_due'\n                      ? t('subscriptionScreen.currentPlan.statusPastDue')\n                      : status === 'expired'\n                        ? t('subscriptionScreen.currentPlan.statusExpired')\n                        : status === 'trial'\n                          ? t('subscription.statusBadge.trial')\n                          : t('subscriptionScreen.currentPlan.statusActive')"),
    # Tier label display (uses TIER_LABELS -> now use t())
    ('                {TIER_LABELS[tier]}', '                {t(TIER_LABEL_KEYS[tier])}'),
    # Tier limits display
    ('              {TIER_LIMITS[tier]}', '              {t(TIER_LIMIT_KEYS[tier])}'),
    # Access until / Renews date
    ("                  ? `Access until ${new Date(\n                      subscription.currentPeriodEnd,\n                    ).toLocaleDateString(undefined, {\n                      year: 'numeric',\n                      month: 'long',\n                      day: 'numeric',\n                    })}`\n                  : `Renews ${new Date(\n                      subscription.currentPeriodEnd,\n                    ).toLocaleDateString(undefined, {\n                      year: 'numeric',\n                      month: 'long',",
     "                  ? t('subscriptionScreen.currentPlan.accessUntil', { date: new Date(\n                      subscription.currentPeriodEnd,\n                    ).toLocaleDateString(undefined, {\n                      year: 'numeric',\n                      month: 'long',\n                      day: 'numeric',\n                    }) })\n                  : t('subscriptionScreen.currentPlan.renews', { date: new Date(\n                      subscription.currentPeriodEnd,\n                    ).toLocaleDateString(undefined, {\n                      year: 'numeric',\n                      month: 'long',"),
    # Upgrade button
    ('                  <Text className="text-body font-semibold text-text-inverse">\n                    Upgrade\n                  </Text>',
     '                  <Text className="text-body font-semibold text-text-inverse">\n                    {t(\'subscriptionScreen.currentPlan.upgradeButton\')}\n                  </Text>'),
    # Upgrade accessibilityLabel
    ('                  accessibilityLabel="Upgrade plan"',
     "                  accessibilityLabel={t('subscriptionScreen.currentPlan.upgradeAccessibilityLabel')}"),
    # Cancellation notice
    ('                <Text className="text-body-sm font-semibold text-warning">\n                  Subscription ending\n                </Text>',
     '                <Text className="text-body-sm font-semibold text-warning">\n                  {t(\'subscriptionScreen.cancellationNotice.title\')}\n                </Text>'),
    # Usage section header
    ('                  Usage this month\n                </Text>',
     "                  {t('subscriptionScreen.usage.sectionHeader')}\n                </Text>"),
    # Daily usage inline
    ("                      Today: {usage.usedToday} / {usage.dailyLimit} daily\n                        questions",
     "                      {t('subscriptionScreen.usage.dailyQuestions', { used: usage.usedToday, limit: usage.dailyLimit })}"),
    # Top-up credits remaining
    ('                      + {usage.topUpCreditsRemaining} top-up credits remaining',
     "{t('subscriptionScreen.usage.topUpCreditsRemaining', { count: usage.topUpCreditsRemaining })}"),
    # Your share / Your usage
    ("? 'Your share'\n                              : row.is_self\n                                ? 'Your usage'",
     "? t('subscriptionScreen.usage.yourShare')\n                              : row.is_self\n                                ? t('subscriptionScreen.usage.yourUsage')"),
    # questions count
    ('                            {row.used} questions',
     "{t('subscriptionScreen.usage.questionsCount', { count: row.used })}"),
    # Family aggregate label
    ('                          Family aggregate\n                          </Text>',
     "{t('subscriptionScreen.usage.familyAggregate')}\n                          </Text>"),
    # Daily limit resets
    ('                    Daily limit — resets at midnight',
     "{t('subscriptionScreen.usage.dailyLimitResets')}"),
    # Family pool section header
    ('              Family pool\n              </Text>',
     "{t('subscriptionScreen.familyPool.sectionHeader')}\n              </Text>"),
    # Plans section headers (two occurrences)
    ('              Plans\n              </Text>',
     "{t('subscriptionScreen.plans.sectionHeader')}\n              </Text>"),
    # Confirming purchase spinner text
    ('                  <Text className="text-body font-semibold text-primary ml-2">\n                    Confirming purchase…\n                  </Text>',
     "                  <Text className=\"text-body font-semibold text-primary ml-2\">\n                    {t('subscriptionScreen.plans.confirmingPurchase')}\n                  </Text>"),
    # Current badge in static tier
    ('                        Current\n                        </Text>',
     "{t('subscriptionScreen.plans.currentBadge')}\n                        </Text>"),
    # Retry offerings button
    ('                    <Text className="text-body font-semibold text-text-inverse">\n                      Retry\n                    </Text>',
     "                    <Text className=\"text-body font-semibold text-text-inverse\">\n                      {t('subscriptionScreen.plans.retryOfferings')}\n                    </Text>"),
    # Retry offerings accessibilityLabel
    ('                    accessibilityLabel="Retry loading subscription offerings"',
     "                    accessibilityLabel={t('subscriptionScreen.plans.retryOfferingsAccessibilityLabel')}"),
    # Contact support button
    ('                    <Text className="text-body font-semibold text-text-primary">\n                      Contact support\n                    </Text>',
     "                    <Text className=\"text-body font-semibold text-text-primary\">\n                      {t('subscriptionScreen.plans.contactSupport')}\n                    </Text>"),
    # Contact support accessibilityLabel
    ('                    accessibilityLabel="Contact support"',
     "                    accessibilityLabel={t('subscriptionScreen.plans.contactSupportAccessibilityLabel')}"),
    # Check later button in restore
    ('                  Check later\n                </Text>',
     "                  {t('subscriptionScreen.restore.checkLater')}\n                </Text>"),
    # Top-up section header
    ('              Need more questions?\n              </Text>',
     "              {t('subscriptionScreen.topUp.sectionHeader')}\n              </Text>"),
    # Buy 500 credits accessibilityLabel
    ('                accessibilityLabel="Buy 500 credits"',
     "                accessibilityLabel={t('subscriptionScreen.topUp.buyAccessibilityLabel')}"),
    # Opening store text
    ('                    {topUpPolling ? pollMessage : \'Opening store...\'}',
     "                    {topUpPolling ? pollMessage : t('subscriptionScreen.topUp.openingStore')}"),
    # Buy 500 credits text
    ('                    <Text className="text-body font-semibold text-primary">\n                      Buy 500 credits\n                    </Text>',
     "                    <Text className=\"text-body font-semibold text-primary\">\n                      {t('subscriptionScreen.topUp.buyButton')}\n                    </Text>"),
    # Credits subtitle
    ('                    <Text className="text-caption text-text-secondary mt-0.5">\n                      One-time purchase. Credits expire in 12 months.\n                    </Text>',
     "                    <Text className=\"text-caption text-text-secondary mt-0.5\">\n                      {t('subscriptionScreen.topUp.credits')}\n                    </Text>"),
    # Check later (top-up)
    ('                  Check later\n                </Text>\n              </Pressable>\n            </View>\n          )}\n\n          {/* Manage billing',
     "                  {t('subscriptionScreen.topUp.checkLater')}\n                </Text>\n              </Pressable>\n            </View>\n          )}\n\n          {/* Manage billing"),
    # Cancel top-up accessibilityLabel
    ('                  accessibilityLabel="Cancel top-up confirmation"',
     "                  accessibilityLabel={t('subscriptionScreen.topUp.checkLaterAccessibilityLabel')}"),
    # Manage section header
    ('              Manage\n              </Text>',
     "              {t('subscriptionScreen.manageBilling.sectionHeader')}\n              </Text>"),
    # Manage billing web info title
    ('                  <Text className="text-body text-text-primary">\n                    Manage billing\n                  </Text>\n                  <Text className="text-caption text-text-secondary mt-0.5">\n                    Subscription is managed on your mobile device\n                  </Text>',
     "                  <Text className=\"text-body text-text-primary\">\n                    {t('subscriptionScreen.manageBilling.webInfo')}\n                  </Text>\n                  <Text className=\"text-caption text-text-secondary mt-0.5\">\n                    {t('subscriptionScreen.manageBilling.webInfoSubtitle')}\n                  </Text>"),
    # Manage billing native button
    ('                  accessibilityLabel="Manage billing"\n                  accessibilityRole="button"\n                  testID="manage-billing-button"',
     "                  accessibilityLabel={t('subscriptionScreen.manageBilling.buttonAccessibilityLabel')}\n                  accessibilityRole=\"button\"\n                  testID=\"manage-billing-button\""),
    # Manage billing native title
    ('                  <Text className="text-body text-text-primary">\n                    Manage billing\n                  </Text>',
     "                  <Text className=\"text-body text-text-primary\">\n                    {t('subscriptionScreen.manageBilling.button')}\n                  </Text>"),
    # Opens App Store
    ('                      \'Opens App Store subscriptions\'',
     "t('subscriptionScreen.manageBilling.opensAppStore')"),
    # Opens Google Play
    ("                      'Opens Google Play subscriptions'",
     "t('subscriptionScreen.manageBilling.opensGooglePlay')"),
]

for old, new in replacements:
    if old in content:
        content = content.replace(old, new, 1)
        print(f'OK: {old[:50]!r}')
    else:
        print(f'MISS: {old[:60]!r}')

print(f'\nOriginal: {original_len}, New: {len(content)}, Delta: {len(content) - original_len}')

with open('apps/mobile/src/app/(app)/subscription.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
print('Written')
