import json, sys
sys.stdout.reconfigure(encoding='utf-8')

en_block = {
  "title": "Subscription",
  "back": "Back",
  "backAccessibilityLabel": "Go back",
  "loading": {
    "error": "Unable to load subscription details. Please try again.",
    "retryAccessibilityLabel": "Retry loading subscription",
    "retry": "Retry"
  },
  "tierLabels": {
    "free": "Free",
    "plus": "Plus",
    "family": "Family",
    "pro": "Pro"
  },
  "tierLimits": {
    "free": "10 questions/day, 100/month",
    "plus": "700 questions/month",
    "family": "1,500 questions/month (shared)",
    "pro": "3,000 questions/month"
  },
  "tierFeatures": {
    "free": {"0": "10 questions per day, 100 per month", "1": "All subjects", "2": "Spaced repetition", "3": "Library"},
    "plus": {"0": "700 questions per month, no daily limit", "1": "All Free features", "2": "Advanced AI help on harder study questions", "3": "Detailed progress analytics"},
    "family": {"0": "1,500 questions per month (shared across pool)", "1": "Up to 6 child profiles", "2": "All Plus features", "3": "Managed by parent account"},
    "pro": {"0": "3,000 questions per month, no daily limit", "1": "All Plus features", "2": "Priority AI mentor", "3": "Advanced analytics"}
  },
  "packagePeriod": {
    "monthly": "Monthly", "annual": "Annual", "sixMonth": "6 Months",
    "threeMonth": "3 Months", "twoMonth": "2 Months", "weekly": "Weekly", "lifetime": "Lifetime"
  },
  "currentPlan": {
    "sectionHeader": "Current plan",
    "statusActive": "Active",
    "statusCancelling": "Cancelling",
    "statusPastDue": "Past due",
    "statusExpired": "Expired",
    "accessUntil": "Access until {{date}}",
    "renews": "Renews {{date}}",
    "upgradeButton": "Upgrade",
    "upgradeAccessibilityLabel": "Upgrade plan"
  },
  "cancellationNotice": {
    "title": "Subscription ending",
    "body": "Your subscription has been cancelled. You can continue using all features until {{date}}. After that, your account will revert to the Free tier."
  },
  "usage": {
    "sectionHeader": "Usage this month",
    "dailyQuestions": "Today: {{used}} / {{limit}} daily questions",
    "topUpCreditsRemaining": "+ {{count}} top-up credits remaining",
    "yourShare": "Your share",
    "yourUsage": "Your usage",
    "questionsCount": "{{count}} questions",
    "familyAggregate": "Family aggregate",
    "quotaResets": "Quota resets {{date}}",
    "subscriptionRenews": "Subscription renews {{date}}",
    "dailyLimitResets": "Daily limit — resets at midnight"
  },
  "familyPool": {
    "sectionHeader": "Family pool",
    "profilesConnected": "{{count}} of {{max}} profiles connected",
    "questionsLeft": "{{count}} shared questions left this cycle.",
    "ownerSuffix": " (owner)",
    "removingMember": "Removing...",
    "removeMember": "Remove",
    "removeMemberAccessibilityLabel": "Remove {{name}} from family"
  },
  "plans": {
    "sectionHeader": "Plans",
    "confirmingPurchase": "Confirming purchase…",
    "offeringsError": "We could not load purchase options right now. You’re on the {{tier}} plan with {{limits}}.",
    "offeringsUnavailable": "You’re on the {{tier}} plan with {{limits}}. Here’s what each plan includes — store purchasing isn’t available on this device yet.",
    "currentBadge": "Current",
    "retryOfferings": "Retry",
    "retryOfferingsAccessibilityLabel": "Retry loading subscription offerings",
    "contactSupport": "Contact support",
    "contactSupportAccessibilityLabel": "Contact support"
  },
  "packageOption": {
    "currentPlanLabel": "Current plan",
    "subscribeLabel": "Subscribe",
    "processingLabel": "Processing...",
    "currentPlanAccessibilityLabel": "Current plan {{title}} {{price}}",
    "subscribePlanAccessibilityLabel": "Subscribe to {{title}} {{price}}"
  },
  "restore": {
    "button": "Restore purchases",
    "accessibilityLabel": "Restore purchases",
    "restoring": "Restoring...",
    "verifying": "Verifying...",
    "checkLater": "Check later",
    "cancelledTitle": "Checking later",
    "cancelledBody": "Your restore is still in progress in the background. Refresh the screen if your subscription doesn’t appear.",
    "cancelAccessibilityLabel": "Check restore later"
  },
  "topUp": {
    "sectionHeader": "Need more questions?",
    "buyButton": "Buy 500 credits",
    "buyAccessibilityLabel": "Buy 500 credits",
    "credits": "One-time purchase. Credits expire in 12 months.",
    "openingStore": "Opening store...",
    "checkLater": "Check later",
    "checkLaterAccessibilityLabel": "Cancel top-up confirmation",
    "checkLaterTitle": "Check later",
    "checkLaterBody": "Credits will appear shortly — tap refresh to check.",
    "confirmingPollMessage": "Confirming your purchase...",
    "confirmingPollMessageLong": "Still confirming — this can take up to 30 seconds. Your purchase is safe."
  },
  "manageBilling": {
    "sectionHeader": "Manage",
    "button": "Manage billing",
    "buttonAccessibilityLabel": "Manage billing",
    "webInfo": "Manage billing",
    "webInfoSubtitle": "Subscription is managed on your mobile device",
    "opensAppStore": "Opens App Store subscriptions",
    "opensGooglePlay": "Opens Google Play subscriptions"
  },
  "byokWaitlist": {
    "heading": "Bring Your Own Key",
    "body": "Use your own AI API key for unlimited questions. Join the waitlist and we’ll notify you when it’s available.",
    "joinButton": "Join waitlist",
    "alreadyJoinedButton": "Already joined",
    "joinAccessibilityLabel": "Join API key waitlist",
    "alreadyJoinedAccessibilityLabel": "Already on API key waitlist",
    "alerts": {
      "successTitle": "You’re on the list!",
      "successBody": "We’ll let you know when Bring Your Own Key is ready.",
      "errorTitle": "Could not join waitlist",
      "errorBody": "Please check your connection and try again."
    }
  },
  "alerts": {
    "restoreFailed": "Restore failed",
    "restoreFailedBody": "Could not restore purchases. Please try again.",
    "noSubscriptionsFound": "No subscriptions found",
    "noSubscriptionsFoundBody": "We could not find any previous purchases to restore.",
    "checkAgain": "Check again",
    "alreadyPurchasedTitle": "Already purchased",
    "alreadyPurchasedBody": "It looks like you already own this subscription. Tap “Restore purchases” to activate it on this device.",
    "restorePurchasesButton": "Restore purchases",
    "networkErrorTitle": "Network error",
    "networkErrorBody": "Please check your internet connection and try again.",
    "purchaseFailedTitle": "Purchase failed",
    "purchaseFailedBody": "Something unexpected happened with your purchase. Please try again.",
    "manageBillingErrorTitle": "Could not open subscription management",
    "manageBillingErrorBody": "You can manage your subscription directly at:\n{{url}}",
    "tryAgain": "Try again",
    "topUpConnectionErrorTitle": "Connection error",
    "topUpConnectionErrorBody": "Couldn’t load purchase options. Check your connection and try again.",
    "topUpRetry": "Retry",
    "topUpNotAvailableTitle": "Not available",
    "topUpNotAvailableBody": "Top-up credits aren’t available right now. Try again later or contact support.",
    "topUpPurchaseConfirmedTitle": "Purchase confirmed",
    "topUpPurchaseConfirmedBody": "Your 500 credits are being added. They usually appear within a minute — pull down to refresh your usage.",
    "removeFamilyTitle": "Remove from family?",
    "removeFamilyBody": "{{name}}’s profile will be removed from this family plan and hidden from profile switching.",
    "removeFamilyConfirm": "Remove",
    "familyUpdatedTitle": "Family updated",
    "familyUpdatedBody": "{{name}} was removed from your family plan.",
    "removeFamilyErrorTitle": "Could not remove profile",
    "removeFamilyErrorBody": "Please check your connection and try again.",
    "contactSupportTitle": "Contact support",
    "contactSupportBody": "Email support@mentomate.app for help with subscriptions."
  },
  "childPaywall": {
    "backAccessibilityLabel": "Go back",
    "back": "Back",
    "title": "Nice work so far!",
    "progressWithXp_one": "You learned {{topics}} topic and earned {{xp}} XP — great work!",
    "progressWithXp_other": "You learned {{topics}} topics and earned {{xp}} XP — great work!",
    "progressExploring": "You’ve been exploring and learning — great start!",
    "quotaMessage": "You’ve used all your free questions. Ask your parent to upgrade so you can keep learning.",
    "notifyParentLabel": "Notify my parent",
    "parentAlreadyNotifiedLabel": "Parent already notified",
    "notifyParentButton": "Notify My Parent",
    "parentNotifiedButton": "Parent notified",
    "remindAgainIn": "You can remind them again in {{time}}.",
    "parentNotifiedExplore": "Your parent has been notified! While you wait, you can still explore:",
    "waitingExplore": "While you wait, you can still browse your Library and see your progress.",
    "browseLibrary": "Browse Library",
    "browseLibraryAccessibilityLabel": "Browse Library",
    "seeProgress": "See your progress",
    "seeProgressAccessibilityLabel": "See your progress",
    "goHome": "Go Home",
    "goHomeAccessibilityLabel": "Go Home",
    "cooldownSeconds_one": "{{count}} second",
    "cooldownSeconds_other": "{{count}} seconds",
    "cooldownMinutes_one": "{{count}} minute",
    "cooldownMinutes_other": "{{count}} minutes",
    "cooldownHours_one": "{{count}} hour",
    "cooldownHours_other": "{{count}} hours",
    "cooldownZero": "0 seconds",
    "notifySentTitle": "Sent!",
    "notifySentBody": "We let your parent know!",
    "notifyAskParentTitle": "Ask your parent",
    "notifyAskParentBody": "Ask your parent to open the app and subscribe.",
    "notifyErrorTitle": "Could not send notification",
    "notifyErrorBody": "Please check your connection and try again."
  }
}

path = 'apps/mobile/src/i18n/locales/en.json'
with open(path, encoding='utf-8-sig') as f:
    d = json.load(f)
d['subscriptionScreen'] = en_block
with open(path, 'w', encoding='utf-8') as f:
    json.dump(d, f, ensure_ascii=False, indent=2)
    f.write('\n')
print('en.json written, keys:', len(d))
