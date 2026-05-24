import sys
sys.stdout.reconfigure(encoding='utf-8')

with open('apps/mobile/src/app/(app)/subscription.tsx', encoding='utf-8') as f:
    content = f.read()

original_len = len(content)

# --- Patch 1: topUpPkg not found alert ---
content = content.replace(
    "      platformAlert(\n        'Not available',\n        \"Top-up credits aren't available right now. Try again later or contact support.\",\n        [\n          {\n            text: 'Retry',",
    "      platformAlert(\n        t('subscriptionScreen.alerts.topUpNotAvailableTitle'),\n        t('subscriptionScreen.alerts.topUpNotAvailableBody'),\n        [\n          {\n            text: t('subscriptionScreen.alerts.topUpRetry'),",
)

# --- Patch 2: topUp network error ---
content = content.replace(
    "      if (isNetworkError(error)) {\n        platformAlert(\n          'Network error',\n          'Please check your internet connection and try again.',\n        );\n        return;\n      }\n      platformAlert(\n        'Purchase failed',\n        'Something unexpected happened with your purchase. Please try again.',\n      );\n      return;\n    }\n\n    // Purchase succeeded on store side",
    "      if (isNetworkError(error)) {\n        platformAlert(\n          t('subscriptionScreen.alerts.networkErrorTitle'),\n          t('subscriptionScreen.alerts.networkErrorBody'),\n        );\n        return;\n      }\n      platformAlert(\n        t('subscriptionScreen.alerts.purchaseFailedTitle'),\n        t('subscriptionScreen.alerts.purchaseFailedBody'),\n      );\n      return;\n    }\n\n    // Purchase succeeded on store side",
)

# --- Patch 3: setPollMessage initial ---
content = content.replace(
    "    setPollMessage('Confirming your purchase...');",
    "    setPollMessage(t('subscriptionScreen.topUp.confirmingPollMessage'));",
)

# --- Patch 4: setPollMessage long ---
content = content.replace(
    "        setPollMessage(\n          'Still confirming \\u2014 this can take up to 30 seconds. Your purchase is safe.',\n        );",
    "        setPollMessage(t('subscriptionScreen.topUp.confirmingPollMessageLong'));",
)

# --- Patch 5: topUp confirmed=false alert ---
content = content.replace(
    "      platformAlert(\n        'Purchase confirmed',\n        'Your 500 credits are being added. They usually appear within a minute \\u2014 pull down to refresh your usage.',\n        [{ text: t('common.ok') }],\n      );",
    "      platformAlert(\n        t('subscriptionScreen.alerts.topUpPurchaseConfirmedTitle'),\n        t('subscriptionScreen.alerts.topUpPurchaseConfirmedBody'),\n        [{ text: t('common.ok') }],\n      );",
)

# --- Patch 6: contactSupport alert ---
content = content.replace(
    "      platformAlert(\n        'Contact support',\n        'Email support@mentomate.app for help with subscriptions.',\n      );",
    "      platformAlert(\n        t('subscriptionScreen.alerts.contactSupportTitle'),\n        t('subscriptionScreen.alerts.contactSupportBody'),\n      );",
)

# Fix: handleContactSupport uses t but it's not in deps
content = content.replace(
    "  }, []);\n\n  const handleRemoveFamilyProfile",
    "  }, [t]);\n\n  const handleRemoveFamilyProfile",
)

# --- Patch 7: removeFamilyProfile alerts ---
content = content.replace(
    "      platformAlert(\n        'Remove from family?',\n        `${displayName}'s profile will be removed from this family plan and hidden from profile switching.`,",
    "      platformAlert(\n        t('subscriptionScreen.alerts.removeFamilyTitle'),\n        t('subscriptionScreen.alerts.removeFamilyBody', { name: displayName }),",
)
content = content.replace(
    "              { text: t('common.cancel'), style: 'cancel' },\n              {\n                text: 'Remove',\n                style: 'destructive',",
    "              { text: t('common.cancel'), style: 'cancel' },\n              {\n                text: t('subscriptionScreen.alerts.removeFamilyConfirm'),\n                style: 'destructive',",
)
content = content.replace(
    "                  platformAlert(\n                    'Family updated',\n                    `${displayName} was removed from your family plan.`,\n                  );\n                } catch {\n                  platformAlert(\n                    'Could not remove profile',\n                    'Please check your connection and try again.',\n                  );",
    "                  platformAlert(\n                    t('subscriptionScreen.alerts.familyUpdatedTitle'),\n                    t('subscriptionScreen.alerts.familyUpdatedBody', { name: displayName }),\n                  );\n                } catch {\n                  platformAlert(\n                    t('subscriptionScreen.alerts.removeFamilyErrorTitle'),\n                    t('subscriptionScreen.alerts.removeFamilyErrorBody'),\n                  );",
)

print(f'Original length: {original_len}, new length: {len(content)}, delta: {len(content) - original_len}')
# Verify the patches worked by checking key strings are gone
checks = [
    ("'Not available'", False),
    ("'Confirming your purchase...'", False),
    ("'Contact support'", False),
    ("'Remove from family?'", False),
    ("'Purchase confirmed'", False),
]
for s, should_exist in checks:
    found = s in content
    status = 'OK' if found == should_exist else 'FAIL'
    print(f'{status}: "{s}" {"found" if found else "not found"} (expected {"found" if should_exist else "not found"})')

with open('apps/mobile/src/app/(app)/subscription.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
print('Written successfully')
