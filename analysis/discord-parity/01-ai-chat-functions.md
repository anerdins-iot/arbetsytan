# AI-chatt funktioner (webb)

Inventering av alla verktyg/funktioner som personlig AI-chatt i webben har tillgång till. Källa: `web/src/lib/ai/shared-core.ts` (buildToolSchemas) och `web/src/lib/ai/tools/personal-tools.ts` (createPersonalTools).

**Endpoint:** `POST /api/ai/chat` → `executeAIChat` → `buildToolSchemas` → `createPersonalTools()` + eventuellt `web_search`.

**OBS:** Systemprompten nämner verktyget `getUnreadAIMessages` för olästa meddelanden från projekt-AI:er, men det verktyget finns **inte** i den returnerade verktygslistan. Olästa notifieringar kan hämtas med `getNotifications` (parametern `unreadOnly`).

---

## Provider-specifikt verktyg

1. **web_search** (endast när provider är CLAUDE_HAIKU eller CLAUDE_SONNET)
   - Webbsökning via Anthropic. Används för aktuell information från internet.
   - Parametrar: (hanteras av Anthropic SDK, maxUses: 10, blockedDomains för sociala medier m.m.)

---

## Projektlista och hantering

2. **getProjectList**
   - Hämta listan över projekt som användaren är medlem i (id, namn, status).
   - Parametrar: (ingen obligatorisk)

3. **getProjectDetail**
   - Hämta detaljerad information om ett projekt (task-status, medlemmar, tillgängliga medlemmar).
   - Parametrar: `projectId`

4. **createProject**
   - Skapa ett nytt projekt. Kräver behörighet. Namn, valfritt beskrivning och adress.
   - Parametrar: `name`, `description` (valfritt), `address` (valfritt)

5. **updateProject**
   - Uppdatera projektinformation. Ange de fält som ska ändras.
   - Parametrar: `projectId`, `name`, `description`, `status` (ACTIVE | PAUSED | COMPLETED), `address` (valfria)

6. **archiveProject**
   - Arkivera ett projekt (status ARCHIVED). Kräver bekräftelse.
   - Parametrar: `projectId`, `confirmArchive` (måste vara true)

---

## Uppgifter (Tasks)

7. **getUserTasks**
   - Hämta användarens uppgifter från alla projekt (status, prioritet, deadline, tilldelning).
   - Parametrar: `limit` (valfritt, default 30)

8. **getProjectTasks**
   - Hämta alla uppgifter i ett specifikt projekt.
   - Parametrar: `projectId`, `limit` (valfritt, default 50)

9. **createTask**
   - Skapa ny uppgift i ett projekt.
   - Parametrar: `projectId`, `title`, `description`, `priority` (LOW|MEDIUM|HIGH|URGENT), `deadline` (valfritt, ISO)

10. **updateTask**
    - Uppdatera befintlig uppgift.
    - Parametrar: `projectId`, `taskId`, `title`, `description`, `status` (TODO|IN_PROGRESS|DONE), `priority`, `deadline` (valfria)

11. **assignTask**
    - Tilldela uppgift till projektmedlem.
    - Parametrar: `projectId`, `taskId`, `membershipId`

12. **unassignTask**
    - Ta bort tilldelning från uppgift.
    - Parametrar: `projectId`, `taskId`, `membershipId`

13. **deleteTask**
    - Ta bort uppgift permanent. Kräver bekräftelse i chatten.
    - Parametrar: `projectId`, `taskId`

---

## Kommentarer

14. **getTaskComments**
    - Hämta alla kommentarer för en uppgift.
    - Parametrar: `projectId`, `taskId`

15. **createComment**
    - Skapa kommentar på en uppgift.
    - Parametrar: `projectId`, `taskId`, `content`

16. **updateComment**
    - Uppdatera befintlig kommentar.
    - Parametrar: `projectId`, `commentId`, `content`

17. **deleteComment**
    - Ta bort kommentar.
    - Parametrar: `projectId`, `commentId`

---

## Tidrapportering

18. **getProjectTimeEntries**
    - Hämta tidsrapporter i ett projekt.
    - Parametrar: `projectId`, `limit` (valfritt)

19. **createTimeEntry**
    - Skapa tidsrapport. Kan kopplas till projekt och/eller uppgift.
    - Parametrar: `projectId`, `taskId`, `minutes` eller `hours`, `date` (YYYY-MM-DD), `description`, `entryType` (WORK|VACATION|SICK|VAB|PARENTAL|EDUCATION|OTHER)

20. **smartLogTime**
    - Smart tidrapportering från naturlig text (extraherar tid, datum, beskrivning och matchar uppgifter).
    - Parametrar: `projectId`, `text`

21. **updateTimeEntry**
    - Uppdatera befintlig tidsrapport.
    - Parametrar: `projectId`, `timeEntryId`, `taskId`, `minutes`/`hours`, `date`, `description` (valfria)

22. **deleteTimeEntry**
    - Ta bort tidsrapport. Kräver bekräftelse.
    - Parametrar: `projectId`, `timeEntryId`

23. **getProjectTimeSummary**
    - Sammanfattning av registrerad tid i projekt (total, per uppgift, per person, per vecka).
    - Parametrar: `projectId`

24. **getMyTimeEntries**
    - Hämta användarens egna tidsrapporter från alla projekt.
    - Parametrar: `limit` (valfritt, default 50)

---

## Rapporter och dokumentgenerering

25. **generateProjectReport**
    - Generera automatisk projektrapport (PDF). Hämtar uppgifter, tid, medlemmar och skapar AI-sammanfattning. Kräver OPENAI_API_KEY.
    - Parametrar: `projectId`, `reportType` (weekly|monthly|custom), `dateRange` (valfritt för custom)

26. **createReport**
    - Skapa rapport med förhandsgranskning och redigeringsmöjlighet (användaren kan granska innan PDF).
    - Parametrar: (definieras i tool – projectId, rapporttyp, datum etc.)

27. **generatePdf**
    - Generera PDF-dokument från innehåll.
    - Parametrar: (enligt shared-tools)

28. **generateExcel**
    - Generera Excel-fil från data.
    - Parametrar: (enligt shared-tools)

29. **generateWord**
    - Generera Word-dokument.
    - Parametrar: (enligt shared-tools)

30. **readExcelFile**
    - Läsa innehåll från befintlig Excel-fil.
    - Parametrar: `projectId` eller personlig fil, `fileId`

31. **editExcelFile**
    - Redigera befintlig Excel-fil.
    - Parametrar: (enligt shared-tools)

32. **readWordFile**
    - Läsa innehåll från Word-fil.
    - Parametrar: (enligt shared-tools)

33. **analyzeDocumentTemplate**
    - Analysera Word-mall (docxtemplater) för tillgängliga placeholders.
    - Parametrar: (enligt shared-tools)

34. **fillDocumentTemplate**
    - Fylla i Word-mall med data.
    - Parametrar: (enligt shared-tools)

35. **listDocumentTemplates**
    - Lista tillgängliga dokumentmallar.
    - Parametrar: (enligt shared-tools)

36. **getTemplateDetails**
    - Hämta detaljer för en specifik mall.
    - Parametrar: (enligt shared-tools)

---

## Filer

37. **listFiles** (exponeras även som **getProjectFiles**)
    - Lista filer i ett projekt (id, namn, typ, storlek, datum, analyser). Bildfiler får previewUrl.
    - Parametrar: `projectId`, `limit` (valfritt)

38. **deleteFile**
    - Radera fil från projekt permanent. Kräver bekräftelse.
    - Parametrar: `projectId`, `fileId`

39. **getPersonalFiles**
    - Hämta användarens personliga filer.
    - Parametrar: `limit` (valfritt)

40. **getFilePreviewUrl**
    - Hämta förhandsgransknings-URL för fil (för visning i chatten med markdown-bild).
    - Parametrar: `fileId`, `projectId` (valfritt för projektfil)

41. **searchFiles**
    - Semantisk sökning i dokument över alla projekt + personliga filer (OCR-text).
    - Parametrar: `query`, `limit` (valfritt, default 8)

42. **analyzeDocument**
    - OCR-analys av PDF/ritning i projekt. Returnerar extraherad text.
    - Parametrar: `projectId`, `fileId`

43. **analyzePersonalFile**
    - OCR-text för personlig fil.
    - Parametrar: `fileId`

44. **analyzeImage**
    - Analysera bild med vision-modell (beskrivning, text i bild).
    - Parametrar: `fileId`, `projectId` (valfritt), `prompt` (valfritt)

45. **movePersonalFileToProject**
    - Flytta personlig fil till projekt.
    - Parametrar: `fileId`, `projectId`, `deleteOriginal` (valfritt)

46. **moveProjectFileToPersonal**
    - Flytta projektfil till personliga filer.
    - Parametrar: `projectId`, `fileId`

47. **deletePersonalFile**
    - Radera personlig fil. Kräver bekräftelse.
    - Parametrar: `fileId`

---

## Projektmedlemmar

48. **listMembers**
    - Hämta medlemmar i ett projekt (namn, e-post, membershipId).
    - Parametrar: `projectId`

49. **getAvailableMembers**
    - Hämta teammedlemmar som kan läggas till i projektet.
    - Parametrar: `projectId`

50. **addMember**
    - Lägg till teammedlem i projekt.
    - Parametrar: `projectId`, `membershipId`

51. **removeMember**
    - Ta bort medlem från projekt.
    - Parametrar: `projectId`, `membershipId`

---

## Inbjudningar

52. **sendInvitation**
    - Skicka inbjudan till ny användare via e-post. Endast admins.
    - Parametrar: `email`, (övriga enligt action)

53. **listInvitations**
    - Lista skickade inbjudningar och status (ADMIN).
    - Parametrar: (enligt tool)

54. **cancelInvitation**
    - Avbryt/ta bort skickad inbjudan som inte accepterats (ADMIN).
    - Parametrar: (enligt tool)

---

## Projektanteckningar

55. **getProjectNotes**
    - Lista anteckningar i ett projekt.
    - Parametrar: `projectId`, `limit` (valfritt), kategori (valfritt)

56. **createNote** (implementeras som createProjectNote)
    - Skapa projektanteckning.
    - Parametrar: `projectId`, `content`, `title`, `category` (valfria)

57. **updateNote** (updateProjectNote)
    - Uppdatera projektanteckning.
    - Parametrar: `projectId`, `noteId`, `content`, `title`, `category` (valfria)

58. **deleteNote** (deleteProjectNote)
    - Ta bort projektanteckning. Kräver bekräftelse.
    - Parametrar: `projectId`, `noteId`

59. **toggleNotePin**
    - Fästa eller lossa projektanteckning.
    - Parametrar: `projectId`, `noteId`

60. **searchNotes** (searchProjectNotes)
    - Sök i projektanteckningar.
    - Parametrar: `projectId`, `query`, `limit` (valfritt)

61. **getNoteAttachments**
    - Hämta bilagor till projektanteckning.
    - Parametrar: `projectId`, `noteId`

62. **attachFileToNote**
    - Koppla fil till projektanteckning.
    - Parametrar: `projectId`, `noteId`, `fileId`

63. **detachFileFromNote**
    - Ta bort bilaga från projektanteckning.
    - Parametrar: `projectId`, `noteId`, `fileId`

---

## Personliga anteckningar

64. **getPersonalNotes**
    - Lista personliga anteckningar.
    - Parametrar: `limit` (valfritt), kategori (valfritt)

65. **createPersonalNote**
    - Skapa personlig anteckning.
    - Parametrar: `content`, `title`, `category` (valfria)

66. **updatePersonalNote**
    - Uppdatera personlig anteckning.
    - Parametrar: `noteId`, `content`, `title`, `category` (valfria)

67. **deletePersonalNote**
    - Ta bort personlig anteckning. Kräver bekräftelse.
    - Parametrar: `noteId`

68. **togglePersonalNotePin**
    - Fästa eller lossa personlig anteckning.
    - Parametrar: `noteId`

69. **searchPersonalNotes**
    - Sök i personliga anteckningar.
    - Parametrar: `query`, `limit` (valfritt)

70. **getPersonalNoteAttachments**
    - Hämta bilagor till personlig anteckning.
    - Parametrar: `noteId`

71. **attachFileToPersonalNote**
    - Koppla fil till personlig anteckning.
    - Parametrar: `noteId`, `fileId`

72. **detachFileFromPersonalNote**
    - Ta bort bilaga från personlig anteckning.
    - Parametrar: `noteId`, `fileId`

---

## Anteckningskategorier

73. **listNoteCategories**
    - Lista anteckningskategorier (projekt eller personliga).
    - Parametrar: `projectId` (valfritt för personliga)

74. **createNoteCategory**
    - Skapa anteckningskategori.
    - Parametrar: `name`, `projectId` (valfritt)

75. **updateNoteCategory**
    - Uppdatera kategori. Namn normaliseras till inledande versal.
    - Parametrar: `categorySlug`, `name`, `projectId` (valfritt)

76. **deleteNoteCategory**
    - Ta bort kategori. Anteckningar behåller kategori-text. Kräver bekräftelse.
    - Parametrar: `categorySlug`, `projectId` (valfritt)

---

## Automatiseringar

77. **createAutomation**
    - Skapa schemalagd automation (naturligt språk för tidpunkt).
    - Parametrar: `name`, `description`, `schedule`, `actionTool`, `actionParams`, `projectId` (valfritt)

78. **listAutomations**
    - Lista schemalagda automatiseringar.
    - Parametrar: `projectId` (valfritt)

79. **getAutomation**
    - Hämta detaljer för en automation.
    - Parametrar: `automationId`

80. **updateAutomation**
    - Uppdatera automation.
    - Parametrar: `automationId`, (fält som ska ändras)

81. **pauseAutomation**
    - Pausa aktiv automation.
    - Parametrar: `automationId`

82. **resumeAutomation**
    - Återuppta pausad automation.
    - Parametrar: `automationId`

83. **deleteAutomation**
    - Ta bort automation. Kräver bekräftelse.
    - Parametrar: `automationId`

---

## E-postmallar (admin)

84. **listEmailTemplates**
    - Lista e-postmallar för företaget.
    - Parametrar: (enligt tool)

85. **getEmailTemplate**
    - Hämta en specifik e-postmall.
    - Parametrar: `templateName` eller liknande

86. **updateEmailTemplate**
    - Uppdatera e-postmall. Admin.
    - Parametrar: (enligt tool)

87. **previewEmailTemplate**
    - Förhandsgranska mall med variabler.
    - Parametrar: (enligt tool)

---

## Skicka e-post (förbered preview)

88. **prepareEmailToExternalRecipients**
    - Förbered e-post till externa mottagare. Returnerar preview; användaren skickar via knapp.
    - Parametrar: `recipients`, `subject`, `body`, `replyTo` (valfritt)

89. **prepareEmailToTeamMembers**
    - Förbered e-post till teammedlemmar. Preview för bekräftelse.
    - Parametrar: `memberIds`, `subject`, `body`

90. **prepareEmailToProjectMembers**
    - Förbered e-post till projektmedlemmar.
    - Parametrar: `projectId`, `memberIds` (valfritt; alla om utelämnat), `subject`, `body`

91. **getTeamMembersForEmailTool**
    - Lista teammedlemmar som kan få e-post.
    - Parametrar: (inga)

92. **getProjectsForEmailTool**
    - Lista projekt med medlemsantal (för e-postval).
    - Parametrar: (inga)

93. **getProjectMembersForEmailTool**
    - Lista medlemmar i ett projekt som kan få e-post.
    - Parametrar: `projectId`

---

## Notifieringar

94. **getNotifications**
    - Hämta användarens notifieringar (olästa och lästa). Kan filtrera på endast olästa.
    - Parametrar: `unreadOnly` (valfritt, default false), `limit` (valfritt, default 20)

95. **markNotificationRead**
    - Markera en notifiering som läst.
    - Parametrar: `notificationId`

96. **markAllNotificationsRead**
    - Markera alla notifieringar som lästa.
    - Parametrar: (inga)

97. **getNotificationSettings**
    - Hämta användarens notifikationsinställningar.
    - Parametrar: (enligt tool)

98. **updateNotificationSettings**
    - Uppdatera notifikationsinställningar.
    - Parametrar: (enligt tool)

---

## E-postsökning och konversationer

99. **searchMyEmails**
    - Semantisk sökning i användarens e-post (innehåll, ämne, avsändare).
    - Parametrar: `query`, `projectId` (valfritt), `limit` (valfritt, default 10)

100. **getConversationContext**
     - Hämta hela e-postkonversation (alla meddelanden i tråden). Använd när searchMyEmails returnerar conversationId.
     - Parametrar: `conversationId`

101. **getMyRecentEmails**
     - Hämta senaste e-postmeddelanden (historik).
     - Parametrar: `projectId` (valfritt), `limit` (valfritt), `direction` (INBOUND|OUTBOUND, valfritt)

---

## Chatthistorik (AI-konversationer)

102. **searchConversations**
    - Sök i användarens AI-chattkonversationer med semantisk sökning.
    - Parametrar: `query`, `limit` (valfritt, default 10)

---

## Offert (preview)

103. **createQuote**
    - Skapa offert/prisförslag för kund. Returnerar interaktiv förhandsgranskning; användaren genererar PDF via knapp.
    - Parametrar: `projectId` (valfritt), `clientName`, `clientEmail` (valfritt), `title`, `items` (array med description, quantity, unit, unitPrice, vatRate), `validUntil` (valfritt), `notes` (valfritt), `includeRot` (valfritt)

---

## Offerter (databas)

104. **listQuotes**
    - Hämta användarens offerter. Filtrera på status eller projekt.
    - Parametrar: `status` (DRAFT|SENT|ACCEPTED|REJECTED|EXPIRED, valfritt), `projectId` (valfritt)

105. **getQuote** (getQuoteDetail)
    - Hämta specifik offert med alla rader.
    - Parametrar: `quoteId`

106. **createQuoteDb**
    - Skapa ny offert i databasen.
    - Parametrar: (enligt tool – titel, kund, projekt etc.)

107. **addQuoteItem** (addQuoteItemTool)
    - Lägg till rad på offert.
    - Parametrar: `quoteId`, (artikelinfo)

108. **suggestQuoteItems**
    - Få förslag på rader till offert (t.ex. från grossist/produkter).
    - Parametrar: (enligt tool)

109. **updateQuoteStatus** (updateQuoteStatusTool)
    - Uppdatera offertens status (DRAFT, SENT, ACCEPTED, REJECTED, EXPIRED).
    - Parametrar: `quoteId`, `status`

---

## Grossistsökning

110. **searchSupplierProducts**
    - Sök produkter hos Elektroskandia och Ahlsell. Returnerar artikelnummer, namn, pris, enhet, lager. Inkluderar popularitetsdata.
    - Parametrar: `query`, `supplier` (ELEKTROSKANDIA|AHLSELL|ALL, valfritt), `maxResults` (valfritt, default 10)

---

## Inköpslistor

111. **getShoppingLists**
    - Hämta användarens inköpslistor. Kan filtreras på projekt.
    - Parametrar: `projectId` (valfritt), `includeArchived` (valfritt)

112. **createShoppingList**
    - Skapa ny inköpslista. Kan kopplas till projekt.
    - Parametrar: `title`, `projectId` (valfritt)

113. **addToShoppingList**
    - Lägg till produkt/artikel i inköpslista.
    - Parametrar: `listId`, `name`, `articleNo`, `brand`, `supplier`, `quantity`, `unit`, `price`, `imageUrl`, `productUrl`, `notes` (valfria)

114. **toggleShoppingItem**
    - Bocka av eller av-bocka artikel i inköpslista.
    - Parametrar: `itemId`

115. **searchAndAddToShoppingList**
    - Sök hos grossister och lägg till första matchande produkten i inköpslista.
    - Parametrar: `query`, `listId`, `quantity` (valfritt), `supplier` (ELEKTROSKANDIA|AHLSELL|ALL, valfritt)

---

## Sammanfattning

- **Totalt antal verktyg (personliga):** 115 unika funktionsnamn (vissa exponerade med alias, t.ex. getProjectFiles = listFiles, getQuote = getQuoteDetail).
- **Provider-specifikt:** 1 verktyg (`web_search` endast för Anthropic).
- **Saknat verktyg:** `getUnreadAIMessages` nämns i systemprompten men finns inte implementerat; `getNotifications` med `unreadOnly: true` används för olästa notifieringar.
