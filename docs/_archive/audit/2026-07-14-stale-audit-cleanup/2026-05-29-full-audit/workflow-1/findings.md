# Confirmed Violations — Full Findings

> 960 confirmed hardcoded user-visible strings, grouped by file (most-affected first). Generated 2026-05-30. Severity legend: **H**igh = primary visible copy; **M**edium = placeholder/helper/a11y; **L**ow = edge/possibly-dynamic.

## `app/(app)/shelf/[subjectId]/book/[bookId].tsx`  ·  71 violations

| Line | Sev | Kind | Literal | Suggested key | Why |
|---:|:--:|---|---|---|---|
| 347 | H | prop:title | Delete started topics? | book.deleteStartedTopicsTitle | Title of a platformAlert (native dialog) shown to the user when deleting a book with started topics. |
| 348 | H | prop:message | This book has ${startedLabel}. Deleting it will also delete those topics, their… | book.deleteStartedTopicsMessage | Body text of the native dialog shown when deleting a book with started topics. Directly user-visible. |
| 354 | H | prop:cancelText | Cancel | common.cancel | Button text in platformAlert dialog for cancelling book deletion. Directly user-visible in native alert. |
| 356 | H | prop:confirmText | Delete everything | book.deleteEverythingConfirm | Destructive confirm button text in the native dialog for deleting a book with started topics. |
| 375 | H | prop:title | Delete book? | book.deleteBookTitle | Title of the standard book-deletion native dialog. Directly user-visible. |
| 376 | H | prop:message | You can re-add it later. If any topics have been started, you will be asked bef… | book.deleteBookMessage | Body message in the standard book-deletion native dialog. Directly user-visible. |
| 378 | H | prop:cancelText | Cancel | common.cancel | Cancel button text in the standard book-deletion native dialog. |
| 380 | H | prop:confirmText | Delete | common.delete | Destructive confirm button text in the standard book-deletion native dialog. |
| 579 | H | prop:summary | Loading notes... | book.notesLoadingSummary | Assigned to noteSummary and passed as summary= to BookSectionStrip, rendered as visible subtitle text while notes are loading. |
| 580 | H | prop:summary | Add your first note for this book | book.notesEmptySummary | Assigned to noteSummary when noteCount is 0, rendered as visible subtitle text in BookSectionStrip. |
| 582 | H | prop:summary | 1 note saved for this book | book.notesSummary_one | Singular note count summary text for BookSectionStrip, rendered as visible subtitle. |
| 583 | H | prop:summary | ${noteCount} notes saved for this book | book.notesSummary_other | Plural note count summary text for BookSectionStrip, rendered as visible subtitle. |
| 974 | H | prop:message | This is the only book on this shelf — there is nowhere to move this topic. | book.moveTopicOnlyBookMessage | Body text of a platformAlert shown when trying to move a topic but no other books exist on the shelf. |
| 1008 | H | prop:message | Move to a different book? | book.moveTopicMessage | Body/title text of the native dialog for moving a topic to a different book. |
| 1011 | H | prop:cancelText | Cancel | common.cancel | Cancel button in the move-topic native dialog. Directly user-visible. |
| 1273 | H | jsx | Missing book details. Please go back and try again. | book.missingParamsError | Rendered in <Text> as an error screen when subjectId or bookId params are missing. User-visible error state. |
| 1281 | H | jsx | Go back | common.goBack | Button label rendered in <Text> in the missing-params error screen. |
| 1339 | H | prop:label | Notes for this book | book.notesLabel | Passed as label= to BookSectionStrip in the loading state, rendered as the section header visible to users. |
| 1352 | H | jsx | Topics | book.topicsHeading | Section heading 'Topics' rendered in <Text> above the topics shimmer in the loading state. |
| 1397 | H | jsx | Retry | common.retry | Retry button label in the error state (book query failed), rendered in <Text>. |
| 1407 | H | jsx | Go back | common.goBack | Secondary button label in the book error state, rendered in <Text>. |
| 1436 | H | jsx | Writing your book... | book.generatingTitle | Rendered in <Text> as the placeholder title while the book is being generated (book?.title ?? 'Writing your book...'). |
| 1437 | H | jsx | Writing your book... | book.generatingBody | Rendered in a separate <Text> body line below the title during book generation state. |
| 1441 | H | jsx | Taking a little longer than usual... | book.generatingSlowWarning | Rendered in <Text> during the 'slow' generation phase to reassure the user. |
| 1448 | H | jsx | Couldn't finish this book right now. | book.generationTimedOut | Rendered in <Text> when book generation times out, shown in the 'timed_out' error state. |
| 1456 | H | jsx | Retry | common.retry | Retry button label in the generation-timed-out error state, rendered in <Text>. |
| 1469 | H | jsx | Set up this book | book.setupBookText | Rendered in <Text> as the CTA button label to manually set up a book after generation fails. |
| 1480 | H | jsx | Go back | common.goBack | Rendered in <Text> as the go-back button label in the generation-timed-out state. |
| 1495 | H | jsx | Go back | common.goBack | Rendered in <Text> as the go-back button label in the non-timed-out generation state. |
| 1606 | H | jsx | {doneTopics.length} of {activeTopics.length} topics finished | book.topicsFinishedProgress | Rendered in <Text> as the progress caption below the progress bar in the book hero. 'of' and 'topics finished' are hardcoded English. |
| 1617 | H | prop:label | Notes for this book | book.notesLabel | Passed as label= to BookSectionStrip in the main book view, rendered as the notes section header. |
| 1685 | H | jsx | No notes yet. Add one when something clicks. | book.notesEmptyState | Rendered in <Text> as the empty state message when no notes exist for the book. |
| 1709 | H | jsx | + Add your first note for this book | book.addFirstNoteText | Rendered in <Text> as the add-note CTA text when no notes exist. |
| 1710 | H | jsx | + Add a note | book.addNoteText | Rendered in <Text> as the add-note CTA text when notes already exist. |
| 1729 | H | jsx | Couldn't load your history. | book.sessionsLoadError | Rendered in <Text> in the sessions-error banner visible to users when session history fails to load. |
| 1740 | H | jsx | Retry | common.retry | Rendered in <Text> as the retry button label in the sessions-error banner. |
| 1757 | H | jsx | Couldn't load progress. | book.progressLoadError | Rendered in <Text> in the retention-error banner visible to users when progress fails to load. |
| 1768 | H | jsx | Retry | common.retry | Rendered in <Text> as the retry button label in the retention-error banner. |
| 1779 | H | jsx | This book is not ready yet | book.notReadyTitle | Rendered in <Text> as the heading of the empty-topics state when topics are generated but empty. |
| 1781 | H | jsx | Set up the topics first. Then you can start learning step by step. | book.notReadyBody | Rendered in <Text> as the body text of the empty-topics state. |
| 1793 | H | jsx | Set up this book | book.setupBookText | Rendered in <Text> as the CTA button label in the empty-topics state. |
| 1847 | H | jsx | Nothing to show yet. | book.fallbackEmptyTitle | Rendered in <Text> as the heading of the all-sections-fallback empty state. |
| 1849 | H | jsx | Start your first lesson to see your progress here. | book.fallbackEmptyBody | Rendered in <Text> as the body text of the all-sections-fallback empty state. |
| 1868 | H | jsx | ▶ Start first lesson | book.startFirstLessonText | Rendered in <Text> as the CTA button label in the fallback empty state. |
| 1905 | H | jsx | You finished this book | book.completedTitle | Rendered in <Text> as the heading of the book-complete celebration card. |
| 1907 | H | jsx | You've studied all {activeTopics.length} topics in this book. Review them to ke… | book.completedBody | Rendered in <Text> as the body text of the book-complete card. |
| 1921 | H | jsx | ▶ Start review | book.startReviewText | Rendered in <Text> as the start-review CTA button label in the book-complete card. |
| 1933 | H | jsx | Back to subject → | book.backToSubjectText | Rendered in <Text> as the navigation link text in the book-complete card. |
| 1953 | H | jsx | Past conversations | book.pastConversationsHeading | Rendered in <Text> as the section heading for the past conversations toggle. |
| 1987 | H | jsx | No conversations yet | book.noConversationsEmpty | Rendered in <Text> as the empty state for the past conversations section. |
| 2087 | H | jsx | Set up this book | book.setupBookText | Rendered in <Text> as the underlined link text for setting up the book at the bottom of the main screen. |
| 110 | M | prop:accessibilityLabel | ${label}. ${summary}. ${expanded ? 'Collapse section' : 'Expand section'}. | book.sectionStrip.collapseExpandLabel | accessibilityLabel on BookSectionStrip, containing 'Collapse section' / 'Expand section' as hardcoded English toggle state strings read by … |
| 1310 | M | prop:accessibilityLabel | Back | common.backLabel | accessibilityLabel on the back button in the loading state header. Read by screen readers. |
| 1465 | M | prop:accessibilityLabel | Set up this book | book.setupBookLabel | accessibilityLabel on the 'Set up this book' button in the generation-timed-out state. The visible text is the same (line 1469). |
| 1479 | M | prop:accessibilityLabel | Go back | common.goBackLabel | accessibilityLabel on the go-back button in generation-timed-out state. |
| 1490 | M | prop:accessibilityLabel | Go back | common.goBackLabel | accessibilityLabel on the go-back button in the non-timed-out generation state. |
| 1520 | M | prop:accessibilityLabel | Back | common.backLabel | accessibilityLabel on the back button in the main book view header. |
| 1533 | M | prop:accessibilityLabel | Delete book | book.deleteBookLabel | accessibilityLabel on the delete-book icon button in the main book view header. |
| 1551 | M | prop:accessibilityLabel | View saved bookmarks for this subject | book.viewBookmarksLabel | accessibilityLabel on the bookmarks icon button in the main book view header. |
| 1703 | M | prop:accessibilityLabel | Add your first note for this book | book.addFirstNoteLabel | accessibilityLabel on the add-note button when no notes exist yet. |
| 1704 | M | prop:accessibilityLabel | Add a note | book.addNoteLabel | accessibilityLabel on the add-note button when notes already exist. |
| 1735 | M | prop:accessibilityLabel | Retry loading session history | book.retrySessionsLabel | accessibilityLabel on the retry button in the sessions-error banner. |
| 1763 | M | prop:accessibilityLabel | Retry loading progress | book.retryProgressLabel | accessibilityLabel on the retry button in the retention-error banner. |
| 1790 | M | prop:accessibilityLabel | Set up this book | book.setupBookLabel | accessibilityLabel on the 'Set up this book' CTA in the empty-topics state. |
| 1865 | M | prop:accessibilityLabel | Start first lesson | book.startFirstLessonLabel | accessibilityLabel on the 'Start first lesson' CTA in the fallback empty state. |
| 1882 | M | prop:accessibilityLabel | ${book?.title ?? 'Book'} complete. ${activeTopics.length} topics studied. | book.completeCardLabel | accessibilityLabel on the book-complete card containing 'complete' and 'topics studied' as hardcoded English words read by screen readers. |
| 1918 | M | prop:accessibilityLabel | Start spaced-repetition review | book.startReviewLabel | accessibilityLabel on the start-review CTA in the book-complete card. |
| 1930 | M | prop:accessibilityLabel | Back to subject to pick what to learn next | book.backToSubjectLabel | accessibilityLabel on the 'Back to subject' link in the book-complete card. |
| 1948 | M | prop:accessibilityLabel | Collapse past conversations | book.collapseConversationsLabel | accessibilityLabel branch when past conversations are expanded. Read by screen readers. |
| 1949 | M | prop:accessibilityLabel | Expand past conversations | book.expandConversationsLabel | accessibilityLabel branch when past conversations are collapsed. Read by screen readers. |
| 2084 | M | prop:accessibilityLabel | Set up this book | book.setupBookLabel | accessibilityLabel on the 'Set up this book' link at the bottom of the main book screen. |

## `app/session-summary/[sessionId].tsx`  ·  63 violations

| Line | Sev | Kind | Literal | Suggested key | Why |
|---:|:--:|---|---|---|---|
| 418 | H | prop:title | Session not found | sessionSummary.error.sessionNotFound.title | ErrorFallback title prop rendered as visible heading when session ID is missing; hardcoded English not wrapped in t(). |
| 419 | H | prop:message | We couldn't find this session. Head home to start a new one. | sessionSummary.error.sessionNotFound.message | ErrorFallback message prop rendered as visible body text; hardcoded English not wrapped in t(). |
| 421 | H | prop:label | Go Home | sessionSummary.error.goHome | Primary action button label passed to ErrorFallback and rendered to the user; hardcoded English not wrapped in t(). |
| 444 | H | jsx | This session has expired | sessionSummary.error.expired.title | Error state heading visible when a session has expired; hardcoded English in JSX Text, not wrapped in t(). |
| 447 | H | jsx | This session is no longer available. Head home to start a new one. | sessionSummary.error.expired.message | Error state body text visible when session has expired; hardcoded English in JSX Text, not wrapped in t(). |
| 457 | H | jsx | Go Home | sessionSummary.error.goHome | CTA button label in the expired-session error state; hardcoded English in JSX Text, not wrapped in t(). |
| 470 | H | jsx | Session not found | sessionSummary.error.loadFailed.title | Error state heading when a non-404 error occurs loading the session; hardcoded English in JSX Text, not wrapped in t(). |
| 473 | H | jsx | We couldn't load this session. It may no longer exist. | sessionSummary.error.loadFailed.message | Error state body text for non-404 load failures; hardcoded English in JSX Text, not wrapped in t(). |
| 483 | H | jsx | Go Home | sessionSummary.error.goHome | CTA button label in the session-not-found error state; hardcoded English in JSX Text, not wrapped in t(). |
| 502 | H | prop:title | Taking longer than expected | sessionSummary.error.timeout.title | ErrorFallback title prop rendered as heading in the loading-timeout state; hardcoded English not wrapped in t(). |
| 503 | H | prop:message | We couldn't load your session summary. Check your connection and try again. | sessionSummary.error.timeout.message | ErrorFallback message rendered as body text in the timeout state; hardcoded English not wrapped in t(). |
| 505 | H | prop:label | Try Again | sessionSummary.error.tryAgain | Primary action label on the ErrorFallback in the timeout state; hardcoded English not wrapped in t(). |
| 511 | H | prop:label | Go Home | sessionSummary.error.goHome | Secondary action label on the ErrorFallback in the timeout state; hardcoded English not wrapped in t(). |
| 522 | H | jsx | Loading your session summary... | sessionSummary.loading.message | Loading state text shown to users while the session summary is fetching; hardcoded English in JSX Text, not wrapped in t(). |
| 539 | H | jsx | Session not found | sessionSummary.error.sessionNotFound.title | Error state heading for a bogus deep-link session ID; hardcoded English in JSX Text, not wrapped in t(). |
| 542 | H | jsx | This session could not be loaded. Head home to start a new one. | sessionSummary.error.sessionNotFound.message | Error state body text for bogus session ID deep-link; hardcoded English in JSX Text, not wrapped in t(). |
| 552 | H | jsx | Go Home | sessionSummary.error.goHome | CTA button label in the bogus-session error state; hardcoded English in JSX Text, not wrapped in t(). |
| 818 | H | jsx | Session Complete | sessionSummary.header.title | Primary heading in the session summary header shown to every user after completing a session; hardcoded English in JSX Text, not wrapped in… |
| 852 | H | jsx | What happened | sessionSummary.takeaways.title | Section heading in the session takeaways card; hardcoded English in JSX Text, not wrapped in t(). |
| 864 | H | jsx | I'll check in with you soon | sessionSummary.takeaways.checkInSoon | Caption text at the bottom of the takeaways card visible after every session; hardcoded English in JSX Text, not wrapped in t(). |
| 920 | H | jsx | Resume this session | sessionSummary.resumeSession | Primary CTA button label for resuming a session; hardcoded English in JSX Text, not wrapped in t(). |
| 971 | H | jsx | View full transcript | sessionSummary.viewTranscript | CTA button label to open the session transcript; hardcoded English in JSX Text, not wrapped in t(). |
| 1007 | H | jsx | Your learner recap is still loading. | sessionSummary.recap.loadingMessage | Loading state message shown in the recap card when recap generation times out; hardcoded English in JSX Text, not wrapped in t(). |
| 1021 | H | jsx | Tap to retry | sessionSummary.recap.tapToRetry | Retry link label in the recap timeout state; hardcoded English in JSX Text, not wrapped in t(). |
| 1044 | H | jsx | Milestones | sessionSummary.milestones.title | Section heading for the milestones card; hardcoded English in JSX Text, not wrapped in t(). |
| 1074 | H | jsx | Up next | sessionSummary.nextTopic.upNext | Section heading in the next-topic card when a reason is present; hardcoded English in a JSX ternary expression, not wrapped in t(). |
| 1074 | H | jsx | You might also like | sessionSummary.nextTopic.youMightLike | Section heading in the next-topic card when no reason is present; hardcoded English in a JSX ternary expression, not wrapped in t(). |
| 1103 | H | jsx | Continue learning | sessionSummary.continueLearning | CTA button label to continue to the next topic; hardcoded English in JSX Text, not wrapped in t(). |
| 1161 | H | jsx | Some great explanations in this session — you can bookmark them next time. | sessionSummary.bookmarkNudge.message | Nudge message shown to users who have no bookmarks; hardcoded English in JSX Text, not wrapped in t(). |
| 1173 | H | jsx | Fresh wins | sessionSummary.freshWins.title | Section heading for the fast celebrations card; hardcoded English in JSX Text, not wrapped in t(). |
| 1195 | H | jsx | Write a reflection to earn 1.5x XP | sessionSummary.xpIncentive.banner | XP incentive banner text urging the user to write a reflection; hardcoded English in JSX Text, not wrapped in t(). |
| 1213 | H | jsx | +{reflectionBonusXp} bonus XP earned! | sessionSummary.xpIncentive.bonusEarned | User-visible reward text with a dynamic XP value; the surrounding English copy ' bonus XP earned!' is hardcoded and not wrapped in t(). Nee… |
| 1239 | H | jsx | Quick recall check | sessionSummary.recallBridge.title | Section heading for recall bridge questions; hardcoded English in JSX Text, not wrapped in t(). |
| 1242 | H | jsx | Nice work on that homework! Can you answer these about the method you used? | sessionSummary.recallBridge.subtitle | Instructional body text above recall questions; hardcoded English in JSX Text, not wrapped in t(). |
| 1265 | H | jsx | Done — head home | sessionSummary.recallBridge.doneButton | CTA button label in the recall bridge section; hardcoded English in JSX Text, not wrapped in t(). |
| 1279 | H | jsx | Your Words | sessionSummary.yourWords.title | Section heading for the Your Words (submitted reflection) view; hardcoded English in JSX Text, not wrapped in t(). |
| 1295 | H | jsx | Mate feedback | sessionSummary.yourWords.mateFeedbackLabel | Label for the AI feedback sub-section inside the submitted reflection view; hardcoded English in JSX Text, not wrapped in t(). |
| 1311 | H | jsx | Your Words | sessionSummary.yourWords.title | Section heading in the skipped-state (no draft) branch of the Your Words section; hardcoded English in JSX Text, not wrapped in t(). |
| 1314 | H | jsx | You skipped writing a summary for this session. | sessionSummary.yourWords.skippedMessage | Body text shown when the user previously skipped the reflection; hardcoded English in JSX Text, not wrapped in t(). |
| 1321 | H | jsx | Your Words | sessionSummary.yourWords.title | Section heading in the input form branch of the Your Words section; hardcoded English in JSX Text, not wrapped in t(). |
| 1330 | H | jsx | You started a reflection but didn't submit it last time. Finish it below and su… | sessionSummary.yourWords.resumeBanner | Resume banner body text shown when a skipped-but-drafted reflection is recoverable; hardcoded English in JSX Text, not wrapped in t(). |
| 1335 | H | jsx | Write a short summary of what you learned. This helps you remember and helps me… | sessionSummary.yourWords.inputPrompt | Instructional prompt above the reflection input; hardcoded English in JSX Text, not wrapped in t(). |
| 1385 | H | jsx | Couldn't save your summary. Check your connection and try again — your work won… | sessionSummary.yourWords.saveError | Inline error message shown when the summary save fails; hardcoded English in JSX Text, not wrapped in t(). |
| 1394 | H | jsx | Couldn't skip your summary right now. Check your connection and try again. | sessionSummary.yourWords.skipError | Inline error message shown when the skip action fails; hardcoded English in JSX Text, not wrapped in t(). |
| 1426 | H | jsx | Submit Summary | sessionSummary.yourWords.submitButton | Submit button label for the reflection form; hardcoded English in JSX Text, not wrapped in t(). |
| 1447 | H | jsx | Continue | sessionSummary.yourWords.continueButton | Continue button label shown after submission or in the skipped state; hardcoded English in JSX Text, not wrapped in t(). |
| 1461 | H | jsx | Skipping... | sessionSummary.yourWords.skippingLabel | Loading state label on the skip button; hardcoded English in JSX ternary expression, not wrapped in t(). |
| 1461 | H | jsx | Skip for now | sessionSummary.yourWords.skipButton | Skip button label for the reflection; hardcoded English in JSX ternary expression, not wrapped in t(). |
| 1475 | H | jsx | See your Library | sessionSummary.libraryLink | Library navigation link label at the bottom of the session summary; hardcoded English in JSX Text, not wrapped in t(). |
| 454 | M | prop:accessibilityLabel | Go home | sessionSummary.error.goHome | accessibilityLabel on a CTA button in the expired-session error state; hardcoded English not wrapped in t(). |
| 480 | M | prop:accessibilityLabel | Go home | sessionSummary.error.goHome | accessibilityLabel on the Go Home button in the session-not-found error state; hardcoded English not wrapped in t(). |
| 549 | M | prop:accessibilityLabel | Go home | sessionSummary.error.goHome | accessibilityLabel on the CTA button in the bogus-session-ID error state; hardcoded English not wrapped in t(). |
| 807 | M | prop:accessibilityLabel | Close and go home | sessionSummary.header.closeAccessibilityLabel | accessibilityLabel on the close/home button in the main session summary header; hardcoded English not wrapped in t(). |
| 918 | M | prop:accessibilityLabel | Resume this session | sessionSummary.resumeSession | accessibilityLabel on the resume-session CTA button; hardcoded English not wrapped in t(). |
| 967 | M | prop:accessibilityLabel | View full transcript | sessionSummary.viewTranscript | accessibilityLabel on the view-transcript CTA button; hardcoded English not wrapped in t(). |
| 1016 | M | prop:accessibilityLabel | Retry loading session recap | sessionSummary.recap.retryAccessibilityLabel | accessibilityLabel on the recap retry button; hardcoded English not wrapped in t(). |
| 1099 | M | prop:accessibilityLabel | Continue learning | sessionSummary.continueLearning | accessibilityLabel on the continue-learning CTA button; hardcoded English not wrapped in t(). |
| 1262 | M | prop:accessibilityLabel | Done, head home | sessionSummary.recallBridge.doneButton | accessibilityLabel on the done button in the recall bridge section; hardcoded English not wrapped in t(). |
| 1344 | M | prop:accessibilityLabel | Sentence starter suggestions | sessionSummary.yourWords.starterChipsLabel | accessibilityLabel on the sentence-starter chips container; hardcoded English not wrapped in t(). |
| 1354 | M | prop:accessibilityHint | Tap to use this sentence starter | sessionSummary.yourWords.starterChipHint | accessibilityHint on each sentence-starter chip; hardcoded English not wrapped in t(). |
| 1374 | M | prop:accessibilityLabel | Write your learning summary | sessionSummary.yourWords.inputAccessibilityLabel | accessibilityLabel on the reflection TextInput; hardcoded English not wrapped in t(). |
| 1413 | M | prop:accessibilityLabel | Submit summary | sessionSummary.yourWords.submitButton | accessibilityLabel on the submit button for the reflection; hardcoded English not wrapped in t(). |
| 1472 | M | prop:accessibilityLabel | See your Library | sessionSummary.libraryLink | accessibilityLabel on the Library navigation link; hardcoded English not wrapped in t(). |

## `app/(app)/subscription.tsx`  ·  62 violations

| Line | Sev | Kind | Literal | Suggested key | Why |
|---:|:--:|---|---|---|---|
| 471 | H | prop:title | Not available | subscription.topUp.unavailableTitle | Alert title shown to user in a native dialog when top-up package is missing. |
| 472 | H | prop:message | Top-up credits aren't available right now. Try again later or contact support. | subscription.topUp.unavailableMessage | Alert body shown to user in a native dialog when top-up package is missing. |
| 475 | H | prop:text | Retry | common.retry | Button text inside a native alert dialog shown to the user. |
| 499 | H | prop:title | Network error | common.networkErrorTitle | Alert title displayed in native dialog on network failure during purchase. |
| 500 | H | prop:message | Please check your internet connection and try again. | common.networkErrorMessage | Alert body displayed in native dialog on network failure during purchase. |
| 504 | H | prop:title | Purchase failed | subscription.purchase.failedTitle | Alert title shown to user when purchase encounters an unexpected error. |
| 505 | H | prop:message | Something unexpected happened with your purchase. Please try again. | subscription.purchase.failedMessage | Alert body shown to user when purchase encounters an unexpected error. |
| 516 | H | prop:message | Confirming your purchase... | subscription.purchase.confirmingMessage | String set as poll message rendered in visible <Text> during purchase confirmation spinner. |
| 528 | H | prop:message | Still confirming — this can take up to 30 seconds. Your purchase is safe. | subscription.purchase.slowConfirmingMessage | String set as slow-poll message rendered in visible <Text> during purchase confirmation. |
| 548 | H | prop:title | Purchase confirmed | subscription.purchase.confirmedTitle | Alert title shown to user after top-up purchase times out but was confirmed. |
| 549 | H | prop:message | Your 500 credits are being added. They usually appear within a minute — pull do… | subscription.purchase.confirmedMessage | Alert body shown to user after confirmed top-up when polling times out. |
| 573 | H | prop:title | Contact support | subscription.support.alertTitle | Alert title shown when the user cannot open the mailto link for support. |
| 574 | H | prop:message | Email support@mentomate.app for help with subscriptions. | subscription.support.alertMessage | Alert body shown to user when mailto deeplink fails. |
| 582 | H | prop:title | Remove from family? | subscription.family.removeTitle | Alert title shown to confirm removing a child from the family plan. |
| 583 | H | prop:message | ${displayName}'s profile will be removed from this family plan and hidden from … | subscription.family.removeMessage | Alert body shown to user when confirming removal of a family member; uses template interpolation. |
| 589 | H | prop:text | Remove | common.remove | Destructive alert button text shown to user when removing family member. |
| 599 | H | prop:title | Family updated | subscription.family.updatedTitle | Alert title shown after successfully removing a family member. |
| 600 | H | prop:message | ${displayName} was removed from your family plan. | subscription.family.updatedMessage | Alert body shown to user after family member removal success. |
| 603 | H | prop:title | Could not remove profile | subscription.family.removeErrorTitle | Alert title shown on error when removing a family member fails. |
| 604 | H | prop:message | Please check your connection and try again. | subscription.family.removeErrorMessage | Alert body shown on error when removing a family member fails. |
| 735 | H | jsx | Unable to load subscription details. Please try again. | subscription.loadErrorMessage | Visible error message rendered in <Text> on the subscription screen load failure. |
| 755 | H | jsx | Retry | common.retry | Visible button label rendered in <Text> on the subscription load error screen. |
| 801 | H | jsx | Current plan | subscription.currentPlanHeading | Section heading rendered visibly in <Text> on the subscription screen. |
| 814 | H | jsx | Cancelling | subscription.statusBadge.cancelling | Status badge text rendered visibly in <Text>; shown when subscription is set to cancel at period end. |
| 815 | H | jsx | Past due | subscription.statusBadge.pastDue | Status badge text rendered visibly in <Text>; shown when subscription is past due. |
| 817 | H | jsx | Expired | subscription.statusBadge.expired | Status badge text rendered visibly in <Text>; other status values (trial) already use t() but this one does not. |
| 820 | H | jsx | Active | subscription.statusBadge.active | Status badge text rendered visibly in <Text>; 'trial' uses t() but 'active' does not. |
| 836 | H | jsx | Access until ${date} | subscription.accessUntil | Rendered in <Text> showing subscription end date to user when cancellation is pending. |
| 843 | H | jsx | Renews ${date} | subscription.renewsOn | Rendered in <Text> showing subscription renewal date to user. |
| 894 | H | jsx | Upgrade | subscription.upgradeButton | Visible button label rendered in <Text> on the subscription upgrade button. |
| 904 | H | jsx | Subscription ending | subscription.cancellingHeading | Section heading rendered visibly in <Text> in the cancellation notice banner. |
| 906 | H | jsx | Your subscription has been cancelled. You can continue using all features until… | subscription.cancellingBody | Cancellation notice body rendered visibly in <Text>; includes an inline date expression. |
| 930 | H | jsx | Family pool | subscription.familyPoolHeading | Section heading rendered visibly in <Text> in the family pool section. |
| 934 | H | jsx | ${profileCount} of ${maxProfiles} profiles connected | subscription.family.profilesConnected | Family plan summary rendered visibly in <Text> showing connected profile count. |
| 938 | H | jsx | ${remainingQuestions} shared questions left this cycle. | subscription.family.questionsLeft | Family plan quota rendered visibly in <Text>. |
| 950 | H | jsx | ${displayName} (owner) | subscription.family.ownerLabel | Family member row label rendered visibly in <Text>; the '(owner)' suffix is hardcoded English. |
| 969 | H | jsx | Removing... | subscription.family.removingButton | Pending-state button text rendered visibly in <Text> on remove family member button. |
| 970 | H | jsx | Remove | common.remove | Button label rendered visibly in <Text> on remove family member button. |
| 990 | H | jsx | Plans | subscription.plansHeading | Section heading rendered visibly in <Text> above the offerings list. |
| 1020 | H | jsx | Confirming purchase… | subscription.purchase.confirmingInline | Loading state text rendered visibly in <Text> next to a spinner during purchase confirmation. |
| 1036 | H | jsx | Plans | subscription.plansHeading | Duplicate section heading rendered visibly in <Text> in the no-offerings fallback section. |
| 1172 | H | jsx | Check later | subscription.restore.checkLaterButton | Button label rendered visibly in <Text> to dismiss the restore purchase polling state. |
| 1183 | H | jsx | Need more questions? | subscription.topUp.heading | Section heading rendered visibly in <Text> in the top-up section. |
| 1201 | H | jsx | Opening store... | subscription.topUp.openingStore | Loading state text rendered visibly in <Text> while the store is opening. |
| 1207 | H | jsx | Buy 500 credits | subscription.topUp.buyButton | Primary button label rendered visibly in <Text> on the top-up button. |
| 1210 | H | jsx | One-time purchase. Credits expire in 12 months. | subscription.topUp.subtitle | Subtitle rendered visibly in <Text> below the top-up button. |
| 1221 | H | prop:title | Check later | subscription.topUp.checkLaterTitle | Alert title shown when user dismisses top-up polling. |
| 1222 | H | prop:message | Credits will appear shortly — tap refresh to check. | subscription.topUp.checkLaterMessage | Alert body shown when user dismisses top-up polling. |
| 1231 | H | jsx | Check later | subscription.topUp.checkLaterButton | Button label rendered visibly in <Text> to dismiss top-up polling. |
| 1245 | H | jsx | Manage | subscription.manageHeading | Section heading rendered visibly in <Text> in the manage billing section. |
| 1258 | H | jsx | Manage billing | subscription.manageBillingLabel | Row label rendered visibly in <Text> in the web-only manage billing info row. |
| 1261 | H | jsx | Subscription is managed on your mobile device | subscription.manageBillingWebSubtitle | Subtitle rendered visibly in <Text> in the web-only manage billing info row. |
| 1272 | H | jsx | Manage billing | subscription.manageBillingLabel | Row label rendered visibly in <Text> on the native manage billing pressable. |
| 1276 | H | jsx | Opens App Store subscriptions | subscription.manageBillingIosSubtitle | Subtitle rendered visibly in <Text> on the manage billing button for iOS. |
| 1277 | H | jsx | Opens Google Play subscriptions | subscription.manageBillingAndroidSubtitle | Subtitle rendered visibly in <Text> on the manage billing button for Android. |
| 745 | M | prop:accessibilityLabel | Retry loading subscription | subscription.retryAccessibilityLabel | Accessibility label on the retry button; read aloud by screen readers. |
| 890 | M | prop:accessibilityLabel | Upgrade plan | subscription.upgradeAccessibilityLabel | Accessibility label on the upgrade button; read aloud by screen readers. |
| 964 | M | prop:accessibilityLabel | Remove ${displayName} from family | subscription.family.removeMemberAccessibilityLabel | Accessibility label on remove-member button; read aloud by screen readers. |
| 1189 | M | prop:accessibilityLabel | Buy 500 credits | subscription.topUp.buyAccessibilityLabel | Accessibility label on the top-up button; read aloud by screen readers. |
| 1228 | M | prop:accessibilityLabel | Cancel top-up confirmation | subscription.topUp.cancelPollingAccessibilityLabel | Accessibility label on the cancel top-up polling button; read aloud by screen readers. |
| 1268 | M | prop:accessibilityLabel | Manage billing | subscription.manageBillingAccessibilityLabel | Accessibility label on the manage billing button; read aloud by screen readers. |
| 826 | L | jsx | Unknown | subscription.statusBadge.unknown | Fallback status badge text rendered visibly in <Text> for unknown subscription statuses; edge-case but user-visible. |

## `app/(app)/topic/[topicId].tsx`  ·  53 violations

| Line | Sev | Kind | Literal | Suggested key | Why |
|---:|:--:|---|---|---|---|
| 71 | H | jsx | Never studied | topic.lastStudied.never | Return value of formatLastStudiedText() rendered visibly in the topic detail UI as a last-studied label. |
| 76 | H | jsx | Last studied today | topic.lastStudied.today | Return value of formatLastStudiedText() rendered visibly in the topic detail UI. |
| 77 | H | jsx | Last studied yesterday | topic.lastStudied.yesterday | Return value of formatLastStudiedText() rendered visibly in the topic detail UI. |
| 78 | H | jsx | Last studied ${diffDays} days ago | topic.lastStudied.daysAgo | Return value of formatLastStudiedText() rendered visibly in the topic detail UI. |
| 79 | H | jsx | Last studied last week | topic.lastStudied.lastWeek | Return value of formatLastStudiedText() rendered visibly in the topic detail UI. |
| 81 | H | jsx | Last studied ${weeks} weeks ago | topic.lastStudied.weeksAgo | Return value of formatLastStudiedText() rendered visibly in the topic detail UI. |
| 82 | H | jsx | Last studied ${date} | topic.lastStudied.onDate | Return value of formatLastStudiedText() rendered visibly in the topic detail UI. |
| 120 | H | jsx | ${count} session(s) · ${totalMinutes} min total | topic.sessions.summary | Return value of formatSessionsSummary() rendered visibly as a section summary in TopicSectionStrip. |
| 124 | H | jsx | From chat · ${date} | topic.bookmarks.fromChat | Return value of formatBookmarkSourceLine() rendered visibly as a bookmark source line in the topic bookmarks section. |
| 251 | H | jsx | Start studying | topic.cta.startStudying | Primary CTA button label derived from deriveStudyCTA() and rendered visibly on the topic detail screen. |
| 259 | H | jsx | Practice again | topic.cta.practiceAgain | CTA button label derived from deriveStudyCTA() and rendered visibly on the topic detail screen. |
| 262 | H | jsx | Review this topic | topic.cta.reviewTopic | CTA button label derived from deriveStudyCTA() and rendered visibly on the topic detail screen. |
| 422 | H | jsx | Loading notes... | topic.notes.loading | Loading state string rendered visibly as section summary text in TopicSectionStrip. |
| 424 | H | jsx | Add your first note for this topic | topic.notes.emptyPrompt | Empty-state string rendered visibly as section summary text in TopicSectionStrip. |
| 425 | H | jsx | 1 note saved for this topic | topic.notes.singleNote | Singular note count string rendered visibly as section summary text in TopicSectionStrip. |
| 426 | H | jsx | ${noteCount} notes saved for this topic | topic.notes.multipleNotes | Plural note count string rendered visibly as section summary text in TopicSectionStrip. |
| 428 | H | jsx | Loading saved explanations... | topic.bookmarks.loading | Loading state string rendered visibly as bookmarks section summary text in TopicSectionStrip. |
| 434 | H | jsx | ${count} saved explanations | topic.bookmarks.multiple | Plural bookmark count string rendered visibly as bookmarks section summary text. |
| 436 | H | jsx | Loading sessions... | topic.sessions.loading | Loading state string rendered visibly as sessions section summary text in TopicSectionStrip. |
| 437 | H | jsx | No sessions yet | topic.sessions.emptyShort | Empty-state string rendered visibly as sessions section summary text in TopicSectionStrip. |
| 537 | H | prop:title | Could not delete note | topic.notes.deleteErrorTitle | Alert title shown to the user when note deletion fails. |
| 563 | H | prop:title | Taking too long to open this topic | topic.resolveTimeout.title | ErrorFallback title prop shown to user when deep-link resolve times out. |
| 564 | H | prop:message | Check your connection and try again. | topic.resolveTimeout.message | ErrorFallback message prop shown to user when deep-link resolve times out. |
| 566 | H | prop:label | Retry | common.retry | ErrorFallback primary action label shown as a button to the user. |
| 571 | H | prop:label | Go to Library | topic.resolveTimeout.goToLibrary | ErrorFallback secondary action label shown as a button to the user. |
| 589 | H | jsx | Topic not found | topic.notFound.title | Error heading rendered visibly in <Text> when topic params are missing. |
| 592 | H | jsx | This topic could not be opened. Please go back and try again. | topic.notFound.message | Error body rendered visibly in <Text> when topic params are missing. |
| 602 | H | jsx | Go back | common.goBack | Button label rendered visibly in <Text> on the topic not-found error screen. |
| 617 | H | jsx | We couldn't load this topic | topic.loadError.title | Error heading rendered visibly in <Text> on the topic load error screen. |
| 620 | H | jsx | Please try again, or go back to your library. | topic.loadError.message | Error body rendered visibly in <Text> on the topic load error screen. |
| 632 | H | jsx | Retry | common.retry | Button label rendered visibly in <Text> on the topic load error screen. |
| 642 | H | jsx | Go back | common.goBack | Button label rendered visibly in <Text> on the topic load error screen. |
| 653 | H | jsx | Go Home | common.goHome | Button label rendered visibly in <Text> on the topic load error screen. |
| 693 | H | jsx | Loading topic... | topic.loading | Loading state text rendered visibly in <Text> while topic data loads. |
| 697 | H | prop:label | Loading… | common.loading | Label prop on disabled StudyCTA component rendered visibly while data loads. |
| 709 | H | jsx | Topic not found | topic.notFound.title | Error heading rendered visibly in <Text> when topicProgress is not available. |
| 712 | H | jsx | This topic may have been removed from your curriculum. | topic.notFound.removedMessage | Error body rendered visibly in <Text> when topic progress is missing. |
| 722 | H | jsx | Go back | common.goBack | Button label rendered visibly in <Text> on the topic-not-found (empty) state. |
| 817 | H | prop:label | Notes for this topic | topic.notes.sectionLabel | label prop on TopicSectionStrip is rendered both as visible text (section heading) and as part of accessibilityLabel. |
| 868 | H | jsx | No notes yet. Add one when something clicks. | topic.notes.emptyMessage | Empty-state message rendered visibly in <Text> in the notes expanded section. |
| 900 | H | jsx | + Add a note | topic.notes.addNoteButton | Button label rendered visibly in <Text> when notes already exist. |
| 901 | H | jsx | + Add your first note for this topic | topic.notes.addFirstNoteButton | Button label rendered visibly in <Text> when no notes exist yet. |
| 963 | H | prop:label | Sessions | topic.sessions.sectionLabel | label prop on TopicSectionStrip is rendered as visible text (section heading) and used in accessibilityLabel. |
| 1006 | H | jsx | No sessions yet. Start one below! | topic.sessions.emptyMessage | Empty-state message rendered visibly in <Text> in the sessions expanded section. |
| 155 | M | prop:accessibilityLabel | ${label}. ${summary}. Collapse section / Expand section. | topic.section.collapseLabel | The 'Collapse section' and 'Expand section' substrings are hardcoded English inside the accessibilityLabel template; read aloud by screen r… |
| 599 | M | prop:accessibilityLabel | Go back | common.goBackAccessibilityLabel | Accessibility label on back button; read aloud by screen readers. |
| 629 | M | prop:accessibilityLabel | Retry loading topic | topic.loadError.retryAccessibilityLabel | Accessibility label on retry button; read aloud by screen readers. |
| 639 | M | prop:accessibilityLabel | Go back | common.goBackAccessibilityLabel | Accessibility label on back button on load error screen; read aloud by screen readers. |
| 649 | M | prop:accessibilityLabel | Go home | common.goHomeAccessibilityLabel | Accessibility label on home button on load error screen; read aloud by screen readers. |
| 672 | M | prop:accessibilityLabel | Go back | common.goBackAccessibilityLabel | Accessibility label on back button in the loading state; read aloud by screen readers. |
| 719 | M | prop:accessibilityLabel | Back to previous screen | common.backToPreviousAccessibilityLabel | Accessibility label on back button; read aloud by screen readers. |
| 895 | M | prop:accessibilityLabel | Add a note / Add your first note for this topic | topic.notes.addNoteAccessibilityLabel | Accessibility labels on the add-note button; read aloud by screen readers. |
| 433 | L | jsx | 1 saved explanation | topic.bookmarks.singleFallback | Fallback string for singular bookmark displayed when bookmark content is missing; user-visible but only shown as a fallback. |

## `app/(auth)/sign-in.tsx`  ·  49 violations

| Line | Sev | Kind | Literal | Suggested key | Why |
|---:|:--:|---|---|---|---|
| 1022 | H | prop:title | Still signing you in | signIn.stuckTitle | Rendered as the title of an ErrorFallback component shown to users when sign-in transition is stuck. No useTranslation in this file. |
| 1023 | H | prop:message | This is taking longer than expected. Try again. | signIn.stuckMessage | Rendered as the body message of an ErrorFallback shown to users when sign-in is stuck. No useTranslation in this file. |
| 1025 | H | prop:label | Try again | signIn.stuckPrimaryAction | Primary action button label on the stuck sign-in ErrorFallback, rendered to users. No useTranslation in this file. |
| 1049 | H | prop:label | Sign up | signIn.stuckSecondaryAction | Secondary action button label on stuck sign-in ErrorFallback, rendered to users. No useTranslation in this file. |
| 1075 | H | jsx | Signing you in… | signIn.signingInLabel | Visible Text body shown to users during sign-in loading state. No useTranslation in this file. |
| 1108 | H | jsx | Enter authenticator code | signIn.verify.headingTotp | Heading text in h2 Text rendered to users when TOTP verification is pending. No useTranslation in this file. |
| 1110 | H | jsx | Enter a backup code | signIn.verify.headingBackupCode | Heading text in h2 Text rendered to users when backup_code verification is pending. No useTranslation in this file. |
| 1111 | H | jsx | Enter verification code | signIn.verify.headingDefault | Heading text in h2 Text rendered to users for default email verification. No useTranslation in this file. |
| 1115 | H | jsx | Open your authenticator app and enter the 6-digit code. | signIn.verify.subtitleTotp | Body text rendered to users with TOTP verification instructions. No useTranslation in this file. |
| 1117 | H | jsx | Enter one of the backup codes you saved when you set up two-factor authenticati… | signIn.verify.subtitleBackupCode | Body text rendered to users with backup code instructions. No useTranslation in this file. |
| 1120 | H | jsx | We sent a verification code to | signIn.verify.subtitleEmail | Part of body text rendered to users explaining where verification code was sent. No useTranslation in this file. |
| 1143 | H | jsx | Verification code | signIn.verify.codeLabel | Field label above the verification code input, visible to users. No useTranslation in this file. |
| 1169 | H | prop:label | Verify | signIn.verify.verifyButton | Primary button label on the verification screen, rendered to users. No useTranslation in this file. |
| 1182 | H | prop:label | Try Again | signIn.verify.retryButton | Secondary action button rendered to users after activation failure during verification. No useTranslation in this file. |
| 1197 | H | prop:label | Resend code | signIn.verify.resendButton | Tertiary button label rendered to users to resend verification code. No useTranslation in this file. |
| 1208 | H | prop:label | Back to sign in | signIn.verify.backButton | Tertiary button label rendered to users to navigate back from verification. No useTranslation in this file. |
| 1255 | H | jsx | Welcome | signIn.welcomeLoading | H2 heading shown to users when returning user status is unknown (loading state). No useTranslation in this file. |
| 1256 | H | jsx | Welcome back | signIn.welcomeReturning | H2 heading shown to returning users. No useTranslation in this file. |
| 1257 | H | jsx | Welcome to MentoMate | signIn.welcomeFirstTime | H2 heading shown to first-time users. No useTranslation in this file. |
| 1271 | H | jsx | Sign in to get started | signIn.subtitleLoading | Subtitle text rendered to users when returning user status is unknown. No useTranslation in this file. |
| 1272 | H | jsx | Sign in to continue learning | signIn.subtitleReturning | Subtitle text rendered to returning users. No useTranslation in this file. |
| 1273 | H | jsx | Sign in to start learning | signIn.subtitleFirstTime | Subtitle text rendered to first-time users. No useTranslation in this file. |
| 1315 | H | prop:label | Contact support | signIn.contactSupportButton | Button label shown to users when unsupported verification strategies are detected. No useTranslation in this file. |
| 1327 | H | prop:label | Try Again | signIn.oauthRetryButton | Button label rendered to users after OAuth activation failure. No useTranslation in this file. |
| 1343 | H | prop:label | Cancel sign-in | signIn.cancelButton | Tertiary button label allowing users to cancel a pending SSO activation. No useTranslation in this file. |
| 1356 | H | prop:label | Continue with Google | signIn.continueWithGoogle | SSO button label rendered to users on non-iOS. No useTranslation in this file. |
| 1369 | H | prop:label | Continue with Apple | signIn.continueWithApple | SSO button label rendered to iOS users. No useTranslation in this file. |
| 1382 | H | prop:label | Continue with OpenAI | signIn.continueWithOpenAI | SSO button label rendered to users when OpenAI strategy is available. No useTranslation in this file. |
| 1399 | H | jsx | Email | signIn.emailLabel | Field label above email TextInput, rendered to users. No useTranslation in this file. |
| 1421 | H | jsx | Password | signIn.passwordLabel | Field label above password input, rendered to users. No useTranslation in this file. |
| 1443 | H | prop:label | Forgot password? | signIn.forgotPasswordButton | Button label shown to users linking to password reset. No useTranslation in this file. |
| 1451 | H | prop:label | Sign in | signIn.signInButton | Primary sign-in submit button label, rendered to users. No useTranslation in this file. |
| 1477 | H | jsx | Additional verification is available | signIn.verificationOfferTitle | Heading text in verification offer card rendered to users. No useTranslation in this file. |
| 1480 | H | jsx | This account can continue with a verification code sent to | signIn.verificationOfferBody | Body text in verification offer card rendered to users. No useTranslation in this file. |
| 1486 | H | jsx | . We will only send the code if you choose to continue. | signIn.verificationOfferBodyTrail | Trailing text in verification offer card rendered to users. Part of a sentence split across JSX nodes. No useTranslation in this file. |
| 1491 | H | prop:label | Send verification code | signIn.sendVerificationCodeButton | Button label in verification offer card rendered to users. No useTranslation in this file. |
| 1503 | H | jsx | Don't have an account? | signIn.noAccountPrompt | Prompt text rendered to users below sign-in form linking to sign-up. No useTranslation in this file. |
| 1508 | H | prop:label | Sign up | signIn.signUpLink | Button label below sign-in form linking to sign-up, rendered to users. No useTranslation in this file. |
| 1524 | H | jsx | New here? | signIn.newHerePrompt | Text rendered to users above the Try MentoMate CTA (behind a feature flag). No useTranslation in this file. |
| 1535 | H | jsx | Try MentoMate | signIn.tryMentomateLabel | Visible Text inside the preview CTA button, rendered to users. No useTranslation in this file. |
| 1073 | M | prop:accessibilityLabel | Signing you in | signIn.signingInAccessibility | accessibilityLabel on ActivityIndicator shown during sign-in transition — read aloud by screen readers to users. No useTranslation in this … |
| 1149 | M | prop:placeholder | Enter backup code | signIn.verify.placeholderBackupCode | Placeholder text visible in the code input field when backup_code strategy is active. No useTranslation in this file. |
| 1150 | M | prop:placeholder | Enter 6-digit code | signIn.verify.placeholder6Digit | Placeholder text visible in the code input field for TOTP/email strategies. No useTranslation in this file. |
| 1393 | M | jsx | or | signIn.orDivider | Divider label between SSO buttons and email field, rendered to users. No useTranslation in this file. |
| 1406 | M | prop:placeholder | you@example.com | signIn.emailPlaceholder | Placeholder text visible in email input field. No useTranslation in this file. |
| 1430 | M | prop:placeholder | Enter your password | signIn.passwordPlaceholder | Placeholder text visible in the password input. No useTranslation in this file. |
| 1464 | M | jsx | Enter your email to continue | signIn.validationHintEmail | Validation hint text shown below submit button when email is empty, rendered to users. No useTranslation in this file. |
| 1466 | M | jsx | Enter your password to continue | signIn.validationHintPassword | Validation hint text shown below submit button when password is empty, rendered to users. No useTranslation in this file. |
| 1532 | M | prop:accessibilityLabel | Try MentoMate | signIn.tryMentomateAccessibility | accessibilityLabel on the preview CTA button, read by screen readers. No useTranslation in this file. |

## `app/(app)/topic/relearn.tsx`  ·  46 violations

| Line | Sev | Kind | Literal | Suggested key | Why |
|---:|:--:|---|---|---|---|
| 37 | H | prop:label | Visual Diagrams | relearn.methods.visualDiagrams.label | Teaching method label in TEACHING_METHODS array rendered visibly as button text in the method selection UI. |
| 38 | H | prop:description | Learn through charts, diagrams, and visual representations | relearn.methods.visualDiagrams.description | Teaching method description in TEACHING_METHODS array rendered visibly as subtitle text in the method selection UI. |
| 42 | H | prop:label | Step-by-Step | relearn.methods.stepByStep.label | Teaching method label in TEACHING_METHODS array rendered visibly as button text. |
| 43 | H | prop:description | Break concepts down into clear, sequential steps | relearn.methods.stepByStep.description | Teaching method description in TEACHING_METHODS array rendered visibly as subtitle text. |
| 47 | H | prop:label | Real-World Examples | relearn.methods.realWorldExamples.label | Teaching method label in TEACHING_METHODS array rendered visibly as button text. |
| 48 | H | prop:description | Connect concepts to practical, everyday situations | relearn.methods.realWorldExamples.description | Teaching method description in TEACHING_METHODS array rendered visibly as subtitle text. |
| 52 | H | prop:label | Practice Problems | relearn.methods.practiceProblems.label | Teaching method label in TEACHING_METHODS array rendered visibly as button text. |
| 53 | H | prop:description | Learn by working through guided exercises | relearn.methods.practiceProblems.description | Teaching method description in TEACHING_METHODS array rendered visibly as subtitle text. |
| 60 | H | prop:label | Show Me Pictures | relearn.methodsLearner.visualDiagrams.label | Teaching method label in TEACHING_METHODS_LEARNER array rendered visibly as button text for minor users. |
| 61 | H | prop:description | Learn with pictures, charts, and drawings | relearn.methodsLearner.visualDiagrams.description | Teaching method description in TEACHING_METHODS_LEARNER array rendered visibly as subtitle text for minor users. |
| 65 | H | prop:label | Walk Me Through It | relearn.methodsLearner.stepByStep.label | Teaching method label in TEACHING_METHODS_LEARNER array rendered visibly as button text. |
| 66 | H | prop:description | Break it down into small, easy steps | relearn.methodsLearner.stepByStep.description | Teaching method description in TEACHING_METHODS_LEARNER array rendered visibly as subtitle text. |
| 70 | H | prop:label | Show Me How It Works | relearn.methodsLearner.realWorldExamples.label | Teaching method label in TEACHING_METHODS_LEARNER array rendered visibly as button text. |
| 71 | H | prop:description | Learn with fun, everyday examples | relearn.methodsLearner.realWorldExamples.description | Teaching method description in TEACHING_METHODS_LEARNER array rendered visibly as subtitle text. |
| 75 | H | prop:label | Let Me Try It | relearn.methodsLearner.practiceProblems.label | Teaching method label in TEACHING_METHODS_LEARNER array rendered visibly as button text. |
| 76 | H | prop:description | Learn by solving problems with help | relearn.methodsLearner.practiceProblems.description | Teaching method description in TEACHING_METHODS_LEARNER array rendered visibly as subtitle text. |
| 82 | H | prop:topicIntro | Pick a topic that feels the shakiest right now. | relearn.copy.default.topicIntro | COPY_DEFAULT.topicIntro rendered visibly in <Text> on the relearn topics phase. |
| 83 | H | prop:methodIntro | Choose a teaching style that feels like your best next step. | relearn.copy.default.methodIntro | COPY_DEFAULT.methodIntro rendered visibly in <Text> on the relearn method phase. |
| 84 | H | prop:subjectIntro | Which subject would you like to review first? | relearn.copy.default.subjectIntro | COPY_DEFAULT.subjectIntro rendered visibly in <Text> on the relearn subjects phase. |
| 85 | H | prop:emptyTitle | Nothing to relearn right now | relearn.copy.default.emptyTitle | COPY_DEFAULT.emptyTitle rendered visibly in <Text> as empty-state heading. |
| 86 | H | prop:emptyBody | You're all caught up on overdue topics. Nice work. | relearn.copy.default.emptyBody | COPY_DEFAULT.emptyBody rendered visibly in <Text> as empty-state body. |
| 87 | H | prop:errorTitle | We couldn't load your review topics right now. | relearn.copy.default.errorTitle | COPY_DEFAULT.errorTitle rendered visibly in <Text> as the error state heading. |
| 88 | H | prop:usualMethod | Usual method | relearn.copy.usualMethod | COPY_DEFAULT.usualMethod rendered visibly in <Text> as the preferred method badge. |
| 92 | H | prop:topicIntro | Pick the topic you want to try again. | relearn.copy.learner.topicIntro | COPY_LEARNER.topicIntro rendered visibly in <Text> on the relearn topics phase for minor users. |
| 93 | H | prop:methodIntro | How would you like to learn this time? | relearn.copy.learner.methodIntro | COPY_LEARNER.methodIntro rendered visibly in <Text> on the relearn method phase for minor users. |
| 94 | H | prop:subjectIntro | Which subject should we start with? | relearn.copy.learner.subjectIntro | COPY_LEARNER.subjectIntro rendered visibly in <Text> on the relearn subjects phase for minor users. |
| 95 | H | prop:emptyTitle | No review topics right now | relearn.copy.learner.emptyTitle | COPY_LEARNER.emptyTitle rendered visibly in <Text> as empty-state heading for minor users. |
| 96 | H | prop:emptyBody | You're all caught up for now. Great job! | relearn.copy.learner.emptyBody | COPY_LEARNER.emptyBody rendered visibly in <Text> as empty-state body for minor users. |
| 199 | H | jsx | Added from ${childName}'s learning. / Added from a child's learning. | relearn.parentBridgeHeader | parentBridgeHeaderText rendered visibly in <Text> in the parent bridge header on the method phase. |
| 410 | H | jsx | Relearn Topic | relearn.screenTitle | Screen title rendered visibly in <Text> in the relearn screen header. |
| 430 | H | jsx | Retry | common.retry | Button label rendered visibly in <Text> in the error banner retry button. |
| 448 | H | jsx | Loading review topics... | relearn.loadingTopics | Loading state text rendered visibly in <Text> while overdue topics load. |
| 473 | H | jsx | Retry | common.retry | Button label rendered visibly in <Text> on the overdue topics error screen. |
| 507 | H | jsx | Go back | common.goBack | Button label rendered visibly in <Text> on the empty state screen. |
| 524 | H | jsx | Starting relearn session... | relearn.startingSession | Loading state text rendered visibly in <Text> while a relearn session is being started. |
| 540 | H | jsx | Cancel | common.cancel | Button label rendered visibly in <Text> to cancel the relearn session start. |
| 575 | H | jsx | ${overdueCount} overdue topic(s) | relearn.overdueTopicsCount | Overdue count subtitle rendered visibly in <Text> in subject selection rows; the word 'overdue topic/topics' is hardcoded English with inli… |
| 610 | H | jsx | ${days} day(s) overdue | relearn.overdueDaysCount | Overdue days subtitle rendered visibly in <Text> in topic selection rows; the word 'day/days overdue' is hardcoded English with inline plur… |
| 407 | M | prop:accessibilityLabel | Go back | common.goBackAccessibilityLabel | Accessibility label on back button in the relearn header; read aloud by screen readers. |
| 428 | M | prop:accessibilityLabel | Retry | common.retryAccessibilityLabel | Accessibility label on retry button in the error banner; read aloud by screen readers. |
| 470 | M | prop:accessibilityLabel | Retry | common.retryAccessibilityLabel | Accessibility label on retry button in the overdue error state; read aloud by screen readers. |
| 504 | M | prop:accessibilityLabel | Go back | common.goBackAccessibilityLabel | Accessibility label on back button in the empty state; read aloud by screen readers. |
| 538 | M | prop:accessibilityLabel | Cancel | common.cancelAccessibilityLabel | Accessibility label on cancel button during session start loading; read aloud by screen readers. |
| 569 | M | prop:accessibilityLabel | Open ${subject.subjectName} | relearn.openSubjectAccessibilityLabel | Accessibility label on subject selection button; read aloud by screen readers. |
| 604 | M | prop:accessibilityLabel | Open ${topic.topicTitle} | relearn.openTopicAccessibilityLabel | Accessibility label on topic selection button; read aloud by screen readers. |
| 651 | M | prop:accessibilityLabel | Learn with ${method.label} | relearn.methodAccessibilityLabel | Accessibility label on teaching method button; read aloud by screen readers. |

## `app/(app)/pick-book/[subjectId].tsx`  ·  44 violations

| Line | Sev | Kind | Literal | Suggested key | Why |
|---:|:--:|---|---|---|---|
| 33 | H | jsx | Finding fresh books for you... | pickBook.loading.findingBooks | Entry in LOADING_MESSAGES array rendered as body Text during loading state at line 337. File imports useTranslation but this string bypasse… |
| 34 | H | jsx | Picking books to suggest... | pickBook.loading.pickingBooks | Entry in LOADING_MESSAGES rendered as body Text during loading state at line 337. Bypasses t(). |
| 35 | H | jsx | Almost there... | pickBook.loading.almostThere | Entry in LOADING_MESSAGES rendered as body Text during loading state at line 337. Bypasses t(). |
| 49 | H | jsx | We just tried to load fresh suggestions and they're not ready yet. Try again in… | pickBook.emptyState.cooldown | emptyStateMessage() returns this for 'cooldown' case; the return value is rendered as body Text in the empty state at line 553. Bypasses t(… |
| 53 | H | jsx | We couldn't load suggestions right now. Try again, or type a book or topic to a… | pickBook.emptyState.quota | emptyStateMessage() returns this for quota/network/timeout/unknown cases; rendered as body Text. Bypasses t(). |
| 57 | H | jsx | Suggestions didn't come through cleanly. Try again, or type a book or topic to … | pickBook.emptyState.parse | emptyStateMessage() returns this for 'parse' case; rendered as body Text. Bypasses t(). |
| 59 | H | jsx | Another request is already loading suggestions. Try again in a moment. | pickBook.emptyState.lockLoser | emptyStateMessage() returns this for 'lock_loser' case; rendered as body Text. Bypasses t(). |
| 61 | H | jsx | This subject uses a different learning flow. Type the book or topic you want to… | pickBook.emptyState.languageSubject | emptyStateMessage() returns this for 'language_subject' case; rendered as body Text. Bypasses t(). |
| 63 | H | jsx | We've used up the obvious suggestions for this subject. Type the next book or t… | pickBook.emptyState.allFiltered | emptyStateMessage() returns this for 'all_filtered' case; rendered as body Text. Bypasses t(). |
| 68 | H | jsx | No suggestions yet. Type a book or topic you want to add. | pickBook.emptyState.default | emptyStateMessage() default return rendered as body Text. Bypasses t(). |
| 238 | H | prop:title | Something went wrong | common.somethingWentWrong | platformAlert title shown as a native Alert dialog title visible to the user. Bypasses t(). |
| 238 | H | prop:message | Couldn't set up that book. Try again? | pickBook.alert.couldntSetUpBook | platformAlert message shown as native Alert body text visible to the user. Bypasses t(). |
| 241 | H | prop:buttonText | Try again | common.tryAgain | platformAlert button text shown in native Alert dialog. Bypasses t(). |
| 244 | H | prop:buttonText | Go back | common.goBack | platformAlert button text shown in native Alert dialog. Bypasses t(). |
| 292 | H | prop:title | Something went wrong | common.somethingWentWrong | platformAlert title shown as native Alert dialog title for custom submit errors. Bypasses t(). |
| 293 | H | prop:buttonText | Try again | common.tryAgain | platformAlert button text in native Alert dialog. Bypasses t(). |
| 294 | H | prop:buttonText | Go back | common.goBack | platformAlert button text in native Alert dialog. Bypasses t(). |
| 308 | H | jsx | Missing subject. Please go back and try again. | pickBook.error.missingSubject | Guard error body Text rendered in the missing-param view at line 307-309. Bypasses t(). |
| 315 | H | jsx | Go back | common.goBack | Button label Text in the missing-param guard view at line 315. Bypasses t(). |
| 353 | H | jsx | Go back | common.goBack | Visible button label Text in loading state at line 353. Bypasses t(). |
| 380 | H | prop:label | Try Again | common.tryAgain | label prop on ErrorFallback primaryAction rendered as a button label in the full error screen. Bypasses t(). |
| 385 | H | prop:label | Go Back | common.goBack | label prop on ErrorFallback primaryAction (non-retriable path) rendered as a button label. Bypasses t(). |
| 391 | H | prop:label | Go Back | common.goBack | label prop on ErrorFallback secondaryAction rendered as a button label. Bypasses t(). |
| 438 | H | jsx | Pick what interests you | pickBook.subtitle | Screen subtitle Text rendered below the header at line 437-439. Bypasses t(). |
| 446 | H | jsx | Suggestions did not load | pickBook.inlineError.title | Inline error heading Text in the inline suggestions-error banner at line 446-448. Bypasses t(). |
| 449 | H | jsx | You can still type the book or topic you want to add. | pickBook.inlineError.body | Inline error body Text in the inline suggestions-error banner at line 449-451. Bypasses t(). |
| 459 | H | jsx | Try again | common.tryAgain | Visible button label Text in inline error banner at line 459-461. Bypasses t(). |
| 489 | H | jsx | Based on what you've studied | pickBook.suggestions.relatedHeading | Section heading h3 Text rendered above 'related' suggestions at line 488-490. Bypasses t(). (Note: the &apos; in source is HTML entity insi… |
| 509 | H | jsx | Try something new | pickBook.suggestions.exploreHeading | Section heading h3 Text rendered above 'explore' suggestions at line 508-510. Bypasses t(). |
| 565 | H | jsx | Try again | common.tryAgain | Visible button label Text in empty-state retry at line 565-567. Bypasses t(). |
| 605 | H | jsx | Setting up... | pickBook.customInput.submitting | Submit button Text shown while filing is pending at line 604-606. Bypasses t(). |
| 605 | H | jsx | Go | pickBook.customInput.submit | Submit button Text shown when idle at line 604-606. Bypasses t(). |
| 631 | H | jsx | Something else... | pickBook.somethingElse | Visible secondary Text label on the 'Something else...' Pressable at line 630-632. Bypasses t(). |
| 642 | H | prop:message | Organizing your library... | pickBook.filing.message | message prop on LoadingMomentOverlay rendered as visible Text during the filing loading overlay. Bypasses t(). |
| 672 | H | jsx | Skip — start learning anyway | pickBook.filing.skip | Visible button label Text on the skip Pressable inside the filing overlay at line 671-673. Bypasses t(). |
| 343 | M | jsx | This is taking a bit longer than usual... | pickBook.loading.takingLonger | Slow-loading hint Text shown after 5 seconds of loading at line 343-345. Bypasses t(). |
| 352 | M | prop:accessibilityLabel | Go back | common.goBack | accessibilityLabel on back Pressable in loading state — read by screen readers. Bypasses t(). |
| 424 | M | prop:accessibilityLabel | Back | common.back | accessibilityLabel on header back Pressable — read by screen readers. Bypasses t(). |
| 433 | M | jsx | Subject | pickBook.header.subjectFallback | Fallback Text when subject?.name is undefined: `subject?.name ?? 'Subject'` rendered as the h1 header at line 429-434. Bypasses t(). |
| 455 | M | prop:accessibilityLabel | Try again | common.tryAgain | accessibilityLabel on inline retry button — read by screen readers. Bypasses t(). |
| 563 | M | prop:accessibilityLabel | Try again | common.tryAgain | accessibilityLabel on empty-state retry button — read by screen readers. Bypasses t(). |
| 578 | M | prop:placeholder | Book or topic to add | pickBook.customInput.placeholder | TextInput placeholder visible when the custom input is empty at line 578. Bypasses t(). |
| 629 | M | prop:accessibilityLabel | Something else | pickBook.somethingElse | accessibilityLabel on 'Something else...' Pressable — read by screen readers. Bypasses t(). |
| 669 | M | prop:accessibilityLabel | Skip and start learning anyway | pickBook.filing.skip | accessibilityLabel on skip Pressable during filing overlay — read by screen readers. Bypasses t(). |

## `app/(auth)/sign-up.tsx`  ·  29 violations

| Line | Sev | Kind | Literal | Suggested key | Why |
|---:|:--:|---|---|---|---|
| 359 | H | jsx | Verify your email | signUp.verify.heading | H2 heading rendered to users during email verification step. No useTranslation in this file. |
| 362 | H | jsx | We sent a verification code to | signUp.verify.subtitle | Body text rendered to users explaining where verification code was sent. No useTranslation in this file. |
| 383 | H | jsx | Verification code | signUp.verify.codeLabel | Field label above verification code input, rendered to users. No useTranslation in this file. |
| 400 | H | prop:label | Verify | signUp.verify.verifyButton | Primary submit button label on verification screen, rendered to users. No useTranslation in this file. |
| 413 | H | prop:label | Try Again | signUp.verify.retryButton | Button shown to users after activation failure during verification. No useTranslation in this file. |
| 424 | H | prop:label | Resend code | signUp.verify.resendButton | Button label to resend verification code, rendered to users. No useTranslation in this file. |
| 436 | H | prop:label | Use a different email | signUp.verify.differentEmailButton | Button label rendered to users to go back and change email. No useTranslation in this file. |
| 447 | H | prop:label | Back to sign in | signUp.verify.backToSignInButton | Button label rendered to users navigating back to sign-in from verification. No useTranslation in this file. |
| 491 | H | jsx | Create account | signUp.createAccountHeading | H2 heading on sign-up form, rendered to users. No useTranslation in this file. |
| 494 | H | jsx | Start your learning journey | signUp.subtitle | Subtitle below heading on sign-up form, rendered to users. No useTranslation in this file. |
| 502 | H | jsx | We couldn't find an account with that email. Create one below to get started. | signUp.fromSignInBanner | Alert banner body text rendered to users when redirected from sign-in with no matching account. No useTranslation in this file. |
| 524 | H | prop:label | Try Again | signUp.oauthRetryButton | Button label shown after OAuth activation failure on sign-up, rendered to users. No useTranslation in this file. |
| 533 | H | prop:label | Try another method | signUp.oauthTryOtherButton | Button label shown after OAuth activation failure allowing fallback, rendered to users. No useTranslation in this file. |
| 548 | H | prop:label | Continue with Google | signUp.continueWithGoogle | SSO button label rendered to non-iOS users on sign-up. No useTranslation in this file. |
| 561 | H | prop:label | Continue with Apple | signUp.continueWithApple | SSO button label rendered to iOS users on sign-up. No useTranslation in this file. |
| 574 | H | prop:label | Continue with OpenAI | signUp.continueWithOpenAI | SSO button label rendered to users when OpenAI strategy is available on sign-up. No useTranslation in this file. |
| 593 | H | jsx | Email | signUp.emailLabel | Field label above email input on sign-up form, rendered to users. No useTranslation in this file. |
| 612 | H | jsx | Password | signUp.passwordLabel | Field label above password input on sign-up form, rendered to users. No useTranslation in this file. |
| 637 | H | prop:label | Sign up | signUp.signUpButton | Primary submit button label on sign-up form, rendered to users. No useTranslation in this file. |
| 648 | H | jsx | Already have an account? | signUp.alreadyHaveAccountPrompt | Prompt text rendered to existing users below sign-up form. No useTranslation in this file. |
| 651 | H | prop:label | Sign in | signUp.signInLink | Button label linking back to sign-in from sign-up form, rendered to users. No useTranslation in this file. |
| 663 | H | jsx | By signing up, you agree to our | signUp.termsPrefix | Legal disclaimer text rendered to users at bottom of sign-up form. No useTranslation in this file. |
| 669 | H | jsx | Terms of Service | signUp.termsOfService | Link text rendered to users in the legal disclaimer. No useTranslation in this file. |
| 677 | H | jsx | Privacy Policy | signUp.privacyPolicy | Link text rendered to users in the legal disclaimer. No useTranslation in this file. |
| 388 | M | prop:placeholder | Enter 6-digit code | signUp.verify.codePlaceholder | Placeholder in code input field rendered to users. No useTranslation in this file. |
| 585 | M | jsx | or continue with email | signUp.orContinueWithEmail | Divider label between SSO buttons and email section on sign-up, rendered to users. No useTranslation in this file. |
| 600 | M | prop:placeholder | you@example.com | signUp.emailPlaceholder | Placeholder in email input on sign-up, rendered to users. No useTranslation in this file. |
| 618 | M | prop:placeholder | Create a password | signUp.passwordPlaceholder | Placeholder in password input on sign-up, rendered to users. No useTranslation in this file. |
| 671 | L | jsx | and | signUp.termsAnd | Connector word in the legal disclaimer rendered to users. Short but still user-visible text that would need localizing. |

## `app/(app)/my-notes/[kind].tsx`  ·  27 violations

| Line | Sev | Kind | Literal | Suggested key | Why |
|---:|:--:|---|---|---|---|
| 62 | H | jsx | Notes | myNotes.kind.notes | titleForKind() returns this string which is rendered as a heading Text at line 459 (titleForKind(kind)). No useTranslation in file. |
| 64 | H | jsx | Bookmarks | myNotes.kind.bookmarks | titleForKind() returns this string which is rendered as a heading Text at line 459. No useTranslation in file. |
| 66 | H | jsx | Sessions | myNotes.kind.sessions | titleForKind() returns this string which is rendered as a heading Text at line 459. No useTranslation in file. |
| 74 | H | jsx | saved reply | myNotes.subtitle.savedReply | subtitleForKind() returns this as part of a count+label string rendered at line 462 as subtitle Text. No useTranslation in file. |
| 77 | H | jsx | saved replies | myNotes.subtitle.savedReplies | subtitleForKind() returns this as part of a count+label string rendered at line 462 as subtitle Text. No useTranslation in file. |
| 98 | H | jsx | Today | myNotes.dateGroup.today | formatDate() returns 'Today' which is used as a group header Text label rendered in the FlatList at line 490. No useTranslation in file. |
| 99 | H | jsx | Yesterday | myNotes.dateGroup.yesterday | formatDate() returns 'Yesterday' which is used as a group header Text label rendered in the FlatList at line 490. No useTranslation in file. |
| 119 | H | jsx | Homework | myNotes.sessionType.homework | normalizeSessionType() returns 'Homework' stored as typeLabel and rendered in ArchiveCard meta Text at line 291. No useTranslation in file. |
| 121 | H | jsx | Review | myNotes.sessionType.review | normalizeSessionType() returns 'Review' stored as typeLabel and rendered in ArchiveCard meta Text. No useTranslation in file. |
| 123 | H | jsx | Learning | myNotes.sessionType.learning | normalizeSessionType() default returns 'Learning' stored as typeLabel and rendered in ArchiveCard meta Text. No useTranslation in file. |
| 157 | H | jsx | Note | myNotes.itemType.note | typeLabel value 'Note' from noteToItem() is rendered in ArchiveCard meta Text at line 291. No useTranslation in file. |
| 173 | H | jsx | Bookmark | myNotes.itemType.bookmark | typeLabel value 'Bookmark' from bookmarkToItem() is rendered in ArchiveCard meta Text at line 291. No useTranslation in file. |
| 237 | H | jsx | Date | myNotes.groupToggle.date | Rendered as a visible Text label inside GroupToggle at line 237. No useTranslation in file. |
| 237 | H | jsx | Subject | myNotes.groupToggle.subject | Rendered as a visible Text label inside GroupToggle at line 237. No useTranslation in file. |
| 505 | H | jsx | Couldn't load  | myNotes.error.couldntLoad | Part of error-state Text: `Couldn't load {titleForKind(kind).toLowerCase()}` rendered as body Text in the error view at line 504-506. No us… |
| 514 | H | jsx | Try again | common.tryAgain | Visible button label Text in error state at line 514-515. No useTranslation in file. |
| 522 | H | jsx | No  yet | myNotes.empty.heading | Empty-state heading Text: `No {titleForKind(kind).toLowerCase()} yet` at line 521-523. No useTranslation in file. |
| 524 | H | jsx | They'll show up here as you learn. | myNotes.empty.body | Empty-state body Text rendered at line 524-526. No useTranslation in file. |
| 543 | H | jsx | Load more | common.loadMore | Visible button label Text in FlatList footer at line 543-545. No useTranslation in file. |
| 112 | M | jsx | <1 min | myNotes.duration.lessThanOneMin | formatMinutes() returns '<1 min' which is rendered in a duration badge Text inside ArchiveCard at line 304. No useTranslation in file. |
| 113 | M | jsx |  min | myNotes.duration.minutes | The string ' min' is a suffix in a template literal `${n} min` returned by formatMinutes() and rendered in a duration badge. No useTranslat… |
| 137 | M | prop:subjectName | Unknown subject | myNotes.card.unknownSubject | Fallback value for subjectName field which is rendered as primary bold Text in ArchiveCard at line 285. No useTranslation in file. |
| 229 | M | prop:accessibilityLabel | Group by date | myNotes.groupToggle.accessibilityLabel | accessibilityLabel is `Group by ${value}` — a template that produces 'Group by date' or 'Group by subject'. This is screen-reader copy that… |
| 449 | M | prop:accessibilityLabel | Back | common.back | accessibilityLabel on a back Pressable — read aloud by screen readers. No useTranslation in file. |
| 478 | M | prop:placeholder | Search sessions | myNotes.search.placeholder | Placeholder text in a TextInput: `Search ${titleForKind(kind).toLowerCase()}`. Visible to all users as placeholder copy. No useTranslation … |
| 511 | M | prop:accessibilityLabel | Try again | common.tryAgain | accessibilityLabel on retry button in error state — read by screen readers. No useTranslation in file. |
| 540 | M | prop:accessibilityLabel | Load more | common.loadMore | accessibilityLabel on load-more footer button — read by screen readers. No useTranslation in file. |

## `app/session-transcript/[sessionId].tsx`  ·  21 violations

| Line | Sev | Kind | Literal | Suggested key | Why |
|---:|:--:|---|---|---|---|
| 91 | H | jsx | Missing session | sessionTranscript.error.missingSession.title | Error state heading when no sessionId param is present; hardcoded English in JSX Text, not wrapped in t(). |
| 93 | H | jsx | We couldn't tell which conversation to load. | sessionTranscript.error.missingSession.message | Error state body text when sessionId is missing; hardcoded English in JSX Text, not wrapped in t(). |
| 102 | H | jsx | Back to library | sessionTranscript.backToLibrary | CTA button label in the missing-session error state; hardcoded English in JSX Text, not wrapped in t(). |
| 121 | H | prop:loadingLabel | Loading transcript... | sessionTranscript.loading.label | loadingLabel prop passed to TimeoutLoader and rendered as visible copy during transcript loading; hardcoded English not wrapped in t(). |
| 122 | H | prop:title | Still loading | sessionTranscript.error.timeout.title | title prop passed to TimeoutLoader (shown after timeout); rendered as visible heading, hardcoded English not wrapped in t(). |
| 123 | H | prop:message | The transcript is taking longer than usual. Try again or head back to your libr… | sessionTranscript.error.timeout.message | message prop passed to TimeoutLoader rendered as visible body text after timeout; hardcoded English not wrapped in t(). |
| 125 | H | prop:label | Retry | sessionTranscript.error.retry | Primary action button label in the timeout fallback; hardcoded English not wrapped in t(). |
| 130 | H | prop:label | Back to library | sessionTranscript.backToLibrary | Secondary action button label in the timeout fallback; hardcoded English not wrapped in t(). |
| 142 | H | prop:title | Couldn't load conversation | sessionTranscript.error.loadFailed.title | ErrorFallback title prop rendered as heading when the transcript fetch fails; hardcoded English not wrapped in t(). |
| 147 | H | prop:label | Retry | sessionTranscript.error.retry | Primary action button label in the transcript error fallback; hardcoded English not wrapped in t(). |
| 151 | H | prop:label | Back to library | sessionTranscript.backToLibrary | Secondary action button label in the transcript error fallback; hardcoded English not wrapped in t(). |
| 199 | H | jsx | No messages yet | sessionTranscript.emptyState.title | Empty-state heading when the transcript has no exchanges; hardcoded English in JSX Text, not wrapped in t(). |
| 202 | H | jsx | This session doesn't have any saved exchanges to show. | sessionTranscript.emptyState.message | Empty-state body text when transcript is empty; hardcoded English in JSX Text, not wrapped in t(). |
| 211 | H | jsx | Back to library | sessionTranscript.backToLibrary | CTA button label in the empty transcript state; hardcoded English in JSX Text, not wrapped in t(). |
| 238 | H | jsx | Conversation | sessionTranscript.header.title | Header title 'Conversation' visible on the transcript screen; hardcoded English in JSX Text, not wrapped in t(). |
| 241 | H | jsx | message | sessionTranscript.header.messageCount_one | Singular form of the message count label in the transcript header; hardcoded English in a JSX ternary, not wrapped in t(). |
| 241 | H | jsx | messages | sessionTranscript.header.messageCount_other | Plural form of the message count label in the transcript header; hardcoded English in a JSX ternary, not wrapped in t(). |
| 272 | H | jsx | You | sessionTranscript.exchange.youLabel | Speaker label for the learner in each transcript exchange; hardcoded English in a JSX ternary, not wrapped in t(). |
| 99 | M | prop:accessibilityLabel | Back to library | sessionTranscript.backToLibrary | accessibilityLabel on the back-to-library CTA in the missing-session error state; hardcoded English not wrapped in t(). |
| 208 | M | prop:accessibilityLabel | Back to library | sessionTranscript.backToLibrary | accessibilityLabel on the back-to-library CTA in the empty-state; hardcoded English not wrapped in t(). |
| 230 | M | prop:accessibilityLabel | Back | sessionTranscript.header.backButton | accessibilityLabel on the back button in the transcript header; hardcoded English not wrapped in t(). |

## `app/create-profile.tsx`  ·  20 violations

| Line | Sev | Kind | Literal | Suggested key | Why |
|---:|:--:|---|---|---|---|
| 543 | H | jsx | Tell us about your child | createProfile.headingChild | H1 heading rendered to users when adding a child profile. useTranslation is imported but t() is never called for this literal. |
| 543 | H | jsx | Who's the learner? | createProfile.headingLearner | H1 heading rendered to users when creating a new learner profile. useTranslation is imported but t() is never called for this literal. |
| 570 | H | jsx | Child's display name | createProfile.displayNameLabelChild | Field label rendered to users when adding a child profile. t() is not called for this literal. |
| 570 | H | jsx | Display name | createProfile.displayNameLabel | Field label rendered to users when creating a learner profile. t() is not called for this literal. |
| 591 | H | jsx | Child's birth date | createProfile.birthDateLabelChild | Field label rendered to users when adding a child profile. t() is not called for this literal. |
| 591 | H | jsx | Birth date | createProfile.birthDateLabel | Field label rendered to users when creating a self learner profile. t() is not called for this literal. |
| 594 | H | jsx | So your child's mentor talks to them the right way. Minimum age is 11. | createProfile.birthDateHelperChild | Helper text below birth date field rendered to users when adding a child. t() is not called for this literal. |
| 596 | H | jsx | So your mentor talks to you the right way. Minimum age is 11. | createProfile.birthDateHelper | Helper text below birth date field rendered to users for self profile. t() is not called for this literal. |
| 692 | H | prop:label | Add child | createProfile.addChildButton | Primary submit button label rendered to users when adding a child profile. t() is not called for this literal. |
| 575 | M | prop:placeholder | Enter your child's name | createProfile.namePlaceholderChild | Placeholder text in name input when adding a child, rendered to users. t() is not called for this literal. |
| 575 | M | prop:placeholder | Enter name | createProfile.namePlaceholder | Placeholder text in name input for self profile, rendered to users. t() is not called for this literal. |
| 609 | M | prop:accessibilityLabel | Child's birth date | createProfile.birthDateAccessibilityChild | accessibilityLabel on the web birth date input for child profile, read by screen readers. t() is not called for this literal. |
| 609 | M | prop:accessibilityLabel | Birth date | createProfile.birthDateAccessibility | accessibilityLabel on the web birth date input for self profile, read by screen readers. t() is not called for this literal. |
| 615 | M | jsx | Enter your child's birth date as YYYY-MM-DD. | createProfile.birthDateFormatHintChild | Caption hint text rendered to web users below the birth date input when adding a child. t() is not called for this literal. |
| 617 | M | jsx | Enter your birth date as YYYY-MM-DD. | createProfile.birthDateFormatHint | Caption hint text rendered to web users below the birth date input for self profile. t() is not called for this literal. |
| 625 | M | prop:accessibilityLabel | Select child's birth date | createProfile.birthDatePickerAccessibilityChild | accessibilityLabel on the native date picker Pressable for child profile, read by screen readers. t() is not called for this literal. |
| 625 | M | prop:accessibilityLabel | Select birth date | createProfile.birthDatePickerAccessibility | accessibilityLabel on the native date picker Pressable for self profile, read by screen readers. t() is not called for this literal. |
| 636 | M | jsx | Select your child's date of birth | createProfile.birthDatePickerPlaceholderChild | Placeholder text in the date picker Pressable rendered to users before a date is selected (child profile). t() is not called for this liter… |
| 638 | M | jsx | Select date of birth | createProfile.birthDatePickerPlaceholder | Placeholder text in the date picker Pressable rendered to users before a date is selected (self profile). t() is not called for this litera… |
| 651 | M | prop:accessibilityLabel | Close date picker | createProfile.closeDatePickerAccessibility | accessibilityLabel on the iOS date picker dismiss button, read by screen readers. t() is not called for this literal. |

## `components/session-summary/SessionSummaryLibraryFilingControls.tsx`  ·  20 violations

| Line | Sev | Kind | Literal | Suggested key | Why |
|---:|:--:|---|---|---|---|
| 61 | H | jsx | Couldn't update Library right now. Try again in a moment. | sessionSummary.library.mutationError | Set into state via setMessage() and rendered in a <Text> component at line 265. Visible error message users see after a mutation failure. N… |
| 148 | H | jsx | Still adding this to your Library... | sessionSummary.library.timedOutTitle | Rendered in a <Text> component in the timedOutStillPending branch. Visible heading users see when filing is taking longer than expected. No… |
| 151 | H | jsx | This can take a little longer. Your chat is saved either way. | sessionSummary.library.timedOutBody | Rendered in a <Text> component in the timedOutStillPending branch. Visible body text. Not wrapped in t(). |
| 163 | H | jsx | Refresh | sessionSummary.library.refreshButton | Rendered in a <Text> component as a visible button label in the timed-out state. Not wrapped in t(). |
| 168 | H | prop:label | Don't add to Library | sessionSummary.library.dontAddButton | Passed as `label` to renderPrimaryAction() which renders it in a <Text> component and also uses it as accessibilityLabel. Visible button la… |
| 177 | H | jsx | Adding this to your Library... | sessionSummary.library.pendingTitle | Rendered in a <Text> component in the showPending branch. Visible heading users see while filing is in progress. Not wrapped in t(). |
| 179 | H | jsx | Your chat is saved. We are finding the right Library spot for it. | sessionSummary.library.pendingBody | Rendered in a <Text> component in the showPending branch. Visible body text. Not wrapped in t(). |
| 183 | H | prop:label | Don't add to Library | sessionSummary.library.dontAddButton | Passed as `label` to renderPrimaryAction() which renders it in a <Text> component. Visible button label in pending state. Not wrapped in t(… |
| 193 | H | jsx | Added to Library | sessionSummary.library.filedTitle | Rendered in a <Text> component in the isFiledInLibrary branch. Visible heading. Not wrapped in t(). |
| 200 | H | jsx | This chat is linked to your Library. | sessionSummary.library.filedNoTopicBody | Rendered in a <Text> component when topicTitle is absent in the filed state. Visible body text. Not wrapped in t(). |
| 219 | H | jsx | Open in Library | sessionSummary.library.openButton | Rendered in a <Text> component as a visible button label. Not wrapped in t(). |
| 224 | H | prop:label | Remove from Library | sessionSummary.library.removeButton | Passed as `label` to renderPrimaryAction() which renders it in a <Text> component and as accessibilityLabel. Visible button label. Not wrap… |
| 233 | H | jsx | We couldn't add this to your Library | sessionSummary.library.failureTitle | Rendered in a <Text> component in the isTerminalFailure branch. Visible error heading. Not wrapped in t(). |
| 235 | H | jsx | Your chat is saved. Try again when you're ready. | sessionSummary.library.failureBody | Rendered in a <Text> component in the isTerminalFailure branch. Visible body text. Not wrapped in t(). |
| 240 | H | prop:label | Retry | sessionSummary.library.retryButton | Passed as `label` to renderPrimaryAction() which renders it in a <Text> component and as accessibilityLabel. Visible retry button. Not wrap… |
| 249 | H | jsx | Not in Library | sessionSummary.library.notInLibraryTitle | Rendered in a <Text> component in the isKeptOut/showUnfiled branch. Visible heading. Not wrapped in t(). |
| 252 | H | jsx | This chat is saved, but it is not a Library topic. | sessionSummary.library.notInLibraryBody | Rendered in a <Text> component in the isKeptOut/showUnfiled branch. Visible body text. Not wrapped in t(). |
| 256 | H | prop:label | Add to Library | sessionSummary.library.addButton | Passed as `label` to renderPrimaryAction() which renders it in a <Text> component and as accessibilityLabel. Visible add button. Not wrappe… |
| 159 | M | prop:accessibilityLabel | Refresh Library status | sessionSummary.library.refreshAccessibilityLabel | accessibilityLabel on the Refresh Pressable. Screen reader users hear this. Not wrapped in t(). |
| 214 | M | prop:accessibilityLabel | Open in Library | sessionSummary.library.openAccessibilityLabel | accessibilityLabel on the Open in Library Pressable. Screen reader users hear this. Not wrapped in t(). |

## `app/(auth)/forgot-password.tsx`  ·  18 violations

| Line | Sev | Kind | Literal | Suggested key | Why |
|---:|:--:|---|---|---|---|
| 296 | H | jsx | Reset password | forgotPassword.resetTitle | Screen heading rendered visibly in <Text> on the reset password form. |
| 298 | H | jsx | Enter the code sent to {email} and your new password | forgotPassword.resetSubtitle | Subtitle rendered visibly in <Text> on the reset password form. |
| 329 | H | prop:label | Try Again | forgotPassword.tryAgainButton | Primary button label rendered visibly when setActive fails after successful reset. |
| 335 | H | prop:label | Sign in with your new password | forgotPassword.signInWithNewPasswordButton | Button label rendered visibly as fallback navigation after setActive failure. |
| 349 | H | jsx | Reset code | forgotPassword.resetCodeLabel | Form field label rendered visibly in <Text> above the reset code input. |
| 366 | H | jsx | New password | forgotPassword.newPasswordLabel | Form field label rendered visibly in <Text> above the new password input. |
| 383 | H | prop:label | Reset password | forgotPassword.resetButton | Primary button label rendered visibly on the reset password submit button. |
| 396 | H | prop:label | Resend code | forgotPassword.resendCodeButton | Button label rendered visibly on the resend code button. |
| 405 | H | prop:label | Use a different email | forgotPassword.useDifferentEmailButton | Button label rendered visibly on the back-from-reset button. |
| 413 | H | prop:label | Back to sign in | forgotPassword.backToSignInButton | Button label rendered visibly on the back-to-sign-in button in the reset form. |
| 457 | H | jsx | Forgot password? | forgotPassword.title | Screen heading rendered visibly in <Text> on the forgot password entry form. |
| 459 | H | jsx | We'll send a reset code to your email | forgotPassword.subtitle | Subtitle rendered visibly in <Text> on the forgot password entry form. |
| 473 | H | jsx | Email | forgotPassword.emailLabel | Form field label rendered visibly in <Text> above the email input. |
| 492 | H | prop:label | Send reset code | forgotPassword.sendCodeButton | Primary button label rendered visibly on the send reset code button. |
| 503 | H | prop:label | Back to sign in | forgotPassword.backToSignInButton | Button label rendered visibly on the back-to-sign-in button on the email entry form. |
| 353 | M | prop:placeholder | Enter 6-digit code | forgotPassword.resetCodePlaceholder | Placeholder text visible in the reset code input field. |
| 372 | M | prop:placeholder | Enter new password | forgotPassword.newPasswordPlaceholder | Placeholder text visible in the new password input field. |
| 476 | M | prop:placeholder | you@example.com | forgotPassword.emailPlaceholder | Placeholder text visible in the email input field. |

## `app/(app)/quiz/results.tsx`  ·  17 violations

| Line | Sev | Kind | Literal | Suggested key | Why |
|---:|:--:|---|---|---|---|
| 72 | H | prop:title | Perfect round! | quiz.results.tierPerfect | String literal assigned to 'title' field of tierConfig object. config.title is rendered inside a <Text> on line 181 and passed as message= … |
| 77 | H | prop:title | Great round! | quiz.results.tierGreat | String literal in tierConfig.great.title, rendered in <Text> via config.title. |
| 82 | H | prop:title | Nice effort! | quiz.results.tierNice | String literal in tierConfig.nice.title, rendered in <Text> via config.title. |
| 96 | H | prop:title | Capital of ${q.country} | quiz.results.capitalOf | Return value of questionPrompt() for capitals questions; rendered inside a <Text> (line 237) as the question prompt label visible to users. |
| 188 | H | jsx | {score} of {total} people identified | quiz.results.peopleIdentified | Rendered inside a <Text> for guess_who activity type. 'of' and 'people identified' are hardcoded English visible in the results screen. |
| 213 | H | jsx | What you missed | quiz.results.whatYouMissed | Section heading in <Text> shown above the list of missed questions in the results screen. |
| 242 | H | jsx | You said: {qr.answerGiven} | quiz.results.youSaid | Rendered in a <Text> inside the missed-question card showing the wrong answer the user gave. Hardcoded English visible in results screen. |
| 245 | H | jsx | You skipped this question | quiz.results.youSkippedText | Rendered in a <Text> for skipped questions in the missed-question section of results screen. |
| 249 | H | jsx | You didn't answer | quiz.results.youDidntAnswerText | Rendered in a <Text> for unanswered questions in the missed-question section. |
| 274 | H | jsx | Play Again | quiz.results.playAgain | Primary CTA button label rendered in <Text> on the quiz results screen. |
| 284 | H | jsx | Done | quiz.results.done | Secondary CTA button label rendered in <Text> on the quiz results screen. |
| 94 | M | prop:title | Question | quiz.results.questionFallback | Fallback return value in questionPrompt() when question data is missing. The returned string is used as a label inside accessibilityLabel c… |
| 104 | M | prop:title | Guess Who | quiz.results.guessWhoFallback | Fallback return in questionPrompt() for guess_who type. Rendered as a label in the missed-questions section when clues are absent. |
| 228 | M | prop:accessibilityLabel | You said ${qr.answerGiven} | quiz.results.youSaidLabel | Part of the accessibilityLabel on a missed-question card, read by screen readers. Hardcoded English template. |
| 231 | M | prop:accessibilityLabel | You skipped this question | quiz.results.youSkipped | Branch of the accessibilityLabel for skipped questions in the missed-question card. |
| 233 | M | prop:accessibilityLabel | You didn't answer | quiz.results.youDidntAnswer | Third branch of the missed-question accessibilityLabel for unanswered questions. |
| 234 | M | prop:accessibilityLabel | Correct answer ${qr.correctAnswer}. | quiz.results.correctAnswerLabel | Suffix of the missed-question accessibilityLabel disclosing the correct answer to screen-reader users. |

## `components/common/AnalogyDomainPicker.tsx`  ·  16 violations

| Line | Sev | Kind | Literal | Suggested key | Why |
|---:|:--:|---|---|---|---|
| 29 | H | prop:label | No preference | analogyDomainPicker.options.noPreference.label | option.label is rendered directly in a <Text> element (line 116) as {option.label}. 'No preference' is visible to all users as a selectable… |
| 30 | H | prop:description | Use whatever analogy fits best | analogyDomainPicker.options.noPreference.description | option.description is rendered directly in a <Text> element (line 124) as {option.description}. Visible to all users as the subtitle of the… |
| 33 | H | prop:label | Cooking | analogyDomainPicker.options.cooking.label | option.label rendered in <Text> as {option.label}. Visible to all users as a selectable option label. Not inside t(). |
| 34 | H | prop:description | Recipes, ingredients, kitchen techniques | analogyDomainPicker.options.cooking.description | option.description rendered in <Text> as {option.description}. Visible subtitle for the Cooking option. Not inside t(). |
| 37 | H | prop:label | Sports | analogyDomainPicker.options.sports.label | option.label rendered in <Text> as {option.label}. Visible option label. Not inside t(). |
| 38 | H | prop:description | Games, teams, training strategies | analogyDomainPicker.options.sports.description | option.description rendered in <Text> as {option.description}. Visible subtitle for the Sports option. Not inside t(). |
| 41 | H | prop:label | Building | analogyDomainPicker.options.building.label | option.label rendered in <Text> as {option.label}. Visible option label. Not inside t(). |
| 42 | H | prop:description | Construction, architecture, tools | analogyDomainPicker.options.building.description | option.description rendered in <Text> as {option.description}. Visible subtitle for the Building option. Not inside t(). |
| 45 | H | prop:label | Music | analogyDomainPicker.options.music.label | option.label rendered in <Text> as {option.label}. Visible option label. Not inside t(). |
| 46 | H | prop:description | Instruments, rhythm, composition | analogyDomainPicker.options.music.description | option.description rendered in <Text> as {option.description}. Visible subtitle for the Music option. Not inside t(). |
| 49 | H | prop:label | Nature | analogyDomainPicker.options.nature.label | option.label rendered in <Text> as {option.label}. Visible option label. Not inside t(). |
| 50 | H | prop:description | Plants, animals, ecosystems | analogyDomainPicker.options.nature.description | option.description rendered in <Text> as {option.description}. Visible subtitle for the Nature option. Not inside t(). |
| 53 | H | prop:label | Gaming | analogyDomainPicker.options.gaming.label | option.label rendered in <Text> as {option.label}. Visible option label. Not inside t(). |
| 54 | H | prop:description | Levels, quests, game mechanics | analogyDomainPicker.options.gaming.description | option.description rendered in <Text> as {option.description}. Visible subtitle for the Gaming option. Not inside t(). |
| 120 | H | jsx | Active | analogyDomainPicker.activeIndicator | Rendered directly in a <Text> element shown to users when an option is selected. English-only hardcoded copy, not inside t(). |
| 108 | M | prop:accessibilityLabel | ${option.label}: ${option.description} | analogyDomainPicker.optionAccessibilityLabel | accessibilityLabel announced to screen-reader users. The template derives from hardcoded English DOMAIN_OPTIONS strings, making it English-… |

## `components/home/LearnerScreen.tsx`  ·  15 violations

| Line | Sev | Kind | Literal | Suggested key | Why |
|---:|:--:|---|---|---|---|
| 314 | H | jsx | Pick up where you stopped in ${recoveryMarker.topicName ?? recoveryMarker.subje… | home.coachBand.recoveryHeadline | Passed as `headline` prop to CoachBand and rendered in a <Text> element. Entirely hardcoded English template literal. |
| 352 | H | jsx | Pick up where you left off in ${resumeTarget.topicTitle ?? resumeTarget.subject… | home.coachBand.resumeHeadline | Passed as `headline` prop to CoachBand and rendered in a <Text> element. Entirely hardcoded English template literal. |
| 366 | H | jsx | Revisit ${topic.topicTitle} — it's starting to fade. | home.coachBand.reviewHeadline | Passed as `headline` prop to CoachBand and rendered in a <Text> element. Entirely hardcoded English template literal. |
| 487 | H | jsx | Hey ${firstName}! | home.learner.greeting | Greeting rendered in <Text> as JSX: 'Hey {firstName}!' — the 'Hey' and '!' are hardcoded English surrounding a dynamic expression. Not wrap… |
| 533 | H | jsx | My Notes | home.learner.myNotes | Visible button caption rendered in <Text> below the notes icon. Not wrapped in t(). |
| 690 | H | jsx | We couldn't load your subjects right now | home.learner.subjectsLoadErrorTitle | Error state heading rendered in <Text> in the subjects-load-error view. Not wrapped in t(), while nearby empty-state strings correctly use … |
| 693 | H | jsx | You can still start a session or try another action. | home.learner.subjectsLoadErrorBody | Error state body copy rendered in <Text> in the subjects-load-error view. Not wrapped in t(). |
| 703 | H | jsx | Retry | home.learner.retry | Retry button label rendered in <Text> in the subjects-load-error view. Not wrapped in t(). |
| 279 | M | jsx | Setting up ${s.name}... | home.subjectTile.preparingHint | Template literal assigned to `hint` which is passed as the accessibilityLabel component of SubjectTile (and also rendered as visible second… |
| 279 | M | jsx | Open | home.subjectTile.openHint | 'Open' is the default hint string rendered as visible text inside SubjectTile and used as part of its accessibilityLabel. Hardcoded English… |
| 284 | M | jsx | Continue ${resumeTarget.topicTitle ?? s.name} | home.subjectTile.continueHint | Template literal used as the SubjectTile hint (visible text + part of accessibilityLabel). 'Continue ' prefix is hardcoded English. |
| 289 | M | jsx | Quiz: ${reviewSummary.nextReviewTopic.topicTitle} | home.subjectTile.quizHint | Template literal used as the SubjectTile hint (visible + accessibilityLabel). 'Quiz: ' prefix is hardcoded English. |
| 291 | M | jsx | Practice: ${s.name} | home.subjectTile.practiceHint | Template literal used as the SubjectTile hint (visible + accessibilityLabel). 'Practice: ' prefix is hardcoded English. |
| 522 | M | prop:accessibilityLabel | Open My Notes | home.learner.openMyNotesLabel | accessibilityLabel for the My Notes button. Hardcoded English. The surrounding code uses t() for other labels. |
| 700 | M | prop:accessibilityLabel | Retry loading subjects | home.learner.retryLabel | accessibilityLabel on the retry button in the error state. Hardcoded English. Not wrapped in t(). |

## `components/progress/SubjectProgressRow.tsx`  ·  15 violations

| Line | Sev | Kind | Literal | Suggested key | Why |
|---:|:--:|---|---|---|---|
| 62 | H | jsx | session | progress.subjectRow.sessionSingular | Part of sessionsLabel template string rendered as visible subtitle text in the SubjectProgressRow component. Not wrapped in t(). Users see … |
| 62 | H | jsx | sessions | progress.subjectRow.sessionPlural | Part of sessionsLabel template string rendered as visible subtitle text. Not wrapped in t(). Users see e.g. '3 sessions'. |
| 78 | H | jsx | topic | progress.subjectRow.topicSingular | Part of headline template string rendered in a visible Text component. Not wrapped in t(). Users see e.g. '1 topic started · 2 mastered'. |
| 78 | H | jsx | topics | progress.subjectRow.topicPlural | Part of headline template string rendered in a visible Text component. Not wrapped in t(). Users see e.g. '3 topics started · 2 mastered'. |
| 79 | H | jsx | started ·  | progress.subjectRow.headlineStartedSeparator | Part of headline template literal '${startedCount} ${...} started · ${subject.topics.mastered} mastered' rendered in a visible Text compone… |
| 79 | H | jsx | mastered | progress.subjectRow.mastered | Part of headline template literal '...started · ${subject.topics.mastered} mastered' rendered in a visible Text component. Not wrapped in t… |
| 89 | H | prop:label | Continue | progress.subjectRow.actionContinue | ACTION_LABEL['continue'] = 'Continue' is rendered directly in a <Text> component via {ACTION_LABEL[action]}. Not wrapped in t(). This is a … |
| 90 | H | prop:label | Explore | progress.subjectRow.actionExplore | ACTION_LABEL['explore'] = 'Explore' is rendered directly in a <Text> component via {ACTION_LABEL[action]}. Not wrapped in t(). This is a vi… |
| 182 | H | jsx | ▴ Hide topics | progress.subjectRow.hideTopics | Rendered directly in a <Text> component: {expanded ? '▴ Hide topics' : '▾ See topics'}. Not wrapped in t(). Users see this as a toggle labe… |
| 182 | H | jsx | ▾ See topics | progress.subjectRow.seeTopics | Rendered directly in a <Text> component: {expanded ? '▴ Hide topics' : '▾ See topics'}. Not wrapped in t(). Users see this as a toggle labe… |
| 172 | M | prop:accessibilityLabel | ${ACTION_LABEL[action]} ${subject.subjectName} | progress.subjectRow.actionAccessibilityLabel | accessibilityLabel uses the hardcoded ACTION_LABEL English string concatenated with subject name. The ACTION_LABEL values are themselves un… |
| 205 | M | prop:accessibilityLabel | ${subject.subjectName}, expanded | progress.subjectRow.expandedAccessibilityLabel | accessibilityLabel contains hardcoded English 'expanded' and 'collapsed' literals in the template string `${subject.subjectName}, ${ expand… |
| 209 | M | prop:accessibilityHint | Tap to hide topics | progress.subjectRow.tapToHideTopicsHint | accessibilityHint with hardcoded English string. Screen reader users hear this hint. Not wrapped in t(). |
| 209 | M | prop:accessibilityHint | Tap to show topics | progress.subjectRow.tapToShowTopicsHint | accessibilityHint with hardcoded English string. Screen reader users hear this hint. Not wrapped in t(). |
| 225 | M | prop:accessibilityLabel | Open ${subject.subjectName} progress | progress.subjectRow.openProgressAccessibilityLabel | accessibilityLabel with hardcoded English template 'Open ... progress'. Screen reader users hear this. Not wrapped in t(). |

## `components/mentor-memory-sections.tsx`  ·  14 violations

| Line | Sev | Kind | Literal | Suggested key | Why |
|---:|:--:|---|---|---|---|
| 30 | H | prop:label | Prefers ${style.preferredExplanations.join(', ')} explanations | mentorMemory.learningStyle.preferredExplanations | label property on LearningStyleRow is rendered in <Text> via MemoryRow at line 183. The getLearningStyleRows function is not wrapped in t()… |
| 39 | H | prop:label | Prefers a step-by-step pace | mentorMemory.learningStyle.paceThorough | label property rendered via MemoryRow <Text> at line 183. No t() wrapping in getLearningStyleRows. |
| 41 | H | prop:label | Prefers a quicker pace | mentorMemory.learningStyle.paceQuick | label property rendered via MemoryRow <Text> at line 183. No t() wrapping in getLearningStyleRows. |
| 48 | H | prop:label | Likes a challenge | mentorMemory.learningStyle.challengeMotivated | label property rendered via MemoryRow <Text> at line 183. No t() wrapping in getLearningStyleRows. |
| 50 | H | prop:label | Needs extra encouragement when work gets difficult | mentorMemory.learningStyle.challengeEncouragement | label property rendered via MemoryRow <Text> at line 183. No t() wrapping in getLearningStyleRows. |
| 64 | H | prop:progressLabel | ${entry.attempts} ${entry.attempts === 1 ? 'time' : 'times'} noticed | mentorMemory.focusArea.attemptsNoticed | progressLabel is rendered in <Text> at line 207. getFocusAreaProgress returns a combined string using attemptsLabel. No t() wrapping. |
| 68 | H | prop:progressLabel | Showing up a lot lately | mentorMemory.focusArea.confidenceHigh | Part of progressLabel string rendered in <Text> at line 207. No t() wrapping in getFocusAreaProgress. |
| 70 | H | prop:progressLabel | Repeated pattern | mentorMemory.focusArea.confidenceMedium | Part of progressLabel string rendered in <Text> at line 207. No t() wrapping in getFocusAreaProgress. |
| 72 | H | prop:progressLabel | Early signal | mentorMemory.focusArea.confidenceLow | Part of progressLabel string rendered in <Text> at line 207. No t() wrapping in getFocusAreaProgress. |
| 130 | H | jsx | Hide | mentorMemory.section.hide | Rendered in <Text> at line 129-131 inside CollapsibleMemorySection. Visible toggle label. No t() wrapping. |
| 130 | H | jsx | Show | mentorMemory.section.show | Rendered in <Text> at line 129-131 inside CollapsibleMemorySection. Visible toggle label. No t() wrapping. |
| 139 | H | jsx | You told your mentor | mentorMemory.source.learner | Return value of getSourceBadgeLabel rendered in MemorySourceBadge <Text> at line 150. No t() wrapping. |
| 140 | H | jsx | Added by parent | mentorMemory.source.parent | Return value of getSourceBadgeLabel rendered in MemorySourceBadge <Text> at line 150. No t() wrapping. |
| 163 | H | prop:actionLabel | Remove | mentorMemory.row.remove | Default value for actionLabel prop rendered in both <Text> at line 198 and as part of accessibilityLabel at line 196. No t() wrapping. |

## `components/quiz/GuessWhoQuestion.tsx`  ·  14 violations

| Line | Sev | Kind | Literal | Suggested key | Why |
|---:|:--:|---|---|---|---|
| 49 | H | jsx | Not quite. Here's another clue, and multiple choice is now available. | quiz.guessWho.hintWrongWithMultipleChoice | Return value of getHintMessage() is rendered in a <Text> component (line 276-278). This string is user-visible helper text displayed after … |
| 51 | H | jsx | Here's another clue. Multiple choice is now available too. | quiz.guessWho.hintNextClueWithMultipleChoice | Return value of getHintMessage() rendered in a <Text> component. User-visible helper text. Not wrapped in t(). |
| 54 | H | jsx | Not quite. Here's another clue. | quiz.guessWho.hintWrong | Return value of getHintMessage() rendered in a <Text> component. User-visible feedback after a wrong guess. Not wrapped in t(). |
| 55 | H | jsx | Here's another clue. | quiz.guessWho.hintNextClue | Return value of getHintMessage() rendered in a <Text> component. User-visible hint text. Not wrapped in t(). |
| 213 | H | jsx | Clue  | quiz.guessWho.clueLabel | Rendered in a <Text> component as 'Clue {index + 1}' — visible label shown above each clue card. Not wrapped in t(). |
| 256 | H | jsx | Submit guess | quiz.guessWho.submitButton | Rendered in a <Text> component as a visible button label. Not wrapped in t(). |
| 270 | H | jsx | I don't know | quiz.guessWho.iDontKnowButton | Rendered in a <Text> component: {isFinalClue ? "I don't know" : 'Reveal next clue'}. Visible button label on the final clue. Not wrapped in… |
| 270 | H | jsx | Reveal next clue | quiz.guessWho.revealNextClueButton | Rendered in a <Text> component: {isFinalClue ? "I don't know" : 'Reveal next clue'}. Visible button label before final clue. Not wrapped in… |
| 285 | H | jsx | Need a fallback? Pick one: | quiz.guessWho.fallbackSectionLabel | Rendered in a <Text> component as a visible section heading above the multiple-choice fallback options. Not wrapped in t(). |
| 225 | M | prop:placeholder | Type a name | quiz.guessWho.inputPlaceholder | TextInput placeholder shown to users when the input is empty. Not wrapped in t(). |
| 232 | M | prop:accessibilityLabel | Guess who answer | quiz.guessWho.inputAccessibilityLabel | accessibilityLabel on a TextInput. Screen reader users hear this. Not wrapped in t(). |
| 245 | M | prop:accessibilityLabel | Submit guess | quiz.guessWho.submitAccessibilityLabel | accessibilityLabel on the submit Pressable. Screen reader users hear this. Not wrapped in t(). |
| 265 | M | prop:accessibilityLabel | I don't know | quiz.guessWho.iDontKnowAccessibilityLabel | accessibilityLabel on a Pressable (final clue branch). Screen reader users hear this. Not wrapped in t(). |
| 265 | M | prop:accessibilityLabel | Reveal next clue | quiz.guessWho.revealNextClueAccessibilityLabel | accessibilityLabel on the reveal-next-clue Pressable. Screen reader users hear this. Not wrapped in t(). |

## `app/(app)/session/_components/SessionScreenChrome.tsx`  ·  13 violations

| Line | Sev | Kind | Literal | Suggested key | Why |
|---:|:--:|---|---|---|---|
| 59 | H | jsx | Wrapping... | session.chrome.wrappingText | Rendered in <Text> in the session chrome header button when session is closing. |
| 60 | H | jsx | Done | session.chrome.doneText | Rendered in <Text> in the session chrome end-session button when a session is active. |
| 61 | H | jsx | Exit | session.chrome.exitText | Rendered in <Text> in the session chrome end-session button when there is no active session. |
| 76 | H | prop:subtitle | Figuring out what this is about... | session.chrome.classifyingSubtitle | Assigned to the subtitle variable which is passed to the screen header, visible to users while topic classification is pending. |
| 80 | H | prop:subtitle | Session expired - start a new one. | session.chrome.sessionExpiredSubtitle | Subtitle shown in the session chrome header when the session has expired. Directly user-visible. |
| 83 | H | prop:subtitle | Server unreachable - messages may fail | session.chrome.serverUnreachableSubtitle | Subtitle shown when the API is unreachable, displayed in the session screen header to warn the user. |
| 97 | H | jsx | Retry classification | session.chrome.retryClassificationText | Rendered in <Text> inside the classify-error chip button visible in the session header. |
| 121 | H | jsx | Skip the warm-up, jump in | session.chrome.skipWarmupText | Rendered in <Text> inside the skip-warmup chip button in the session header, visible to users. |
| 47 | M | prop:accessibilityLabel | Wrapping up | session.chrome.wrappingUpLabel | accessibilityLabel branch on the end-session button when session is closing. Read by screen readers. |
| 48 | M | prop:accessibilityLabel | I'm done | session.chrome.imDoneLabel | accessibilityLabel branch for active session end button. The visible text is also 'Done' (line 60) but the accessibility label differs. |
| 49 | M | prop:accessibilityLabel | Exit | session.chrome.exitLabel | accessibilityLabel branch when there is no active session. The visible text is also 'Exit' (line 61). |
| 93 | M | prop:accessibilityLabel | Retry classification | session.chrome.retryClassificationLabel | accessibilityLabel on the retry chip button. The visible text is the same string (line 97). |
| 117 | M | prop:accessibilityLabel | Skip the warm-up, jump in | session.chrome.skipWarmupLabel | accessibilityLabel on the skip-warmup chip. The visible text is the same string (line 121). |

## `components/feedback/FeedbackSheet.tsx`  ·  13 violations

| Line | Sev | Kind | Literal | Suggested key | Why |
|---:|:--:|---|---|---|---|
| 104 | H | jsx | Cancel | feedback.cancel | Visible button label rendered in a <Text> element inside the FeedbackSheet header. No t() wrapper. FeedbackSheet has no useTranslation impo… |
| 107 | H | jsx | Give us feedback now! | feedback.sheetTitle | Sheet heading rendered directly in <Text>. No t() call. FeedbackSheet has no useTranslation import. |
| 116 | H | jsx | Or shake your phone anytime to contact us. | feedback.shakeHint | Visible body copy rendered in <Text> (shown on non-web platforms). No t() call. |
| 123 | H | jsx | Thank you! | feedback.successTitle | Post-submission success heading rendered in <Text>. No t() call. |
| 126 | H | jsx | We&apos;ve received your feedback and will look into it. | feedback.successBody | Post-submission success body copy rendered in <Text>. No t() call. |
| 135 | H | jsx | Done | feedback.done | Button label rendered in <Text> on the post-submission confirmation screen. No t() call. |
| 147 | H | jsx | What kind of feedback? | feedback.categoryLabel | Section label rendered in <Text> above the feedback category picker. No t() call. |
| 178 | H | jsx | Tell us what happened | feedback.messageLabel | Section label rendered in <Text> above the message input. No t() call. |
| 224 | H | jsx | Send Feedback | feedback.sendFeedback | Submit button label rendered in <Text>. No t() call. |
| 101 | M | prop:accessibilityLabel | Close | feedback.closeLabel | FeedbackSheet.tsx has no useTranslation import. This accessibilityLabel is hardcoded English rendered to screen-reader users. |
| 184 | M | prop:placeholder | Describe the issue or your idea... | feedback.messagePlaceholder | TextInput placeholder text visible to users. No t() call. FeedbackSheet has no useTranslation import. |
| 199 | M | jsx | We&apos;ll also include your app version and device info to help us investigate. | feedback.deviceInfoNote | Helper/caption text rendered in <Text> below the message input. No t() call. |
| 217 | M | prop:accessibilityLabel | Send feedback | feedback.sendFeedbackLabel | accessibilityLabel on the submit button. No t() call. FeedbackSheet has no useTranslation import. |

## `app/profiles.tsx`  ·  12 violations

| Line | Sev | Kind | Literal | Suggested key | Why |
|---:|:--:|---|---|---|---|
| 254 | H | jsx | No profiles yet | profiles.emptyState.title | Empty-state heading on the profiles screen; hardcoded English in JSX Text, not wrapped in t(). |
| 257 | H | jsx | Create your first profile to get started | profiles.emptyState.subtitle | Empty-state body text on the profiles screen; hardcoded English in JSX Text, not wrapped in t(). |
| 265 | H | jsx | Create profile | profiles.emptyState.createCta | Primary CTA button label on the profiles empty-state; hardcoded English in JSX Text, not wrapped in t(). |
| 325 | H | jsx | Edit | profiles.editButton | Visible button label on each profile row in the profiles screen; hardcoded English in JSX Text, not wrapped in t(). |
| 346 | H | jsx | + Add profile | profiles.addProfile | CTA button label to add a new profile; hardcoded English in JSX Text, not wrapped in t(). |
| 374 | H | jsx | Rename profile | profiles.renameModal.title | Modal heading for the rename dialog; hardcoded English in JSX Text, not wrapped in t(). |
| 422 | H | jsx | Saving... | profiles.renameModal.savingLabel | Loading state label on the save button rendered to the user; hardcoded English in JSX ternary expression, not wrapped in t(). |
| 422 | H | jsx | Save | profiles.renameModal.saveButton | Default state label on the save button rendered to the user; hardcoded English in JSX ternary expression, not wrapped in t(). |
| 323 | M | prop:accessibilityLabel | Rename ${profile.displayName} | profiles.renameAccessibilityLabel | accessibilityLabel with a dynamic profile name; the surrounding English copy 'Rename' is hardcoded. At line 318 in the file, not line 323 a… |
| 387 | M | prop:placeholder | Name | profiles.renameModal.placeholder | Input placeholder visible in the rename modal; hardcoded English not wrapped in t(). |
| 389 | M | prop:accessibilityLabel | Profile name | profiles.renameModal.inputLabel | accessibilityLabel for the rename input field; hardcoded English not wrapped in t(). |
| 419 | M | prop:accessibilityLabel | Save | profiles.renameModal.saveButton | accessibilityLabel for the save button in the rename modal; hardcoded English not wrapped in t(). |

## `components/tell-mentor-input.tsx`  ·  12 violations

| Line | Sev | Kind | Literal | Suggested key | Why |
|---:|:--:|---|---|---|---|
| 28 | H | prop:title | Tell the Mentor | tellMentor.parent.title | Rendered as a visible <Text> heading (copy.title) via getCopy() for the parent audience. Hardcoded English copy not routed through t(). |
| 29 | H | prop:description | Add something important for the mentor to remember about ${childName ?? 'this c… | tellMentor.parent.description | Rendered as a visible <Text> body description (copy.description) for the parent audience. The English text including the fallback 'this chi… |
| 44 | H | prop:title | Add a Note for Your Mentor | tellMentor.adult.title | Rendered as a visible <Text> heading (copy.title) for the adult-learner audience. Hardcoded English copy not routed through t(). |
| 45 | H | prop:description | Add something you want your mentor to remember for future sessions. | tellMentor.adult.description | Rendered as a visible <Text> description (copy.description) for the adult-learner audience. Hardcoded English copy not routed through t(). |
| 53 | H | prop:title | Tell Your Mentor Something | tellMentor.adolescent.title | Rendered as a visible <Text> heading (copy.title) for the adolescent-learner audience. Hardcoded English copy not routed through t(). |
| 54 | H | prop:description | Add what helps you learn, what you enjoy, or what still feels tricky. | tellMentor.adolescent.description | Rendered as a visible <Text> description (copy.description) for the adolescent-learner audience. Hardcoded English copy not routed through … |
| 120 | H | jsx | Saving... | tellMentor.saveButton.saving | Visible button label rendered inside <Text> that every user sees. Hardcoded English not routed through t(). |
| 120 | H | jsx | Save | tellMentor.saveButton.save | Visible button label rendered inside <Text> that every user sees. Hardcoded English not routed through t(). |
| 33 | M | prop:placeholder | They do best with short examples and still get stuck on fractions. | tellMentor.parent.placeholder | Used as both TextInput placeholder and accessibilityLabel (line 105) for the parent audience variant. Visible to all users as placeholder t… |
| 47 | M | prop:placeholder | Examples really help me understand fractions. | tellMentor.adult.placeholder | Used as TextInput placeholder and accessibilityLabel for the adult-learner audience. Visible as placeholder text and announced by screen re… |
| 114 | M | prop:accessibilityLabel | Saving | tellMentor.saveButton.savingLabel | accessibilityLabel on the submit Pressable, announced to screen-reader users. Hardcoded English not routed through t(). |
| 114 | M | prop:accessibilityLabel | Save | tellMentor.saveButton.saveLabel | accessibilityLabel on the submit Pressable, announced to screen-reader users. Hardcoded English not routed through t(). |

## `app/(app)/_components/save-wizard/ProfileBasicsStep.tsx`  ·  11 violations

| Line | Sev | Kind | Literal | Suggested key | Why |
|---:|:--:|---|---|---|---|
| 209 | H | jsx | Tell us about you | saveWizard.basics.headingSelf | Rendered as h3 section heading in <Text> via JSX ternary. useTranslation is imported but only used for i18n.language detection, not for t()… |
| 209 | H | jsx | About you (the parent) | saveWizard.basics.headingParent | Rendered as h3 section heading in <Text> via JSX ternary. Not wrapped in t(). |
| 241 | H | jsx | About your child | saveWizard.basics.headingChild | Rendered as h3 section heading in <Text>. Not wrapped in t(). |
| 274 | H | jsx | To set up a child's learning, the account holder must be 18 or older. You can s… | saveWizard.basics.adultGateWarning | Rendered as a warning message in <Text> visible to users when the age gate triggers. Not wrapped in t(). |
| 293 | H | jsx | We saved your account, but couldn't add your child yet: | saveWizard.basics.errorChildPartial | Rendered as a visible error message in <Text> when child creation fails. Not wrapped in t(). |
| 302 | H | jsx | Retry | saveWizard.basics.retryChild | Rendered as a visible button label in <Text> inside a Pressable for retrying child creation. Not wrapped in t(). |
| 319 | H | jsx | Continue | saveWizard.basics.continue | Rendered as primary CTA button label in <Text> inside a Pressable. Not wrapped in t(). |
| 212 | M | prop:placeholder | Your name | saveWizard.basics.placeholderYourName | TextInput placeholder rendered visibly to all users as input hint. Not wrapped in t(). |
| 223 | M | prop:placeholder | Birth year (e.g. 1985) | saveWizard.basics.placeholderParentBirthYear | TextInput placeholder rendered visibly to users as input hint. Not wrapped in t(). |
| 244 | M | prop:placeholder | Their name or nickname | saveWizard.basics.placeholderChildName | TextInput placeholder rendered visibly to users as input hint. Not wrapped in t(). |
| 251 | M | prop:placeholder | Birth year | saveWizard.basics.placeholderChildBirthYear | TextInput placeholder rendered visibly to users as input hint. Not wrapped in t(). |

## `app/preview/value-prop.tsx`  ·  11 violations

| Line | Sev | Kind | Literal | Suggested key | Why |
|---:|:--:|---|---|---|---|
| 77 | H | jsx | Back to sign in | preview.backToSignIn | Visible navigation label on the preview value-prop screen; hardcoded English in JSX Text, not wrapped in t(). |
| 127 | H | jsx | Here's how MentoMate teaches | preview.valueProp.learner.title | Primary heading in the learner variant of the value-prop screen; hardcoded English in JSX Text, not wrapped in t(). |
| 129 | H | jsx | A back-and-forth conversation that follows what you actually need — not a fixed… | preview.valueProp.learner.subtitle | Body subtitle in the learner value-prop variant visible to all preview users; hardcoded English in JSX Text, not wrapped in t(). |
| 200 | H | jsx | Here's how MentoMate helps families | preview.valueProp.parent.title | Primary heading in the parent variant of the value-prop screen; hardcoded English in JSX Text, not wrapped in t(). |
| 203 | H | jsx | You set up your child, they learn, and you get a short weekly read on what they… | preview.valueProp.parent.subtitle | Body subtitle in the parent value-prop variant; hardcoded English in JSX Text, not wrapped in t(). |
| 209 | H | jsx | Weekly highlight | preview.valueProp.parent.sampleCardTitle | Section heading inside the parent value-prop sample card; visible to all preview users, hardcoded English not wrapped in t(). |
| 212 | H | jsx | Practiced quadratic equations for 45 minutes across three sessions. Getting com… | preview.valueProp.parent.sampleCardBody | Sample data body text shown inside the parent value-prop card; visible to all preview users and renders as real content, hardcoded English … |
| 216 | H | jsx | Sample data — your child's real insights appear after their first session. | preview.valueProp.parent.sampleCardDisclaimer | Caption/disclaimer text visible inside the parent value-prop card; hardcoded English in JSX Text, not wrapped in t(). |
| 228 | H | jsx | Try a sample lesson first | preview.valueProp.parent.tryLessonCta | Secondary CTA button label on the parent value-prop screen; hardcoded English in JSX Text, not wrapped in t(). |
| 74 | M | prop:accessibilityLabel | Go back | preview.goBack | accessibilityLabel on the preview value-prop screen; hardcoded English not wrapped in t(). |
| 116 | L | jsx | Sample | preview.valueProp.sampleBadge | User-visible label on the SampleMarker badge rendered inside the preview flow; hardcoded English in JSX Text, not wrapped in t(). |

## `components/progress/AccordionTopicList.tsx`  ·  11 violations

| Line | Sev | Kind | Literal | Suggested key | Why |
|---:|:--:|---|---|---|---|
| 26 | H | jsx | Not started | progress.topicStatus.notStarted | Return value of getTopicStatusLabel rendered in visible <Text> at line 126-128. No useTranslation in the file. |
| 30 | H | jsx | Mastered | progress.topicStatus.mastered | Return value of getTopicStatusLabel rendered in visible <Text> at line 126-128. No useTranslation in the file. |
| 34 | H | jsx | Needs review | progress.topicStatus.needsReview | Return value of getTopicStatusLabel rendered in visible <Text> at line 126-128. No useTranslation in the file. |
| 38 | H | jsx | Started | progress.topicStatus.started | Return value of getTopicStatusLabel rendered in visible <Text> at line 126-128. No useTranslation in the file. |
| 41 | H | jsx | Covered | progress.topicStatus.covered | Return value of getTopicStatusLabel rendered in visible <Text> at line 126-128. No useTranslation in the file. |
| 86 | H | jsx | Could not load topics. Tap to retry, or close the subject card to dismiss. | progress.accordionTopics.loadError | Rendered in <Text> at line 85-88 as error message visible to users. No useTranslation in the file. |
| 144 | H | jsx | No topics yet | progress.accordionTopics.emptyTitle | Rendered in <Text> at line 143-145 as empty state message visible to users. No useTranslation in the file. |
| 156 | H | jsx | Browse topics | progress.accordionTopics.browseButton | Rendered in <Text> at line 155-157 as a visible call-to-action button label. No useTranslation in the file. |
| 82 | M | prop:accessibilityLabel | Retry loading topics. Tap here to retry, or close the subject card to dismiss. | progress.accordionTopics.retryAccessibilityLabel | Hardcoded accessibilityLabel on error Pressable at line 82. Screen readers announce this. No useTranslation in the file. |
| 119 | M | prop:accessibilityLabel | View ${topic.title} details | progress.accordionTopics.topicLinkLabel | Hardcoded 'View … details' template in accessibilityLabel at line 119. The 'View' and 'details' parts are not translatable. No useTranslati… |
| 152 | M | prop:accessibilityLabel | Browse topics in your library | progress.accordionTopics.browseAccessibilityLabel | Hardcoded accessibilityLabel on browse Pressable at line 152. Screen readers announce this. No useTranslation in file. |

## `app/(app)/_subscription/_components/SubscriptionUsageCard.tsx`  ·  10 violations

| Line | Sev | Kind | Literal | Suggested key | Why |
|---:|:--:|---|---|---|---|
| 31 | H | jsx | Usage this month | subscription.usageCard.usageThisMonth | Rendered directly in a <Text> component as a section heading in the subscription usage card. Hardcoded English, visible to all users. |
| 43 | H | jsx | Today: {usage.usedToday} / {usage.dailyLimit} daily questions | subscription.usageCard.dailyUsage | Rendered directly in a <Text> component for free-tier users who have a daily cap. Hardcoded English template with interpolation. |
| 49 | H | jsx | + {usage.topUpCreditsRemaining} top-up credits remaining | subscription.usageCard.topUpCreditsRemaining | Rendered in a <Text> for users with top-up credits. Hardcoded English template. |
| 62 | H | jsx | Your share | subscription.usageCard.yourShare | Rendered in a <Text> component for the owner's row label when canUseOwnerBillingGates is true. Directly user-visible. |
| 64 | H | jsx | Your usage | subscription.usageCard.yourUsage | Rendered in a <Text> for the owner's row label when canUseOwnerBillingGates is false. Directly user-visible. |
| 68 | H | jsx | {row.used} questions | subscription.usageCard.questionsCount | Rendered in a <Text> component next to each profile's usage count. Hardcoded English unit word. |
| 78 | H | jsx | Family aggregate | subscription.usageCard.familyAggregate | Rendered in a <Text> as a label for the family aggregate row. Directly user-visible. |
| 88 | H | jsx | Quota resets | subscription.usageCard.quotaResets | Rendered in a <Text> component followed by a formatted date. Hardcoded English label for the reset date row. |
| 98 | H | jsx | Subscription renews {usage.renewsAtLabel} | subscription.usageCard.subscriptionRenews | Rendered in a <Text> when renewsAtLabel is defined. Hardcoded English template with date interpolation. |
| 116 | H | jsx | Daily limit — resets at midnight | subscription.usageCard.dailyLimitResetsAtMidnight | Rendered in a <Text> below the daily usage meter for free-tier users. Hardcoded English body copy. |

## `components/library/NoteInput.tsx`  ·  10 violations

| Line | Sev | Kind | Literal | Suggested key | Why |
|---:|:--:|---|---|---|---|
| 78 | H | jsx | Your note is getting long! (${text.length}/${MAX_CHARS}) | library.noteInput.nearLimitWarning | Hardcoded English warning message rendered in a <Text> element visible to users when the note approaches the character limit. |
| 86 | H | jsx | Listening... | library.noteInput.listeningStatus | Hardcoded English status text rendered in a <Text> element visible to users while speech recognition is active. |
| 115 | H | jsx | Cancel | library.noteInput.cancelButton.label | Hardcoded English button label rendered in a <Text> element inside the Cancel Pressable, directly visible to all users. |
| 127 | H | jsx | Save | library.noteInput.saveButton.label | Hardcoded English button label rendered in a <Text> element inside the Save Pressable, directly visible to all users. |
| 29 | M | prop:placeholder | Write your note... | library.noteInput.placeholder | Hardcoded English default prop value for a TextInput placeholder. This text is displayed to users in the note-input field when it is empty. |
| 73 | M | prop:accessibilityLabel | Note text | library.noteInput.textInput.accessibilityLabel | Hardcoded English accessibility label on the multiline TextInput. Screen readers announce this to users. |
| 97 | M | prop:accessibilityLabel | Stop recording | library.noteInput.micButton.stopRecording.accessibilityLabel | Hardcoded English accessibility label (the isListening=true branch) on the mic Pressable. Screen readers announce this to users. |
| 97 | M | prop:accessibilityLabel | Start recording | library.noteInput.micButton.startRecording.accessibilityLabel | Hardcoded English accessibility label (the isListening=false branch) on the mic Pressable. Screen readers announce this to users. |
| 113 | M | prop:accessibilityLabel | Cancel | library.noteInput.cancelButton.accessibilityLabel | Hardcoded English accessibility label on the Cancel Pressable. Screen readers announce this to users. |
| 123 | M | prop:accessibilityLabel | Save note | library.noteInput.saveButton.accessibilityLabel | Hardcoded English accessibility label on the Save Pressable. Screen readers announce this to users. |

## `app/(app)/my-notes/index.tsx`  ·  9 violations

| Line | Sev | Kind | Literal | Suggested key | Why |
|---:|:--:|---|---|---|---|
| 30 | H | prop:title | Sessions | myNotes.hub.sessions.title | HUB_ITEMS title rendered as bold Text inside a Pressable card at line 123-125. No useTranslation in file. |
| 31 | H | prop:subtitle | Conversations you had | myNotes.hub.sessions.subtitle | HUB_ITEMS subtitle rendered as secondary Text inside a Pressable card at line 126-128. No useTranslation in file. |
| 35 | H | prop:title | Notes | myNotes.hub.notes.title | HUB_ITEMS title rendered as bold Text inside a Pressable card. No useTranslation in file. |
| 36 | H | prop:subtitle | Things you wrote down | myNotes.hub.notes.subtitle | HUB_ITEMS subtitle rendered as secondary Text inside a Pressable card. No useTranslation in file. |
| 40 | H | prop:title | Bookmarks | myNotes.hub.bookmarks.title | HUB_ITEMS title rendered as bold Text inside a Pressable card. No useTranslation in file. |
| 41 | H | prop:subtitle | Mentor replies you saved | myNotes.hub.bookmarks.subtitle | HUB_ITEMS subtitle rendered as secondary Text inside a Pressable card. No useTranslation in file. |
| 96 | H | jsx | My Notes | myNotes.hub.title | Screen heading rendered as h2 bold Text at line 95-97. No useTranslation in file. |
| 99 | H | jsx | Sessions, notes, and saved replies | myNotes.hub.subtitle | Screen subtitle rendered as secondary body Text at line 98-100. No useTranslation in file. |
| 89 | M | prop:accessibilityLabel | Back | common.back | accessibilityLabel on back Pressable — read by screen readers. No useTranslation in file. |

## `components/progress/MilestoneCard.tsx`  ·  9 violations

| Line | Sev | Kind | Literal | Suggested key | Why |
|---:|:--:|---|---|---|---|
| 17 | H | jsx | ${threshold} ${threshold === 1 ? 'word' : 'words'} learned | progress.milestone.vocabularyCount | label() return value rendered in <Text> at line 77-79. No useTranslation or t() anywhere in MilestoneCard.tsx. |
| 21 | H | jsx | ${threshold} ${threshold === 1 ? 'topic' : 'topics'} mastered | progress.milestone.topicMasteredCount | label() return value rendered in <Text> at line 77-79. No useTranslation or t() anywhere in MilestoneCard.tsx. |
| 25 | H | jsx | ${threshold} learning ${threshold === 1 ? 'session' : 'sessions'} completed | progress.milestone.sessionCount | label() return value rendered in <Text> at line 77-79. No useTranslation or t() anywhere in MilestoneCard.tsx. |
| 31 | H | jsx | ${threshold}-day streak | progress.milestone.streakLength | label() return value rendered in <Text> at line 77-79. No useTranslation or t() anywhere in MilestoneCard.tsx. |
| 36 | H | jsx | Mastered ${String(metadata?.['subjectName'] ?? 'a subject')} | progress.milestone.subjectMastered | label() return value rendered in <Text> at line 77-79. No useTranslation or t() anywhere in MilestoneCard.tsx. |
| 40 | H | jsx | Completed a book | progress.milestone.bookCompleted | label() return value rendered in <Text> at line 77-79. No useTranslation or t() anywhere in MilestoneCard.tsx. |
| 43 | H | jsx | ${threshold} ${threshold === 1 ? 'hour' : 'hours'} of learning | progress.milestone.learningTime | label() return value rendered in <Text> at line 77-79. No useTranslation or t() anywhere in MilestoneCard.tsx. |
| 49 | H | jsx | Language level increased | progress.milestone.cefrLevelUp | label() return value rendered in <Text> at line 77-79. No useTranslation or t() anywhere in MilestoneCard.tsx. |
| 53 | H | jsx | Explored ${threshold} topics in ${String(metadata?.['subjectName'] ?? 'a subjec… | progress.milestone.topicsExplored | label() return value rendered in <Text> at line 77-79. No useTranslation or t() anywhere in MilestoneCard.tsx. |

## `app/(app)/child/[profileId]/index.tsx`  ·  8 violations

| Line | Sev | Kind | Literal | Suggested key | Why |
|---:|:--:|---|---|---|---|
| 41 | H | jsx | just now | child.lastSession.justNow | formatLastSession() returns this string which is rendered in the UI as a last-session timestamp label. Directly user-visible English. |
| 44 | H | jsx | {diffMinutes} min{diffMinutes === 1 ? '' : 's'} ago | child.lastSession.minutesAgo | formatLastSession() returns this template rendered as last-session relative time. Hardcoded English plural form. |
| 48 | H | jsx | {diffHours} hour{diffHours === 1 ? '' : 's'} ago | child.lastSession.hoursAgo | formatLastSession() returns this template rendered as last-session relative time. Hardcoded English plural form. |
| 53 | H | jsx | {diffDays} day{diffDays === 1 ? '' : 's'} ago | child.lastSession.daysAgo | formatLastSession() returns this template rendered as last-session relative time. Hardcoded English plural form. |
| 58 | H | jsx | {diffWeeks} week{diffWeeks === 1 ? '' : 's'} ago | child.lastSession.weeksAgo | formatLastSession() returns this template rendered as last-session relative time. Hardcoded English plural form. |
| 63 | H | jsx | {diffMonths} month{diffMonths === 1 ? '' : 's'} ago | child.lastSession.monthsAgo | formatLastSession() returns this template rendered as last-session relative time. Hardcoded English plural form. |
| 68 | H | jsx | {diffYears} year{diffYears === 1 ? '' : 's'} ago | child.lastSession.yearsAgo | formatLastSession() returns this template rendered as last-session relative time. Hardcoded English plural form. |
| 959 | M | prop:subtitle | {activeAccommodation.title} - {activeAccommodation.description} | more.accommodation.subtitleFormat | Passed as the subtitle prop to RowLink, which renders it in a <Text> element. title/description come from ACCOMMODATION_OPTIONS which conta… |

## `app/preview/both.tsx`  ·  8 violations

| Line | Sev | Kind | Literal | Suggested key | Why |
|---:|:--:|---|---|---|---|
| 24 | H | prop:label | Set up my child first | preview.both.childFirstLabel | Option label in the OPTIONS constant rendered as visible Text to users in the preview onboarding screen. No useTranslation in this file. |
| 25 | H | prop:description | We'll get your child going, then come back to you. | preview.both.childFirstDescription | Option description in the OPTIONS constant rendered as visible Text to users in the preview onboarding screen. No useTranslation in this fi… |
| 30 | H | prop:label | Try a lesson myself first | preview.both.selfFirstLabel | Option label in the OPTIONS constant rendered as visible Text to users in the preview onboarding screen. No useTranslation in this file. |
| 31 | H | prop:description | See how it works, then set up your child after sign-up. | preview.both.selfFirstDescription | Option description in the OPTIONS constant rendered as visible Text to users in the preview onboarding screen. No useTranslation in this fi… |
| 103 | H | jsx | Back to sign in | preview.both.backToSignIn | Visible Text in the back navigation button rendered to users. No useTranslation in this file. |
| 107 | H | jsx | What do you want to set up first? | preview.both.heading | H1 heading rendered to users on the preview both-priority screen. No useTranslation in this file. |
| 110 | H | jsx | You can do both — pick where to start. | preview.both.subtitle | Subtitle text rendered to users on the preview both-priority screen. No useTranslation in this file. |
| 101 | M | prop:accessibilityLabel | Go back | preview.both.goBackAccessibility | accessibilityLabel on the back Pressable, read aloud by screen readers to users. No useTranslation in this file. |

## `components/common/ProfileSwitcher.tsx`  ·  8 violations

| Line | Sev | Kind | Literal | Suggested key | Why |
|---:|:--:|---|---|---|---|
| 14 | H | prop:accessibilityLabel | Parent | profileSwitcher.roleParent | roleLabel() returns 'Parent' or 'Student'; the return value is rendered as visible <Text> at line 202 (the role subtitle under each profile… |
| 14 | H | prop:accessibilityLabel | Student | profileSwitcher.roleStudent | roleLabel() returns 'Parent' or 'Student'; same as 'Parent' — rendered as visible <Text> at line 202 and in accessibilityLabel at line 171. |
| 202 | H | jsx | Parent | profileSwitcher.roleParent | Line 202 renders {roleLabel(profile, profiles)} as a visible <Text> subtitle under each profile name in the dropdown. roleLabel() returns t… |
| 96 | M | prop:accessibilityLabel | Switch profile. Current:  | profileSwitcher.switchProfileCurrent | Screen-reader accessibilityLabel template on the profile-switcher chip Pressable. Reads aloud to VoiceOver/TalkBack users in English regard… |
| 108 | M | jsx | Profile | profileSwitcher.defaultName | Fallback visible <Text> rendered when activeProfile?.displayName is nullish: `{activeProfile?.displayName ?? 'Profile'}`. Displayed in the … |
| 134 | M | prop:accessibilityLabel | Close profile switcher | profileSwitcher.closeLabel | accessibilityLabel on the modal backdrop Pressable, read by screen readers to describe the close affordance. English-only. |
| 174 | M | prop:accessibilityLabel | , active | profileSwitcher.activeIndicator | Appended to each profile menu item's accessibilityLabel when it is the active profile. Read by screen readers in English. |
| 97 | L | prop:accessibilityLabel | Unknown | profileSwitcher.unknownName | Fallback string inside the accessibilityLabel template when activeProfile?.displayName is nullish. Rarely seen but still read by screen rea… |

## `components/session/ChatShell.tsx`  ·  8 violations

| Line | Sev | Kind | Literal | Suggested key | Why |
|---:|:--:|---|---|---|---|
| 881 | H | jsx |  — tap to retry | session.voice.errorTapToRetry | JSX text rendered directly inside a visible <Text> element. The suffix ' — tap to retry' is hardcoded English copy that all sighted users s… |
| 251 | M | prop:accessibilityLabel | Homework image | session.chat.homeworkImageLabel | accessibilityLabel on <Image> is read by VoiceOver/TalkBack. The Image has accessibilityLabel set directly and is a real a11y surface for s… |
| 703 | M | prop:accessibilityLabel | Go back | common.goBack | accessibilityLabel on a <Pressable accessibilityRole="button"> is announced by screen readers; hardcoded English. |
| 877 | M | prop:accessibilityLabel | Voice error: . Tap to retry. | session.voice.errorRetryLabel | Template literal accessibilityLabel on a Pressable with accessibilityRole="button". The surrounding English text is hardcoded and read by s… |
| 1045 | M | prop:accessibilityLabel | Message input | session.chat.messageInputLabel | accessibilityLabel on a <TextInput> is the primary label announced by screen readers for the input field. Hardcoded English. |
| 1071 | M | prop:accessibilityLabel | Enable voice message | session.voice.enableLabel | accessibilityLabel on <Pressable accessibilityRole="button"> — announced by screen readers. Hardcoded English. |
| 1092 | M | prop:accessibilityLabel | Send message | session.chat.sendLabel | accessibilityLabel on <Pressable accessibilityRole="button"> send button. Announced by screen readers. Hardcoded English. |
| 878 | L | prop:accessibilityHint | Tap to retry voice input | session.voice.errorRetryHint | accessibilityHint is announced by VoiceOver as supplementary guidance. Hardcoded English string on an interactive Pressable. |

## `components/session/MessageBubble.tsx`  ·  8 violations

| Line | Sev | Kind | Literal | Suggested key | Why |
|---:|:--:|---|---|---|---|
| 142 | H | jsx | Step-by-step | session.escalation.stepByStep | ESCALATION_STYLES[3].label is rendered as <Text>{escalation.label}</Text> and is visible to all users when escalation rung 3 is active. Har… |
| 150 | H | jsx | Let me show you | session.escalation.letMeShowYou | ESCALATION_STYLES[4].label rendered as <Text>{escalation.label}</Text>. Visible to all users on rung 4 escalation. Hardcoded English. |
| 158 | H | jsx | Teaching mode | session.escalation.teachingMode | ESCALATION_STYLES[5].label rendered as <Text>{escalation.label}</Text>. Visible to all users on rung 5 escalation. Hardcoded English. |
| 172 | H | jsx | THINK-DEEPER CLEARED | session.verification.thinkDeeperCleared | VERIFICATION_BADGE_CONFIG.evaluate.label rendered as <Text>✓ {label}</Text> and displayed to users when the evaluate verification badge is … |
| 173 | H | jsx | TEACH-BACK CLEARED | session.verification.teachBackCleared | VERIFICATION_BADGE_CONFIG.teach_back.label rendered as <Text>✓ {label}</Text> and displayed to users. Hardcoded English. |
| 284 | H | jsx | Sending… | session.chat.sendingStatus | JSX text directly inside a <Text> element shown in the pending-sync indicator. Visible to all sighted users while a message is pending. Har… |
| 93 | M | prop:accessibilityLabel | Thinking | session.chat.thinkingLabel | accessibilityLabel on the ThinkingIndicator <View>. Although the View lacks explicit accessible={true}, React Native aggregates accessibili… |
| 242 | L | prop:accessibilityLabel | Guided response | session.escalation.guidedResponseLabel | accessibilityLabel on a plain <View> without accessible={true}. Not reliably surfaced to screen readers in RN (no focusable role). Violatio… |

## `hooks/use-celebration.tsx`  ·  8 violations

| Line | Sev | Kind | Literal | Suggested key | Why |
|---:|:--:|---|---|---|---|
| 41 | H | jsx | You had a breakthrough! | celebration.breakthrough.child | Returned by getCelebrationMessage() and rendered inside a visible <Text> in the CelebrationOverlay JSX (line 187). The file is use-celebrat… |
| 42 | H | jsx | Breakthrough - concept clicked. | celebration.breakthrough.adult | Returned by getCelebrationMessage() and rendered inside a visible <Text> in the CelebrationOverlay JSX (line 187). Hardcoded English for th… |
| 47 | H | jsx | That was a huge milestone! | celebration.milestone.child | Returned by getCelebrationMessage() and rendered inside a visible <Text> in the CelebrationOverlay. Hardcoded English for the child audienc… |
| 48 | H | jsx | Major milestone reached. | celebration.milestone.adult | Returned by getCelebrationMessage() and rendered inside a visible <Text> in the CelebrationOverlay. Hardcoded English for the adult audienc… |
| 52 | H | jsx | Great thoughtful responses | celebration.deepDiver | Returned by getCelebrationMessage() and rendered inside a visible <Text> in the CelebrationOverlay. Hardcoded English not routed through t(… |
| 56 | H | jsx | You kept going | celebration.persistent | Returned by getCelebrationMessage() and rendered inside a visible <Text> in the CelebrationOverlay. Hardcoded English not routed through t(… |
| 59 | H | jsx | Nice work! | celebration.niceWork.child | Returned by getCelebrationMessage() and rendered inside a visible <Text> in the CelebrationOverlay. Hardcoded English for the child audienc… |
| 59 | H | jsx | Nice work. | celebration.niceWork.adult | Returned by getCelebrationMessage() and rendered inside a visible <Text> in the CelebrationOverlay. Hardcoded English for the adult audienc… |

## `app/(app)/child/[profileId]/subjects/[subjectId].tsx`  ·  7 violations

| Line | Sev | Kind | Literal | Suggested key | Why |
|---:|:--:|---|---|---|---|
| 19 | H | jsx | Not started | child.subject.completionStatus.notStarted | COMPLETION_LABELS values are rendered directly in a <Text className="text-caption"> via COMPLETION_LABELS[topic.completionStatus]. This lab… |
| 20 | H | jsx | Started | child.subject.completionStatus.inProgress | COMPLETION_LABELS value for 'in_progress', rendered directly in <Text>. User-visible status label. |
| 21 | H | jsx | Completed | child.subject.completionStatus.completed | COMPLETION_LABELS value for 'completed', rendered directly in <Text>. User-visible status label. |
| 22 | H | jsx | Verified | child.subject.completionStatus.verified | COMPLETION_LABELS value for 'verified', rendered directly in <Text>. User-visible status label. |
| 23 | H | jsx | Stable | child.subject.completionStatus.stable | COMPLETION_LABELS value for 'stable', rendered directly in <Text>. User-visible status label. |
| 51 | M | jsx | <1 min | child.subject.durationLessThanOneMin | formatDuration() returns '<1 min' for sessions under 1 minute; this string is rendered as topic duration in the subject detail screen. Hard… |
| 91 | M | jsx | Subject | child.subject.defaultSubjectName | Fallback display name when subject data is not available. Used in screen heading/UI. Hardcoded English. |

## `app/(app)/session/index.tsx`  ·  7 violations

| Line | Sev | Kind | Literal | Suggested key | Why |
|---:|:--:|---|---|---|---|
| 681 | H | prop:content | Session expired. Start a new one to keep going. | session.expiredMessage | Injected as a chat message (role: 'assistant', isSystemPrompt: true) into the conversation thread when the session expires. Rendered as a v… |
| 875 | H | prop:content | Your photo took too long to load, so I'm starting with the text only. If someth… | session.imageTimeoutMessage | Injected as an assistant chat message (isSystemPrompt: true) when image attachment times out. Rendered as visible copy in the chat thread. |
| 878 | H | prop:content | I couldn't open your photo, so I'm starting with the text only. If something lo… | session.imageErrorMessage | Injected as an assistant chat message when image attachment fails to open. Rendered as visible copy in the chat thread. |
| 1231 | H | prop:disabledReason | You're offline — input will return when you reconnect | session.disabledReasonOffline | Passed as disabledReason to ChatShell, which renders it as a visible banner above the disabled input when the user is offline. |
| 1233 | H | prop:disabledReason | This session has ended | session.disabledReasonExpired | Passed as disabledReason to ChatShell when the session has expired. Rendered as a visible disabled-state banner. |
| 1235 | H | prop:disabledReason | Your session limit has been reached | session.disabledReasonQuota | Passed as disabledReason to ChatShell when quota is exhausted. Rendered as a visible disabled-state banner. |
| 1237 | H | prop:disabledReason | Choose where to save this session | session.disabledReasonFiling | Passed as disabledReason to ChatShell when the filing prompt is shown. Rendered as a visible disabled-state banner. |

## `components/ClerkGate.tsx`  ·  7 violations

| Line | Sev | Kind | Literal | Suggested key | Why |
|---:|:--:|---|---|---|---|
| 71 | H | jsx | Taking longer than expected | clerkGate.timeout.title | Heading rendered to users when Clerk initialization times out; hardcoded English in JSX Text, not wrapped in t(). |
| 80 | H | jsx | Please check your internet connection and try again. | clerkGate.timeout.message | Body text shown to users when Clerk initialization times out; hardcoded English in JSX Text, not wrapped in t(). |
| 104 | H | jsx | Try again | clerkGate.timeout.retryButton | Retry button label on the Clerk timeout screen; hardcoded English in JSX Text, not wrapped in t(). |
| 123 | H | jsx | Continue without account | clerkGate.timeout.offlineButton | Secondary action button label on the Clerk timeout screen; hardcoded English in JSX Text, not wrapped in t(). |
| 149 | H | jsx | Connecting securely... | clerkGate.loading.message | Loading state copy shown to users while Clerk initializes; hardcoded English in JSX Text, not wrapped in t(). |
| 95 | M | prop:accessibilityLabel | Try again | clerkGate.timeout.retryButton | accessibilityLabel on the retry button in the Clerk timeout screen; hardcoded English not wrapped in t(). |
| 113 | M | prop:accessibilityLabel | Continue without account | clerkGate.timeout.offlineButton | accessibilityLabel on the offline/continue-without-account button; hardcoded English not wrapped in t(). |

## `components/library/TopicStatusRow.tsx`  ·  7 violations

| Line | Sev | Kind | Literal | Suggested key | Why |
|---:|:--:|---|---|---|---|
| 222 | H | jsx | session | library.topicStatus.sessionCount | Rendered inside <Text> at line 222: '{sessionCount} {sessionCount === 1 ? 'session' : 'sessions'}'. Visible user copy, not wrapped in t(). |
| 222 | H | jsx | sessions | library.topicStatus.sessionCount_plural | Plural form of the same JSX text rendered at line 222. Visible user copy, not wrapped in t(). |
| 31 | M | prop:accessibilityLabel | Continue now | library.topicStatus.continueNow | STATE_LABEL map value used in accessibilityLabel on Pressable at line 157. Screen readers announce this to users. No t() wrapping. |
| 32 | M | prop:accessibilityLabel | Started | library.topicStatus.started | STATE_LABEL map value used in accessibilityLabel on Pressable at line 157. Screen readers announce this to users. No t() wrapping. |
| 33 | M | prop:accessibilityLabel | Up next | library.topicStatus.upNext | STATE_LABEL map value used in accessibilityLabel on Pressable at line 157. Screen readers announce this to users. No t() wrapping. |
| 34 | M | prop:accessibilityLabel | Done | library.topicStatus.done | STATE_LABEL map value used in accessibilityLabel on Pressable at line 157. Screen readers announce this to users. No t() wrapping. |
| 35 | M | prop:accessibilityLabel | Later | library.topicStatus.later | STATE_LABEL map value used in accessibilityLabel on Pressable at line 157. Screen readers announce this to users. No t() wrapping. |

## `components/memory-consent-prompt.tsx`  ·  7 violations

| Line | Sev | Kind | Literal | Suggested key | Why |
|---:|:--:|---|---|---|---|
| 23 | H | jsx | Help the mentor learn about ${childName ?? 'your child'} | memoryConsent.title | Default title rendered in <Text> when no title prop is provided. File has no useTranslation import. Hardcoded English visible to all users. |
| 26 | H | jsx | This lets the mentor remember what kinds of explanations work, what is still tr… | memoryConsent.description | Default description rendered in <Text> when no description prop is provided. File has no useTranslation import. Hardcoded English visible t… |
| 39 | H | jsx | Saving... | memoryConsent.saving | Rendered in <Text> inside the grant button when isPending is true. Hardcoded English, no t() wrapping. |
| 39 | H | jsx | Yes, enable | memoryConsent.confirm | Rendered in <Text> inside the grant button when not pending. Hardcoded English, no t() wrapping. |
| 51 | H | jsx | Not now | memoryConsent.decline | Rendered in <Text> inside the decline button. Hardcoded English, no t() wrapping. |
| 35 | M | prop:accessibilityLabel | Enable mentor memory | memoryConsent.enableLabel | Hardcoded accessibilityLabel on the grant Pressable. No t() wrapping anywhere in the file. Screen readers announce this. |
| 47 | M | prop:accessibilityLabel | Decline mentor memory | memoryConsent.declineLabel | Hardcoded accessibilityLabel on the decline Pressable. No t() wrapping anywhere in the file. Screen readers announce this. |

## `components/session/SessionMessageActions.tsx`  ·  7 violations

| Line | Sev | Kind | Literal | Suggested key | Why |
|---:|:--:|---|---|---|---|
| 72 | H | jsx | Reconnect | session.actions.reconnect | JSX text 'Reconnect' rendered inside a visible <Text> element in the reconnect chip. Visible to all sighted users. Hardcoded English. |
| 119 | H | jsx | Wrong subject | session.actions.wrongSubject | Inline literal 'Wrong subject' (not from QUICK_CHIP_CONFIG) is used as the chip label and rendered as <Text>{chip.label}</Text>. Visible to… |
| 69 | M | prop:accessibilityLabel | Reconnect to the conversation | session.actions.reconnectLabel | accessibilityLabel on <Pressable accessibilityRole="button"> for the reconnect prompt. Announced by screen readers. Hardcoded English. |
| 168 | M | prop:accessibilityLabel | Helpful — mark this reply helpful | session.actions.helpfulLabel | accessibilityLabel on <Pressable accessibilityRole="button"> for the helpful feedback button. Announced by screen readers. Hardcoded Englis… |
| 204 | M | prop:accessibilityLabel | Not helpful — mark this reply not helpful | session.actions.notHelpfulLabel | accessibilityLabel on <Pressable accessibilityRole="button"> for the not-helpful feedback button. Announced by screen readers. Hardcoded En… |
| 239 | M | prop:accessibilityLabel | Mark this reply as incorrect | session.actions.incorrectLabel | accessibilityLabel on <Pressable accessibilityRole="button"> for the incorrect feedback button. Announced by screen readers. Hardcoded Engl… |
| 275 | M | prop:accessibilityLabel | Remove bookmark | session.actions.bookmarkToggleLabel | Ternary accessibilityLabel ('Remove bookmark' / 'Bookmark this response') on a <Pressable accessibilityRole="button">. Both states are hard… |

## `components/session/VoiceRecordButton.tsx`  ·  7 violations

| Line | Sev | Kind | Literal | Suggested key | Why |
|---:|:--:|---|---|---|---|
| 145 | H | jsx | Send | session.voiceRecord.sendButton | Visible button label rendered inside <Text> that every user sees, hardcoded English not routed through t(). |
| 68 | M | prop:accessibilityLabel | Stop recording | session.voiceRecord.stopLabel | accessibilityLabel on a Pressable button, announced to screen-reader users. Hardcoded English not routed through t(). |
| 68 | M | prop:accessibilityLabel | Start recording | session.voiceRecord.startLabel | accessibilityLabel on a Pressable button, announced to screen-reader users. Hardcoded English not routed through t(). |
| 133 | M | prop:accessibilityLabel | Voice transcript — tap to edit | session.voiceRecord.transcriptLabel | accessibilityLabel on a TextInput, announced to screen-reader users. Hardcoded English not routed through t(). |
| 142 | M | prop:accessibilityLabel | Send voice message | session.voiceRecord.sendLabel | accessibilityLabel on a Pressable send button, announced to screen-reader users. Hardcoded English not routed through t(). |
| 151 | M | prop:accessibilityLabel | Re-record | session.voiceRecord.reRecordLabel | accessibilityLabel on a Pressable icon-only button, announced to screen-reader users. Hardcoded English not routed through t(). |
| 164 | M | prop:accessibilityLabel | Discard recording | session.voiceRecord.discardLabel | accessibilityLabel on a Pressable icon-only trash button, announced to screen-reader users. Hardcoded English not routed through t(). |

## `app/preview/index.tsx`  ·  6 violations

| Line | Sev | Kind | Literal | Suggested key | Why |
|---:|:--:|---|---|---|---|
| 24 | H | jsx | Back to sign in | preview.backToSignIn | Visible button label rendered directly as JSX text in a production UI screen; not wrapped in t(). |
| 29 | H | jsx | Try MentoMate | preview.landing.title | Primary heading on the preview landing screen; hardcoded English in JSX Text, not wrapped in t(). |
| 32 | H | jsx | See how it works — no sign-up needed yet. | preview.landing.subtitle | Body subtitle copy visible to all users on the preview landing screen; hardcoded English, not wrapped in t(). |
| 42 | H | jsx | Continue | preview.landing.continueCta | Primary CTA button label on the preview landing screen; hardcoded English in JSX Text, not wrapped in t(). |
| 21 | M | prop:accessibilityLabel | Go back | preview.landing.goBack | accessibilityLabel rendered to assistive technology users on a real UI screen; hardcoded English not wrapped in t(). |
| 39 | M | prop:accessibilityLabel | Continue | preview.landing.continueCta | accessibilityLabel for a primary CTA button; hardcoded English not wrapped in t(). |

## `components/common/RewardBurst.tsx`  ·  6 violations

| Line | Sev | Kind | Literal | Suggested key | Why |
|---:|:--:|---|---|---|---|
| 63 | H | prop:label | Solid work | rewardBurst.labelAssessment | config.label is rendered as visible <Text> in the reward badge at line 262 (`{message ?? config.label}`). The outer View hides children fro… |
| 68 | H | prop:label | Correct | rewardBurst.labelCapitals | config.label for the 'capitals' variant, rendered as visible <Text> in the reward badge at line 262. |
| 73 | H | prop:label | Nice | rewardBurst.labelDictation | config.label for the 'dictation' variant, rendered as visible <Text> in the reward badge at line 262. |
| 78 | H | prop:label | Solved | rewardBurst.labelGuessWho | config.label for the 'guess_who' variant, rendered as visible <Text> in the reward badge at line 262. |
| 83 | H | prop:label | Strong | rewardBurst.labelRecite | config.label for the 'recite' variant, rendered as visible <Text> in the reward badge at line 262. |
| 88 | H | prop:label | Got it | rewardBurst.labelVocabulary | config.label for the 'vocabulary' variant, rendered as visible <Text> in the reward badge at line 262. |

## `components/library/BookCard.tsx`  ·  6 violations

| Line | Sev | Kind | Literal | Suggested key | Why |
|---:|:--:|---|---|---|---|
| 21 | H | prop:label | Not started | library.bookCard.statusNotStarted | Value in STATUS_LABELS map is rendered directly in <Text> at line 79 (STATUS_LABELS[status]) and also concatenated into the accessibilityLa… |
| 22 | H | prop:label | In progress | library.bookCard.statusInProgress | Value in STATUS_LABELS map rendered in <Text> and used in accessibilityLabel. Hardcoded English; no useTranslation in BookCard.tsx. |
| 23 | H | prop:label | Complete | library.bookCard.statusComplete | Value in STATUS_LABELS map rendered in <Text> and used in accessibilityLabel. Hardcoded English; no useTranslation in BookCard.tsx. |
| 24 | H | prop:label | Review due | library.bookCard.statusReviewDue | Value in STATUS_LABELS map rendered in <Text> and used in accessibilityLabel. Hardcoded English; no useTranslation in BookCard.tsx. |
| 35 | H | prop:label | Ready to open | library.bookCard.readyToOpen | Assigned to progressLabel which is rendered in <Text> at line 90 and concatenated into accessibilityLabel at line 53. Hardcoded English; no… |
| 36 | H | prop:label | Build this book | library.bookCard.buildThisBook | Assigned to progressLabel which is rendered in <Text> at line 90 and concatenated into accessibilityLabel at line 53. Hardcoded English; no… |

## `components/parent/EngagementChip.tsx`  ·  6 violations

| Line | Sev | Kind | Literal | Suggested key | Why |
|---:|:--:|---|---|---|---|
| 21 | H | jsx | Curious | parent.engagementChip.curious | CONFIG label rendered in visible <Text> at line 66 and in accessibilityLabel at line 57. No useTranslation in the file. |
| 26 | H | jsx | Stuck | parent.engagementChip.stuck | CONFIG label rendered in visible <Text> at line 66 and in accessibilityLabel at line 57. No useTranslation in the file. |
| 31 | H | jsx | Breezing | parent.engagementChip.breezing | CONFIG label rendered in visible <Text> at line 66 and in accessibilityLabel at line 57. No useTranslation in the file. |
| 36 | H | jsx | Focused | parent.engagementChip.focused | CONFIG label rendered in visible <Text> at line 66 and in accessibilityLabel at line 57. No useTranslation in the file. |
| 41 | H | jsx | Scattered | parent.engagementChip.scattered | CONFIG label rendered in visible <Text> at line 66 and in accessibilityLabel at line 57. No useTranslation in the file. |
| 57 | M | prop:accessibilityLabel | Engagement: ${label} | parent.engagementChip.accessibilityLabel | Hardcoded 'Engagement: ' prefix in accessibilityLabel at line 57. The prefix is not translatable. No useTranslation in file. |

## `app/(app)/_components/save-wizard/ConfirmStep.tsx`  ·  5 violations

| Line | Sev | Kind | Literal | Suggested key | Why |
|---:|:--:|---|---|---|---|
| 47 | H | jsx | Start lesson | saveWizard.confirm.ctaStartLesson | Assigned to `cta` variable and rendered as button label text in <Text> at line 125. Not wrapped in t(). Visible CTA button copy. |
| 47 | H | jsx | Open parent home | saveWizard.confirm.ctaOpenParentHome | Assigned to `cta` variable and rendered as button label text in <Text> at line 125. Not wrapped in t(). Visible CTA button copy. |
| 106 | H | jsx | Your first lesson is ready | saveWizard.confirm.headingSelfReady | Part of a template literal rendered as h3 heading text in <Text> at lines 104-108. Not wrapped in t(). |
| 107 | H | jsx | Your child's profile is set up. Let's open parent home. | saveWizard.confirm.headingChildReady | Rendered as h3 heading text in <Text> via JSX ternary at line 107. Not wrapped in t(). |
| 55 | M | jsx | Could not switch profile. | saveWizard.confirm.errorSwitchProfile | Fallback error string set via setLandingError and then rendered in a visible <Text> inside an error banner. Not wrapped in t(). |

## `app/(app)/_components/save-wizard/SaveWizardGate.tsx`  ·  5 violations

| Line | Sev | Kind | Literal | Suggested key | Why |
|---:|:--:|---|---|---|---|
| 144 | H | jsx | Great, let's save this and get you started. | saveWizard.gate.heading | Rendered as an h1 heading in <Text> visible to all users entering the save wizard. Not wrapped in t(). |
| 150 | H | jsx | Where should we save this? | saveWizard.gate.subheading | Rendered as body text in <Text> visible to users on step 1 of the wizard. Not wrapped in t(). |
| 178 | H | jsx | Continue | saveWizard.gate.continue | Rendered as primary CTA button label in <Text> inside a Pressable on step 1. Not wrapped in t(). |
| 125 | M | prop:accessibilityLabel | Back to previous step | saveWizard.gate.accessibilityBack | accessibilityLabel is read by screen readers to announce the back button. Not wrapped in t(). Affects VoiceOver/TalkBack users in all non-E… |
| 136 | M | prop:accessibilityLabel | Cancel and exit | saveWizard.gate.accessibilityCancel | accessibilityLabel is read by screen readers for the cancel button. Not wrapped in t(). Affects VoiceOver/TalkBack users in all non-English… |

## `components/session/VoicePlaybackBar.tsx`  ·  5 violations

| Line | Sev | Kind | Literal | Suggested key | Why |
|---:|:--:|---|---|---|---|
| 59 | M | prop:accessibilityLabel | Replay last AI message | session.voicePlayback.replayLabel | accessibilityLabel on a Pressable button is announced to screen-reader users. The string is a hardcoded English label not passed through t(… |
| 83 | M | prop:accessibilityLabel | Resume speaking | session.voicePlayback.resumeLabel | accessibilityLabel on a Pressable button, announced to screen-reader users. Hardcoded English not routed through t(). |
| 83 | M | prop:accessibilityLabel | Pause speaking | session.voicePlayback.pauseLabel | accessibilityLabel on a Pressable button, announced to screen-reader users. Hardcoded English not routed through t(). |
| 106 | M | prop:accessibilityLabel | Stop speaking | session.voicePlayback.stopLabel | accessibilityLabel on a Pressable button, announced to screen-reader users. Hardcoded English not routed through t(). |
| 125 | M | prop:accessibilityLabel | Speech speed ${rate}x. Tap to change. | session.voicePlayback.speedLabel | accessibilityLabel on a Pressable button with a dynamic rate value, announced to screen-reader users. The surrounding English copy is hardc… |

## `app/(app)/child/[profileId]/mentor-memory.tsx`  ·  4 violations

| Line | Sev | Kind | Literal | Suggested key | Why |
|---:|:--:|---|---|---|---|
| 401 | H | prop:title | Could not enable memory | parentView.mentorMemory.couldNotEnableMemoryTitle | platformAlert() renders a native alert to the user. The title string is directly shown as alert title on both iOS/Android and web. Hardcode… |
| 402 | H | prop:message | Please try again. | common.pleaseRetry | platformAlert() renders a native alert to the user. The message string is directly shown as alert body. Hardcoded English. |
| 415 | H | prop:title | Could not save preference | parentView.mentorMemory.couldNotSavePreferenceTitle | platformAlert() renders a native alert to the user. The title string is directly shown as alert title. Hardcoded English. |
| 416 | H | prop:message | Please try again. | common.pleaseRetry | Duplicate of line 402 — platformAlert() message body shown to user in the native alert. Hardcoded English. |

## `app/(app)/child/[profileId]/reports.tsx`  ·  4 violations

| Line | Sev | Kind | Literal | Suggested key | Why |
|---:|:--:|---|---|---|---|
| 25 | H | jsx | should be ready later today | child.reports.nextReportLaterToday | Assigned to timeContext and passed as {{timeContext}} interpolation to t('parentView.reports.firstReportTimeContext'), causing the hardcode… |
| 43 | H | jsx | arrives in a few days | child.reports.nextReportInFewDays | Assigned to timeContext and passed as {{timeContext}} to t('parentView.reports.firstReportTimeContext'); the hardcoded English string appea… |
| 44 | H | jsx | arrives in about {daysUntil} days | child.reports.nextReportInDays | Assigned to timeContext and passed as {{timeContext}} to t('parentView.reports.firstReportTimeContext'); the hardcoded English template str… |
| 51 | L | jsx | Latest week | child.reports.latestWeekFallback | formatReportWeek() fallback when the date string is invalid (Number.isNaN). This return value is used via formatReportWeek(latestReport.rep… |

## `app/(app)/session/_components/SessionErrorBoundary.tsx`  ·  4 violations

| Line | Sev | Kind | Literal | Suggested key | Why |
|---:|:--:|---|---|---|---|
| 64 | H | jsx | Session screen crashed | session.errorBoundary.crashTitle | Error heading rendered in <Text> when the session screen crashes. Shown to users in the error boundary fallback UI. |
| 135 | H | jsx | Try Again | session.errorBoundary.tryAgain | Primary button label in the error boundary recovery UI, rendered in <Text> and visible to users. |
| 168 | H | jsx | Go Home | session.errorBoundary.goHomeText | Secondary button label rendered in <Text> in the error boundary fallback UI. |
| 159 | M | prop:accessibilityLabel | Go Home | session.errorBoundary.goHome | accessibilityLabel on the secondary escape button in the error boundary. The visible text (line 168) is the same string. |

## `app/preview/intent.tsx`  ·  4 violations

| Line | Sev | Kind | Literal | Suggested key | Why |
|---:|:--:|---|---|---|---|
| 125 | H | jsx | Back to sign in | preview.backToSignIn | Visible navigation label on the preview intent screen; hardcoded English in JSX Text, not wrapped in t(). |
| 129 | H | jsx | Who are you setting this up for? | preview.intent.title | Primary heading on the preview intent selection screen; hardcoded English in JSX Text, not wrapped in t(). |
| 132 | H | jsx | We'll tailor what you see next. | preview.intent.subtitle | Subtitle/body text on the preview intent screen visible to all preview users; hardcoded English, not wrapped in t(). |
| 122 | M | prop:accessibilityLabel | Go back | preview.goBack | accessibilityLabel on a real UI screen (preview intent); hardcoded English not wrapped in t(). |

## `app/preview/topic.tsx`  ·  4 violations

| Line | Sev | Kind | Literal | Suggested key | Why |
|---:|:--:|---|---|---|---|
| 97 | H | jsx | Back to sign in | preview.backToSignIn | Visible navigation label on the preview topic screen; hardcoded English in JSX Text, not wrapped in t(). |
| 101 | H | jsx | Pick a sample lesson | preview.topic.title | Primary heading on the preview topic selection screen; hardcoded English in JSX Text, not wrapped in t(). |
| 104 | H | jsx | These are safe previews. Your own topic comes after signup. | preview.topic.subtitle | Body subtitle text on the preview topic screen; hardcoded English in JSX Text, not wrapped in t(). |
| 93 | M | prop:accessibilityLabel | Go back | preview.goBack | accessibilityLabel on the preview topic screen; hardcoded English not wrapped in t(). |

## `components/chrome/ModeSwitcher.tsx`  ·  4 violations

| Line | Sev | Kind | Literal | Suggested key | Why |
|---:|:--:|---|---|---|---|
| 116 | H | jsx | Couldn't switch. Tap to try again. | modeSwitcher.switchError | Visible error message rendered in a <Text> element inside an accessibilityRole='alert' view. Shown directly to users when mode switching fa… |
| 125 | H | jsx | Retry | modeSwitcher.retryButton | Visible button label rendered in <Text> on the error banner's retry button. Shown directly to all users. Not inside t(). |
| 122 | M | prop:accessibilityLabel | Retry mode switch | modeSwitcher.retryLabel | accessibilityLabel on the retry button is announced to screen-reader users. English-only hardcoded string, not inside t(). |
| 132 | M | prop:accessibilityLabel | Dismiss | modeSwitcher.dismissLabel | accessibilityLabel on the dismiss button is announced to screen-reader users. English-only hardcoded string, not inside t(). The visible ch… |

## `components/session/LivingBook.tsx`  ·  4 violations

| Line | Sev | Kind | Literal | Suggested key | Why |
|---:|:--:|---|---|---|---|
| 189 | H | jsx | page | session.livingBook.pageCount | The ternary `exchangeCount === 1 ? 'page' : 'pages'` produces visible text inside a <Text> component. Both 'page' and 'pages' are English l… |
| 140 | M | prop:accessibilityLabel | Your book is ready — tap to continue | session.livingBook.readyLabel | accessibilityLabel on a <Pressable accessibilityRole="button"> — announced by screen readers when the book is complete. Hardcoded English. |
| 141 | M | prop:accessibilityLabel | Book progress:  pages | session.livingBook.progressLabel | Template literal accessibilityLabel on a Pressable. The 'page'/'pages' pluralisation and surrounding text are hardcoded English read by scr… |
| 147 | M | prop:accessibilityLabel | Book progress:  pages | session.livingBook.progressLabel | accessibilityLabel on a non-pressable wrapper View with accessibilityRole="image" — also surfaced to screen readers. Same hardcoded English… |

## `components/session/SessionAccessories.tsx`  ·  4 violations

| Line | Sev | Kind | Literal | Suggested key | Why |
|---:|:--:|---|---|---|---|
| 176 | M | prop:accessibilityLabel | Add  as a new subject | session.accessories.addSubjectLabel | accessibilityLabel on a <Pressable accessibilityRole="button"> — read by screen readers. The surrounding 'Add … as a new subject' template … |
| 199 | M | prop:accessibilityLabel | Choose  | session.accessories.chooseSubjectLabel | accessibilityLabel on a <Pressable accessibilityRole="button"> — read by screen readers. The 'Choose ${subjectName}' template prefix is har… |
| 220 | M | prop:accessibilityLabel | Add  as a new subject | session.accessories.addSubjectLabel | accessibilityLabel on a <Pressable accessibilityRole="button"> for resolve suggestions. Same hardcoded English template as line 176. |
| 365 | M | prop:accessibilityLabel | Hide problem text | session.accessories.problemToggleLabel | Ternary accessibilityLabel ('Hide problem text' / 'Show problem text') on a <Pressable accessibilityRole="button">. Both states are hardcod… |

## `components/session/SessionInputModeToggle.tsx`  ·  4 violations

| Line | Sev | Kind | Literal | Suggested key | Why |
|---:|:--:|---|---|---|---|
| 54 | H | jsx | Text | session.inputMode.text | JSX text 'Text' rendered inside a visible <Text> element in the input mode toggle. Visible to all sighted users. Hardcoded English. |
| 85 | H | jsx | Voice | session.inputMode.voice | JSX text 'Voice' rendered inside a visible <Text> element in the input mode toggle. Visible to all sighted users. Hardcoded English. |
| 33 | M | prop:accessibilityLabel | Text mode | session.inputMode.textModeLabel | accessibilityLabel on <Pressable accessibilityRole="button"> for the text-mode toggle button. Announced by screen readers. Hardcoded Englis… |
| 63 | M | prop:accessibilityLabel | Voice mode | session.inputMode.voiceModeLabel | accessibilityLabel on <Pressable accessibilityRole="button"> for the voice-mode toggle button. Announced by screen readers. Hardcoded Engli… |

## `app/(app)/_subscription/_components/SubscriptionHeader.tsx`  ·  3 violations

| Line | Sev | Kind | Literal | Suggested key | Why |
|---:|:--:|---|---|---|---|
| 15 | H | jsx | Back | subscription.header.back | Rendered as a visible button label in <Text> on the subscription screen header. Not wrapped in t(). |
| 17 | H | jsx | Subscription | subscription.header.title | Rendered as an h2 screen title in <Text> on the subscription screen. Not wrapped in t(). |
| 12 | M | prop:accessibilityLabel | Go back | subscription.header.accessibilityBack | accessibilityLabel on the back Pressable, read by screen readers. Not wrapped in t(). Affects VoiceOver/TalkBack users in all non-English l… |

## `app/(app)/quiz/play.tsx`  ·  3 violations

| Line | Sev | Kind | Literal | Suggested key | Why |
|---:|:--:|---|---|---|---|
| 782 | H | jsx | {currentIndex + 1} of {totalQuestions} | quiz.play.questionProgress | Rendered directly in a <Text> element as the question progress indicator (e.g. '1 of 5'). The word 'of' is hardcoded English visible to all… |
| 812 | M | prop:accessibilityLabel | Elapsed time: ${elapsedSeconds} seconds | quiz.play.elapsedTimeLabel | accessibilityLabel with interpolated seconds value, read by screen readers. The template string is hardcoded English. |
| 1125 | M | prop:accessibilityLabel | Next question | quiz.play.nextQuestionLabel | accessibilityLabel on the Next Question button. The visible button text is already translated via t('quiz.play.nextQuestion') but the acces… |

## `app/(app)/topic/recall-test.tsx`  ·  3 violations

| Line | Sev | Kind | Literal | Suggested key | Why |
|---:|:--:|---|---|---|---|
| 217 | H | jsx | I don't remember. | recallTest.dontRememberMessage | Synthetic user message injected into the chat message list and rendered visibly in the recall test UI as if the user said it. |
| 217 | H | jsx | Still stuck. | recallTest.stillStuckMessage | Synthetic user message injected into the chat message list on second don't-remember tap; rendered visibly in the recall test UI. |
| 233 | H | jsx | Thanks for saying that honestly. Let's switch to review so this feels doable ag… | recallTest.redirectToReviewResponse | Animated bot response injected into the chat message list and rendered visibly in the recall test UI. |

## `components/home/EarlyAdopterCard.tsx`  ·  3 violations

| Line | Sev | Kind | Literal | Suggested key | Why |
|---:|:--:|---|---|---|---|
| 85 | H | jsx | Early user — your feedback shapes MentoMate | home.earlyAdopter.ctaText | Visible body copy rendered in <Text> inside the EarlyAdopterCard. EarlyAdopterCard has no useTranslation import. |
| 69 | M | prop:accessibilityLabel | Send feedback — your input shapes MentoMate | home.earlyAdopter.feedbackCtaLabel | EarlyAdopterCard has no useTranslation import. This accessibilityLabel is hardcoded English read by screen readers. |
| 94 | M | prop:accessibilityLabel | Dismiss | home.earlyAdopter.dismissLabel | accessibilityLabel on the dismiss button. EarlyAdopterCard has no useTranslation import. |

## `components/library/InlineNoteCard.tsx`  ·  3 violations

| Line | Sev | Kind | Literal | Suggested key | Why |
|---:|:--:|---|---|---|---|
| 49 | M | prop:accessibilityLabel | Note for ${topicTitle}. ${sourceLine}. Tap to ${expanded ? 'collapse' : 'expand… | library.inlineNoteCard.accessibilityLabel | Hardcoded English accessibility label on a Pressable read by screen readers. The template string embeds English words 'Note for', 'Tap to',… |
| 76 | M | prop:accessibilityLabel | Open source session for ${topicTitle} | library.inlineNoteCard.sourceLink.accessibilityLabel | Hardcoded English accessibility label on a Pressable link. 'Open source session for' is a hardcoded English prefix read by screen readers. |
| 120 | M | prop:accessibilityLabel | Note options for ${topicTitle} | library.inlineNoteCard.menuButton.accessibilityLabel | Hardcoded English accessibility label on the kebab-menu Pressable. 'Note options for' is English copy without i18n. |

## `app/(app)/child/[profileId]/session/[sessionId].tsx`  ·  2 violations

| Line | Sev | Kind | Literal | Suggested key | Why |
|---:|:--:|---|---|---|---|
| 47 | M | jsx | 1 min | child.session.durationOneMin | formatDuration() returns '1 min' for exactly 1 minute sessions; this value is rendered in the session detail UI. Hardcoded English abbrevia… |
| 47 | M | jsx | {mins} min | child.session.durationMins | formatDuration() returns this template for sessions > 1 minute; rendered in session detail UI. Hardcoded English. |

## `components/home/IntentCard.tsx`  ·  2 violations

| Line | Sev | Kind | Literal | Suggested key | Why |
|---:|:--:|---|---|---|---|
| 34 | M | prop:dismissLabel | Dismiss | common.dismiss | Default parameter value 'Dismiss' feeds directly into accessibilityLabel on the dismiss Pressable (line 123). IntentCard has no useTranslat… |
| 69 | M | prop:accessibilityHint | Opens this activity | home.intentCard.openHint | accessibilityHint rendered to screen-reader users. Hardcoded English. IntentCard has no useTranslation import. |

## `components/home/SubjectTile.tsx`  ·  2 violations

| Line | Sev | Kind | Literal | Suggested key | Why |
|---:|:--:|---|---|---|---|
| 73 | H | jsx | ${topicsCompleted}/${topicsTotal} topics | home.subjectTile.topicsCount | Visible caption rendered in <Text> inside SubjectTile. The 'topics' suffix is hardcoded English. No useTranslation in SubjectTile.tsx. |
| 37 | M | prop:accessibilityLabel | ${name}. ${hint}. ${topicsCompleted}/${topicsTotal} topics | home.subjectTile.accessibilityLabel | accessibilityLabel template literal with hardcoded English word 'topics'. No useTranslation in SubjectTile.tsx. |

## `components/library/CollapsibleChapter.tsx`  ·  2 violations

| Line | Sev | Kind | Literal | Suggested key | Why |
|---:|:--:|---|---|---|---|
| 58 | H | jsx | ${topics.length} / ${totalTopicCount} not started | library.chapter.topicsNotStarted | Visible secondary text rendered in <Text> inside the chapter header. The 'not started' suffix is hardcoded English. No useTranslation in Co… |
| 38 | M | prop:accessibilityLabel | ${title}, ${topics.length} of ${totalTopicCount} topics not started | library.chapter.accessibilityLabel | accessibilityLabel template literal with hardcoded English words 'of', 'topics', and 'not started'. No useTranslation in CollapsibleChapter… |

## `components/library/NoteDisplay.tsx`  ·  2 violations

| Line | Sev | Kind | Literal | Suggested key | Why |
|---:|:--:|---|---|---|---|
| 61 | M | prop:accessibilityLabel | Edit note | library.noteDisplay.editButton.accessibilityLabel | Hardcoded English accessibility label on the edit Pressable. Screen readers announce this string directly to users. |
| 79 | M | prop:accessibilityLabel | Delete note | library.noteDisplay.deleteButton.accessibilityLabel | Hardcoded English accessibility label on the delete Pressable. Screen readers announce this string directly to users. |

## `components/library/TopicPickerSheet.tsx`  ·  2 violations

| Line | Sev | Kind | Literal | Suggested key | Why |
|---:|:--:|---|---|---|---|
| 54 | H | jsx | Choose a topic | library.topicPickerSheet.title | Hardcoded English heading rendered in a <Text> element at the top of the topic picker modal sheet, directly visible to all users. |
| 40 | M | prop:accessibilityLabel | Close topic picker | library.topicPickerSheet.closeButton.accessibilityLabel | Hardcoded English accessibility label on the backdrop Pressable that dismisses the topic picker modal. Screen readers announce this to user… |

## `components/library/TopicProvenance.tsx`  ·  2 violations

| Line | Sev | Kind | Literal | Suggested key | Why |
|---:|:--:|---|---|---|---|
| 48 | H | jsx | From {childName} | library.topicProvenance.fromChild | The 'From ' prefix is hardcoded English rendered inside a badge <Text> element. childName is dynamic but the English word 'From' always ren… |
| 58 | H | jsx | Recently added | library.topicProvenance.recentlyAdded | Hardcoded English badge text rendered in a <Text> element visible to all users when a topic was added within the last 24 hours. |

## `components/onboarding/OnboardingStepIndicator.tsx`  ·  2 violations

| Line | Sev | Kind | Literal | Suggested key | Why |
|---:|:--:|---|---|---|---|
| 44 | H | jsx | Step ${activeStep} of ${safeTotalSteps} | onboarding.stepIndicator.label | Rendered in visible <Text> at line 43-45. Hardcoded English 'Step X of Y'. No useTranslation in the file. |
| 22 | M | prop:accessibilityLabel | Step ${activeStep} of ${safeTotalSteps} | onboarding.stepIndicator.accessibilityLabel | Hardcoded template in accessibilityLabel on the outer View at line 22. No useTranslation in the file. Screen readers announce this. |

## `components/session/QuestionCounter.tsx`  ·  2 violations

| Line | Sev | Kind | Literal | Suggested key | Why |
|---:|:--:|---|---|---|---|
| 18 | H | jsx | Question  | session.questionCounter.label | The text 'Question {count}' is rendered inside a visible <Text> element and seen by all sighted users. 'Question' is hardcoded English. |
| 15 | L | prop:accessibilityLabel | Question  | session.questionCounter.label | accessibilityLabel on a <View> without accessible={true} or accessibilityRole — not reliably a screen-reader element in RN. The English pre… |

## `components/session/VoiceToggle.tsx`  ·  2 violations

| Line | Sev | Kind | Literal | Suggested key | Why |
|---:|:--:|---|---|---|---|
| 23 | M | prop:accessibilityLabel | Mute AI voice | session.voiceToggle.muteLabel | accessibilityLabel on a Pressable toggle button, announced to screen-reader users. Hardcoded English not routed through t(). |
| 23 | M | prop:accessibilityLabel | Unmute AI voice | session.voiceToggle.unmuteLabel | accessibilityLabel on a Pressable toggle button, announced to screen-reader users. Hardcoded English not routed through t(). |

## `app/(app)/_layout.tsx`  ·  1 violation

| Line | Sev | Kind | Literal | Suggested key | Why |
|---:|:--:|---|---|---|---|
| 457 | H | prop:title | We could not load your profile | layout.profileLoadErrorTitle | Passed as `title` prop to ErrorFallback which renders it as a visible error screen heading. The same site uses t('common.retry') for its pr… |

## `app/(app)/child/[profileId]/topic/[topicId].tsx`  ·  1 violation

| Line | Sev | Kind | Literal | Suggested key | Why |
|---:|:--:|---|---|---|---|
| 44 | M | jsx | <1 min | child.topic.durationLessThanOneMin | formatDuration() returns '<1 min' for very short sessions, used in formatTimeOnApp() which renders to a <Text> via t() interpolation. The r… |

## `app/(app)/child/[profileId]/weekly-report/[weeklyReportId].tsx`  ·  1 violation

| Line | Sev | Kind | Literal | Suggested key | Why |
|---:|:--:|---|---|---|---|
| 33 | L | jsx | Weekly report | child.weeklyReport.titleFallback | formatWeeklyReportRange() returns 'Weekly report' when the weekStart date is invalid. The return value is rendered in a <Text className="te… |

## `app/(app)/dictation/playback.tsx`  ·  1 violation

| Line | Sev | Kind | Literal | Suggested key | Why |
|---:|:--:|---|---|---|---|
| 255 | M | prop:accessibilityLabel | Dismiss | dictation.playback.dismissModal | An accessibilityLabel is read aloud by screen readers (VoiceOver/TalkBack) to users and must be localized. Every other accessibilityLabel i… |

## `app/(app)/progress/weekly-report/[weeklyReportId].tsx`  ·  1 violation

| Line | Sev | Kind | Literal | Suggested key | Why |
|---:|:--:|---|---|---|---|
| 22 | L | jsx | Weekly report | progress.weeklyReport.titleFallback | formatWeeklyReportRange() returns this hardcoded English string as a fallback when the weekStart date is invalid (NaN). Its return value is… |

## `app/(app)/quiz/index.tsx`  ·  1 violation

| Line | Sev | Kind | Literal | Suggested key | Why |
|---:|:--:|---|---|---|---|
| 283 | L | prop:displayLanguage | Language | quiz.index.languageFallback | The 'Language' string is the last-resort fallback for displayLanguage, which is interpolated directly into translated strings such as t('qu… |

## `app/create-subject.tsx`  ·  1 violation

| Line | Sev | Kind | Literal | Suggested key | Why |
|---:|:--:|---|---|---|---|
| 923 | M | prop:accessibilityLabel | Choose ${suggestion.name} | subject.chooseSuggestionLabel | The accessibilityLabel is a template literal `Choose ${suggestion.name}...` — the 'Choose ' prefix is hardcoded English read by screen read… |

## `components/coaching/BaseCoachingCard.tsx`  ·  1 violation

| Line | Sev | Kind | Literal | Suggested key | Why |
|---:|:--:|---|---|---|---|
| 29 | M | prop:accessibilityLabel | Loading mentor card | coaching.card.loadingLabel | accessibilityLabel on the skeleton loading state is read aloud by screen readers to users. It is English-only hardcoded copy, not inside t(… |

## `components/common/UsageMeter.tsx`  ·  1 violation

| Line | Sev | Kind | Literal | Suggested key | Why |
|---:|:--:|---|---|---|---|
| 47 | M | prop:accessibilityLabel | Usage: ${used} of ${limit} questions used | usageMeter.accessibilityLabel | This accessibilityLabel is on a progressbar-role View and is announced verbatim to screen-reader users (VoiceOver/TalkBack). The file has n… |

## `components/home/CoachBand.tsx`  ·  1 violation

| Line | Sev | Kind | Literal | Suggested key | Why |
|---:|:--:|---|---|---|---|
| 75 | M | prop:accessibilityLabel | Dismiss recommendation | home.coachBand.dismissLabel | CoachBand imports useTranslation and uses t() for some strings (e.g. common.continue), but this accessibilityLabel is still a hardcoded Eng… |

## `components/library/LibrarySearchBar.tsx`  ·  1 violation

| Line | Sev | Kind | Literal | Suggested key | Why |
|---:|:--:|---|---|---|---|
| 38 | M | prop:accessibilityLabel | Clear search | library.searchBar.clearButton.accessibilityLabel | Hardcoded English accessibility label on the clear-search Pressable. No t() call wraps this string. |

## `components/library/RetentionPill.tsx`  ·  1 violation

| Line | Sev | Kind | Literal | Suggested key | Why |
|---:|:--:|---|---|---|---|
| 68 | M | prop:accessibilityLabel | Memory check: ${elapsedLabel ? `${label}, ${elapsedLabel}` : label} | library.retentionPill.accessibilityLabel | The 'Memory check: ' prefix is hardcoded English. Although label and elapsedLabel are produced via t(), the enclosing template string is no… |

## `components/library/SessionRow.tsx`  ·  1 violation

| Line | Sev | Kind | Literal | Suggested key | Why |
|---:|:--:|---|---|---|---|
| 35 | M | prop:accessibilityLabel | , has note | library.sessionRow.hasNote.accessibilityFragment | ', has note' is a hardcoded English fragment injected into the accessibility label of a Pressable row. Screen readers announce this verbati… |

## `components/library/TopicHeader.tsx`  ·  1 violation

| Line | Sev | Kind | Literal | Suggested key | Why |
|---:|:--:|---|---|---|---|
| 102 | H | jsx | This topic covers | library.topicHeader.descriptionLabel | Hardcoded English heading rendered in a <Text> element inside the topic description card, directly visible to all users. |

## `components/progress/RecentSessionsList.tsx`  ·  1 violation

| Line | Sev | Kind | Literal | Suggested key | Why |
|---:|:--:|---|---|---|---|
| 30 | M | jsx | <1 min | progress.duration.lessThanOneMin | Returned from formatDuration() and rendered as duration text in the UI. Not wrapped in t(). Users see this string when a session lasted les… |

## `components/progress/RetentionSignal.tsx`  ·  1 violation

| Line | Sev | Kind | Literal | Suggested key | Why |
|---:|:--:|---|---|---|---|
| 75 | M | prop:accessibilityLabel | Review status: ${displayLabel} | progress.retention.reviewStatusAccessibilityLabel | The 'Review status: ' prefix is a hardcoded English string prepended to the translated displayLabel. While displayLabel itself goes through… |

## `components/session/MilestoneDots.tsx`  ·  1 violation

| Line | Sev | Kind | Literal | Suggested key | Why |
|---:|:--:|---|---|---|---|
| 28 | M | prop:accessibilityLabel | 1 milestone reached | session.milestones.reachedLabel | The View has explicit accessible={true} and accessibilityRole="text", making it a proper screen-reader element. The label strings '1 milest… |

## `components/session/SessionTimer.tsx`  ·  1 violation

| Line | Sev | Kind | Literal | Suggested key | Why |
|---:|:--:|---|---|---|---|
| 34 | M | prop:accessibilityLabel | Session time: ${formatTime(elapsed)} | session.timer.accessibilityLabel | accessibilityLabel on a View is read by screen readers to real users. The template includes a dynamic time value but the surrounding Englis… |

