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

# --- Header ---
patch(
    'accessibilityLabel="Go back"',
    "accessibilityLabel={t('subscriptionScreen.backAccessibilityLabel')}",
    'backAccessibilityLabel',
)
patch(
    '>Back</Text>',
    ">{t('subscriptionScreen.back')}</Text>",
    'back text',
)
patch(
    '          Subscription\n        </Text>',
    "          {t('subscriptionScreen.title')}\n        </Text>",
    'title',
)

# --- Loading error ---
patch(
    '            Unable to load subscription details. Please try again.\n          </Text>',
    "            {t('subscriptionScreen.loading.error')}\n          </Text>",
    'loading.error',
)
patch(
    'accessibilityLabel="Retry loading subscription"',
    "accessibilityLabel={t('subscriptionScreen.loading.retryAccessibilityLabel')}",
    'loading.retryAccessibilityLabel',
)
patch(
    '                Retry\n              </Text>\n            )}\n          </Pressable>\n        </View>',
    "                {t('subscriptionScreen.loading.retry')}\n              </Text>\n            )}\n          </Pressable>\n        </View>",
    'loading.retry',
)

# --- Current plan section header ---
patch(
    '          {/* Current plan */}\n          <Text className="text-body-sm font-semibold text-text-primary opacity-70 tracking-wide mb-2 mt-4">',
    "          {/* Current plan */}\n          <Text className=\"text-body-sm font-semibold text-text-primary opacity-70 tracking-wide mb-2 mt-4\">\n            {t('subscriptionScreen.currentPlan.sectionHeader')}",
    'currentPlan.sectionHeader opening tag',
)
# Also remove leftover 'Current plan' text node that might follow (check separately)
# The above adds t() call before the tag closes, but the original had a text node right after

# --- Status badges (already patched from subscriptionScreen in earlier script but let's verify) ---

# --- Tier labels and limits (already patched via TIER_LABEL_KEYS/TIER_LIMIT_KEYS, not raw strings) ---

# --- Upgrade button ---
patch(
    "                    Upgrade\n                  </Text>",
    "                    {t('subscriptionScreen.currentPlan.upgradeButton')}\n                  </Text>",
    'upgradeButton',
)
patch(
    'accessibilityLabel="Upgrade plan"',
    "accessibilityLabel={t('subscriptionScreen.currentPlan.upgradeAccessibilityLabel')}",
    'upgradeAccessibilityLabel',
)

# --- Usage section header ---
patch(
    '                  Usage this month\n                </Text>',
    "                  {t('subscriptionScreen.usage.sectionHeader')}\n                </Text>",
    'usage.sectionHeader',
)

# --- Daily usage inline ---
patch(
    '                      Today: {usage.usedToday} / {usage.dailyLimit} daily\n                        questions\n                      </Text>',
    "                      {t('subscriptionScreen.usage.dailyQuestions', { used: usage.usedToday, limit: usage.dailyLimit })}\n                      </Text>",
    'usage.dailyQuestions',
)

# --- Top-up credits remaining ---
patch(
    '                      + {usage.topUpCreditsRemaining} top-up credits remaining',
    "                      {t('subscriptionScreen.usage.topUpCreditsRemaining', { count: usage.topUpCreditsRemaining })}",
    'usage.topUpCreditsRemaining',
)

# --- Your share / Your usage ---
patch(
    "? 'Your share'\n                              : row.is_self\n                                ? 'Your usage'",
    "? t('subscriptionScreen.usage.yourShare')\n                              : row.is_self\n                                ? t('subscriptionScreen.usage.yourUsage')",
    'usage.yourShare/yourUsage',
)

# --- Questions count ---
patch(
    '                            {row.used} questions',
    "                            {t('subscriptionScreen.usage.questionsCount', { count: row.used })}",
    'usage.questionsCount',
)

# --- Family aggregate ---
patch(
    '                          Family aggregate\n                          </Text>',
    "                          {t('subscriptionScreen.usage.familyAggregate')}\n                          </Text>",
    'usage.familyAggregate',
)

# --- Quota resets (with date fallback) ---
patch(
    "                    Quota resets{' '}\n                    {usage.resetsAtLabel ??\n                      new Date(usage.cycleResetAt).toLocaleDateString(\n                        undefined,\n                        {\n                          year: 'numeric',\n                          month: 'long',\n                          day: 'numeric',\n                        },\n                      )}\n                  </Text>",
    "                    {t('subscriptionScreen.usage.quotaResets', { date: usage.resetsAtLabel ?? new Date(usage.cycleResetAt).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }) })}\n                  </Text>",
    'usage.quotaResets',
)

# --- Subscription renews ---
patch(
    '                      Subscription renews {usage.renewsAtLabel}',
    "                      {t('subscriptionScreen.usage.subscriptionRenews', { date: usage.renewsAtLabel })}",
    'usage.subscriptionRenews',
)

# --- Daily limit resets ---
patch(
    '                      Daily limit — resets at midnight',
    "                      {t('subscriptionScreen.usage.dailyLimitResets')}",
    'usage.dailyLimitResets',
)

# --- Family pool ---
patch(
    '                Family pool\n              </Text>',
    "                {t('subscriptionScreen.familyPool.sectionHeader')}\n              </Text>",
    'familyPool.sectionHeader',
)
patch(
    ' profiles connected\n                </Text>',
    " {t('subscriptionScreen.familyPool.profilesConnected')}\n                </Text>",
    'familyPool.profilesConnected',
)
patch(
    ' shared questions left\n                  this cycle.\n                </Text>',
    " {t('subscriptionScreen.familyPool.questionsLeft')}\n                </Text>",
    'familyPool.questionsLeft',
)
patch(
    '? `${member.displayName} (owner)`',
    "? `${member.displayName}${t('subscriptionScreen.familyPool.ownerSuffix')}`",
    'familyPool.ownerSuffix',
)
patch(
    "? 'Removing...'\n                              : 'Remove'}",
    "? t('subscriptionScreen.familyPool.removingMember')\n                              : t('subscriptionScreen.familyPool.removeMember')}",
    'familyPool.removingMember/removeMember',
)

# --- Plans section ---
patch(
    '                Plans\n              </Text>\n              {subscriptionPackages.map',
    "                {t('subscriptionScreen.plans.sectionHeader')}\n              </Text>\n              {subscriptionPackages.map",
    'plans.sectionHeader (subscription packages)',
)

# --- Confirming purchase spinner ---
patch(
    '                    Confirming purchase…\n                  </Text>',
    "                    {t('subscriptionScreen.plans.confirmingPurchase')}\n                  </Text>",
    'plans.confirmingPurchase',
)

# --- No offerings error text ---
patch(
    "We could not load purchase options right now. You're on the {TIER_LABELS[tier]} plan with {TIER_LIMITS[tier]}.",
    "{t('subscriptionScreen.plans.offeringsError', { tier: t(TIER_LABEL_KEYS[tier]), limits: t(TIER_LIMIT_KEYS[tier]) })}",
    'plans.offeringsError',
)

# --- Current badge in tier comparison ---
patch(
    '                          Current\n                        </Text>',
    "                          {t('subscriptionScreen.plans.currentBadge')}\n                        </Text>",
    'plans.currentBadge',
)

# --- Retry offerings ---
patch(
    '                      Retry\n                    </Text>\n                  </Pressable>\n                  <Pressable',
    "                      {t('subscriptionScreen.plans.retryOfferings')}\n                    </Text>\n                  </Pressable>\n                  <Pressable",
    'plans.retryOfferings',
)
patch(
    'accessibilityLabel="Retry loading subscription offerings"',
    "accessibilityLabel={t('subscriptionScreen.plans.retryOfferingsAccessibilityLabel')}",
    'plans.retryOfferingsAccessibilityLabel',
)

# --- Contact support ---
patch(
    '                      Contact support\n                    </Text>',
    "                      {t('subscriptionScreen.plans.contactSupport')}\n                    </Text>",
    'plans.contactSupport',
)
patch(
    'accessibilityLabel="Contact support"',
    "accessibilityLabel={t('subscriptionScreen.plans.contactSupportAccessibilityLabel')}",
    'plans.contactSupportAccessibilityLabel',
)

# --- Restore check later ---
patch(
    '                  Check later\n                </Text>\n              </Pressable>\n            )}\n          </View>\n\n',
    "                  {t('subscriptionScreen.restore.checkLater')}\n                </Text>\n              </Pressable>\n            )}\n          </View>\n\n",
    'restore.checkLater',
)

# --- Top-up ---
patch(
    '                Need more questions?\n              </Text>',
    "                {t('subscriptionScreen.topUp.sectionHeader')}\n              </Text>",
    'topUp.sectionHeader',
)
patch(
    'accessibilityLabel="Buy 500 credits"',
    "accessibilityLabel={t('subscriptionScreen.topUp.buyAccessibilityLabel')}",
    'topUp.buyAccessibilityLabel',
)
patch(
    "{topUpPolling ? pollMessage : 'Opening store...'}",
    "{topUpPolling ? pollMessage : t('subscriptionScreen.topUp.openingStore')}",
    'topUp.openingStore',
)
patch(
    '                      Buy 500 credits\n                    </Text>',
    "                      {t('subscriptionScreen.topUp.buyButton')}\n                    </Text>",
    'topUp.buyButton',
)
patch(
    '                      One-time purchase. Credits expire in 12 months.\n                    </Text>',
    "                      {t('subscriptionScreen.topUp.credits')}\n                    </Text>",
    'topUp.credits',
)
patch(
    'accessibilityLabel="Cancel top-up confirmation"',
    "accessibilityLabel={t('subscriptionScreen.topUp.checkLaterAccessibilityLabel')}",
    'topUp.checkLaterAccessibilityLabel',
)

# --- Manage section ---
patch(
    '                Manage\n              </Text>\n              {/* [BUG-916]',
    "                {t('subscriptionScreen.manageBilling.sectionHeader')}\n              </Text>\n              {/* [BUG-916]",
    'manageBilling.sectionHeader',
)
patch(
    'accessibilityLabel="Manage billing"\n                  accessibilityRole="button"\n                  testID="manage-billing-button"',
    "accessibilityLabel={t('subscriptionScreen.manageBilling.buttonAccessibilityLabel')}\n                  accessibilityRole=\"button\"\n                  testID=\"manage-billing-button\"",
    'manageBilling.buttonAccessibilityLabel',
)
# There are two "Manage billing" text nodes -- one is in a webInfo <Text> and one is in a button
# Find both
idx1 = content.find('                    Manage billing\n                  </Text>\n                  <Text className="text-caption text-text-secondary mt-0.5">\n                    Subscription is managed on your mobile device')
if idx1 >= 0:
    content = content.replace(
        '                    Manage billing\n                  </Text>\n                  <Text className="text-caption text-text-secondary mt-0.5">\n                    Subscription is managed on your mobile device',
        "                    {t('subscriptionScreen.manageBilling.webInfo')}\n                  </Text>\n                  <Text className=\"text-caption text-text-secondary mt-0.5\">\n                    {t('subscriptionScreen.manageBilling.webInfoSubtitle')}",
        1
    )
    print("OK: manageBilling.webInfo+webInfoSubtitle")
else:
    misses.append('manageBilling.webInfo')
    print("MISS: manageBilling.webInfo")

patch(
    '                    Manage billing\n                  </Text>',
    "                    {t('subscriptionScreen.manageBilling.button')}\n                  </Text>",
    'manageBilling.button',
)

print(f'\nOriginal: {original_len}, New: {len(content)}, Delta: {len(content) - original_len}')
if misses:
    print(f'MISSES ({len(misses)}):')
    for m in misses:
        print(f'  - {m!r}')
else:
    print('All patches applied successfully!')

with open('apps/mobile/src/app/(app)/subscription.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
print('Written')
