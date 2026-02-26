# UI Server Actions – inventering

Alla server actions ligger i `/workspace/web/src/actions/`. Det finns inga `actions.ts` under `web/src/app/*/`.

---

## Projekt

| Action | Fil | Beskrivning |
|--------|-----|-------------|
| getProjects | projects.ts | Listar projekt för tenant (med sök/status); admins ser alla, övriga bara projekt där de är medlemmar |
| createProject | projects.ts | Skapar nytt projekt |
| getProject | projects.ts | Hämtar ett projekts detaljer |
| updateProject | projects.ts | Uppdaterar projekt (namn, beskrivning, adress, status) |
| archiveProject | projects.ts | Arkiverar projekt |
| addProjectMember | projects.ts | Lägger till medlem i projekt |
| removeProjectMember | projects.ts | Tar bort medlem från projekt |

---

## Uppgifter

| Action | Fil | Beskrivning |
|--------|-----|-------------|
| getTasks | tasks.ts | Hämtar alla uppgifter för ett projekt (med tilldelningar) |
| createTask | tasks.ts | Skapar ny uppgift |
| updateTask | tasks.ts | Uppdaterar uppgift (titel, beskrivning, prioritet, status, deadline) |
| updateTaskStatus | tasks.ts | Uppdaterar endast uppgiftens status |
| assignTask | tasks.ts | Tilldelar uppgift till medlem |
| unassignTask | tasks.ts | Tar bort tilldelning från uppgift |
| deleteTask | tasks.ts | Raderar uppgift |

---

## Tidsrapportering

| Action | Fil | Beskrivning |
|--------|-----|-------------|
| createTimeEntry | time-entries.ts | Skapar tidsrapport (task/project, minuter, datum, typ, beskrivning) |
| getTimeEntriesByProject | time-entries.ts | Hämtar tidsrapporter för ett projekt |
| getMyTimeEntries | time-entries.ts | Hämtar användarens egna tidsrapporter |
| getMyTimeEntriesGrouped | time-entries.ts | Hämtar användarens tidsrapporter grupperade (t.ex. per datum) |
| updateTimeEntry | time-entries.ts | Uppdaterar tidsrapport |
| deleteTimeEntry | time-entries.ts | Raderar tidsrapport |
| getProjectTimeSummary | time-entries.ts | Hämtar tidsöversikt för projekt (per typ, uppgift, person, dag, vecka) |

---

## Filer (projekt & uppladdning)

| Action | Fil | Beskrivning |
|--------|-----|-------------|
| prepareFileUpload | files.ts | Förbereder uppladdning (presigned URL etc.) |
| completeFileUpload | files.ts | Slutför uppladdning efter upload till MinIO |
| uploadFile | files.ts | Enkel uppladdning (formData → MinIO) |
| getProjectFiles | files.ts | Hämtar filer för ett projekt |
| getFiles | files.ts | Hämtar filer (generell) |
| deleteFile | files.ts | Raderar fil |
| getFilePreviewData | files.ts | Hämtar förhandsgranskningsdata för fil |
| getFileOcrText | files.ts | Hämtar OCR-text för fil |
| fillTemplate | files.ts | Fyller dokumentmall med data |
| saveEditedExcel | files.ts | Sparar redigerad Excel-fil |

---

## E-post (konversationer & skicka)

| Action | Fil | Beskrivning |
|--------|-----|-------------|
| getConversations | email-conversations.ts | Listar e-postkonversationer |
| getEmailUnreadCount | email-conversations.ts | Hämtar antal olästa e-postkonversationer |
| getConversation | email-conversations.ts | Hämtar en konversation med meddelanden |
| createConversation | email-conversations.ts | Skapar ny e-postkonversation |
| replyToConversation | email-conversations.ts | Svarar i en konversation |
| markConversationAsRead | email-conversations.ts | Markerar konversation som läst |
| archiveConversation | email-conversations.ts | Arkiverar konversation |
| sendExternalEmail | send-email.ts | Skickar e-post till extern mottagare |
| sendToTeamMember | send-email.ts | Skickar e-post till teammedlem |
| sendToTeamMembers | send-email.ts | Skickar e-post till flera teammedlemmar |
| getTeamMembersForEmail | send-email.ts | Hämtar teammedlemmar för e-postval |
| getProjectsWithMembersForEmail | send-email.ts | Hämtar projekt med medlemmar för e-postval |

---

## E-postmallar

| Action | Fil | Beskrivning |
|--------|-----|-------------|
| listEmailTemplates | email-templates.ts | Listar e-postmallar |
| getEmailTemplate | email-templates.ts | Hämtar en mall |
| updateEmailTemplate | email-templates.ts | Uppdaterar mall |
| resetEmailTemplate | email-templates.ts | Återställer mall till standard |
| previewEmailTemplate | email-templates.ts | Förhandsgranskar mall |
| aiEditEmailTemplate | email-templates.ts | AI-redigering av mall |

---

## Användare / medlemmar / inbjudan

| Action | Fil | Beskrivning |
|--------|-----|-------------|
| inviteUser | invitations.ts | Bjuder in användare till tenant |
| getInvitations | invitations.ts | Listar väntande inbjudningar |
| cancelInvitation | invitations.ts | Avbryter inbjudan |
| getInvitationInfo | invitations.ts | Hämtar info för att acceptera inbjudan |
| acceptInvitation | invitations.ts | Accepterar inbjudan (befintlig användare) |
| acceptInvitationWithRegistration | invitations.ts | Accepterar inbjudan med nyregistrering |
| getTenantMembers | settings.ts | Hämtar tenant-medlemmar |
| updateMembershipRole | settings.ts | Uppdaterar medlems roll |
| removeMembership | settings.ts | Tar bort medlem från tenant |
| getRolePermissions | settings.ts | Hämtar rollbehörigheter |
| updateRolePermissions | settings.ts | Uppdaterar behörigheter för en roll |
| isCurrentUserAdmin | settings.ts | Returnerar om inloggad användare är admin |

---

## Inställningar (tenant & profil)

| Action | Fil | Beskrivning |
|--------|-----|-------------|
| getTenantSettings | settings.ts | Hämtar tenant-inställningar (namn, org.nr, adress) |
| updateTenant | settings.ts | Uppdaterar tenant (namn, org.nr, adress) |
| getCurrentUserProfile | profile.ts | Hämtar inloggad användares profil |
| updateProfile | profile.ts | Uppdaterar profil (formData) |
| changePassword | profile.ts | Byter lösenord |
| updateUserLocale | profile.ts | Uppdaterar användarens språk (sv/en) |
| prepareProfileImageUpload | profile.ts | Förbereder uppladdning av profilbild |
| completeProfileImageUpload | profile.ts | Slutför uppladdning av profilbild |

---

## Fakturering / prenumeration

| Action | Fil | Beskrivning |
|--------|-----|-------------|
| getSubscription | subscription.ts | Hämtar tenantens Stripe-prenumeration |
| createCheckoutSession | subscription.ts | Skapar Stripe Checkout-session (priceId) |
| createBillingPortalSession | subscription.ts | Skapar Stripe Billing Portal-session |
| getMemberCount | subscription.ts | Hämtar antal medlemmar (för quantity) |
| checkSubscriptionAccess | subscription.ts | Kontrollerar om tenant har aktiv prenumeration |
| updateSubscriptionQuantity | subscription.ts | Uppdaterar prenumerationsantal (sits) |
| syncSubscriptionQuantityForTenant | subscription.ts | Synkar prenumerationsantal för tenant (intern) |

---

## Kommentarer

| Action | Fil | Beskrivning |
|--------|-----|-------------|
| getComments | comments.ts | Hämtar kommentarer (generellt) |
| getCommentsByTask | comments.ts | Hämtar kommentarer för en uppgift |
| createComment | comments.ts | Skapar kommentar |
| updateComment | comments.ts | Uppdaterar kommentar |
| deleteComment | comments.ts | Raderar kommentar |

---

## Anteckningar (projekt)

| Action | Fil | Beskrivning |
|--------|-----|-------------|
| createNote | notes.ts | Skapar anteckning |
| getNotes | notes.ts | Hämtar anteckningar för projekt |
| getNote | notes.ts | Hämtar en anteckning |
| updateNote | notes.ts | Uppdaterar anteckning |
| deleteNote | notes.ts | Raderar anteckning |
| toggleNotePin | notes.ts | Fäst/avfäst anteckning |
| getNoteAttachments | notes.ts | Hämtar bilagor till anteckning |
| attachFileToNote | notes.ts | Kopplar fil till anteckning |
| detachFileFromNote | notes.ts | Tar bort fil från anteckning |

---

## Anteckningskategorier

| Action | Fil | Beskrivning |
|--------|-----|-------------|
| getNoteCategories | note-categories.ts | Hämtar anteckningskategorier (projekt eller null) |
| createNoteCategory | note-categories.ts | Skapar kategori |
| updateNoteCategory | note-categories.ts | Uppdaterar kategori |
| deleteNoteCategory | note-categories.ts | Raderar kategori |

---

## Personliga anteckningar & filer

| Action | Fil | Beskrivning |
|--------|-----|-------------|
| getPersonalNotes | personal.ts | Hämtar personliga anteckningar |
| createPersonalNote | personal.ts | Skapar personlig anteckning |
| updatePersonalNote | personal.ts | Uppdaterar personlig anteckning |
| deletePersonalNote | personal.ts | Raderar personlig anteckning |
| togglePersonalNotePin | personal.ts | Fäst/avfäst personlig anteckning |
| getPersonalFiles | personal.ts | Hämtar personliga filer |
| getPersonalFilesWithUrls | personal.ts | Hämtar personliga filer med presigned URLs |
| deletePersonalFile | personal.ts | Raderar personlig fil |
| moveProjectFileToPersonal | personal.ts | Flyttar projektfil till personligt |
| preparePersonalFileUpload | personal.ts | Förbereder uppladdning av personlig fil |
| completePersonalFileUpload | personal.ts | Slutför uppladdning av personlig fil |
| getPersonalNoteAttachments | personal.ts | Hämtar bilagor till personlig anteckning |
| attachFileToPersonalNote | personal.ts | Kopplar fil till personlig anteckning |
| detachFileFromPersonalNote | personal.ts | Tar bort fil från personlig anteckning |

---

## Inköpslistor

| Action | Fil | Beskrivning |
|--------|-----|-------------|
| createShoppingList | shopping-list.ts | Skapar inköpslista |
| updateShoppingList | shopping-list.ts | Uppdaterar inköpslista |
| deleteShoppingList | shopping-list.ts | Raderar inköpslista |
| addShoppingListItem | shopping-list.ts | Lägger till rad i inköpslista |
| updateShoppingListItem | shopping-list.ts | Uppdaterar rad |
| toggleShoppingListItem | shopping-list.ts | Kryssar av/avkryssar rad |
| deleteShoppingListItem | shopping-list.ts | Raderar rad |
| getShoppingList | shopping-list.ts | Hämtar en inköpslista |
| getShoppingLists | shopping-list.ts | Listar inköpslistor |

---

## Offerter

| Action | Fil | Beskrivning |
|--------|-----|-------------|
| generateQuotePdf | quotes.ts | Genererar offert-PDF |
| createQuote | quotes.ts | Skapar offert |
| updateQuote | quotes.ts | Uppdaterar offert |
| addQuoteItem | quotes.ts | Lägger till rad på offert |
| updateQuoteItem | quotes.ts | Uppdaterar rad |
| deleteQuoteItem | quotes.ts | Raderar rad |
| updateQuoteStatus | quotes.ts | Uppdaterar offertens status |
| deleteQuote | quotes.ts | Raderar offert |

---

## Automatiseringar

| Action | Fil | Beskrivning |
|--------|-----|-------------|
| createAutomation | automations.ts | Skapar automation |
| listAutomations | automations.ts | Listar automationer |
| getAutomation | automations.ts | Hämtar en automation |
| updateAutomation | automations.ts | Uppdaterar automation |
| deleteAutomation | automations.ts | Raderar automation |
| pauseAutomation | automations.ts | Pausar automation |
| resumeAutomation | automations.ts | Återupptar automation |

---

## Dokumentmallar

| Action | Fil | Beskrivning |
|--------|-----|-------------|
| listDocumentTemplates | document-templates.ts | Listar dokumentmallar |
| getDocumentTemplate | document-templates.ts | Hämtar en mall |
| createDocumentTemplate | document-templates.ts | Skapar mall |
| updateDocumentTemplate | document-templates.ts | Uppdaterar mall |
| deleteDocumentTemplate | document-templates.ts | Raderar mall |

---

## AI-konversationer

| Action | Fil | Beskrivning |
|--------|-----|-------------|
| getProjectConversations | conversations.ts | Hämtar projektets AI-konversationer |
| getPersonalConversations | conversations.ts | Hämtar användarens personliga AI-konversationer |
| getUnreadAiMessageCount | conversations.ts | Hämtar antal olästa AI-meddelanden |
| getConversationWithMessages | conversations.ts | Hämtar konversation med meddelanden |

---

## Dashboard & briefing

| Action | Fil | Beskrivning |
|--------|-----|-------------|
| getDailyBriefing | briefing.ts | Hämtar dagens briefing |
| getMyTasks | dashboard.ts | Hämtar användarens uppgifter |
| getMyTasksToday | dashboard.ts | Hämtar användarens uppgifter för idag |
| getRecentActivity | dashboard.ts | Hämtar senaste aktivitet |
| getMyNotifications | dashboard.ts | Hämtar användarens notifikationer |
| markNotificationRead | dashboard.ts | Markerar notifikation som läst |
| markAllNotificationsRead | dashboard.ts | Markerar alla notifikationer som lästa |

---

## Notifikationer

| Action | Fil | Beskrivning |
|--------|-----|-------------|
| getNotifications | notifications.ts | Hämtar notifikationer (med limit) |
| createNotification | notifications.ts | Skapar notifikation (intern) |
| markNotificationRead | notifications.ts | Markerar notifikation som läst |
| markAllNotificationsRead | notifications.ts | Markerar alla som lästa |
| getUserNotificationPreferences | notifications.ts | Hämtar användarens notifieringsinställningar |
| updateNotificationPreferences | notifications.ts | Uppdaterar notifieringsinställningar |

---

## Notifieringsinställningar (push / prefs)

| Action | Fil | Beskrivning |
|--------|-----|-------------|
| getNotificationPreferences | notification-preferences.ts | Hämtar notifieringspreferenser |
| updateNotificationPreferences | notification-preferences.ts | Uppdaterar preferenser |
| upsertPushSubscription | notification-preferences.ts | Registrerar/uppdaterar web push-prenumeration |
| removePushSubscription | notification-preferences.ts | Tar bort push-prenumeration |

---

## Sök & export

| Action | Fil | Beskrivning |
|--------|-----|-------------|
| globalSearch | search.ts | Global sökning (projekt, uppgifter, filer, etc.) |
| getProjectContext | project-context.ts | Hämtar projektkontext (för AI etc.) |
| getActivityLog | activity-log.ts | Hämtar aktivitetslogg för projekt (filtrerad, paginerad) |
| exportProjectSummaryPdf | export.ts | Exporterar projektsammanfattning som PDF |
| exportTimeReportExcel | export.ts | Exporterar tidsrapport som Excel |
| exportTaskListExcel | export.ts | Exporterar uppgiftslista som Excel |

---

## Auth (ej tenant-scoped)

| Action | Fil | Beskrivning |
|--------|-----|-------------|
| registerUser | auth.ts | Registrerar ny användare |
| loginUser | auth.ts | Inloggning (credentials) |
| requestPasswordReset | auth.ts | Begär lösenordsåterställning |
| resetPassword | auth.ts | Återställ lösenord med token |

---

## Discord

| Action | Fil | Beskrivning |
|--------|-----|-------------|
| getDiscordSettings | discord.ts | Hämtar Discord-inställningar för tenant |
| connectDiscordServer | discord.ts | Kopplar Discord-server |
| disconnectDiscordServer | discord.ts | Kopplar från Discord-server |
| toggleDiscordBot | discord.ts | Aktiverar/inaktiverar bot |
| getLinkedUsers | discord.ts | Hämtar användare kopplade till Discord |
| getDiscordCategories | discord.ts | Hämtar Discord-kategorier (kanaler) |
| createDiscordCategory | discord.ts | Skapar Discord-kategori |
| updateDiscordCategory | discord.ts | Uppdaterar Discord-kategori |
| deleteDiscordCategory | discord.ts | Raderar Discord-kategori |
| getDiscordRoleMappings | discord.ts | Hämtar rollmappningar Discord ↔ tenant |
| updateRoleMapping | discord.ts | Uppdaterar rollmappning |
| syncRoles | discord.ts | Synkar roller från Discord |

---

*Genererad från `/workspace/web/src/actions/`. Inga `app/*/actions.ts` används.*
