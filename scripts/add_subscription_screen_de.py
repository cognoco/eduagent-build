import json, sys
sys.stdout.reconfigure(encoding='utf-8')

de_block = {
  "title": "Abonnement",
  "back": "Zurück",
  "backAccessibilityLabel": "Zurück",
  "loading": {
    "error": "Abonnementdetails konnten nicht geladen werden. Bitte erneut versuchen.",
    "retryAccessibilityLabel": "Abonnement erneut laden",
    "retry": "Erneut versuchen"
  },
  "tierLabels": {"free": "Free", "plus": "Plus", "family": "Familie", "pro": "Pro"},
  "tierLimits": {
    "free": "10 Fragen/Tag, 100/Monat", "plus": "700 Fragen/Monat",
    "family": "1.500 Fragen/Monat (geteilt)", "pro": "3.000 Fragen/Monat"
  },
  "tierFeatures": {
    "free": {"0": "10 Fragen pro Tag, 100 pro Monat", "1": "Alle Fächer", "2": "Spaced Repetition", "3": "Bibliothek"},
    "plus": {"0": "700 Fragen pro Monat, kein Tageslimit", "1": "Alle Free-Funktionen", "2": "Erweiterte KI-Hilfe bei anspruchsvollen Aufgaben", "3": "Detaillierte Lernfortschritts-Analysen"},
    "family": {"0": "1.500 Fragen pro Monat (geteilt im Pool)", "1": "Bis zu 6 Kinderprofile", "2": "Alle Plus-Funktionen", "3": "Verwaltung durch das Elternkonto"},
    "pro": {"0": "3.000 Fragen pro Monat, kein Tageslimit", "1": "Alle Plus-Funktionen", "2": "Prioritäts-KI-Mentor", "3": "Erweiterte Analysen"}
  },
  "packagePeriod": {
    "monthly": "Monatlich", "annual": "Jährlich", "sixMonth": "6 Monate",
    "threeMonth": "3 Monate", "twoMonth": "2 Monate", "weekly": "Wöchentlich", "lifetime": "Lebenslang"
  },
  "currentPlan": {
    "sectionHeader": "Aktueller Plan", "statusActive": "Aktiv", "statusCancelling": "Wird gekündigt",
    "statusPastDue": "Überfällig", "statusExpired": "Abgelaufen",
    "accessUntil": "Zugang bis {{date}}", "renews": "Verlängerung am {{date}}",
    "upgradeButton": "Upgrade", "upgradeAccessibilityLabel": "Plan upgraden"
  },
  "cancellationNotice": {
    "title": "Abonnement endet",
    "body": "Dein Abonnement wurde gekündigt. Du kannst alle Funktionen bis {{date}} weiterhin nutzen. Danach wird dein Konto auf den Free-Tarif zurückgesetzt."
  },
  "usage": {
    "sectionHeader": "Verbrauch diesen Monat",
    "dailyQuestions": "Heute: {{used}} / {{limit}} tägliche Fragen",
    "topUpCreditsRemaining": "+ {{count}} Top-up-Credits verbleibend",
    "yourShare": "Dein Anteil", "yourUsage": "Dein Verbrauch", "questionsCount": "{{count}} Fragen",
    "familyAggregate": "Familien-Gesamt",
    "quotaResets": "Kontingent wird zurückgesetzt am {{date}}",
    "subscriptionRenews": "Abonnement verlängert sich am {{date}}",
    "dailyLimitResets": "Tageslimit — Zurücksetzung um Mitternacht"
  },
  "familyPool": {
    "sectionHeader": "Familien-Pool",
    "profilesConnected": "{{count}} von {{max}} Profilen verbunden",
    "questionsLeft": "{{count}} geteilte Fragen in diesem Zyklus verbleibend.",
    "ownerSuffix": " (Inhaber)", "removingMember": "Wird entfernt...", "removeMember": "Entfernen",
    "removeMemberAccessibilityLabel": "{{name}} aus der Familie entfernen"
  },
  "plans": {
    "sectionHeader": "Pläne", "confirmingPurchase": "Kauf wird bestätigt…",
    "offeringsError": "Kaufoptionen konnten gerade nicht geladen werden. Du bist im {{tier}}-Plan mit {{limits}}.",
    "offeringsUnavailable": "Du bist im {{tier}}-Plan mit {{limits}}. Hier siehst du, was jeder Plan enthält — Store-Käufe sind auf diesem Gerät noch nicht verfügbar.",
    "currentBadge": "Aktuell", "retryOfferings": "Erneut versuchen",
    "retryOfferingsAccessibilityLabel": "Abonnementangebote erneut laden",
    "contactSupport": "Support kontaktieren", "contactSupportAccessibilityLabel": "Support kontaktieren"
  },
  "packageOption": {
    "currentPlanLabel": "Aktueller Plan", "subscribeLabel": "Abonnieren", "processingLabel": "Verarbeitung...",
    "currentPlanAccessibilityLabel": "Aktueller Plan {{title}} {{price}}",
    "subscribePlanAccessibilityLabel": "{{title}} {{price}} abonnieren"
  },
  "restore": {
    "button": "Käufe wiederherstellen", "accessibilityLabel": "Käufe wiederherstellen",
    "restoring": "Wird wiederhergestellt...", "verifying": "Wird überprüft...",
    "checkLater": "Später prüfen", "cancelledTitle": "Später prüfen",
    "cancelledBody": "Die Wiederherstellung läuft noch im Hintergrund. Aktualisiere den Bildschirm, wenn dein Abonnement nicht erscheint.",
    "cancelAccessibilityLabel": "Wiederherstellung später prüfen"
  },
  "topUp": {
    "sectionHeader": "Mehr Fragen benötigt?", "buyButton": "500 Credits kaufen",
    "buyAccessibilityLabel": "500 Credits kaufen",
    "credits": "Einmalkauf. Credits verfallen nach 12 Monaten.",
    "openingStore": "Store wird geöffnet...", "checkLater": "Später prüfen",
    "checkLaterAccessibilityLabel": "Top-up-Bestätigung abbrechen",
    "checkLaterTitle": "Später prüfen",
    "checkLaterBody": "Credits erscheinen in Kürze — nach unten ziehen zum Aktualisieren.",
    "confirmingPollMessage": "Kauf wird bestätigt...",
    "confirmingPollMessageLong": "Noch in Bearbeitung — dies kann bis zu 30 Sekunden dauern. Dein Kauf ist sicher."
  },
  "manageBilling": {
    "sectionHeader": "Verwalten", "button": "Abrechnung verwalten",
    "buttonAccessibilityLabel": "Abrechnung verwalten", "webInfo": "Abrechnung verwalten",
    "webInfoSubtitle": "Das Abonnement wird auf deinem Mobilgerät verwaltet",
    "opensAppStore": "Öffnet App Store-Abonnements", "opensGooglePlay": "Öffnet Google Play-Abonnements"
  },
  "byokWaitlist": {
    "heading": "Eigenen API-Schlüssel verwenden",
    "body": "Verwende deinen eigenen KI-API-Schlüssel für unbegrenzte Fragen. Trag dich in die Warteliste ein und wir benachrichtigen dich.",
    "joinButton": "Warteliste beitreten", "alreadyJoinedButton": "Bereits beigetreten",
    "joinAccessibilityLabel": "API-Schlüssel-Warteliste beitreten",
    "alreadyJoinedAccessibilityLabel": "Bereits auf der API-Schlüssel-Warteliste",
    "alerts": {
      "successTitle": "Du bist auf der Liste!", "successBody": "Wir benachrichtigen dich, wenn der eigene API-Schlüssel verfügbar ist.",
      "errorTitle": "Warteliste konnte nicht beigetreten werden", "errorBody": "Bitte überprüfe deine Verbindung und versuche es erneut."
    }
  },
  "alerts": {
    "restoreFailed": "Wiederherstellung fehlgeschlagen",
    "restoreFailedBody": "Käufe konnten nicht wiederhergestellt werden. Bitte erneut versuchen.",
    "noSubscriptionsFound": "Keine Abonnements gefunden",
    "noSubscriptionsFoundBody": "Es konnten keine früheren Käufe zum Wiederherstellen gefunden werden.",
    "checkAgain": "Erneut prüfen", "alreadyPurchasedTitle": "Bereits gekauft",
    "alreadyPurchasedBody": "Du besitzt dieses Abonnement bereits. Tippe auf 'Kaeufe wiederherstellen', um es auf diesem Geraet zu aktivieren.",
    "restorePurchasesButton": "Käufe wiederherstellen",
    "networkErrorTitle": "Netzwerkfehler", "networkErrorBody": "Bitte überprüfe deine Internetverbindung und versuche es erneut.",
    "purchaseFailedTitle": "Kauf fehlgeschlagen", "purchaseFailedBody": "Bei deinem Kauf ist ein unerwartetes Problem aufgetreten. Bitte erneut versuchen.",
    "manageBillingErrorTitle": "Abonnementverwaltung konnte nicht geöffnet werden",
    "manageBillingErrorBody": "Du kannst dein Abonnement direkt verwalten unter:\n{{url}}",
    "tryAgain": "Erneut versuchen",
    "topUpConnectionErrorTitle": "Verbindungsfehler",
    "topUpConnectionErrorBody": "Kaufoptionen konnten nicht geladen werden. Überprüfe deine Verbindung und versuche es erneut.",
    "topUpRetry": "Erneut versuchen", "topUpNotAvailableTitle": "Nicht verfügbar",
    "topUpNotAvailableBody": "Top-up-Credits sind gerade nicht verfügbar. Versuche es später oder kontaktiere den Support.",
    "topUpPurchaseConfirmedTitle": "Kauf bestätigt",
    "topUpPurchaseConfirmedBody": "Deine 500 Credits werden hinzugefügt. Sie erscheinen normalerweise innerhalb einer Minute — nach unten ziehen zum Aktualisieren.",
    "removeFamilyTitle": "Aus Familie entfernen?",
    "removeFamilyBody": "Das Profil von {{name}} wird aus diesem Familienplan entfernt und beim Profilwechsel ausgeblendet.",
    "removeFamilyConfirm": "Entfernen", "familyUpdatedTitle": "Familie aktualisiert",
    "familyUpdatedBody": "{{name}} wurde aus deinem Familienplan entfernt.",
    "removeFamilyErrorTitle": "Profil konnte nicht entfernt werden",
    "removeFamilyErrorBody": "Bitte überprüfe deine Verbindung und versuche es erneut.",
    "contactSupportTitle": "Support kontaktieren",
    "contactSupportBody": "Schreibe eine E-Mail an support@mentomate.app für Hilfe bei Abonnements."
  },
  "childPaywall": {
    "backAccessibilityLabel": "Zurück", "back": "Zurück", "title": "Gut gemacht bisher!",
    "progressWithXp_one": "Du hast {{topics}} Thema gelernt und {{xp}} XP gesammelt — weiter so!",
    "progressWithXp_other": "Du hast {{topics}} Themen gelernt und {{xp}} XP gesammelt — weiter so!",
    "progressExploring": "Du hast erkundet und gelernt — ein toller Start!",
    "quotaMessage": "Du hast alle deine kostenlosen Fragen verbraucht. Bitte dein Elternteil, ein Upgrade durchzuführen, damit du weiterlernen kannst.",
    "notifyParentLabel": "Elternteil benachrichtigen",
    "parentAlreadyNotifiedLabel": "Elternteil bereits benachrichtigt",
    "notifyParentButton": "Elternteil benachrichtigen", "parentNotifiedButton": "Elternteil benachrichtigt",
    "remindAgainIn": "Du kannst sie in {{time}} erneut erinnern.",
    "parentNotifiedExplore": "Dein Elternteil wurde benachrichtigt! Während du wartest, kannst du noch erkunden:",
    "waitingExplore": "Während du wartest, kannst du noch deine Bibliothek durchsuchen und deinen Fortschritt sehen.",
    "browseLibrary": "Bibliothek durchsuchen", "browseLibraryAccessibilityLabel": "Bibliothek durchsuchen",
    "seeProgress": "Fortschritt ansehen", "seeProgressAccessibilityLabel": "Fortschritt ansehen",
    "goHome": "Startseite", "goHomeAccessibilityLabel": "Startseite",
    "cooldownSeconds_one": "{{count}} Sekunde", "cooldownSeconds_other": "{{count}} Sekunden",
    "cooldownMinutes_one": "{{count}} Minute", "cooldownMinutes_other": "{{count}} Minuten",
    "cooldownHours_one": "{{count}} Stunde", "cooldownHours_other": "{{count}} Stunden",
    "cooldownZero": "0 Sekunden",
    "notifySentTitle": "Gesendet!", "notifySentBody": "Dein Elternteil wurde benachrichtigt!",
    "notifyAskParentTitle": "Elternteil fragen",
    "notifyAskParentBody": "Bitte dein Elternteil, die App zu öffnen und ein Abonnement abzuschließen.",
    "notifyErrorTitle": "Benachrichtigung konnte nicht gesendet werden",
    "notifyErrorBody": "Bitte überprüfe deine Verbindung und versuche es erneut."
  }
}

path = 'apps/mobile/src/i18n/locales/de.json'
with open(path, encoding='utf-8-sig') as f:
    d = json.load(f)
d['subscriptionScreen'] = de_block
with open(path, 'w', encoding='utf-8') as f:
    json.dump(d, f, ensure_ascii=False, indent=2)
    f.write('\n')
print('de.json written, keys:', len(d))
