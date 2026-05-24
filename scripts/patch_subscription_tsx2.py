import sys
sys.stdout.reconfigure(encoding='utf-8')

with open('apps/mobile/src/app/(app)/subscription.tsx', encoding='utf-8') as f:
    content = f.read()

original_len = len(content)

# Fix 1: initial pollMessage state
content = content.replace(
    "useState('Confirming your purchase...')",
    "useState('')",
)

# Fix 2: 'Network error' in handlePurchase (topup section)
content = content.replace(
    "        if (isNetworkError(error)) {\n          platformAlert(\n            'Network error',\n            'Please check your internet connection and try again.',\n          );\n          return;\n        }\n        platformAlert(\n          'Purchase failed',\n          'Something unexpected happened with your purchase. Please try again.',\n        );\n        return;\n      }\n\n      // Purchase succeeded on the store side",
    "        if (isNetworkError(error)) {\n          platformAlert(\n            t('subscriptionScreen.alerts.networkErrorTitle'),\n            t('subscriptionScreen.alerts.networkErrorBody'),\n          );\n          return;\n        }\n        platformAlert(\n          t('subscriptionScreen.alerts.purchaseFailedTitle'),\n          t('subscriptionScreen.alerts.purchaseFailedBody'),\n        );\n        return;\n      }\n\n      // Purchase succeeded on the store side",
)

# Fix 3: 'Already purchased' alert
content = content.replace(
    "          platformAlert(\n            'Already purchased',\n            'It looks like you already own this subscription. Tap \"Restore purchases\" to activate it on this device.',\n            [\n              {\n                text: 'Restore purchases',",
    "          platformAlert(\n            t('subscriptionScreen.alerts.alreadyPurchasedTitle'),\n            t('subscriptionScreen.alerts.alreadyPurchasedBody'),\n            [\n              {\n                text: t('subscriptionScreen.alerts.restorePurchasesButton'),",
)

# Fix 4: 'Could not open subscription management'
content = content.replace(
    "      platformAlert(\n        'Could not open subscription management',\n        `You can manage your subscription directly at:\\n${url}`,\n        [\n          {\n            text: 'Try again',",
    "      platformAlert(\n        t('subscriptionScreen.alerts.manageBillingErrorTitle'),\n        t('subscriptionScreen.alerts.manageBillingErrorBody', { url }),\n        [\n          {\n            text: t('subscriptionScreen.alerts.tryAgain'),",
)

# Fix 5: 'Check again' button text
content = content.replace(
    "            text: 'Check again',",
    "            text: t('subscriptionScreen.alerts.checkAgain'),",
)

print(f'Original: {original_len}, New: {len(content)}, Delta: {len(content) - original_len}')

# Verify
checks = [
    ("useState('')", True),
    ("'Network error'", False),
    ("'Already purchased'", False),
    ("'Could not open subscription management'", False),
    ("'Check again'", False),
    ("subscriptionScreen.alerts.manageBillingErrorTitle", True),
]
for s, should_exist in checks:
    found = s in content
    status = 'OK' if found == should_exist else 'FAIL'
    print(f'{status}: {s!r} {"found" if found else "not found"}')

with open('apps/mobile/src/app/(app)/subscription.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
print('Written')
