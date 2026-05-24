"""
Add/update subscriptionScreen block in all 7 locale files.
Safe: loads current file, merges subscriptionScreen key, writes back.
Does NOT touch any other keys.
"""
import sys, json, os
sys.stdout.reconfigure(encoding='utf-8')

LOCALE_DIR = 'apps/mobile/src/i18n/locales'

# Full subscriptionScreen translation blocks per locale
TRANSLATIONS = {
    'en': {
        "back": "Back",
        "backAccessibilityLabel": "Go back",
        "title": "Subscription",
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
            "family": "1,500 questions/month shared",
            "pro": "Unlimited questions"
        },
        "tierFeatures": {
            "free": {
                "0": "10 questions per day",
                "1": "100 questions per month",
                "2": "Core learning topics",
                "3": "Progress tracking"
            },
            "plus": {
                "0": "700 questions per month",
                "1": "No daily limit",
                "2": "All learning topics",
                "3": "Priority support"
            },
            "family": {
                "0": "1,500 shared questions/month",
                "1": "Up to 5 family members",
                "2": "Family progress overview",
                "3": "All Plus features"
            },
            "pro": {
                "0": "Unlimited questions",
                "1": "Early access to new features",
                "2": "Dedicated support",
                "3": "All Family features"
            }
        },
        "packagePeriod": {
            "monthly": "Monthly",
            "annual": "Annual",
            "weekly": "Weekly",
            "lifetime": "Lifetime",
            "threeMonth": "3 Months",
            "sixMonth": "6 Months",
            "twoMonth": "2 Months"
        },
        "currentPlan": {
            "sectionHeader": "Current plan",
            "statusCancelling": "Cancelling",
            "statusPastDue": "Past due",
            "statusExpired": "Expired",
            "statusActive": "Active",
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
            "topUpCreditsRemaining_one": "+ {{count}} top-up credit remaining",
            "topUpCreditsRemaining_other": "+ {{count}} top-up credits remaining",
            "yourShare": "Your share",
            "yourUsage": "Your usage",
            "questionsCount_one": "{{count}} question",
            "questionsCount_other": "{{count}} questions",
            "familyAggregate": "Family aggregate",
            "quotaResets": "Quota resets {{date}}",
            "subscriptionRenews": "Subscription renews {{date}}",
            "dailyLimitResets": "Daily limit — resets at midnight"
        },
        "familyPool": {
            "sectionHeader": "Family pool",
            "profilesConnected": "of {{max}} profiles connected",
            "questionsLeft": "shared questions left this cycle.",
            "ownerSuffix": " (owner)",
            "removingMember": "Removing…",
            "removeMember": "Remove"
        },
        "plans": {
            "sectionHeader": "Plans",
            "confirmingPurchase": "Confirming purchase…",
            "currentBadge": "Current",
            "retryOfferings": "Retry",
            "retryOfferingsAccessibilityLabel": "Retry loading subscription offerings",
            "contactSupport": "Contact support",
            "contactSupportAccessibilityLabel": "Contact support",
            "offeringsError": "We could not load purchase options right now. You’re on the {{tier}} plan with {{limits}}.",
            "offeringsWebOnly": "You’re on the {{tier}} plan with {{limits}}. Here’s what each plan includes — store purchasing isn’t available on this device yet."
        },
        "packageOption": {
            "currentPlan": "Current plan",
            "subscribeTo": "Subscribe to",
            "subscribe": "Subscribe",
            "processing": "Processing…"
        },
        "restore": {
            "sectionHeader": "Restore purchases",
            "checkLater": "Check later"
        },
        "topUp": {
            "sectionHeader": "Need more questions?",
            "buyAccessibilityLabel": "Buy 500 credits",
            "buyButton": "Buy 500 credits",
            "openingStore": "Opening store…",
            "credits": "One-time purchase. Credits expire in 12 months.",
            "checkLater": "Check later",
            "checkLaterAccessibilityLabel": "Cancel top-up confirmation",
            "confirmingPollMessage": "Confirming your purchase…",
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
            "joinButton": "Join the waitlist",
            "leaveButton": "Leave waitlist",
            "joiningButton": "Joining…",
            "leavingButton": "Leaving…"
        },
        "childPaywall": {
            "title": "Ask a parent",
            "body": "You’ve used all your questions for today. Your parent needs to upgrade to keep learning.",
            "cooldownZero": "0 seconds",
            "cooldownHours_one": "{{count}} hour",
            "cooldownHours_other": "{{count}} hours",
            "cooldownMinutes_one": "{{count}} minute",
            "cooldownMinutes_other": "{{count}} minutes",
            "cooldownSeconds_one": "{{count}} second",
            "cooldownSeconds_other": "{{count}} seconds",
            "xpThisWeek_one": "{{count}} XP this week",
            "xpThisWeek_other": "{{count}} XP this week",
            "topicsThisWeek_one": "{{count}} topic this week",
            "topicsThisWeek_other": "{{count}} topics this week"
        },
        "alerts": {
            "topUpNotAvailableTitle": "Not available",
            "topUpNotAvailableBody": "Top-up credits aren’t available right now. Try again later or contact support.",
            "topUpRetry": "Retry",
            "networkErrorTitle": "Network error",
            "networkErrorBody": "Please check your internet connection and try again.",
            "purchaseFailedTitle": "Purchase failed",
            "purchaseFailedBody": "Something unexpected happened with your purchase. Please try again.",
            "alreadyPurchasedTitle": "Already purchased",
            "alreadyPurchasedBody": "It looks like you already own this subscription. Tap “Restore purchases” to activate it on this device.",
            "restorePurchasesButton": "Restore purchases",
            "manageBillingErrorTitle": "Could not open subscription management",
            "manageBillingErrorBody": "You can manage your subscription directly at:\n{{url}}",
            "tryAgain": "Try again",
            "checkAgain": "Check again",
            "topUpPurchaseConfirmedTitle": "Purchase confirmed",
            "topUpPurchaseConfirmedBody": "Your 500 credits are being added. They usually appear within a minute — pull down to refresh your usage.",
            "topUpCheckLaterTitle": "Check later",
            "topUpCheckLaterBody": "Credits will appear shortly — tap refresh to check.",
            "contactSupportTitle": "Contact support",
            "contactSupportBody": "Email support@mentomate.app for help with subscriptions.",
            "removeFamilyTitle": "Remove from family?",
            "removeFamilyBody": "{{name}}’s profile will be removed from this family plan and hidden from profile switching.",
            "removeFamilyConfirm": "Remove",
            "familyUpdatedTitle": "Family updated",
            "familyUpdatedBody": "{{name}} was removed from your family plan.",
            "removeFamilyErrorTitle": "Could not remove profile",
            "removeFamilyErrorBody": "Please check your connection and try again."
        }
    }
}

# Translations for other locales
OTHER_LOCALES = {
    'de': {
        "back": "Zurück",
        "backAccessibilityLabel": "Zurück",
        "title": "Abonnement",
        "loading": {
            "error": "Abonnementdetails konnten nicht geladen werden. Bitte versuche es erneut.",
            "retryAccessibilityLabel": "Abonnement erneut laden",
            "retry": "Erneut versuchen"
        },
        "tierLabels": {"free": "Kostenlos", "plus": "Plus", "family": "Familie", "pro": "Pro"},
        "tierLimits": {
            "free": "10 Fragen/Tag, 100/Monat",
            "plus": "700 Fragen/Monat",
            "family": "1.500 geteilte Fragen/Monat",
            "pro": "Unbegrenzte Fragen"
        },
        "tierFeatures": {
            "free": {"0": "10 Fragen pro Tag", "1": "100 Fragen pro Monat", "2": "Kern-Lernthemen", "3": "Fortschrittsverfolgung"},
            "plus": {"0": "700 Fragen pro Monat", "1": "Kein Tägliches Limit", "2": "Alle Lernthemen", "3": "Priorisierter Support"},
            "family": {"0": "1.500 geteilte Fragen/Monat", "1": "Bis zu 5 Familienmitglieder", "2": "Familienfortschrittsübersicht", "3": "Alle Plus-Funktionen"},
            "pro": {"0": "Unbegrenzte Fragen", "1": "Frühzeitiger Zugang zu neuen Funktionen", "2": "Dedizierter Support", "3": "Alle Familienfunktionen"}
        },
        "packagePeriod": {"monthly": "Monatlich", "annual": "Jährlich", "weekly": "Wöchentlich", "lifetime": "Lebenslang", "threeMonth": "3 Monate", "sixMonth": "6 Monate", "twoMonth": "2 Monate"},
        "currentPlan": {
            "sectionHeader": "Aktueller Plan",
            "statusCancelling": "Wird gekündigt",
            "statusPastDue": "Überfällig",
            "statusExpired": "Abgelaufen",
            "statusActive": "Aktiv",
            "accessUntil": "Zugang bis {{date}}",
            "renews": "Verlängert am {{date}}",
            "upgradeButton": "Upgraden",
            "upgradeAccessibilityLabel": "Plan upgraden"
        },
        "cancellationNotice": {
            "title": "Abonnement endet",
            "body": "Dein Abonnement wurde gekündigt. Du kannst alle Funktionen bis {{date}} weiter nutzen. Danach wird dein Konto auf den kostenlosen Tarif zurückgesetzt."
        },
        "usage": {
            "sectionHeader": "Nutzung diesen Monat",
            "dailyQuestions": "Heute: {{used}} / {{limit}} tägliche Fragen",
            "topUpCreditsRemaining_one": "+ {{count}} Auflade-Kredit verbleibend",
            "topUpCreditsRemaining_other": "+ {{count}} Auflade-Kredite verbleibend",
            "yourShare": "Dein Anteil",
            "yourUsage": "Deine Nutzung",
            "questionsCount_one": "{{count}} Frage",
            "questionsCount_other": "{{count}} Fragen",
            "familyAggregate": "Familien-Gesamt",
            "quotaResets": "Kontingent wird {{date}} zurückgesetzt",
            "subscriptionRenews": "Abonnement verlängert sich am {{date}}",
            "dailyLimitResets": "Tägliches Limit — setzt um Mitternacht zurück"
        },
        "familyPool": {
            "sectionHeader": "Familienpool",
            "profilesConnected": "von {{max}} Profilen verbunden",
            "questionsLeft": "geteilte Fragen diesen Zyklus verbleibend.",
            "ownerSuffix": " (Inhaber)",
            "removingMember": "Wird entfernt…",
            "removeMember": "Entfernen"
        },
        "plans": {
            "sectionHeader": "Pläne",
            "confirmingPurchase": "Kauf wird bestätigt…",
            "currentBadge": "Aktuell",
            "retryOfferings": "Erneut versuchen",
            "retryOfferingsAccessibilityLabel": "Abonnementangebote erneut laden",
            "contactSupport": "Support kontaktieren",
            "contactSupportAccessibilityLabel": "Support kontaktieren",
            "offeringsError": "Kaufoptionen konnten gerade nicht geladen werden. Du bist im {{tier}}-Plan mit {{limits}}.",
            "offeringsWebOnly": "Du bist im {{tier}}-Plan mit {{limits}}. Hier siehst du, was jeder Plan beinhaltet — der Store-Kauf ist auf diesem Gerät noch nicht verfügbar."
        },
        "packageOption": {"currentPlan": "Aktueller Plan", "subscribeTo": "Abonnieren", "subscribe": "Abonnieren", "processing": "Wird verarbeitet…"},
        "restore": {"sectionHeader": "Käufe wiederherstellen", "checkLater": "Später prüfen"},
        "topUp": {
            "sectionHeader": "Mehr Fragen nötig?",
            "buyAccessibilityLabel": "500 Kredite kaufen",
            "buyButton": "500 Kredite kaufen",
            "openingStore": "Öffne Store…",
            "credits": "Einmaliger Kauf. Kredite verfallen nach 12 Monaten.",
            "checkLater": "Später prüfen",
            "checkLaterAccessibilityLabel": "Auflade-Bestätigung abbrechen",
            "confirmingPollMessage": "Kauf wird bestätigt…",
            "confirmingPollMessageLong": "Noch bestätigen — das kann bis zu 30 Sekunden dauern. Dein Kauf ist sicher."
        },
        "manageBilling": {
            "sectionHeader": "Verwalten",
            "button": "Abrechnung verwalten",
            "buttonAccessibilityLabel": "Abrechnung verwalten",
            "webInfo": "Abrechnung verwalten",
            "webInfoSubtitle": "Das Abonnement wird auf deinem Mobilgerät verwaltet",
            "opensAppStore": "Öffnet App Store-Abonnements",
            "opensGooglePlay": "Öffnet Google Play-Abonnements"
        },
        "byokWaitlist": {"joinButton": "Warteliste beitreten", "leaveButton": "Warteliste verlassen", "joiningButton": "Beitreten…", "leavingButton": "Verlassen…"},
        "childPaywall": {
            "title": "Elternteil fragen",
            "body": "Du hast alle deine Fragen für heute verwendet. Dein Elternteil muss upgraden, um weiterzulernen.",
            "cooldownZero": "0 Sekunden",
            "cooldownHours_one": "{{count}} Stunde",
            "cooldownHours_other": "{{count}} Stunden",
            "cooldownMinutes_one": "{{count}} Minute",
            "cooldownMinutes_other": "{{count}} Minuten",
            "cooldownSeconds_one": "{{count}} Sekunde",
            "cooldownSeconds_other": "{{count}} Sekunden",
            "xpThisWeek_one": "{{count}} XP diese Woche",
            "xpThisWeek_other": "{{count}} XP diese Woche",
            "topicsThisWeek_one": "{{count}} Thema diese Woche",
            "topicsThisWeek_other": "{{count}} Themen diese Woche"
        },
        "alerts": {
            "topUpNotAvailableTitle": "Nicht verfügbar",
            "topUpNotAvailableBody": "Auflade-Kredite sind gerade nicht verfügbar. Versuche es später erneut oder kontaktiere den Support.",
            "topUpRetry": "Erneut versuchen",
            "networkErrorTitle": "Netzwerkfehler",
            "networkErrorBody": "Bitte prüfe deine Internetverbindung und versuche es erneut.",
            "purchaseFailedTitle": "Kauf fehlgeschlagen",
            "purchaseFailedBody": "Bei deinem Kauf ist etwas Unerwartetes passiert. Bitte versuche es erneut.",
            "alreadyPurchasedTitle": "Bereits erworben",
            "alreadyPurchasedBody": "Es sieht so aus, als ob du dieses Abonnement bereits besitzt. Tippe auf 'Käufe wiederherstellen', um es auf diesem Gerät zu aktivieren.",
            "restorePurchasesButton": "Käufe wiederherstellen",
            "manageBillingErrorTitle": "Abonnementverwaltung konnte nicht geöffnet werden",
            "manageBillingErrorBody": "Du kannst dein Abonnement direkt unter folgendem Link verwalten:\n{{url}}",
            "tryAgain": "Erneut versuchen",
            "checkAgain": "Erneut prüfen",
            "topUpPurchaseConfirmedTitle": "Kauf bestätigt",
            "topUpPurchaseConfirmedBody": "Deine 500 Kredite werden hinzugefügt. Sie erscheinen in der Regel innerhalb einer Minute — ziehe zum Aktualisieren nach unten.",
            "topUpCheckLaterTitle": "Später prüfen",
            "topUpCheckLaterBody": "Kredite erscheinen in Kürze — tippe zum Überprüfen auf Aktualisieren.",
            "contactSupportTitle": "Support kontaktieren",
            "contactSupportBody": "Schreibe an support@mentomate.app für Hilfe bei Abonnements.",
            "removeFamilyTitle": "Aus Familie entfernen?",
            "removeFamilyBody": "Das Profil von {{name}} wird aus diesem Familienplan entfernt und bei der Profilauswahl ausgeblendet.",
            "removeFamilyConfirm": "Entfernen",
            "familyUpdatedTitle": "Familie aktualisiert",
            "familyUpdatedBody": "{{name}} wurde aus deinem Familienplan entfernt.",
            "removeFamilyErrorTitle": "Profil konnte nicht entfernt werden",
            "removeFamilyErrorBody": "Bitte prüfe deine Verbindung und versuche es erneut."
        }
    },
    'es': {
        "back": "Atrás",
        "backAccessibilityLabel": "Volver",
        "title": "Suscripción",
        "loading": {"error": "No se pudieron cargar los detalles de la suscripción. Inténtalo de nuevo.", "retryAccessibilityLabel": "Reintentar carga de suscripción", "retry": "Reintentar"},
        "tierLabels": {"free": "Gratis", "plus": "Plus", "family": "Familiar", "pro": "Pro"},
        "tierLimits": {"free": "10 preguntas/día, 100/mes", "plus": "700 preguntas/mes", "family": "1.500 preguntas compartidas/mes", "pro": "Preguntas ilimitadas"},
        "tierFeatures": {
            "free": {"0": "10 preguntas al día", "1": "100 preguntas al mes", "2": "Temas de aprendizaje básicos", "3": "Seguimiento del progreso"},
            "plus": {"0": "700 preguntas al mes", "1": "Sin límite diario", "2": "Todos los temas de aprendizaje", "3": "Soporte prioritario"},
            "family": {"0": "1.500 preguntas compartidas/mes", "1": "Hasta 5 miembros de la familia", "2": "Resumen del progreso familiar", "3": "Todas las funciones Plus"},
            "pro": {"0": "Preguntas ilimitadas", "1": "Acceso anticipado a nuevas funciones", "2": "Soporte dedicado", "3": "Todas las funciones familiares"}
        },
        "packagePeriod": {"monthly": "Mensual", "annual": "Anual", "weekly": "Semanal", "lifetime": "De por vida", "threeMonth": "3 meses", "sixMonth": "6 meses", "twoMonth": "2 meses"},
        "currentPlan": {
            "sectionHeader": "Plan actual",
            "statusCancelling": "Cancelando",
            "statusPastDue": "Vencido",
            "statusExpired": "Expirado",
            "statusActive": "Activo",
            "accessUntil": "Acceso hasta {{date}}",
            "renews": "Se renueva el {{date}}",
            "upgradeButton": "Mejorar",
            "upgradeAccessibilityLabel": "Mejorar plan"
        },
        "cancellationNotice": {
            "title": "Suscripción finaliza",
            "body": "Tu suscripción ha sido cancelada. Puedes continuar usando todas las funciones hasta {{date}}. Después de eso, tu cuenta volverá al nivel Gratis."
        },
        "usage": {
            "sectionHeader": "Uso este mes",
            "dailyQuestions": "Hoy: {{used}} / {{limit}} preguntas diarias",
            "topUpCreditsRemaining_one": "+ {{count}} crédito de recarga restante",
            "topUpCreditsRemaining_other": "+ {{count}} créditos de recarga restantes",
            "yourShare": "Tu parte",
            "yourUsage": "Tu uso",
            "questionsCount_one": "{{count}} pregunta",
            "questionsCount_other": "{{count}} preguntas",
            "familyAggregate": "Total familiar",
            "quotaResets": "La cuota se restablece el {{date}}",
            "subscriptionRenews": "La suscripción se renueva el {{date}}",
            "dailyLimitResets": "Límite diario — se restablece a medianoche"
        },
        "familyPool": {
            "sectionHeader": "Grupo familiar",
            "profilesConnected": "de {{max}} perfiles conectados",
            "questionsLeft": "preguntas compartidas restantes este ciclo.",
            "ownerSuffix": " (propietario)",
            "removingMember": "Eliminando…",
            "removeMember": "Eliminar"
        },
        "plans": {
            "sectionHeader": "Planes",
            "confirmingPurchase": "Confirmando compra…",
            "currentBadge": "Actual",
            "retryOfferings": "Reintentar",
            "retryOfferingsAccessibilityLabel": "Reintentar carga de ofertas de suscripción",
            "contactSupport": "Contactar soporte",
            "contactSupportAccessibilityLabel": "Contactar soporte",
            "offeringsError": "No se pudieron cargar las opciones de compra ahora mismo. Estás en el plan {{tier}} con {{limits}}.",
            "offeringsWebOnly": "Estás en el plan {{tier}} con {{limits}}. Aquí tienes lo que incluye cada plan — las compras en la tienda aún no están disponibles en este dispositivo."
        },
        "packageOption": {"currentPlan": "Plan actual", "subscribeTo": "Suscribirse a", "subscribe": "Suscribirse", "processing": "Procesando…"},
        "restore": {"sectionHeader": "Restaurar compras", "checkLater": "Revisar más tarde"},
        "topUp": {
            "sectionHeader": "¿Necesitas más preguntas?",
            "buyAccessibilityLabel": "Comprar 500 créditos",
            "buyButton": "Comprar 500 créditos",
            "openingStore": "Abriendo tienda…",
            "credits": "Compra única. Los créditos expiran en 12 meses.",
            "checkLater": "Revisar más tarde",
            "checkLaterAccessibilityLabel": "Cancelar confirmación de recarga",
            "confirmingPollMessage": "Confirmando tu compra…",
            "confirmingPollMessageLong": "Aún confirmando — esto puede tardar hasta 30 segundos. Tu compra está segura."
        },
        "manageBilling": {
            "sectionHeader": "Administrar",
            "button": "Administrar facturación",
            "buttonAccessibilityLabel": "Administrar facturación",
            "webInfo": "Administrar facturación",
            "webInfoSubtitle": "La suscripción se administra en tu dispositivo móvil",
            "opensAppStore": "Abre suscripciones de App Store",
            "opensGooglePlay": "Abre suscripciones de Google Play"
        },
        "byokWaitlist": {"joinButton": "Unirse a la lista de espera", "leaveButton": "Salir de la lista de espera", "joiningButton": "Uniéndose…", "leavingButton": "Saliendo…"},
        "childPaywall": {
            "title": "Pregunta a un padre",
            "body": "Has usado todas tus preguntas de hoy. Tu padre necesita actualizar para seguir aprendiendo.",
            "cooldownZero": "0 segundos",
            "cooldownHours_one": "{{count}} hora",
            "cooldownHours_other": "{{count}} horas",
            "cooldownMinutes_one": "{{count}} minuto",
            "cooldownMinutes_other": "{{count}} minutos",
            "cooldownSeconds_one": "{{count}} segundo",
            "cooldownSeconds_other": "{{count}} segundos",
            "xpThisWeek_one": "{{count}} XP esta semana",
            "xpThisWeek_other": "{{count}} XP esta semana",
            "topicsThisWeek_one": "{{count}} tema esta semana",
            "topicsThisWeek_other": "{{count}} temas esta semana"
        },
        "alerts": {
            "topUpNotAvailableTitle": "No disponible",
            "topUpNotAvailableBody": "Los créditos de recarga no están disponibles ahora mismo. Inténtalo más tarde o contacta al soporte.",
            "topUpRetry": "Reintentar",
            "networkErrorTitle": "Error de red",
            "networkErrorBody": "Por favor revisa tu conexión a internet e inténtalo de nuevo.",
            "purchaseFailedTitle": "Compra fallida",
            "purchaseFailedBody": "Algo inesperado ocurrió con tu compra. Por favor inténtalo de nuevo.",
            "alreadyPurchasedTitle": "Ya adquirido",
            "alreadyPurchasedBody": "Parece que ya tienes esta suscripción. Toca 'Restaurar compras' para activarla en este dispositivo.",
            "restorePurchasesButton": "Restaurar compras",
            "manageBillingErrorTitle": "No se pudo abrir la gestión de suscripciones",
            "manageBillingErrorBody": "Puedes gestionar tu suscripción directamente en:\n{{url}}",
            "tryAgain": "Intentar de nuevo",
            "checkAgain": "Revisar de nuevo",
            "topUpPurchaseConfirmedTitle": "Compra confirmada",
            "topUpPurchaseConfirmedBody": "Tus 500 créditos están siendo agregados. Normalmente aparecen en un minuto — desliza hacia abajo para actualizar tu uso.",
            "topUpCheckLaterTitle": "Revisar más tarde",
            "topUpCheckLaterBody": "Los créditos aparecerán en breve — toca actualizar para verificar.",
            "contactSupportTitle": "Contactar soporte",
            "contactSupportBody": "Escribe a support@mentomate.app para ayuda con suscripciones.",
            "removeFamilyTitle": "¿Eliminar de la familia?",
            "removeFamilyBody": "El perfil de {{name}} será eliminado de este plan familiar y ocultado del cambio de perfil.",
            "removeFamilyConfirm": "Eliminar",
            "familyUpdatedTitle": "Familia actualizada",
            "familyUpdatedBody": "{{name}} fue eliminado de tu plan familiar.",
            "removeFamilyErrorTitle": "No se pudo eliminar el perfil",
            "removeFamilyErrorBody": "Por favor revisa tu conexión e inténtalo de nuevo."
        }
    },
    'ja': {
        "back": "戻る",
        "backAccessibilityLabel": "戻る",
        "title": "サブスクリプション",
        "loading": {"error": "サブスクリプションの詳細を読み込めませんでした。もう一度お試しください。", "retryAccessibilityLabel": "サブスクリプションを再読み込み", "retry": "再試行"},
        "tierLabels": {"free": "無料", "plus": "Plus", "family": "ファミリー", "pro": "Pro"},
        "tierLimits": {"free": "1日10問、月100問", "plus": "月700問", "family": "月1,500問共有", "pro": "無制限"},
        "tierFeatures": {
            "free": {"0": "1日10問", "1": "月10問", "2": "基本学習トピック", "3": "進捗管理"},
            "plus": {"0": "月700問", "1": "日次制限なし", "2": "全学習トピック", "3": "優先サポート"},
            "family": {"0": "月1,500問共有", "1": "最大10名まで", "2": "家族進捗概要", "3": "Plusの全機能"},
            "pro": {"0": "無制限の質問", "1": "新機能への早期アクセス", "2": "専属サポート", "3": "Familyの全機能"}
        },
        "packagePeriod": {"monthly": "月次", "annual": "年次", "weekly": "週次", "lifetime": "永久", "threeMonth": "3か月", "sixMonth": "6か月", "twoMonth": "2か月"},
        "currentPlan": {
            "sectionHeader": "現在のプラン",
            "statusCancelling": "解約中",
            "statusPastDue": "未払い",
            "statusExpired": "期限切れ",
            "statusActive": "有効",
            "accessUntil": "{{date}}まで利用可能",
            "renews": "{{date}}に更新",
            "upgradeButton": "アップグレード",
            "upgradeAccessibilityLabel": "プランをアップグレード"
        },
        "cancellationNotice": {
            "title": "サブスクリプション終了",
            "body": "サブスクリプションがキャンセルされました。{{date}}まで全機能を引き続き使用できます。その後、アカウントは無料プランに戻ります。"
        },
        "usage": {
            "sectionHeader": "今月の利用状況",
            "dailyQuestions": "本日: {{used}} / {{limit}}問",
            "topUpCreditsRemaining_one": "+ トップアップクレジット{{count}}残",
            "topUpCreditsRemaining_other": "+ トップアップクレジット{{count}}残",
            "yourShare": "自分の分",
            "yourUsage": "自分の利用",
            "questionsCount_one": "{{count}}問",
            "questionsCount_other": "{{count}}問",
            "familyAggregate": "家族合計",
            "quotaResets": "クォータリセット: {{date}}",
            "subscriptionRenews": "サブスクリプション更新日: {{date}}",
            "dailyLimitResets": "日次上限 — 真夜にリセット"
        },
        "familyPool": {
            "sectionHeader": "ファミリープール",
            "profilesConnected": "/ {{max}}プロフィール接続中",
            "questionsLeft": "今周の共有問残り",
            "ownerSuffix": " (オーナー)",
            "removingMember": "削除中…",
            "removeMember": "削除"
        },
        "plans": {
            "sectionHeader": "プラン",
            "confirmingPurchase": "購入を確認中…",
            "currentBadge": "現在",
            "retryOfferings": "再試行",
            "retryOfferingsAccessibilityLabel": "サブスクリプションオファーを再読み込み",
            "contactSupport": "サポートに連絡",
            "contactSupportAccessibilityLabel": "サポートに連絡",
            "offeringsError": "購入オプションを読み込めませんでした。現在{{tier}}プラン・{{limits}}です。",
            "offeringsWebOnly": "現在{{tier}}プラン・{{limits}}です。各プランの内容—このデバイスではまだストアでの購入はできません。"
        },
        "packageOption": {"currentPlan": "現在のプラン", "subscribeTo": "登録", "subscribe": "登録", "processing": "処理中…"},
        "restore": {"sectionHeader": "購入を復元", "checkLater": "後で確認"},
        "topUp": {
            "sectionHeader": "質問が足りない？",
            "buyAccessibilityLabel": "500クレジットを購入",
            "buyButton": "500クレジットを購入",
            "openingStore": "ストアを開く…",
            "credits": "一回購入。クレジットは12か月後に消滅。",
            "checkLater": "後で確認",
            "checkLaterAccessibilityLabel": "トップアップ確認をキャンセル",
            "confirmingPollMessage": "購入を確認中…",
            "confirmingPollMessageLong": "トップアップ確認中 — 最大30秒かかることがあります。購入は安全です。"
        },
        "manageBilling": {
            "sectionHeader": "管理",
            "button": "支払い管理",
            "buttonAccessibilityLabel": "支払い管理",
            "webInfo": "支払い管理",
            "webInfoSubtitle": "サブスクリプションはモバイルデバイスで管理されています",
            "opensAppStore": "App Storeのサブスクリプションを開く",
            "opensGooglePlay": "Google Playのサブスクリプションを開く"
        },
        "byokWaitlist": {"joinButton": "ウェイトリストに登録", "leaveButton": "ウェイトリストを退出", "joiningButton": "登録中…", "leavingButton": "退出中…"},
        "childPaywall": {
            "title": "保護者に相談",
            "body": "本日の質問を使い切りました。学習を続けるには保護者のアップグレードが必要です。",
            "cooldownZero": "0秒",
            "cooldownHours_one": "{{count}}時間",
            "cooldownHours_other": "{{count}}時間",
            "cooldownMinutes_one": "{{count}}分",
            "cooldownMinutes_other": "{{count}}分",
            "cooldownSeconds_one": "{{count}}秒",
            "cooldownSeconds_other": "{{count}}秒",
            "xpThisWeek_one": "今週{{count}} XP",
            "xpThisWeek_other": "今週{{count}} XP",
            "topicsThisWeek_one": "今週{{count}}トピック",
            "topicsThisWeek_other": "今週{{count}}トピック"
        },
        "alerts": {
            "topUpNotAvailableTitle": "利用不可",
            "topUpNotAvailableBody": "トップアップクレジットは現在利用できません。後で再度お試しいただくか、サポートにお啔いしてください。",
            "topUpRetry": "再試行",
            "networkErrorTitle": "ネットワークエラー",
            "networkErrorBody": "インターネット接続を確認して再度お試しください。",
            "purchaseFailedTitle": "購入失敗",
            "purchaseFailedBody": "購入中に予期せぬエラーが発生しました。もう一度お試しください。",
            "alreadyPurchasedTitle": "購入済み",
            "alreadyPurchasedBody": "このサブスクリプションはすでに購入済みのようです。'購入を復元'をタップしてこのデバイスで有効にしてください。",
            "restorePurchasesButton": "購入を復元",
            "manageBillingErrorTitle": "サブスクリプション管理を開けませんでした",
            "manageBillingErrorBody": "次のURLで直接サブスクリプションを管理できます:\n{{url}}",
            "tryAgain": "再試行",
            "checkAgain": "再度確認",
            "topUpPurchaseConfirmedTitle": "購入確認",
            "topUpPurchaseConfirmedBody": "500クレジットが追加されています。通常1分以内に表示されます—下に引っ張って更新してください。",
            "topUpCheckLaterTitle": "後で確認",
            "topUpCheckLaterBody": "クレジットはすぐに表示されます—更新して確認してください。",
            "contactSupportTitle": "サポートに連絡",
            "contactSupportBody": "サブスクリプションについては support@mentomate.app までお問い合わせください。",
            "removeFamilyTitle": "ファミリーから削除？",
            "removeFamilyBody": "{{name}}のプロフィールはこのファミリープランから削除され、プロフィール切り替えから非表示になります。",
            "removeFamilyConfirm": "削除",
            "familyUpdatedTitle": "ファミリーを更新しました",
            "familyUpdatedBody": "{{name}}がファミリープランから削除されました。",
            "removeFamilyErrorTitle": "プロファイルを削除できませんでした",
            "removeFamilyErrorBody": "接続を確認して再度お試しください。"
        }
    },
    'nb': {
        "back": "Tilbake",
        "backAccessibilityLabel": "Gå tilbake",
        "title": "Abonnement",
        "loading": {"error": "Kunne ikke laste abonnementsdetaljer. Prøv igjen.", "retryAccessibilityLabel": "Last inn abonnement på nytt", "retry": "Prøv igjen"},
        "tierLabels": {"free": "Gratis", "plus": "Plus", "family": "Familie", "pro": "Pro"},
        "tierLimits": {"free": "10 spørsmål/dag, 100/måned", "plus": "700 spørsmål/måned", "family": "1 500 delte spørsmål/måned", "pro": "Ubegrenset"},
        "tierFeatures": {
            "free": {"0": "10 spørsmål per dag", "1": "100 spørsmål per måned", "2": "Kjerne-læringsemner", "3": "Fremgangsspøring"},
            "plus": {"0": "700 spørsmål per måned", "1": "Ingen daglig grense", "2": "Alle læringsemner", "3": "Prioritert støtte"},
            "family": {"0": "1 500 delte spørsmål/måned", "1": "Opptil 5 familiemedlemmer", "2": "Familiefremgangs-oversikt", "3": "Alle Plus-funksjoner"},
            "pro": {"0": "Ubegrenset antall spørsmål", "1": "Tidlig tilgang til nye funksjoner", "2": "Dedikert støtte", "3": "Alle Familie-funksjoner"}
        },
        "packagePeriod": {"monthly": "Månedlig", "annual": "Årlig", "weekly": "Ukentlig", "lifetime": "Livstid", "threeMonth": "3 måneder", "sixMonth": "6 måneder", "twoMonth": "2 måneder"},
        "currentPlan": {
            "sectionHeader": "Nåværende plan",
            "statusCancelling": "Avbestilles",
            "statusPastDue": "Forfalt",
            "statusExpired": "Utløpt",
            "statusActive": "Aktiv",
            "accessUntil": "Tilgang til {{date}}",
            "renews": "Fornyes {{date}}",
            "upgradeButton": "Oppgrader",
            "upgradeAccessibilityLabel": "Oppgrader plan"
        },
        "cancellationNotice": {
            "title": "Abonnement avsluttes",
            "body": "Abonnementet ditt er avbestilt. Du kan fortsette å bruke alle funksjoner til {{date}}. Etter det vil kontoen din gå tilbake til Gratis-nivå."
        },
        "usage": {
            "sectionHeader": "Bruk denne måneden",
            "dailyQuestions": "I dag: {{used}} / {{limit}} daglige spørsmål",
            "topUpCreditsRemaining_one": "+ {{count}} påfyllings-kreditt gjenstår",
            "topUpCreditsRemaining_other": "+ {{count}} påfyllings-kreditter gjenstår",
            "yourShare": "Din andel",
            "yourUsage": "Din bruk",
            "questionsCount_one": "{{count}} spørsmål",
            "questionsCount_other": "{{count}} spørsmål",
            "familyAggregate": "Familie totalt",
            "quotaResets": "Kvote tilbakestilles {{date}}",
            "subscriptionRenews": "Abonnement fornyes {{date}}",
            "dailyLimitResets": "Daglig grense — tilbakestilles ved midnatt"
        },
        "familyPool": {
            "sectionHeader": "Familiepott",
            "profilesConnected": "av {{max}} profiler tilkoblet",
            "questionsLeft": "delte spørsmål igjen denne syklusen.",
            "ownerSuffix": " (eier)",
            "removingMember": "Fjerner…",
            "removeMember": "Fjern"
        },
        "plans": {
            "sectionHeader": "Planer",
            "confirmingPurchase": "Bekrefter kjøp…",
            "currentBadge": "Nåværende",
            "retryOfferings": "Prøv igjen",
            "retryOfferingsAccessibilityLabel": "Last inn abonnementstilbud på nytt",
            "contactSupport": "Kontakt support",
            "contactSupportAccessibilityLabel": "Kontakt support",
            "offeringsError": "Kunne ikke laste kjøpsalternativer akkurat nå. Du er på {{tier}}-planen med {{limits}}.",
            "offeringsWebOnly": "Du er på {{tier}}-planen med {{limits}}. Her er hva hver plan inkluderer — butikkjøp er ikke tilgjengelig på denne enheten ennå."
        },
        "packageOption": {"currentPlan": "Nåværende plan", "subscribeTo": "Abonner på", "subscribe": "Abonner", "processing": "Behandler…"},
        "restore": {"sectionHeader": "Gjenopprett kjøp", "checkLater": "Sjekk senere"},
        "topUp": {
            "sectionHeader": "Trenger du flere spørsmål?",
            "buyAccessibilityLabel": "Kjøp 500 kreditter",
            "buyButton": "Kjøp 500 kreditter",
            "openingStore": "Åpner butikk…",
            "credits": "Engangs-kjøp. Kreditter utløper etter 12 måneder.",
            "checkLater": "Sjekk senere",
            "checkLaterAccessibilityLabel": "Avbryt påfyllings-bekreftelse",
            "confirmingPollMessage": "Bekrefter kjøpet ditt…",
            "confirmingPollMessageLong": "Bekrefter fortsatt — dette kan ta opptil 30 sekunder. Kjøpet ditt er trygt."
        },
        "manageBilling": {
            "sectionHeader": "Administrer",
            "button": "Administrer fakturering",
            "buttonAccessibilityLabel": "Administrer fakturering",
            "webInfo": "Administrer fakturering",
            "webInfoSubtitle": "Abonnementet administreres på mobilenheten din",
            "opensAppStore": "Åpner App Store-abonnementer",
            "opensGooglePlay": "Åpner Google Play-abonnementer"
        },
        "byokWaitlist": {"joinButton": "Bli med på ventelisten", "leaveButton": "Forlat ventelisten", "joiningButton": "Blir med…", "leavingButton": "Forlater…"},
        "childPaywall": {
            "title": "Spør en foresatt",
            "body": "Du har brukt alle spørsmålene dine for i dag. Den foresatte må oppgradere for å fortsette læringen.",
            "cooldownZero": "0 sekunder",
            "cooldownHours_one": "{{count}} time",
            "cooldownHours_other": "{{count}} timer",
            "cooldownMinutes_one": "{{count}} minutt",
            "cooldownMinutes_other": "{{count}} minutter",
            "cooldownSeconds_one": "{{count}} sekund",
            "cooldownSeconds_other": "{{count}} sekunder",
            "xpThisWeek_one": "{{count}} XP denne uken",
            "xpThisWeek_other": "{{count}} XP denne uken",
            "topicsThisWeek_one": "{{count}} emne denne uken",
            "topicsThisWeek_other": "{{count}} emner denne uken"
        },
        "alerts": {
            "topUpNotAvailableTitle": "Ikke tilgjengelig",
            "topUpNotAvailableBody": "Påfyllings-kreditter er ikke tilgjengelig akkurat nå. Prøv igjen senere eller kontakt support.",
            "topUpRetry": "Prøv igjen",
            "networkErrorTitle": "Nettverksfeil",
            "networkErrorBody": "Vennligst sjekk internettforbindelsen din og prøv igjen.",
            "purchaseFailedTitle": "Kjøp mislyktes",
            "purchaseFailedBody": "Noe uventet skjedde med kjøpet ditt. Vennligst prøv igjen.",
            "alreadyPurchasedTitle": "Allerede kjøpt",
            "alreadyPurchasedBody": "Det ser ut til at du allerede eier dette abonnementet. Trykk 'Gjenopprett kjøp' for å aktivere det på denne enheten.",
            "restorePurchasesButton": "Gjenopprett kjøp",
            "manageBillingErrorTitle": "Kunne ikke åpne abonnementsadministrasjon",
            "manageBillingErrorBody": "Du kan administrere abonnementet ditt direkte på:\n{{url}}",
            "tryAgain": "Prøv igjen",
            "checkAgain": "Sjekk igjen",
            "topUpPurchaseConfirmedTitle": "Kjøp bekreftet",
            "topUpPurchaseConfirmedBody": "Dine 500 kreditter legges til. De vises vanligvis innen ett minutt — dra ned for å oppdatere bruken din.",
            "topUpCheckLaterTitle": "Sjekk senere",
            "topUpCheckLaterBody": "Kreditter vil snart vises — trykk oppdater for å sjekke.",
            "contactSupportTitle": "Kontakt support",
            "contactSupportBody": "E-post support@mentomate.app for hjelp med abonnementer.",
            "removeFamilyTitle": "Fjerne fra familie?",
            "removeFamilyBody": "Profilen til {{name}} vil bli fjernet fra denne familieplanen og skjult fra profilbytte.",
            "removeFamilyConfirm": "Fjern",
            "familyUpdatedTitle": "Familie oppdatert",
            "familyUpdatedBody": "{{name}} ble fjernet fra familieplanen din.",
            "removeFamilyErrorTitle": "Kunne ikke fjerne profil",
            "removeFamilyErrorBody": "Vennligst sjekk tilkoblingen din og prøv igjen."
        }
    },
    'pl': {
        "back": "Powrót",
        "backAccessibilityLabel": "Powrót",
        "title": "Subskrypcja",
        "loading": {"error": "Nie można załadować szczegółów subskrypcji. Spróbuj ponownie.", "retryAccessibilityLabel": "Ponownie załaduj subskrypcję", "retry": "Spróbuj ponownie"},
        "tierLabels": {"free": "Bezpłatny", "plus": "Plus", "family": "Rodzinny", "pro": "Pro"},
        "tierLimits": {"free": "10 pytań/dzień, 100/miesiąc", "plus": "700 pytań/miesiąc", "family": "1 500 współdzielonych pytań/miesiąc", "pro": "Nieograniczone pytania"},
        "tierFeatures": {
            "free": {"0": "10 pytań dziennie", "1": "100 pytań miesięcznie", "2": "Podstawowe tematy nauki", "3": "śledzenie postępów"},
            "plus": {"0": "700 pytań miesięcznie", "1": "Brak dziennego limitu", "2": "Wszystkie tematy nauki", "3": "Priorytetowe wsparcie"},
            "family": {"0": "1 500 współdzielonych pytań/miesiąc", "1": "Do 5 członków rodziny", "2": "Przegląd postępów rodziny", "3": "Wszystkie funkcje Plus"},
            "pro": {"0": "Nieograniczone pytania", "1": "Wczesny dostęp do nowych funkcji", "2": "Dedykowane wsparcie", "3": "Wszystkie funkcje rodzinne"}
        },
        "packagePeriod": {"monthly": "Miesięczny", "annual": "Roczny", "weekly": "Tygodniowy", "lifetime": "Dożywotnio", "threeMonth": "3 miesiące", "sixMonth": "6 miesięcy", "twoMonth": "2 miesiące"},
        "currentPlan": {
            "sectionHeader": "Obecny plan",
            "statusCancelling": "Anulowanie",
            "statusPastDue": "Zaległość",
            "statusExpired": "Wygasła",
            "statusActive": "Aktywna",
            "accessUntil": "Dostęp do {{date}}",
            "renews": "Odnawia się {{date}}",
            "upgradeButton": "Ulepsz",
            "upgradeAccessibilityLabel": "Ulepszenie planu"
        },
        "cancellationNotice": {
            "title": "Subskrypcja kończy się",
            "body": "Twoja subskrypcja została anulowana. Możesz nadal korzystać ze wszystkich funkcji do {{date}}. Po tym czasie Twój konto zostanie przełączone na plan Bezpłatny."
        },
        "usage": {
            "sectionHeader": "Użycie w tym miesiącu",
            "dailyQuestions": "Dziś: {{used}} / {{limit}} dziennych pytań",
            "topUpCreditsRemaining_one": "+ {{count}} doladowanie kredyt",
            "topUpCreditsRemaining_other": "+ {{count}} doladowania kredyty",
            "yourShare": "Twój udział",
            "yourUsage": "Twoje użycie",
            "questionsCount_one": "{{count}} pytanie",
            "questionsCount_other": "{{count}} pytań",
            "familyAggregate": "Łącznie rodzina",
            "quotaResets": "Kwota resetuje się {{date}}",
            "subscriptionRenews": "Subskrypcja odnawia się {{date}}",
            "dailyLimitResets": "Dzienny limit — resetuje się o północy"
        },
        "familyPool": {
            "sectionHeader": "Pula rodzinna",
            "profilesConnected": "z {{max}} połączonych profilów",
            "questionsLeft": "współdzielonych pytań pozostałych w tym cyklu.",
            "ownerSuffix": " (właściciel)",
            "removingMember": "Usuwanie…",
            "removeMember": "Usuń"
        },
        "plans": {
            "sectionHeader": "Plany",
            "confirmingPurchase": "Potwierdzanie zakupu…",
            "currentBadge": "Obecny",
            "retryOfferings": "Spróbuj ponownie",
            "retryOfferingsAccessibilityLabel": "Ponownie załaduj oferty subskrypcji",
            "contactSupport": "Skontaktuj się z obsługą",
            "contactSupportAccessibilityLabel": "Skontaktuj się z obsługą",
            "offeringsError": "Nie można teraz załadować opcji zakupu. Jesteś na planie {{tier}} z {{limits}}.",
            "offeringsWebOnly": "Jesteś na planie {{tier}} z {{limits}}. Oto co zawiera każdy plan — zakupy w sklepie nie są jeszcze dostępne na tym urządzeniu."
        },
        "packageOption": {"currentPlan": "Obecny plan", "subscribeTo": "Subskrybuj", "subscribe": "Subskrybuj", "processing": "Przetwarzanie…"},
        "restore": {"sectionHeader": "Przywróć zakupy", "checkLater": "Sprawdź później"},
        "topUp": {
            "sectionHeader": "Potrzebujesz więcej pytań?",
            "buyAccessibilityLabel": "Kup 500 kredytów",
            "buyButton": "Kup 500 kredytów",
            "openingStore": "Otwieranie sklepu…",
            "credits": "Zakup jednorazowy. Kredyty wygasą po 12 miesiącach.",
            "checkLater": "Sprawdź później",
            "checkLaterAccessibilityLabel": "Anuluj potwierdzenie doładowania",
            "confirmingPollMessage": "Potwierdzanie zakupu…",
            "confirmingPollMessageLong": "Ciągle potwierdzanie — może to zająć do 30 sekund. Twój zakup jest bezpieczny."
        },
        "manageBilling": {
            "sectionHeader": "Zarządzaj",
            "button": "Zarządzaj rozliczeniami",
            "buttonAccessibilityLabel": "Zarządzaj rozliczeniami",
            "webInfo": "Zarządzaj rozliczeniami",
            "webInfoSubtitle": "Subskrypcja jest zarządzana na Twoim urządzeniu mobilnym",
            "opensAppStore": "Otwiera subskrypcje App Store",
            "opensGooglePlay": "Otwiera subskrypcje Google Play"
        },
        "byokWaitlist": {"joinButton": "Dołącz do listy oczekujących", "leaveButton": "Opuść listę oczekujących", "joiningButton": "Dołączanie…", "leavingButton": "Opuszczanie…"},
        "childPaywall": {
            "title": "Zapytaj rodzica",
            "body": "Wykorzystałeś wszystkie swoje pytania na dziś. Twój rodzic musi dokonać aktualizacji, aby kontynuować naukę.",
            "cooldownZero": "0 sekund",
            "cooldownHours_one": "{{count}} godzina",
            "cooldownHours_other": "{{count}} godzin",
            "cooldownMinutes_one": "{{count}} minuta",
            "cooldownMinutes_other": "{{count}} minut",
            "cooldownSeconds_one": "{{count}} sekunda",
            "cooldownSeconds_other": "{{count}} sekund",
            "xpThisWeek_one": "{{count}} XP w tym tygodniu",
            "xpThisWeek_other": "{{count}} XP w tym tygodniu",
            "topicsThisWeek_one": "{{count}} temat w tym tygodniu",
            "topicsThisWeek_other": "{{count}} tematów w tym tygodniu"
        },
        "alerts": {
            "topUpNotAvailableTitle": "Niedostępne",
            "topUpNotAvailableBody": "Kredyty doładowania nie są teraz dostępne. Spróbuj później lub skontaktuj się z obsługą.",
            "topUpRetry": "Spróbuj ponownie",
            "networkErrorTitle": "Błąd sieci",
            "networkErrorBody": "Proszę sprawdzić połączenie z internetem i spróbować ponownie.",
            "purchaseFailedTitle": "Zakup nie powiódł się",
            "purchaseFailedBody": "Podczas zakupu wystąpił nieoczekiwany błąd. Spróbuj ponownie.",
            "alreadyPurchasedTitle": "Już zakupiono",
            "alreadyPurchasedBody": "Wygląda na to, że już posiadasz tę subskrypcję. Naciśnij 'Przywróć zakupy', aby aktywować ją na tym urządzeniu.",
            "restorePurchasesButton": "Przywróć zakupy",
            "manageBillingErrorTitle": "Nie można otworzyć zarządzania subskrypcją",
            "manageBillingErrorBody": "Możesz zarządzać subskrypcją bezpośrednio pod adresem:\n{{url}}",
            "tryAgain": "Spróbuj ponownie",
            "checkAgain": "Sprawdź ponownie",
            "topUpPurchaseConfirmedTitle": "Zakup potwierdzony",
            "topUpPurchaseConfirmedBody": "Twoje 500 kredytów jest dodawanych. Zazwyczaj pojawiają się w ciągu minuty — przeciągnij w dół, aby odświeżyć użycie.",
            "topUpCheckLaterTitle": "Sprawdź później",
            "topUpCheckLaterBody": "Kredyty pojawią się wkrótce — naciśnij odśwież, aby sprawdzić.",
            "contactSupportTitle": "Skontaktuj się z obsługą",
            "contactSupportBody": "Napisz na support@mentomate.app w celu uzyskania pomocy z subskrypcjami.",
            "removeFamilyTitle": "Usunąć z rodziny?",
            "removeFamilyBody": "Profil {{name}} zostanie usunięty z tego planu rodzinnego i ukryty z przełączania profilów.",
            "removeFamilyConfirm": "Usuń",
            "familyUpdatedTitle": "Rodzina zaktualizowana",
            "familyUpdatedBody": "{{name}} został usunięty z Twojego planu rodzinnego.",
            "removeFamilyErrorTitle": "Nie można usunąć profilu",
            "removeFamilyErrorBody": "Proszę sprawdzić połączenie i spróbować ponownie."
        }
    },
    'pt': {
        "back": "Voltar",
        "backAccessibilityLabel": "Voltar",
        "title": "Assinatura",
        "loading": {"error": "Não foi possível carregar os detalhes da assinatura. Tente novamente.", "retryAccessibilityLabel": "Tentar carregar assinatura novamente", "retry": "Tentar novamente"},
        "tierLabels": {"free": "Gratuito", "plus": "Plus", "family": "Familiar", "pro": "Pro"},
        "tierLimits": {"free": "10 perguntas/dia, 100/mês", "plus": "700 perguntas/mês", "family": "1.500 perguntas compartilhadas/mês", "pro": "Perguntas ilimitadas"},
        "tierFeatures": {
            "free": {"0": "10 perguntas por dia", "1": "100 perguntas por mês", "2": "Tópicos básicos de aprendizado", "3": "Rastreamento de progresso"},
            "plus": {"0": "700 perguntas por mês", "1": "Sem limite diário", "2": "Todos os tópicos de aprendizado", "3": "Suporte prioritário"},
            "family": {"0": "1.500 perguntas compartilhadas/mês", "1": "Até 5 membros da família", "2": "Visão geral do progresso familiar", "3": "Todos os recursos Plus"},
            "pro": {"0": "Perguntas ilimitadas", "1": "Acesso antecipado a novos recursos", "2": "Suporte dedicado", "3": "Todos os recursos Familiar"}
        },
        "packagePeriod": {"monthly": "Mensal", "annual": "Anual", "weekly": "Semanal", "lifetime": "Vitalício", "threeMonth": "3 meses", "sixMonth": "6 meses", "twoMonth": "2 meses"},
        "currentPlan": {
            "sectionHeader": "Plano atual",
            "statusCancelling": "Cancelando",
            "statusPastDue": "Vencido",
            "statusExpired": "Expirado",
            "statusActive": "Ativo",
            "accessUntil": "Acesso até {{date}}",
            "renews": "Renova em {{date}}",
            "upgradeButton": "Fazer upgrade",
            "upgradeAccessibilityLabel": "Fazer upgrade do plano"
        },
        "cancellationNotice": {
            "title": "Assinatura encerrando",
            "body": "Sua assinatura foi cancelada. Você pode continuar usando todos os recursos até {{date}}. Após isso, sua conta reverterá para o plano Gratuito."
        },
        "usage": {
            "sectionHeader": "Uso deste mês",
            "dailyQuestions": "Hoje: {{used}} / {{limit}} perguntas diárias",
            "topUpCreditsRemaining_one": "+ {{count}} crédito extra restante",
            "topUpCreditsRemaining_other": "+ {{count}} créditos extras restantes",
            "yourShare": "Sua parte",
            "yourUsage": "Seu uso",
            "questionsCount_one": "{{count}} pergunta",
            "questionsCount_other": "{{count}} perguntas",
            "familyAggregate": "Total familiar",
            "quotaResets": "Cota reinicia em {{date}}",
            "subscriptionRenews": "Assinatura renova em {{date}}",
            "dailyLimitResets": "Limite diário — reinicia à meia-noite"
        },
        "familyPool": {
            "sectionHeader": "Pool familiar",
            "profilesConnected": "de {{max}} perfis conectados",
            "questionsLeft": "perguntas compartilhadas restantes neste ciclo.",
            "ownerSuffix": " (proprietário)",
            "removingMember": "Removendo…",
            "removeMember": "Remover"
        },
        "plans": {
            "sectionHeader": "Planos",
            "confirmingPurchase": "Confirmando compra…",
            "currentBadge": "Atual",
            "retryOfferings": "Tentar novamente",
            "retryOfferingsAccessibilityLabel": "Tentar carregar ofertas de assinatura novamente",
            "contactSupport": "Contatar suporte",
            "contactSupportAccessibilityLabel": "Contatar suporte",
            "offeringsError": "Não foi possível carregar as opções de compra agora. Você está no plano {{tier}} com {{limits}}.",
            "offeringsWebOnly": "Você está no plano {{tier}} com {{limits}}. Veja o que cada plano inclui — a compra na loja ainda não está disponível neste dispositivo."
        },
        "packageOption": {"currentPlan": "Plano atual", "subscribeTo": "Assinar", "subscribe": "Assinar", "processing": "Processando…"},
        "restore": {"sectionHeader": "Restaurar compras", "checkLater": "Verificar mais tarde"},
        "topUp": {
            "sectionHeader": "Precisa de mais perguntas?",
            "buyAccessibilityLabel": "Comprar 500 créditos",
            "buyButton": "Comprar 500 créditos",
            "openingStore": "Abrindo loja…",
            "credits": "Compra única. Créditos expiram em 12 meses.",
            "checkLater": "Verificar mais tarde",
            "checkLaterAccessibilityLabel": "Cancelar confirmação de recarga",
            "confirmingPollMessage": "Confirmando sua compra…",
            "confirmingPollMessageLong": "Ainda confirmando — isso pode levar até 30 segundos. Sua compra está segura."
        },
        "manageBilling": {
            "sectionHeader": "Gerenciar",
            "button": "Gerenciar cobranças",
            "buttonAccessibilityLabel": "Gerenciar cobranças",
            "webInfo": "Gerenciar cobranças",
            "webInfoSubtitle": "A assinatura é gerenciada no seu dispositivo móvel",
            "opensAppStore": "Abre assinaturas da App Store",
            "opensGooglePlay": "Abre assinaturas do Google Play"
        },
        "byokWaitlist": {"joinButton": "Entrar na lista de espera", "leaveButton": "Sair da lista de espera", "joiningButton": "Entrando…", "leavingButton": "Saindo…"},
        "childPaywall": {
            "title": "Pergunte a um responsável",
            "body": "Você usou todas as suas perguntas de hoje. Seu responsável precisa fazer upgrade para continuar aprendendo.",
            "cooldownZero": "0 segundos",
            "cooldownHours_one": "{{count}} hora",
            "cooldownHours_other": "{{count}} horas",
            "cooldownMinutes_one": "{{count}} minuto",
            "cooldownMinutes_other": "{{count}} minutos",
            "cooldownSeconds_one": "{{count}} segundo",
            "cooldownSeconds_other": "{{count}} segundos",
            "xpThisWeek_one": "{{count}} XP nesta semana",
            "xpThisWeek_other": "{{count}} XP nesta semana",
            "topicsThisWeek_one": "{{count}} tópico nesta semana",
            "topicsThisWeek_other": "{{count}} tópicos nesta semana"
        },
        "alerts": {
            "topUpNotAvailableTitle": "Não disponível",
            "topUpNotAvailableBody": "Créditos de recarga não estão disponíveis agora. Tente novamente mais tarde ou entre em contato com o suporte.",
            "topUpRetry": "Tentar novamente",
            "networkErrorTitle": "Erro de rede",
            "networkErrorBody": "Por favor verifique sua conexão com a internet e tente novamente.",
            "purchaseFailedTitle": "Compra falhou",
            "purchaseFailedBody": "Algo inesperado aconteceu com sua compra. Por favor tente novamente.",
            "alreadyPurchasedTitle": "Já adquirido",
            "alreadyPurchasedBody": "Parece que você já possui esta assinatura. Toque em 'Restaurar compras' para ativá-la neste dispositivo.",
            "restorePurchasesButton": "Restaurar compras",
            "manageBillingErrorTitle": "Não foi possível abrir o gerenciamento de assinatura",
            "manageBillingErrorBody": "Você pode gerenciar sua assinatura diretamente em:\n{{url}}",
            "tryAgain": "Tentar novamente",
            "checkAgain": "Verificar novamente",
            "topUpPurchaseConfirmedTitle": "Compra confirmada",
            "topUpPurchaseConfirmedBody": "Seus 500 créditos estão sendo adicionados. Eles geralmente aparecem em um minuto — puxe para baixo para atualizar seu uso.",
            "topUpCheckLaterTitle": "Verificar mais tarde",
            "topUpCheckLaterBody": "Os créditos aparecerão em breve — toque em atualizar para verificar.",
            "contactSupportTitle": "Contatar suporte",
            "contactSupportBody": "Envie um e-mail para support@mentomate.app para ajuda com assinaturas.",
            "removeFamilyTitle": "Remover da família?",
            "removeFamilyBody": "O perfil de {{name}} será removido deste plano familiar e ocultado da troca de perfil.",
            "removeFamilyConfirm": "Remover",
            "familyUpdatedTitle": "Família atualizada",
            "familyUpdatedBody": "{{name}} foi removido do seu plano familiar.",
            "removeFamilyErrorTitle": "Não foi possível remover o perfil",
            "removeFamilyErrorBody": "Por favor verifique sua conexão e tente novamente."
        }
    }
}

locales = [
    ('en', TRANSLATIONS['en']),
    ('de', OTHER_LOCALES['de']),
    ('es', OTHER_LOCALES['es']),
    ('ja', OTHER_LOCALES['ja']),
    ('nb', OTHER_LOCALES['nb']),
    ('pl', OTHER_LOCALES['pl']),
    ('pt', OTHER_LOCALES['pt']),
]

for locale, ss_block in locales:
    path = f'{LOCALE_DIR}/{locale}.json'
    # Read with BOM handling
    with open(path, encoding='utf-8-sig') as f:
        data = json.load(f)

    # Replace or add subscriptionScreen
    data['subscriptionScreen'] = ss_block

    # Write back without BOM
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.write('\n')

    print(f'OK: {locale}.json updated ({len(data)} top-level keys)')

print('\nDone.')
