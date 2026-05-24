import json, sys
sys.stdout.reconfigure(encoding='utf-8')

blocks = {}

blocks['es'] = {
  "title": "Suscripcion",
  "back": "Atras",
  "backAccessibilityLabel": "Volver",
  "loading": {
    "error": "No se pudieron cargar los detalles de la suscripcion. Intentalo de nuevo.",
    "retryAccessibilityLabel": "Reintentar carga de suscripcion",
    "retry": "Reintentar"
  },
  "tierLabels": {"free": "Free", "plus": "Plus", "family": "Familia", "pro": "Pro"},
  "tierLimits": {
    "free": "10 preguntas/dia, 100/mes", "plus": "700 preguntas/mes",
    "family": "1.500 preguntas/mes (compartidas)", "pro": "3.000 preguntas/mes"
  },
  "tierFeatures": {
    "free": {"0": "10 preguntas por dia, 100 por mes", "1": "Todas las materias", "2": "Repeticion espaciada", "3": "Biblioteca"},
    "plus": {"0": "700 preguntas por mes, sin limite diario", "1": "Todas las funciones Free", "2": "Ayuda avanzada de IA en preguntas dificiles", "3": "Analisis detallados del progreso"},
    "family": {"0": "1.500 preguntas por mes (compartidas en el grupo)", "1": "Hasta 6 perfiles de hijos", "2": "Todas las funciones Plus", "3": "Gestionado por la cuenta del padre"},
    "pro": {"0": "3.000 preguntas por mes, sin limite diario", "1": "Todas las funciones Plus", "2": "Mentor IA prioritario", "3": "Analisis avanzados"}
  },
  "packagePeriod": {
    "monthly": "Mensual", "annual": "Anual", "sixMonth": "6 meses",
    "threeMonth": "3 meses", "twoMonth": "2 meses", "weekly": "Semanal", "lifetime": "De por vida"
  },
  "currentPlan": {
    "sectionHeader": "Plan actual", "statusActive": "Activo", "statusCancelling": "Cancelando",
    "statusPastDue": "Vencido", "statusExpired": "Expirado",
    "accessUntil": "Acceso hasta {{date}}", "renews": "Se renueva el {{date}}",
    "upgradeButton": "Mejorar", "upgradeAccessibilityLabel": "Mejorar plan"
  },
  "cancellationNotice": {
    "title": "Suscripcion finaliza",
    "body": "Tu suscripcion ha sido cancelada. Puedes continuar usando todas las funciones hasta el {{date}}. Despues, tu cuenta volvera al nivel Free."
  },
  "usage": {
    "sectionHeader": "Uso este mes",
    "dailyQuestions": "Hoy: {{used}} / {{limit}} preguntas diarias",
    "topUpCreditsRemaining": "+ {{count}} creditos adicionales restantes",
    "yourShare": "Tu parte", "yourUsage": "Tu uso", "questionsCount": "{{count}} preguntas",
    "familyAggregate": "Total familiar",
    "quotaResets": "La cuota se reinicia el {{date}}",
    "subscriptionRenews": "La suscripcion se renueva el {{date}}",
    "dailyLimitResets": "Limite diario - se reinicia a medianoche"
  },
  "familyPool": {
    "sectionHeader": "Grupo familiar",
    "profilesConnected": "{{count}} de {{max}} perfiles conectados",
    "questionsLeft": "{{count}} preguntas compartidas restantes en este ciclo.",
    "ownerSuffix": " (propietario)", "removingMember": "Eliminando...", "removeMember": "Eliminar",
    "removeMemberAccessibilityLabel": "Eliminar a {{name}} de la familia"
  },
  "plans": {
    "sectionHeader": "Planes", "confirmingPurchase": "Confirmando compra...",
    "offeringsError": "No se pudieron cargar las opciones de compra ahora. Estas en el plan {{tier}} con {{limits}}.",
    "offeringsUnavailable": "Estas en el plan {{tier}} con {{limits}}. Aqui esta lo que incluye cada plan - las compras en la tienda aun no estan disponibles en este dispositivo.",
    "currentBadge": "Actual", "retryOfferings": "Reintentar",
    "retryOfferingsAccessibilityLabel": "Reintentar carga de ofertas de suscripcion",
    "contactSupport": "Contactar soporte", "contactSupportAccessibilityLabel": "Contactar soporte"
  },
  "packageOption": {
    "currentPlanLabel": "Plan actual", "subscribeLabel": "Suscribirse", "processingLabel": "Procesando...",
    "currentPlanAccessibilityLabel": "Plan actual {{title}} {{price}}",
    "subscribePlanAccessibilityLabel": "Suscribirse a {{title}} {{price}}"
  },
  "restore": {
    "button": "Restaurar compras", "accessibilityLabel": "Restaurar compras",
    "restoring": "Restaurando...", "verifying": "Verificando...",
    "checkLater": "Comprobar mas tarde", "cancelledTitle": "Comprobando mas tarde",
    "cancelledBody": "La restauracion continua en segundo plano. Actualiza la pantalla si tu suscripcion no aparece.",
    "cancelAccessibilityLabel": "Comprobar restauracion mas tarde"
  },
  "topUp": {
    "sectionHeader": "Necesitas mas preguntas?", "buyButton": "Comprar 500 creditos",
    "buyAccessibilityLabel": "Comprar 500 creditos",
    "credits": "Compra unica. Los creditos vencen en 12 meses.",
    "openingStore": "Abriendo tienda...", "checkLater": "Comprobar mas tarde",
    "checkLaterAccessibilityLabel": "Cancelar confirmacion de recarga",
    "checkLaterTitle": "Comprobar mas tarde",
    "checkLaterBody": "Los creditos apareceran pronto - desliza hacia abajo para actualizar.",
    "confirmingPollMessage": "Confirmando tu compra...",
    "confirmingPollMessageLong": "Aun confirmando - esto puede tardar hasta 30 segundos. Tu compra esta segura."
  },
  "manageBilling": {
    "sectionHeader": "Gestionar", "button": "Gestionar facturacion",
    "buttonAccessibilityLabel": "Gestionar facturacion", "webInfo": "Gestionar facturacion",
    "webInfoSubtitle": "La suscripcion se gestiona en tu dispositivo movil",
    "opensAppStore": "Abre suscripciones de App Store", "opensGooglePlay": "Abre suscripciones de Google Play"
  },
  "byokWaitlist": {
    "heading": "Usa tu propia clave",
    "body": "Usa tu propia clave API de IA para preguntas ilimitadas. Unete a la lista de espera y te avisaremos cuando este disponible.",
    "joinButton": "Unirse a la lista", "alreadyJoinedButton": "Ya estas en la lista",
    "joinAccessibilityLabel": "Unirse a la lista de espera de clave API",
    "alreadyJoinedAccessibilityLabel": "Ya en la lista de espera de clave API",
    "alerts": {
      "successTitle": "Estas en la lista!", "successBody": "Te avisaremos cuando la funcion de clave propia este lista.",
      "errorTitle": "No se pudo unir a la lista", "errorBody": "Por favor, comprueba tu conexion e intentalo de nuevo."
    }
  },
  "alerts": {
    "restoreFailed": "Error al restaurar", "restoreFailedBody": "No se pudieron restaurar las compras. Intentalo de nuevo.",
    "noSubscriptionsFound": "No se encontraron suscripciones",
    "noSubscriptionsFoundBody": "No se encontraron compras anteriores para restaurar.",
    "checkAgain": "Comprobar de nuevo", "alreadyPurchasedTitle": "Ya comprado",
    "alreadyPurchasedBody": "Parece que ya tienes esta suscripcion. Toca 'Restaurar compras' para activarla en este dispositivo.",
    "restorePurchasesButton": "Restaurar compras",
    "networkErrorTitle": "Error de red", "networkErrorBody": "Por favor, comprueba tu conexion a internet e intentalo de nuevo.",
    "purchaseFailedTitle": "Error en la compra", "purchaseFailedBody": "Algo inesperado ocurrio con tu compra. Intentalo de nuevo.",
    "manageBillingErrorTitle": "No se pudo abrir la gestion de suscripcion",
    "manageBillingErrorBody": "Puedes gestionar tu suscripcion directamente en:\n{{url}}",
    "tryAgain": "Intentar de nuevo",
    "topUpConnectionErrorTitle": "Error de conexion",
    "topUpConnectionErrorBody": "No se pudieron cargar las opciones de compra. Comprueba tu conexion e intentalo de nuevo.",
    "topUpRetry": "Reintentar", "topUpNotAvailableTitle": "No disponible",
    "topUpNotAvailableBody": "Los creditos adicionales no estan disponibles ahora. Intentalo mas tarde o contacta soporte.",
    "topUpPurchaseConfirmedTitle": "Compra confirmada",
    "topUpPurchaseConfirmedBody": "Tus 500 creditos se estan anadiendo. Normalmente aparecen en un minuto - desliza hacia abajo para actualizar.",
    "removeFamilyTitle": "Eliminar de la familia?",
    "removeFamilyBody": "El perfil de {{name}} se eliminara de este plan familiar y se ocultara en el cambio de perfil.",
    "removeFamilyConfirm": "Eliminar", "familyUpdatedTitle": "Familia actualizada",
    "familyUpdatedBody": "{{name}} fue eliminado de tu plan familiar.",
    "removeFamilyErrorTitle": "No se pudo eliminar el perfil",
    "removeFamilyErrorBody": "Por favor, comprueba tu conexion e intentalo de nuevo.",
    "contactSupportTitle": "Contactar soporte",
    "contactSupportBody": "Envia un correo a support@mentomate.app para ayuda con suscripciones."
  },
  "childPaywall": {
    "backAccessibilityLabel": "Volver", "back": "Atras", "title": "Buen trabajo hasta ahora!",
    "progressWithXp_one": "Aprendiste {{topics}} tema y ganaste {{xp}} XP - muy bien!",
    "progressWithXp_other": "Aprendiste {{topics}} temas y ganaste {{xp}} XP - muy bien!",
    "progressExploring": "Has estado explorando y aprendiendo - un gran comienzo!",
    "quotaMessage": "Has usado todas tus preguntas gratuitas. Pide a tu padre o madre que mejore el plan para que puedas seguir aprendiendo.",
    "notifyParentLabel": "Notificar a mi padre o madre",
    "parentAlreadyNotifiedLabel": "Padre o madre ya notificado",
    "notifyParentButton": "Notificar a mi padre o madre", "parentNotifiedButton": "Padre notificado",
    "remindAgainIn": "Puedes recordarselo en {{time}}.",
    "parentNotifiedExplore": "Tu padre o madre ha sido notificado! Mientras esperas, aun puedes explorar:",
    "waitingExplore": "Mientras esperas, puedes seguir explorando tu Biblioteca y ver tu progreso.",
    "browseLibrary": "Explorar Biblioteca", "browseLibraryAccessibilityLabel": "Explorar Biblioteca",
    "seeProgress": "Ver tu progreso", "seeProgressAccessibilityLabel": "Ver tu progreso",
    "goHome": "Inicio", "goHomeAccessibilityLabel": "Inicio",
    "cooldownSeconds_one": "{{count}} segundo", "cooldownSeconds_other": "{{count}} segundos",
    "cooldownMinutes_one": "{{count}} minuto", "cooldownMinutes_other": "{{count}} minutos",
    "cooldownHours_one": "{{count}} hora", "cooldownHours_other": "{{count}} horas",
    "cooldownZero": "0 segundos",
    "notifySentTitle": "Enviado!", "notifySentBody": "Hemos avisado a tu padre o madre!",
    "notifyAskParentTitle": "Pregunta a tu padre o madre",
    "notifyAskParentBody": "Pide a tu padre o madre que abra la app y se suscriba.",
    "notifyErrorTitle": "No se pudo enviar la notificacion",
    "notifyErrorBody": "Por favor, comprueba tu conexion e intentalo de nuevo."
  }
}

blocks['ja'] = {
  "title": "サブスクリプション",
  "back": "戻る",
  "backAccessibilityLabel": "戻る",
  "loading": {
    "error": "サブスクリプションの詳細を読み込めませんでした。もう一度お試しください。",
    "retryAccessibilityLabel": "サブスクリプションを再読み込み",
    "retry": "再試行"
  },
  "tierLabels": {"free": "Free", "plus": "Plus", "family": "ファミリー", "pro": "Pro"},
  "tierLimits": {
    "free": "1日10問、月100問", "plus": "朎700問",
    "family": "月1,500問（共有）", "pro": "月3,000問"
  },
  "tierFeatures": {
    "free": {"0": "1日10問、月100問", "1": "全科目", "2": "間隔反復", "3": "ライブラリ"},
    "plus": {"0": "月700問、日次制限なし", "1": "Free機能すべて", "2": "難しい問題AI高度サポート", "3": "詳細な学習進捗分析"},
    "family": {"0": "月1,500問（プール内で共有）", "1": "最大6つの子どもプロフィール", "2": "Plus機能すべて", "3": "保護者アカウントで管理"},
    "pro": {"0": "月3,000問、日次制限なし", "1": "Plus機能すべて", "2": "優先AIメンター", "3": "高度な分析"}
  },
  "packagePeriod": {
    "monthly": "月次", "annual": "年次", "sixMonth": "6ヶ月",
    "threeMonth": "3ヶ月", "twoMonth": "2ヶ月", "weekly": "週次", "lifetime": "生涯"
  },
  "currentPlan": {
    "sectionHeader": "現在のプラン", "statusActive": "有効",
    "statusCancelling": "キャンセル中", "statusPastDue": "支払い遅延",
    "statusExpired": "期限切れ",
    "accessUntil": "{{date}}まで利用可能", "renews": "{{date}}に更新",
    "upgradeButton": "アップグレード", "upgradeAccessibilityLabel": "プランをアップグレード"
  },
  "cancellationNotice": {
    "title": "サブスクリプション終了",
    "body": "サブスクリプションがキャンセルされました。{{date}}まですべての機能を引き続き利用できます。その後、アカウントはFreeプランに戻ります。"
  },
  "usage": {
    "sectionHeader": "今月の利用状況",
    "dailyQuestions": "本日：{{used}} / {{limit}}問",
    "topUpCreditsRemaining": "＋ {{count}}クレジット残り",
    "yourShare": "あなたのシェア", "yourUsage": "あなたの利用",
    "questionsCount": "{{count}}問", "familyAggregate": "ファミリー合計",
    "quotaResets": "クォータリセット日：{{date}}",
    "subscriptionRenews": "サブスクリプション更新日：{{date}}",
    "dailyLimitResets": "日次制限 — 深夜0晎にリセット"
  },
  "familyPool": {
    "sectionHeader": "ファミリープール",
    "profilesConnected": "{{max}}件中{{count}}件のプロフィールが接続中",
    "questionsLeft": "このサイクルの残り共有問題数：{{count}}問",
    "ownerSuffix": "（オーナー）", "removingMember": "削除中...",
    "removeMember": "削除", "removeMemberAccessibilityLabel": "{{name}}をファミリーから削除"
  },
  "plans": {
    "sectionHeader": "プラン", "confirmingPurchase": "購入を確認中…",
    "offeringsError": "購入オプションを読み込めませんでした。現在のプラン：{{tier}}（{{limits}}）",
    "offeringsUnavailable": "現在のプラン：{{tier}}（{{limits}}）。各プランの内容をご確認ください — このデバイスではストア購入はまだご利用いただけません。",
    "currentBadge": "現在", "retryOfferings": "再試行",
    "retryOfferingsAccessibilityLabel": "サブスクリプションオファーを再読み込み",
    "contactSupport": "サポートに連絡", "contactSupportAccessibilityLabel": "サポートに連絡"
  },
  "packageOption": {
    "currentPlanLabel": "現在のプラン", "subscribeLabel": "登録する",
    "processingLabel": "処理中...",
    "currentPlanAccessibilityLabel": "現在のプラン {{title}} {{price}}",
    "subscribePlanAccessibilityLabel": "{{title}} {{price}}に登録"
  },
  "restore": {
    "button": "購入を復元", "accessibilityLabel": "購入を復元",
    "restoring": "復元中...", "verifying": "確認中...",
    "checkLater": "後で確認", "cancelledTitle": "後で確認",
    "cancelledBody": "復元はバックグラウンドで続いています。サブスクリプションが表示されない場合は画面を更新してください。",
    "cancelAccessibilityLabel": "後で復元を確認"
  },
  "topUp": {
    "sectionHeader": "もっと問題が必要ですか？",
    "buyButton": "500クレジット購入", "buyAccessibilityLabel": "500クレジット購入",
    "credits": "買い切り。クレジットは12ヶ月で失効します。",
    "openingStore": "ストアを開いています...",
    "checkLater": "後で確認", "checkLaterAccessibilityLabel": "トップアップ確認をキャンセル",
    "checkLaterTitle": "後で確認",
    "checkLaterBody": "クレジットはまもなく反映されます — 下にスワイプして更新してください。",
    "confirmingPollMessage": "購入を確認中...",
    "confirmingPollMessageLong": "まだ確認中 — 最大30秒かかる場合があります。購入は安全です。"
  },
  "manageBilling": {
    "sectionHeader": "管理", "button": "請求を管理",
    "buttonAccessibilityLabel": "請求を管理", "webInfo": "請求を管理",
    "webInfoSubtitle": "サブスクリプションはモバイルデバイスで管理されています",
    "opensAppStore": "App Storeのサブスクリプションを開く",
    "opensGooglePlay": "Google Playのサブスクリプションを開く"
  },
  "byokWaitlist": {
    "heading": "独自のAPIキーを使用",
    "body": "自分のAI APIキーを使って無制限に質問できます。ウェイティングリストに登録すると、利用可能になった際にお知らせします。",
    "joinButton": "ウェイティングリストに登録", "alreadyJoinedButton": "登録済み",
    "joinAccessibilityLabel": "APIキーのウェイティングリストに登録",
    "alreadyJoinedAccessibilityLabel": "APIキーのウェイティングリストに登録済み",
    "alerts": {
      "successTitle": "リストに登録されました！",
      "successBody": "独自キー機能が準備できたらお知らせします。",
      "errorTitle": "ウェイティングリストに登録できませんでした",
      "errorBody": "接続を確認してもう一度お試しください。"
    }
  },
  "alerts": {
    "restoreFailed": "復元に失敗しました",
    "restoreFailedBody": "購入を復元できませんでした。もう一度お試しください。",
    "noSubscriptionsFound": "サブスクリプションが見つかりません",
    "noSubscriptionsFoundBody": "復元できる以前の購入が見つかりませんでした。",
    "checkAgain": "再確認", "alreadyPurchasedTitle": "購入済み",
    "alreadyPurchasedBody": "このサブスクリプションはすでにお持ちです。「購入を復元」をタップしてこのデバイスで有効化してください。",
    "restorePurchasesButton": "購入を復元",
    "networkErrorTitle": "ネットワークエラー",
    "networkErrorBody": "インターネット接続を確認してもう一度お試しください。",
    "purchaseFailedTitle": "購入に失敗しました",
    "purchaseFailedBody": "購入中に予期しない問題が発生しました。もう一度お試しください。",
    "manageBillingErrorTitle": "サブスクリプション管理を開けませんでした",
    "manageBillingErrorBody": "次のURLでサブスクリプションを直接管理できます：\n{{url}}",
    "tryAgain": "再試行",
    "topUpConnectionErrorTitle": "接続エラー",
    "topUpConnectionErrorBody": "購入オプションを読み込めませんでした。接続を確認してもう一度お試しください。",
    "topUpRetry": "再試行", "topUpNotAvailableTitle": "利用不可",
    "topUpNotAvailableBody": "トップアップクレジットは現在ご利用いただけません。後でもう一度お試しいただくか、サポートにお問い合わせください。",
    "topUpPurchaseConfirmedTitle": "購入が確認されました",
    "topUpPurchaseConfirmedBody": "500クレジットが追加されます。通常1分以内に反映されます — 下にスワイプして更新してください。",
    "removeFamilyTitle": "ファミリーから削除しますか？",
    "removeFamilyBody": "{{name}}のプロフィールがこのファミリープランから削除され、プロフィール切り替えから非表示になります。",
    "removeFamilyConfirm": "削除",
    "familyUpdatedTitle": "ファミリーが更新されました",
    "familyUpdatedBody": "{{name}}がファミリープランから削除されました。",
    "removeFamilyErrorTitle": "プロフィールを削除できませんでした",
    "removeFamilyErrorBody": "接続を確認してもう一度お試しください。",
    "contactSupportTitle": "サポートに連絡",
    "contactSupportBody": "サブスクリプションのサポートはsupport@mentomate.appにメールしてください。"
  },
  "childPaywall": {
    "backAccessibilityLabel": "戻る", "back": "戻る",
    "title": "ここまでよく頑張りました！",
    "progressWithXp_one": "{{topics}}つのトピックを学習し、{{xp}} XPを獲得しました — すばらしい！",
    "progressWithXp_other": "{{topics}}つのトピックを学習し、{{xp}} XPを獲得しました — すばらしい！",
    "progressExploring": "探索して学習しています — 素晴らしいスタートです！",
    "quotaMessage": "無料の質問をすべて使い切りました。引き続き学習するには、保護者にアップグレードをお願いしてください。",
    "notifyParentLabel": "保護者に通知する",
    "parentAlreadyNotifiedLabel": "保護者にすでに通知済み",
    "notifyParentButton": "保護者に通知する", "parentNotifiedButton": "保護者に通知済み",
    "remindAgainIn": "{{time}}後に再度リマインドできます。",
    "parentNotifiedExplore": "保護者に通知しました！待っている間も引き続き探索できます：",
    "waitingExplore": "待っている間、ライブラリを閲覧したり進捗を確認したりできます。",
    "browseLibrary": "ライブラリを閲覧", "browseLibraryAccessibilityLabel": "ライブラリを閲覧",
    "seeProgress": "進捗を確認", "seeProgressAccessibilityLabel": "進捗を確認",
    "goHome": "ホームへ", "goHomeAccessibilityLabel": "ホームへ",
    "cooldownSeconds_one": "{{count}}秒", "cooldownSeconds_other": "{{count}}秒",
    "cooldownMinutes_one": "{{count}}分", "cooldownMinutes_other": "{{count}}分",
    "cooldownHours_one": "{{count}}時間", "cooldownHours_other": "{{count}}時間",
    "cooldownZero": "0秒",
    "notifySentTitle": "送信しました！", "notifySentBody": "保護者にお知らせしました！",
    "notifyAskParentTitle": "保護者に聴く",
    "notifyAskParentBody": "保護者にアプリを開いてサブスクリプションに登録するようお願いしてください。",
    "notifyErrorTitle": "通知を送信できまたせんでした",
    "notifyErrorBody": "接続を確認してもう一度お試しください。"
  }
}

blocks['nb'] = {
  "title": "Abonnement", "back": "Tilbake", "backAccessibilityLabel": "Ga tilbake",
  "loading": {
    "error": "Kunne ikke laste abonnementsdetaljer. Prøv igjen.",
    "retryAccessibilityLabel": "Last abonnement på nytt", "retry": "Prøv igjen"
  },
  "tierLabels": {"free": "Free", "plus": "Plus", "family": "Familie", "pro": "Pro"},
  "tierLimits": {
    "free": "10 spørsmål/dag, 100/måned", "plus": "700 spørsmål/måned",
    "family": "1 500 spørsmål/måned (delt)", "pro": "3 000 spørsmål/måned"
  },
  "tierFeatures": {
    "free": {"0": "10 spørsmål per dag, 100 per måned", "1": "Alle fag", "2": "Repetisjonssystem", "3": "Bibliotek"},
    "plus": {"0": "700 spørsmål per måned, ingen dagsgrense", "1": "Alle Free-funksjoner", "2": "Avansert KI-hjelp på krevende oppgaver", "3": "Detaljerte læringsanalyser"},
    "family": {"0": "1 500 spørsmål per måned (delt i poolen)", "1": "Opptil 6 barneprofiler", "2": "Alle Plus-funksjoner", "3": "Administrert av foreldrekontoen"},
    "pro": {"0": "3 000 spørsmål per måned, ingen dagsgrense", "1": "Alle Plus-funksjoner", "2": "Prioritert KI-mentor", "3": "Avanserte analyser"}
  },
  "packagePeriod": {
    "monthly": "Månedlig", "annual": "Årlig", "sixMonth": "6 måneder",
    "threeMonth": "3 måneder", "twoMonth": "2 måneder", "weekly": "Ukentlig", "lifetime": "Livsvarig"
  },
  "currentPlan": {
    "sectionHeader": "Gjeldende abonnement", "statusActive": "Aktiv", "statusCancelling": "Avsluttes",
    "statusPastDue": "Forfalt", "statusExpired": "Utløpt",
    "accessUntil": "Tilgang til {{date}}", "renews": "Fornyes {{date}}",
    "upgradeButton": "Oppgrader", "upgradeAccessibilityLabel": "Oppgrader abonnement"
  },
  "cancellationNotice": {
    "title": "Abonnement avsluttes",
    "body": "Abonnementet ditt er kansellert. Du kan bruke alle funksjoner til {{date}}. Etter det vil kontoen din gå tilbake til Free-nivå."
  },
  "usage": {
    "sectionHeader": "Bruk denne måneden",
    "dailyQuestions": "I dag: {{used}} / {{limit}} daglige spørsmål",
    "topUpCreditsRemaining": "+ {{count}} ekstrapoeng gjenstår",
    "yourShare": "Din andel", "yourUsage": "Ditt forbruk", "questionsCount": "{{count}} spørsmål",
    "familyAggregate": "Familiesamlet",
    "quotaResets": "Kvoten nullstilles {{date}}",
    "subscriptionRenews": "Abonnementet fornyes {{date}}",
    "dailyLimitResets": "Dagsgrense — nullstilles ved midnatt"
  },
  "familyPool": {
    "sectionHeader": "Familiepulje",
    "profilesConnected": "{{count}} av {{max}} profiler koblet til",
    "questionsLeft": "{{count}} delte spørsmål igjen i denne syklusen.",
    "ownerSuffix": " (eier)", "removingMember": "Fjerner...", "removeMember": "Fjern",
    "removeMemberAccessibilityLabel": "Fjern {{name}} fra familien"
  },
  "plans": {
    "sectionHeader": "Abonnementer", "confirmingPurchase": "Bekrefter kjøp…",
    "offeringsError": "Kunne ikke laste kjøpsalternativer akkurat nå. Du er på {{tier}}-planen med {{limits}}.",
    "offeringsUnavailable": "Du er på {{tier}}-planen med {{limits}}. Her er hva hvert abonnement inkluderer — butikkjøp er ikke tilgjengelig på denne enheten ennå.",
    "currentBadge": "Gjeldende", "retryOfferings": "Prøv igjen",
    "retryOfferingsAccessibilityLabel": "Last abonnementsalternativer på nytt",
    "contactSupport": "Kontakt support", "contactSupportAccessibilityLabel": "Kontakt support"
  },
  "packageOption": {
    "currentPlanLabel": "Gjeldende abonnement", "subscribeLabel": "Abonner", "processingLabel": "Behandler...",
    "currentPlanAccessibilityLabel": "Gjeldende abonnement {{title}} {{price}}",
    "subscribePlanAccessibilityLabel": "Abonner på {{title}} {{price}}"
  },
  "restore": {
    "button": "Gjenopprett kjøp", "accessibilityLabel": "Gjenopprett kjøp",
    "restoring": "Gjenoppretter...", "verifying": "Verifiserer...",
    "checkLater": "Sjekk senere", "cancelledTitle": "Sjekker senere",
    "cancelledBody": "Gjenopprettingen fortsetter i bakgrunnen. Oppdater skjermen hvis abonnementet ikke vises.",
    "cancelAccessibilityLabel": "Sjekk gjenoppretting senere"
  },
  "topUp": {
    "sectionHeader": "Trenger du flere spørsmål?", "buyButton": "Kjøp 500 poeng",
    "buyAccessibilityLabel": "Kjøp 500 poeng",
    "credits": "Engangskjøp. Poeng utløper etter 12 måneder.",
    "openingStore": "Åpner butikk...", "checkLater": "Sjekk senere",
    "checkLaterAccessibilityLabel": "Avbryt bekreftelse av påfyll",
    "checkLaterTitle": "Sjekk senere",
    "checkLaterBody": "Poengene vil vises snart — dra ned for å oppdatere.",
    "confirmingPollMessage": "Bekrefter kjøpet ditt...",
    "confirmingPollMessageLong": "Bekrefter fortsatt — dette kan ta opptil 30 sekunder. Kjøpet ditt er trygt."
  },
  "manageBilling": {
    "sectionHeader": "Administrer", "button": "Administrer fakturering",
    "buttonAccessibilityLabel": "Administrer fakturering", "webInfo": "Administrer fakturering",
    "webInfoSubtitle": "Abonnementet administreres på mobilenheten din",
    "opensAppStore": "Åpner App Store-abonnementer", "opensGooglePlay": "Åpner Google Play-abonnementer"
  },
  "byokWaitlist": {
    "heading": "Bruk din egen nøkkel",
    "body": "Bruk din egen KI API-nøkkel for ubegrensede spørsmål. Bli med på ventelisten og vi gir deg beskjed når det er tilgjengelig.",
    "joinButton": "Bli med på ventelisten", "alreadyJoinedButton": "Allerede påmeldt",
    "joinAccessibilityLabel": "Bli med på venteliste for API-nøkkel",
    "alreadyJoinedAccessibilityLabel": "Allerede på venteliste for API-nøkkel",
    "alerts": {
      "successTitle": "Du er på listen!", "successBody": "Vi gir deg beskjed når Bruk din egen nøkkel er klar.",
      "errorTitle": "Kunne ikke bli med på ventelisten", "errorBody": "Sjekk tilkoblingen din og prøv igjen."
    }
  },
  "alerts": {
    "restoreFailed": "Gjenoppretting mislyktes", "restoreFailedBody": "Kunne ikke gjenopprette kjøp. Prøv igjen.",
    "noSubscriptionsFound": "Ingen abonnementer funnet",
    "noSubscriptionsFoundBody": "Fant ingen tidligere kjøp å gjenopprette.",
    "checkAgain": "Sjekk igjen", "alreadyPurchasedTitle": "Allerede kjøpt",
    "alreadyPurchasedBody": "Det ser ut til at du allerede eier dette abonnementet. Trykk 'Gjenopprett kjøp' for å aktivere det på denne enheten.",
    "restorePurchasesButton": "Gjenopprett kjøp",
    "networkErrorTitle": "Nettverksfeil", "networkErrorBody": "Sjekk internettforbindelsen din og prøv igjen.",
    "purchaseFailedTitle": "Kjøp mislyktes", "purchaseFailedBody": "Noe uventet skjedde med kjøpet ditt. Prøv igjen.",
    "manageBillingErrorTitle": "Kunne ikke åpne abonnementsadministrasjon",
    "manageBillingErrorBody": "Du kan administrere abonnementet direkt på:\n{{url}}",
    "tryAgain": "Prøv igjen",
    "topUpConnectionErrorTitle": "Tilkoblingsfeil",
    "topUpConnectionErrorBody": "Kunne ikke laste kjøpsalternativer. Sjekk tilkoblingen og prøv igjen.",
    "topUpRetry": "Prøv igjen", "topUpNotAvailableTitle": "Ikke tilgjengelig",
    "topUpNotAvailableBody": "Ekstrapoeng er ikke tilgjengelig akkurat nå. Prøv igjen senere eller kontakt support.",
    "topUpPurchaseConfirmedTitle": "Kjøp bekreftet",
    "topUpPurchaseConfirmedBody": "500 poengene dine legges til. De vises vanligvis innen ett minutt — dra ned for å oppdatere.",
    "removeFamilyTitle": "Fjerne fra familien?",
    "removeFamilyBody": "{{name}}s profil vil fjernes fra denne familieplanen og skjules ved profilbytte.",
    "removeFamilyConfirm": "Fjern", "familyUpdatedTitle": "Familien oppdatert",
    "familyUpdatedBody": "{{name}} ble fjernet fra familieplanen din.",
    "removeFamilyErrorTitle": "Kunne ikke fjerne profil",
    "removeFamilyErrorBody": "Sjekk tilkoblingen din og prøv igjen.",
    "contactSupportTitle": "Kontakt support",
    "contactSupportBody": "Send e-post til support@mentomate.app for hjelp med abonnementer."
  },
  "childPaywall": {
    "backAccessibilityLabel": "Ga tilbake", "back": "Tilbake", "title": "Bra jobbet så langt!",
    "progressWithXp_one": "Du lærte {{topics}} emne og tjente {{xp}} XP — flott jobbet!",
    "progressWithXp_other": "Du lærte {{topics}} emner og tjente {{xp}} XP — flott jobbet!",
    "progressExploring": "Du har utforsket og lært — en flott start!",
    "quotaMessage": "Du har brukt alle de gratis spørsmålene dine. Be en forelder om å oppgradere slik at du kan fortsette å lære.",
    "notifyParentLabel": "Varsle min forelder", "parentAlreadyNotifiedLabel": "Forelder allerede varslet",
    "notifyParentButton": "Varsle min forelder", "parentNotifiedButton": "Forelder varslet",
    "remindAgainIn": "Du kan minne dem igjen om {{time}}.",
    "parentNotifiedExplore": "Forelderen din er varslet! Mens du venter, kan du fortsatt utforske:",
    "waitingExplore": "Mens du venter, kan du fortsatt bla gjennom biblioteket ditt og se fremgangen din.",
    "browseLibrary": "Bla gjennom bibliotek", "browseLibraryAccessibilityLabel": "Bla gjennom bibliotek",
    "seeProgress": "Se fremgangen din", "seeProgressAccessibilityLabel": "Se fremgangen din",
    "goHome": "Gå til hjem", "goHomeAccessibilityLabel": "Gå til hjem",
    "cooldownSeconds_one": "{{count}} sekund", "cooldownSeconds_other": "{{count}} sekunder",
    "cooldownMinutes_one": "{{count}} minutt", "cooldownMinutes_other": "{{count}} minutter",
    "cooldownHours_one": "{{count}} time", "cooldownHours_other": "{{count}} timer",
    "cooldownZero": "0 sekunder",
    "notifySentTitle": "Sendt!", "notifySentBody": "Vi ga forelderen din beskjed!",
    "notifyAskParentTitle": "Spør forelderen din",
    "notifyAskParentBody": "Be forelderen din om å åpne appen og abonnere.",
    "notifyErrorTitle": "Kunne ikke sende varsling",
    "notifyErrorBody": "Sjekk tilkoblingen din og prøv igjen."
  }
}

blocks['pl'] = {
  "title": "Subskrypcja", "back": "Wstecz", "backAccessibilityLabel": "Wróć",
  "loading": {
    "error": "Nie można załadować szczegółów subskrypcji. Spróbuj ponownie.",
    "retryAccessibilityLabel": "Ponów ładowanie subskrypcji", "retry": "Spróbuj ponownie"
  },
  "tierLabels": {"free": "Free", "plus": "Plus", "family": "Rodzina", "pro": "Pro"},
  "tierLimits": {
    "free": "10 pytań/dzień, 100/miesiąc", "plus": "700 pytań/miesiąc",
    "family": "1 500 pytań/miesiąc (współdzielone)", "pro": "3 000 pytań/miesiąc"
  },
  "tierFeatures": {
    "free": {"0": "10 pytań dziennie, 100 miesięcznie", "1": "Wszystkie przedmioty", "2": "Powtarzanie z przerwami", "3": "Biblioteka"},
    "plus": {"0": "700 pytań miesięcznie, bez limitu dziennego", "1": "Wszystkie funkcje Free", "2": "Zaawansowana pomoc AI przy trudnych pytaniach", "3": "Szczegółowe analizy postępów"},
    "family": {"0": "1 500 pytań miesięcznie (współdzielone w puli)", "1": "Do 6 profili dzieci", "2": "Wszystkie funkcje Plus", "3": "Zarządzane przez konto rodzica"},
    "pro": {"0": "3 000 pytań miesięcznie, bez limitu dziennego", "1": "Wszystkie funkcje Plus", "2": "Priorytetowy mentor AI", "3": "Zaawansowane analizy"}
  },
  "packagePeriod": {
    "monthly": "Miesięcznie", "annual": "Rocznie", "sixMonth": "6 miesięcy",
    "threeMonth": "3 miesiące", "twoMonth": "2 miesiące", "weekly": "Tygodniowo", "lifetime": "Dożywotnio"
  },
  "currentPlan": {
    "sectionHeader": "Bieżący plan", "statusActive": "Aktywny", "statusCancelling": "Anulowanie",
    "statusPastDue": "Zaległy", "statusExpired": "Wygasły",
    "accessUntil": "Dostęp do {{date}}", "renews": "Odnowienie {{date}}",
    "upgradeButton": "Ulepsz", "upgradeAccessibilityLabel": "Ulepsz plan"
  },
  "cancellationNotice": {
    "title": "Subskrypcja kończy się",
    "body": "Twoja subskrypcja została anulowana. Możesz korzystać ze wszystkich funkcji do {{date}}. Po tym czasie konto wróci do planu Free."
  },
  "usage": {
    "sectionHeader": "Wykorzystanie w tym miesiącu",
    "dailyQuestions": "Dzisiaj: {{used}} / {{limit}} dziennych pytań",
    "topUpCreditsRemaining": "+ {{count}} dodatkowych kredytów",
    "yourShare": "Twój udział", "yourUsage": "Twoje wykorzystanie", "questionsCount": "{{count}} pytań",
    "familyAggregate": "Suma rodzinna",
    "quotaResets": "Limit odnawia się {{date}}",
    "subscriptionRenews": "Subskrypcja odnawia się {{date}}",
    "dailyLimitResets": "Limit dzienny — resetuje się o północy"
  },
  "familyPool": {
    "sectionHeader": "Pula rodzinna",
    "profilesConnected": "{{count}} z {{max}} profili połączonych",
    "questionsLeft": "{{count}} wspólnych pytań pozostałych w tym cyklu.",
    "ownerSuffix": " (właściciel)", "removingMember": "Usuwanie...", "removeMember": "Usuń",
    "removeMemberAccessibilityLabel": "Usuń {{name}} z rodziny"
  },
  "plans": {
    "sectionHeader": "Plany", "confirmingPurchase": "Potwierdzanie zakupu…",
    "offeringsError": "Nie można załadować opcji zakupu. Twój plan to {{tier}} z {{limits}}.",
    "offeringsUnavailable": "Twój plan to {{tier}} z {{limits}}. Oto co zawiera każdy plan — zakupy w sklepie nie są jeszcze dostępne na tym urządzeniu.",
    "currentBadge": "Bieżący", "retryOfferings": "Spróbuj ponownie",
    "retryOfferingsAccessibilityLabel": "Ponów ładowanie ofert subskrypcji",
    "contactSupport": "Kontakt z pomocą", "contactSupportAccessibilityLabel": "Kontakt z pomocą"
  },
  "packageOption": {
    "currentPlanLabel": "Bieżący plan", "subscribeLabel": "Subskrybuj", "processingLabel": "Przetwarzanie...",
    "currentPlanAccessibilityLabel": "Bieżący plan {{title}} {{price}}",
    "subscribePlanAccessibilityLabel": "Subskrybuj {{title}} {{price}}"
  },
  "restore": {
    "button": "Przywróć zakupy", "accessibilityLabel": "Przywróć zakupy",
    "restoring": "Przywracanie...", "verifying": "Weryfikowanie...",
    "checkLater": "Sprawdź później", "cancelledTitle": "Sprawdzanie później",
    "cancelledBody": "Przywracanie trwa w tle. Odśwież ekran, jeśli subskrypcja nie pojawi się.",
    "cancelAccessibilityLabel": "Sprawdź przywracanie później"
  },
  "topUp": {
    "sectionHeader": "Potrzebujesz więcej pytań?", "buyButton": "Kup 500 kredytów",
    "buyAccessibilityLabel": "Kup 500 kredytów",
    "credits": "Jednorazowy zakup. Kredyty wygasają po 12 miesiącach.",
    "openingStore": "Otwieranie sklepu...", "checkLater": "Sprawdź później",
    "checkLaterAccessibilityLabel": "Anuluj potwierdzenie doładowania",
    "checkLaterTitle": "Sprawdź później",
    "checkLaterBody": "Kredyty pojawią się wkrótce — przesuń w dół, aby odświeżyć.",
    "confirmingPollMessage": "Potwierdzanie zakupu...",
    "confirmingPollMessageLong": "Nadal potwierdzamy — może to potrwać do 30 sekund. Twój zakup jest bezpieczny."
  },
  "manageBilling": {
    "sectionHeader": "Zarządzaj", "button": "Zarządzaj rozliczeniami",
    "buttonAccessibilityLabel": "Zarządzaj rozliczeniami", "webInfo": "Zarządzaj rozliczeniami",
    "webInfoSubtitle": "Subskrypcja jest zarządzana na urządzeniu mobilnym",
    "opensAppStore": "Otwiera subskrypcje App Store", "opensGooglePlay": "Otwiera subskrypcje Google Play"
  },
  "byokWaitlist": {
    "heading": "Użyj własnego klucza",
    "body": "Użyj własnego klucza API AI dla nieograniczonych pytań. Dołącz do listy oczekujących, a powiadomimy Cię gdy będzie dostępne.",
    "joinButton": "Dołącz do listy", "alreadyJoinedButton": "Już na liście",
    "joinAccessibilityLabel": "Dołącz do listy oczekujących na klucz API",
    "alreadyJoinedAccessibilityLabel": "Już na liście oczekujących na klucz API",
    "alerts": {
      "successTitle": "Jesteś na liście!", "successBody": "Powiadomimy Cię, gdy funkcja własnego klucza będzie gotowa.",
      "errorTitle": "Nie można dołączyć do listy", "errorBody": "Sprawdź połączenie i spróbuj ponownie."
    }
  },
  "alerts": {
    "restoreFailed": "Przywracanie nie powiodło się", "restoreFailedBody": "Nie można przywrócić zakupów. Spróbuj ponownie.",
    "noSubscriptionsFound": "Nie znaleziono subskrypcji",
    "noSubscriptionsFoundBody": "Nie znaleziono wcześniejszych zakupów do przywrócenia.",
    "checkAgain": "Sprawdź ponownie", "alreadyPurchasedTitle": "Już zakupione",
    "alreadyPurchasedBody": "Wygląda na to, że masz już tę subskrypcję. Naciśnij 'Przywróć zakupy', aby aktywować ją na tym urządzeniu.",
    "restorePurchasesButton": "Przywróć zakupy",
    "networkErrorTitle": "Błąd sieci", "networkErrorBody": "Sprawdź połączenie internetowe i spróbuj ponownie.",
    "purchaseFailedTitle": "Zakup nie powiódł się", "purchaseFailedBody": "Coś nieoczekiwanego wydarzyło się podczas zakupu. Spróbuj ponownie.",
    "manageBillingErrorTitle": "Nie można otworzyć zarządzania subskrypcją",
    "manageBillingErrorBody": "Możesz zarządzać subskrypcją bezpośrednio na:\n{{url}}",
    "tryAgain": "Spróbuj ponownie",
    "topUpConnectionErrorTitle": "Błąd połączenia",
    "topUpConnectionErrorBody": "Nie można załadować opcji zakupu. Sprawdź połączenie i spróbuj ponownie.",
    "topUpRetry": "Spróbuj ponownie", "topUpNotAvailableTitle": "Niedostępne",
    "topUpNotAvailableBody": "Kredyty doładowania nie są teraz dostępne. Spróbuj później lub skontaktuj się z pomocą.",
    "topUpPurchaseConfirmedTitle": "Zakup potwierdzony",
    "topUpPurchaseConfirmedBody": "Twoje 500 kredytów jest dodawanych. Zazwyczaj pojawiają się w ciągu minuty — przesuń w dół, aby odświeżyć.",
    "removeFamilyTitle": "Usunąć z rodziny?",
    "removeFamilyBody": "Profil użytkownika {{name}} zostanie usunięty z tego planu rodzinnego i ukryty przy przełączaniu profili.",
    "removeFamilyConfirm": "Usuń", "familyUpdatedTitle": "Rodzina zaktualizowana",
    "familyUpdatedBody": "{{name}} został usunięty z Twojego planu rodzinnego.",
    "removeFamilyErrorTitle": "Nie można usunąć profilu",
    "removeFamilyErrorBody": "Sprawdź połączenie i spróbuj ponownie.",
    "contactSupportTitle": "Kontakt z pomocą",
    "contactSupportBody": "Wyślij e-mail na support@mentomate.app po pomoc z subskrypcjami."
  },
  "childPaywall": {
    "backAccessibilityLabel": "Wróć", "back": "Wstecz", "title": "Świetna robota do tej pory!",
    "progressWithXp_one": "Nauczyłeś się {{topics}} tematu i zdobyłeś {{xp}} XP — brawo!",
    "progressWithXp_other": "Nauczyłeś się {{topics}} tematów i zdobyłeś {{xp}} XP — brawo!",
    "progressExploring": "Eksplorowałeś i uczyłeś się — świetny start!",
    "quotaMessage": "Wykorzystałeś wszystkie swoje bezpłatne pytania. Poproś rodzica o ulepszenie planu, aby kontynuować naukę.",
    "notifyParentLabel": "Powiadom mojego rodzica", "parentAlreadyNotifiedLabel": "Rodzic już powiadomiony",
    "notifyParentButton": "Powiadom mojego rodzica", "parentNotifiedButton": "Rodzic powiadomiony",
    "remindAgainIn": "Możesz przypomnieć mu za {{time}}.",
    "parentNotifiedExplore": "Twój rodzic został powiadomiony! Czekając, możesz nadal eksplorować:",
    "waitingExplore": "Czekając, możesz przeglądać bibliotekę i sprawdzać swoje postępy.",
    "browseLibrary": "Przeglądaj bibliotekę", "browseLibraryAccessibilityLabel": "Przeglądaj bibliotekę",
    "seeProgress": "Zobacz swoje postępy", "seeProgressAccessibilityLabel": "Zobacz swoje postępy",
    "goHome": "Idź do strony głównej", "goHomeAccessibilityLabel": "Idź do strony głównej",
    "cooldownSeconds_one": "{{count}} sekundę", "cooldownSeconds_other": "{{count}} sekund",
    "cooldownMinutes_one": "{{count}} minutę", "cooldownMinutes_other": "{{count}} minut",
    "cooldownHours_one": "{{count}} godzinę", "cooldownHours_other": "{{count}} godzin",
    "cooldownZero": "0 sekund",
    "notifySentTitle": "Wysłano!", "notifySentBody": "Poinformowaliśmy Twojego rodzica!",
    "notifyAskParentTitle": "Zapytaj rodzica",
    "notifyAskParentBody": "Poproś rodzica, aby otworzył aplikację i wykupił subskrypcję.",
    "notifyErrorTitle": "Nie można wysłać powiadomienia",
    "notifyErrorBody": "Sprawdź połączenie i spróbuj ponownie."
  }
}

blocks['pt'] = {
  "title": "Assinatura", "back": "Voltar", "backAccessibilityLabel": "Voltar",
  "loading": {
    "error": "Não foi possível carregar os detalhes da assinatura. Tente novamente.",
    "retryAccessibilityLabel": "Tentar carregar assinatura novamente", "retry": "Tentar novamente"
  },
  "tierLabels": {"free": "Free", "plus": "Plus", "family": "Família", "pro": "Pro"},
  "tierLimits": {
    "free": "10 perguntas/dia, 100/mês", "plus": "700 perguntas/mês",
    "family": "1.500 perguntas/mês (compartilhadas)", "pro": "3.000 perguntas/mês"
  },
  "tierFeatures": {
    "free": {"0": "10 perguntas por dia, 100 por mês", "1": "Todas as disciplinas", "2": "Repetição espaçada", "3": "Biblioteca"},
    "plus": {"0": "700 perguntas por mês, sem limite diário", "1": "Todos os recursos Free", "2": "Ajuda avançada de IA em questões difíceis", "3": "Análises detalhadas de progresso"},
    "family": {"0": "1.500 perguntas por mês (compartilhadas no grupo)", "1": "Até 6 perfis de filhos", "2": "Todos os recursos Plus", "3": "Gerenciado pela conta dos pais"},
    "pro": {"0": "3.000 perguntas por mês, sem limite diário", "1": "Todos os recursos Plus", "2": "Mentor IA prioritário", "3": "Análises avançadas"}
  },
  "packagePeriod": {
    "monthly": "Mensal", "annual": "Anual", "sixMonth": "6 meses",
    "threeMonth": "3 meses", "twoMonth": "2 meses", "weekly": "Semanal", "lifetime": "Vitalício"
  },
  "currentPlan": {
    "sectionHeader": "Plano atual", "statusActive": "Ativo", "statusCancelling": "Cancelando",
    "statusPastDue": "Em atraso", "statusExpired": "Expirado",
    "accessUntil": "Acesso até {{date}}", "renews": "Renova em {{date}}",
    "upgradeButton": "Fazer upgrade", "upgradeAccessibilityLabel": "Fazer upgrade do plano"
  },
  "cancellationNotice": {
    "title": "Assinatura encerrando",
    "body": "Sua assinatura foi cancelada. Você pode continuar usando todos os recursos até {{date}}. Depois disso, sua conta voltará ao nível Free."
  },
  "usage": {
    "sectionHeader": "Uso neste mês",
    "dailyQuestions": "Hoje: {{used}} / {{limit}} perguntas diárias",
    "topUpCreditsRemaining": "+ {{count}} créditos extras restantes",
    "yourShare": "Sua parte", "yourUsage": "Seu uso", "questionsCount": "{{count}} perguntas",
    "familyAggregate": "Total da família",
    "quotaResets": "Cota reinicia em {{date}}",
    "subscriptionRenews": "Assinatura renova em {{date}}",
    "dailyLimitResets": "Limite diário — reinicia à meia-noite"
  },
  "familyPool": {
    "sectionHeader": "Grupo familiar",
    "profilesConnected": "{{count}} de {{max}} perfis conectados",
    "questionsLeft": "{{count}} perguntas compartilhadas restantes neste ciclo.",
    "ownerSuffix": " (proprietário)", "removingMember": "Removendo...", "removeMember": "Remover",
    "removeMemberAccessibilityLabel": "Remover {{name}} da família"
  },
  "plans": {
    "sectionHeader": "Planos", "confirmingPurchase": "Confirmando compra…",
    "offeringsError": "Não foi possível carregar opções de compra agora. Você está no plano {{tier}} com {{limits}}.",
    "offeringsUnavailable": "Você está no plano {{tier}} com {{limits}}. Veja o que cada plano inclui — compras na loja ainda não estão disponíveis neste dispositivo.",
    "currentBadge": "Atual", "retryOfferings": "Tentar novamente",
    "retryOfferingsAccessibilityLabel": "Tentar carregar ofertas de assinatura novamente",
    "contactSupport": "Contatar suporte", "contactSupportAccessibilityLabel": "Contatar suporte"
  },
  "packageOption": {
    "currentPlanLabel": "Plano atual", "subscribeLabel": "Assinar", "processingLabel": "Processando...",
    "currentPlanAccessibilityLabel": "Plano atual {{title}} {{price}}",
    "subscribePlanAccessibilityLabel": "Assinar {{title}} {{price}}"
  },
  "restore": {
    "button": "Restaurar compras", "accessibilityLabel": "Restaurar compras",
    "restoring": "Restaurando...", "verifying": "Verificando...",
    "checkLater": "Verificar mais tarde", "cancelledTitle": "Verificando mais tarde",
    "cancelledBody": "A restauração ainda está em andamento em segundo plano. Atualize a tela se sua assinatura não aparecer.",
    "cancelAccessibilityLabel": "Verificar restauração mais tarde"
  },
  "topUp": {
    "sectionHeader": "Precisa de mais perguntas?", "buyButton": "Comprar 500 créditos",
    "buyAccessibilityLabel": "Comprar 500 créditos",
    "credits": "Compra única. Créditos expiram em 12 meses.",
    "openingStore": "Abrindo loja...", "checkLater": "Verificar mais tarde",
    "checkLaterAccessibilityLabel": "Cancelar confirmação de recarga",
    "checkLaterTitle": "Verificar mais tarde",
    "checkLaterBody": "Os créditos aparecerão em breve — puxe para baixo para atualizar.",
    "confirmingPollMessage": "Confirmando sua compra...",
    "confirmingPollMessageLong": "Ainda confirmando — isso pode levar até 30 segundos. Sua compra está segura."
  },
  "manageBilling": {
    "sectionHeader": "Gerenciar", "button": "Gerenciar cobrança",
    "buttonAccessibilityLabel": "Gerenciar cobrança", "webInfo": "Gerenciar cobrança",
    "webInfoSubtitle": "A assinatura é gerenciada no seu dispositivo móvel",
    "opensAppStore": "Abre assinaturas da App Store", "opensGooglePlay": "Abre assinaturas do Google Play"
  },
  "byokWaitlist": {
    "heading": "Use sua própria chave",
    "body": "Use sua própria chave de API de IA para perguntas ilimitadas. Junte-se à lista de espera e avisaremos quando estiver disponível.",
    "joinButton": "Entrar na lista", "alreadyJoinedButton": "Já na lista",
    "joinAccessibilityLabel": "Entrar na lista de espera de chave de API",
    "alreadyJoinedAccessibilityLabel": "Já na lista de espera de chave de API",
    "alerts": {
      "successTitle": "Você está na lista!", "successBody": "Avisaremos quando a função de chave própria estiver pronta.",
      "errorTitle": "Não foi possível entrar na lista", "errorBody": "Verifique sua conexão e tente novamente."
    }
  },
  "alerts": {
    "restoreFailed": "Falha na restauração", "restoreFailedBody": "Não foi possível restaurar as compras. Tente novamente.",
    "noSubscriptionsFound": "Nenhuma assinatura encontrada",
    "noSubscriptionsFoundBody": "Não foram encontradas compras anteriores para restaurar.",
    "checkAgain": "Verificar novamente", "alreadyPurchasedTitle": "Já comprado",
    "alreadyPurchasedBody": "Parece que você já possui esta assinatura. Toque em 'Restaurar compras' para ativá-la neste dispositivo.",
    "restorePurchasesButton": "Restaurar compras",
    "networkErrorTitle": "Erro de rede", "networkErrorBody": "Verifique sua conexão com a internet e tente novamente.",
    "purchaseFailedTitle": "Falha na compra", "purchaseFailedBody": "Algo inesperado aconteceu com sua compra. Tente novamente.",
    "manageBillingErrorTitle": "Não foi possível abrir o gerenciamento de assinatura",
    "manageBillingErrorBody": "Você pode gerenciar sua assinatura diretamente em:\n{{url}}",
    "tryAgain": "Tentar novamente",
    "topUpConnectionErrorTitle": "Erro de conexão",
    "topUpConnectionErrorBody": "Não foi possível carregar as opções de compra. Verifique sua conexão e tente novamente.",
    "topUpRetry": "Tentar novamente", "topUpNotAvailableTitle": "Indisponível",
    "topUpNotAvailableBody": "Os créditos extras não estão disponíveis agora. Tente novamente mais tarde ou contate o suporte.",
    "topUpPurchaseConfirmedTitle": "Compra confirmada",
    "topUpPurchaseConfirmedBody": "Seus 500 créditos estão sendo adicionados. Geralmente aparecem em um minuto — puxe para baixo para atualizar.",
    "removeFamilyTitle": "Remover da família?",
    "removeFamilyBody": "O perfil de {{name}} será removido deste plano familiar e ocultado na troca de perfil.",
    "removeFamilyConfirm": "Remover", "familyUpdatedTitle": "Família atualizada",
    "familyUpdatedBody": "{{name}} foi removido do seu plano familiar.",
    "removeFamilyErrorTitle": "Não foi possível remover o perfil",
    "removeFamilyErrorBody": "Verifique sua conexão e tente novamente.",
    "contactSupportTitle": "Contatar suporte",
    "contactSupportBody": "Envie um e-mail para support@mentomate.app para obter ajuda com assinaturas."
  },
  "childPaywall": {
    "backAccessibilityLabel": "Voltar", "back": "Voltar", "title": "Ótimo trabalho até agora!",
    "progressWithXp_one": "Você aprendeu {{topics}} tópico e ganhou {{xp}} XP — excelente!",
    "progressWithXp_other": "Você aprendeu {{topics}} tópicos e ganhou {{xp}} XP — excelente!",
    "progressExploring": "Você explorou e aprendeu — um ótimo começo!",
    "quotaMessage": "Você usou todas as suas perguntas gratuitas. Peça a um responsável para fazer upgrade para continuar aprendendo.",
    "notifyParentLabel": "Notificar meu responsável", "parentAlreadyNotifiedLabel": "Responsável já notificado",
    "notifyParentButton": "Notificar meu responsável", "parentNotifiedButton": "Responsável notificado",
    "remindAgainIn": "Você pode lembrar novamente em {{time}}.",
    "parentNotifiedExplore": "Seu responsável foi notificado! Enquanto espera, você ainda pode explorar:",
    "waitingExplore": "Enquanto espera, você ainda pode explorar sua Biblioteca e ver seu progresso.",
    "browseLibrary": "Explorar Biblioteca", "browseLibraryAccessibilityLabel": "Explorar Biblioteca",
    "seeProgress": "Ver seu progresso", "seeProgressAccessibilityLabel": "Ver seu progresso",
    "goHome": "Ir para início", "goHomeAccessibilityLabel": "Ir para início",
    "cooldownSeconds_one": "{{count}} segundo", "cooldownSeconds_other": "{{count}} segundos",
    "cooldownMinutes_one": "{{count}} minuto", "cooldownMinutes_other": "{{count}} minutos",
    "cooldownHours_one": "{{count}} hora", "cooldownHours_other": "{{count}} horas",
    "cooldownZero": "0 segundos",
    "notifySentTitle": "Enviado!", "notifySentBody": "Avisamos seu responsável!",
    "notifyAskParentTitle": "Pergunte ao responsável",
    "notifyAskParentBody": "Peça ao seu responsável para abrir o app e assinar.",
    "notifyErrorTitle": "Não foi possível enviar a notificação",
    "notifyErrorBody": "Verifique sua conexão e tente novamente."
  }
}

for locale, block in blocks.items():
    path = f'apps/mobile/src/i18n/locales/{locale}.json'
    with open(path, encoding='utf-8-sig') as f:
        d = json.load(f)
    d['subscriptionScreen'] = block
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(d, f, ensure_ascii=False, indent=2)
        f.write('\n')
    print(f'{locale}.json written, keys: {len(d)}')

print('All done')
