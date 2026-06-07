import type { Lang } from '$lib/stores/language';

const translations = {
	// ===== LAYOUT =====
	'nav.stage': { en: 'Create', fr: 'Créer' },
	'nav.drafts': { en: 'Drafts', fr: 'Brouillons' },
	'nav.court': { en: 'Court', fr: 'Cour' },
	'nav.library': { en: 'Library', fr: 'Sources' },
	'nav.assignments': { en: 'Assignments', fr: 'Exercices' },
	'nav.about': { en: 'About Verdict', fr: 'À propos' },
	'nav.howItWorks': { en: 'How it Works', fr: 'Comment ça marche' },
	'nav.contact': { en: 'Contact', fr: 'Contact' },
	'layout.resumePrefix': { en: 'Ongoing case:', fr: 'Cause en cours :' },
	'layout.resumeButton': { en: 'Resume', fr: 'Reprendre' },
	'meta.description': {
		en: 'Verdict — source-bound legal reasoning practice with an AI judge.',
		fr: 'Verdict — pratique du raisonnement juridique fondé sur les sources avec un juge IA.'
	},

	// ===== DISCLAIMER =====
	'disclaimer.banner': {
		en: '⚠️ Educational simulation — AI-generated citations may be inaccurate. Always verify legal references against official sources.',
		fr: '⚠️ Simulation éducative — les citations générées par l\'IA peuvent être inexactes. Vérifiez toujours les références juridiques auprès des sources officielles.'
	},

	// ===== MOBILE GATE =====
	'mobile.title': { en: 'Desktop Only', fr: 'Bureau uniquement' },
	'mobile.description': {
		en: 'Verdict is a professional tool optimized for desktop browsers. Please switch to a laptop or desktop to continue.',
		fr: 'Verdict est un outil professionnel optimisé pour les navigateurs de bureau. Veuillez utiliser un ordinateur portable ou de bureau pour continuer.'
	},

	// ===== AUTH =====
	'auth.pageTitle': { en: 'Sign In', fr: 'Connexion' },
	'auth.tagline': { en: 'Build the record. Face the judge.', fr: 'Bâtissez le dossier. Faites face au juge.' },
	'auth.continueWithGoogle': { en: 'Continue with Google', fr: 'Continuer avec Google' },
	'auth.or': { en: 'or', fr: 'ou' },
	'auth.email': { en: 'Email', fr: 'Courriel' },
	'auth.password': { en: 'Password', fr: 'Mot de passe' },
	'auth.confirmPassword': { en: 'Confirm password', fr: 'Confirmer le mot de passe' },
	'auth.signIn': { en: 'Sign In', fr: 'Connexion' },
	'auth.signingIn': { en: 'Signing in…', fr: 'Connexion en cours…' },
	'auth.signOut': { en: 'Sign Out', fr: 'Déconnexion' },
	'auth.createAccount': { en: 'Create Account', fr: 'Créer un compte' },
	'auth.noAccount': { en: "Don't have an account?", fr: "Pas de compte?" },
	'auth.haveAccount': { en: 'Already have an account?', fr: 'Déjà un compte?' },
	'auth.signUpLink': { en: 'Sign up', fr: "S'inscrire" },
	'auth.signInLink': { en: 'Sign in', fr: 'Se connecter' },
	'auth.checkEmail': { en: 'Check your email for a confirmation link.', fr: 'Vérifiez votre courriel pour le lien de confirmation.' },
	'auth.passwordMismatch': { en: 'Passwords do not match.', fr: 'Les mots de passe ne correspondent pas.' },
	'auth.passwordTooShort': { en: 'Password must be at least 6 characters.', fr: 'Le mot de passe doit contenir au moins 6 caractères.' },

	// ===== HOME =====
	'home.subtitle': { en: 'Verdict', fr: 'Verdict' },
	'home.headline': { en: 'Practice. Argue. Win.', fr: 'Pratiquez. Argumentez. Gagnez.' },
	'home.description': {
		en: 'Upload source material, talk normally with Verdict, then create source-grounded exercises when the direction is ready.',
		fr: 'Téléversez des sources, parlez normalement avec Verdict, puis créez des exercices fondés sur les documents quand l’orientation est prête.'
	},
	'home.initCase': { en: 'Open Create', fr: 'Ouvrir Créer' },
	'home.browseLibrary': { en: 'Browse Library', fr: 'Parcourir les sources' },

	// ===== CASES =====
	'cases.header': { en: 'Create', fr: 'Créer' },
	'cases.subheader': {
		en: 'Upload sources, talk naturally, and let Verdict guide the exercise only from the documents you selected.',
		fr: 'Téléversez des sources, discutez naturellement, et laissez Verdict guider l’exercice seulement à partir des documents sélectionnés.'
	},
	'cases.resetForm': { en: 'Reset Chat', fr: 'Réinitialiser' },
	'cases.mode': { en: 'Review Format', fr: 'Format de révision' },
	'cases.judge': { en: 'Judge Review', fr: 'Révision par le juge' },
	'cases.autoFill': { en: 'Auto-fill', fr: 'Remplir auto' },
	'cases.generating': { en: 'Generating...', fr: 'Génération...' },
	'cases.judgeDesc': {
		en: 'Strict examination — the judge tests whether your argument is actually supported by the uploaded sources.',
		fr: 'Examen strict — le juge vérifie si votre argument est réellement appuyé par les sources téléversées.'
	},
	'cases.learningObjective': { en: 'Learning Objective', fr: 'Objectif pedagogique' },
	'cases.skillFocus': { en: 'Skill Focus', fr: 'Competence ciblee' },
	'cases.caseTitle': { en: 'Case Title', fr: 'Titre de la cause' },
	'cases.caseTitlePlaceholder': { en: 'e.g. Smith v. Jones', fr: 'ex. Tremblay c. Dupont' },
	'cases.yourSide': { en: 'Your Side', fr: 'Votre rôle' },
	'cases.plaintiff': { en: 'Plaintiff', fr: 'Demandeur' },
	'cases.defendant': { en: 'Defendant', fr: 'Défendeur' },
	'cases.selectSideRequired': { en: 'Select a side before you initialize the case.', fr: 'Sélectionnez un côté avant de créer la cause.' },
	'cases.fieldRequired': { en: 'This field is required.', fr: 'Ce champ est requis.' },
	'cases.whatHappened': { en: 'What Happened', fr: 'Les faits' },
	'cases.whatHappenedPlaceholder': { en: '> Short, clear summary of the facts.', fr: '> Résumé court et clair des faits.' },
	'cases.mainQuestion': { en: 'Main Question', fr: 'Question principale' },
	'cases.mainQuestionPlaceholder': { en: '> What should the court decide?', fr: '> Que devrait décider le tribunal?' },
	'cases.whatYouWant': { en: 'What Plaintiff Wants', fr: 'Ce que le demandeur demande' },
	'cases.plaintiffPlaceholderYou': { en: '> The outcome you are seeking.', fr: '> Le résultat que vous recherchez.' },
	'cases.plaintiffPlaceholderOther': { en: '> What the plaintiff is seeking (compensation, injunction, etc.).', fr: '> Ce que le demandeur recherche (compensation, injonction, etc.).' },
	'cases.whatDefendantWants': { en: 'What Defendant Wants', fr: 'Ce que le défendeur demande' },
	'cases.defendantPlaceholderYou': { en: '> Your defense position (dismiss, reduce, deny).', fr: '> Votre position de défense (rejet, réduction, refus).' },
	'cases.defendantPlaceholderOther': { en: '> What the defendant asks for (dismiss, reduce, deny).', fr: '> Ce que le défendeur demande (rejet, réduction, refus).' },
	'cases.legalPack': { en: 'Legal Pack', fr: 'Pack juridique' },
	'cases.selectPackRequired': {
		en: 'Select a legal pack before you initialize the case.',
		fr: 'Sélectionnez un pack juridique avant de créer la cause.'
	},
	'cases.selectPackFirst': {
		en: 'Select or create a source pack first so Verdict can read your uploaded documents.',
		fr: 'Sélectionnez ou créez d’abord un pack de sources pour que Verdict puisse lire vos documents téléversés.'
	},
	'cases.noSourcesInPack': {
		en: 'This pack has no sources yet. Upload documents in the Library first.',
		fr: 'Ce pack ne contient pas encore de sources. Téléversez d’abord des documents dans les Sources.'
	},
	'cases.sources': { en: 'Sources (Optional)', fr: 'Sources (Optionnel)' },
	'cases.selected': { en: 'Selected', fr: 'Sélectionnées' },
	'cases.initializeCase': { en: 'INITIALIZE CASE', fr: 'CRÉER LA CAUSE' },
	'cases.processing': { en: 'PROCESSING...', fr: 'TRAITEMENT...' },
	'cases.systemReady': { en: 'SYSTEM_READY // WAITING_FOR_INPUT', fr: 'SYSTÈME_PRÊT // EN_ATTENTE' },
	'cases.setup': { en: 'Setup', fr: 'Configuration' },
	'cases.caseDetails': { en: 'Case Details', fr: 'Détails de la cause' },
	'cases.reviewStep': { en: 'Review', fr: 'Révision' },
	'cases.reviewDesc': { en: 'Review your case before launching the debate.', fr: 'Révisez votre cause avant de lancer le débat.' },
	'cases.generateWithAI': { en: 'GENERATE A CASE WITH AI', fr: 'GÉNÉRER UNE CAUSE AVEC L\'IA' },
	'cases.generateDesc': { en: 'AI will create a realistic case based on your legal pack. You can edit everything afterwards.', fr: 'L\'IA créera une cause réaliste basée sur votre pack juridique. Vous pourrez tout modifier ensuite.' },
	'cases.orManual': { en: 'or write your own case manually', fr: 'ou rédigez votre propre cause manuellement' },
	'cases.back': { en: 'Back', fr: 'Retour' },
	'cases.next': { en: 'NEXT', fr: 'SUIVANT' },
	'cases.startDebate': { en: 'START DEBATE', fr: 'LANCER LE DÉBAT' },
	'cases.editSources': { en: 'Edit sources', fr: 'Modifier les sources' },
	'cases.includeSources': { en: 'Include sources', fr: 'Sources à inclure' },
	'cases.includeSourcesDesc': { en: 'Uncheck any document you want excluded from retrieval for this conversation.', fr: 'Décochez les documents que vous voulez exclure de la recherche pour cette conversation.' },
	'cases.allOn': { en: 'Select all', fr: 'Tout cocher' },
	'cases.allOff': { en: 'Deselect all', fr: 'Tout décocher' },
	'cases.chooseSide': { en: 'Choose Your Side', fr: 'Choisissez votre camp' },
	'cases.chooseSideDesc': { en: 'Now that you\'ve seen the case, which side do you want to argue?', fr: 'Maintenant que vous avez vu la cause, quel camp voulez-vous défendre?' },
	'cases.youArgue': { en: 'You\'ll argue:', fr: 'Vous plaiderez :' },
	'cases.noPacksYet': { en: 'No source packs yet. Create one in the Library first.', fr: 'Aucun pack de sources. Créez-en un dans les Sources d’abord.' },
	'cases.goToLibrary': { en: 'Go to Sources', fr: 'Aller aux sources' },
	'cases.uploadEvidence': { en: 'Upload Evidence / Packet', fr: 'Téléverser des preuves' },
	'cases.uploadFormats': { en: 'PDF, DOCX, TXT // SHA-256 VERIFIED', fr: 'PDF, DOCX, TXT // SHA-256 VÉRIFIÉ' },
	'cases.example': { en: 'Example', fr: 'Exemple' },
	'cases.exampleTitle': { en: 'Tremblay v. TechNova Inc.', fr: 'Tremblay c. TechNova Inc.' },
	'cases.exampleSynopsis': {
		en: 'After 15 years at the company, the employee was fired by an automated system with no human review or appeal.',
		fr: 'Après 15 ans dans l\'entreprise, l\'employé a été congédié par un système automatisé sans révision humaine ni appel.'
	},
	'cases.exampleIssues': {
		en: '1. Was this firing fair without any human review?\n2. Was 2 weeks of severance enough after 15 years?',
		fr: '1. Ce congédiement était-il juste sans révision humaine?\n2. Deux semaines d\'indemnité suffisaient-elles après 15 ans?'
	},
	'cases.exampleRemedy': {
		en: '24 months notice • damages for unfair treatment • job restored',
		fr: '24 mois de préavis • dommages pour traitement injuste • réintégration'
	},
	'cases.exTitle': { en: 'Title', fr: 'Titre' },
	'cases.exWhatHappened': { en: 'What Happened', fr: 'Les faits' },
	'cases.exMainQuestion': { en: 'Main Question', fr: 'Question principale' },
	'cases.exWhatTheyWant': { en: 'What They Want', fr: 'Ce qu\'ils demandent' },
	'cases.sourcePack': { en: 'Source Pack', fr: 'Pack de sources' },
	'cases.activePackLabel': { en: 'Active pack', fr: 'Pack actif' },
	'cases.activePackHint': {
		en: 'This pack sets the source library for the current Create conversation.',
		fr: 'Ce pack définit la bibliothèque de sources utilisée dans cette conversation Créer.'
	},
	'cases.sourcePackDesc': {
		en: 'Create reads only the selected documents. If something is missing, Verdict must ask you first.',
		fr: 'Créer lit seulement les documents sélectionnés. S’il manque quelque chose, Verdict doit vous demander d’abord.'
	},
	'cases.includedSourcesLabel': { en: 'Included sources', fr: 'Sources incluses' },
	'cases.includedSourcesHint': {
		en: 'Only checked documents from this pack are included in retrieval.',
		fr: 'Seuls les documents cochés de ce pack sont inclus dans la recherche.'
	},
	'cases.allPackSourcesIncluded': { en: 'Full pack', fr: 'Pack complet' },
	'cases.filteredPackSources': { en: 'Filtered', fr: 'Filtré' },
	'cases.sourcesLabel': { en: 'sources', fr: 'sources' },
	'cases.source': { en: 'source', fr: 'source' },
	'cases.packStatus': { en: 'Pack status', fr: 'État du pack' },
	'cases.readyStatus': { en: 'Ready', fr: 'Prêt' },
	'cases.noSourceSelectedStatus': { en: 'No source', fr: 'Aucune source' },
	'cases.selectSourcesRequired': {
		en: 'Select at least one source before asking Verdict to build a case.',
		fr: 'Sélectionnez au moins une source avant de demander à Verdict de créer un cas.'
	},
	'cases.studioRequestRequired': {
		en: 'Write a message before continuing the conversation or creating the exercise pack.',
		fr: 'Écrivez un message avant de poursuivre la conversation ou de créer le pack d’exercice.'
	},
	'cases.caseStudio': { en: 'Verdict', fr: 'Verdict' },
	'cases.verdictSpeaker': { en: 'Verdict', fr: 'Verdict' },
	'cases.chatWithVerdict': { en: 'Talk with Verdict', fr: 'Échanger avec Verdict' },
	'cases.caseStudioIntro': {
		en: 'Talk normally. Verdict reads the selected sources for every answer, suggests what they can support, and asks before going beyond them.',
		fr: 'Parlez normalement. Verdict lit les sources sélectionnées à chaque réponse, propose ce qu’elles peuvent appuyer, et demande avant d’aller plus loin.'
	},
	'cases.readThenDraftPlaceholder': {
		en: 'Example: Build the exercise pack from our conversation, using only the selected sources.',
		fr: 'Exemple : monte le pack d’exercice à partir de notre conversation, seulement avec les sources sélectionnées.'
	},
	'cases.caseStudioPlaceholder': {
		en: 'Example: I uploaded documents and want my students to practice default and liability. What exercises can we build from these sources?',
		fr: 'Exemple : j’ai téléversé des documents et je veux que mes étudiants pratiquent le défaut et la responsabilité. Quels exercices peut-on créer avec ces sources ?'
	},
	'cases.caseStudioHint': {
		en: 'Every reply is source-bound. If the documents do not support the request, Verdict should ask what you want to do next.',
		fr: 'Chaque réponse est fondée sur les sources. Si les documents n’appuient pas la demande, Verdict doit demander quoi faire ensuite.'
	},
	'cases.refineDraftPlaceholder': {
		en: 'Example: Keep this structure, but make the default issue sharper using only what the selected sources support.',
		fr: 'Exemple : garde cette structure, mais rends la question du défaut plus précise seulement avec ce que les sources appuient.'
	},
	'cases.manageSources': { en: 'Manage sources', fr: 'Gérer les sources' },
	'cases.chatThreadTitle': { en: 'Conversation', fr: 'Conversation' },
	'cases.conversationTitle': { en: 'Verdict workspace', fr: 'Atelier Verdict' },
	'cases.chatThreadHint': {
		en: 'Talk through the idea normally. Build the exercise pack only when the source-grounded direction is ready.',
		fr: 'Discutez normalement de l’idée. Montez le pack d’exercice seulement quand l’orientation fondée sur les sources est prête.'
	},
	'cases.readingSourcesMessage': {
		en: 'I\'m checking the connected authorities now and building the judge-mode file from what they actually support.',
		fr: 'Je vérifie maintenant les autorités reliées et je construis le dossier du mode juge à partir de ce qu’elles appuient réellement.'
	},
	'cases.readingSourcesRevisionMessage': {
		en: 'I\'m re-checking the connected authorities and updating the current judge-mode file from them.',
		fr: 'Je revérifie les autorités reliées et je mets à jour le dossier actuel du mode juge à partir d’elles.'
	},
	'cases.chatEmptyTitle': { en: 'Start like a normal conversation', fr: 'Commencez comme une vraie conversation' },
	'cases.chatEmptyDesc': {
		en: 'Start asking Verdict what it can build for you from your active pack.',
		fr: 'Commencez par demander à Verdict ce qu’il peut construire pour vous à partir du pack actif.'
	},
	'cases.starterIdeasLabel': { en: 'Find an angle', fr: 'Trouver un angle' },
	'cases.starterIdeasDesc': {
		en: 'Ask Verdict for 2 or 3 grounded directions from these sources.',
		fr: 'Demandez à Verdict 2 ou 3 pistes fondées sur ces sources.'
	},
	'cases.starterIdeasPrompt': {
		en: 'Give me 2 or 3 grounded directions we can explore with these sources.',
		fr: 'Donne-moi 2 ou 3 pistes fondées sur ces sources que nous pouvons explorer.'
	},
	'cases.starterDraftLabel': { en: 'Build a case', fr: 'Monter un cas' },
	'cases.starterDraftDesc': {
		en: 'Ask Verdict for a short case ready for judge mode.',
		fr: 'Demandez à Verdict un cas court prêt pour le mode juge.'
	},
	'cases.starterDraftPrompt': {
		en: 'Build a short practice case ready for judge mode from these sources.',
		fr: 'Monte un cas pratique court prêt pour le mode juge à partir de ces sources.'
	},
	'cases.readThenDraftButton': { en: 'Build Exercise Pack', fr: 'Monter le pack d’exercice' },
	'cases.reviseDraftButton': { en: 'Update Exercise Pack', fr: 'Mettre à jour le pack' },
	'cases.buildNow': { en: 'Build now', fr: 'Construire maintenant' },
	'cases.buildNowDesc': { en: 'Use the included sources and the current conversation.', fr: 'Utiliser les sources incluses et la conversation actuelle.' },
	'cases.sendToStudio': { en: 'Send', fr: 'Envoyer' },
	'cases.buildJudgeModeButton': { en: 'Build Exercise Pack', fr: 'Monter le pack d’exercice' },
	'cases.updateJudgeDraftButton': { en: 'Update Exercise Pack', fr: 'Mettre à jour le pack' },
	'cases.readingSourceChatMessage': {
		en: 'I’m reading the selected sources before I answer.',
		fr: 'Je lis les sources sélectionnées avant de répondre.'
	},
	'cases.noSourcesChatMessage': {
		en: 'I need at least one selected source before I can guide the exercise. Upload or select documents first, then tell me what students should practice.',
		fr: 'J’ai besoin d’au moins une source sélectionnée avant de guider l’exercice. Téléversez ou sélectionnez des documents, puis dites-moi ce que les étudiants doivent pratiquer.'
	},
	'cases.analyzingSources': { en: 'Analyzing selected sources...', fr: 'Analyse des sources sélectionnées...' },
	'cases.activityThinking': { en: 'Thinking', fr: 'Réflexion' },
	'cases.activityThinkingDesc': {
		en: 'Verdict is preparing a normal response.',
		fr: 'Verdict prépare une réponse normale.'
	},
	'cases.activityReading': { en: 'Reading sources', fr: 'Lecture des sources' },
	'cases.activityReadingDesc': {
		en: 'Verdict is loading and checking the selected documents.',
		fr: 'Verdict charge et vérifie les documents sélectionnés.'
	},
	'cases.activityBuilding': { en: 'Building exercise', fr: 'Construction de l’exercice' },
	'cases.activityBuildingDesc': {
		en: 'Verdict is turning the teacher goal into a judge-mode draft.',
		fr: 'Verdict transforme l’objectif pédagogique en projet pour le mode juge.'
	},
	'cases.activityAuditing': { en: 'Checking grounding', fr: 'Vérification du rattachement' },
	'cases.activityAuditingDesc': {
		en: 'Verdict is verifying source links before showing the draft.',
		fr: 'Verdict vérifie les liens aux sources avant d’afficher le projet.'
	},
	'cases.activityStepReading': { en: 'Read', fr: 'Lire' },
	'cases.activityStepBuilding': { en: 'Build', fr: 'Construire' },
	'cases.activityStepAuditing': { en: 'Audit', fr: 'Auditer' },
	'cases.caseOptionsReady': { en: 'Options ready', fr: 'Options prêtes' },
	'cases.sourcesIncomplete': { en: 'Sources incomplete', fr: 'Sources incomplètes' },
	'cases.studioAnalysis': { en: 'Source analysis', fr: 'Analyse des sources' },
	'cases.sourceReadout': { en: 'Source readout', fr: 'Lecture des sources' },
	'cases.understoodGoal': { en: 'Understood goal', fr: 'Objectif compris' },
	'cases.workflowStage': { en: 'Workflow stage', fr: 'Etape du flux' },
	'cases.sourcesReviewed': { en: 'Sources reviewed', fr: 'Sources lues' },
	'cases.nextStep': { en: 'Next step', fr: 'Prochaine etape' },
	'cases.sourceReviewedState': { en: 'Sources reviewed', fr: 'Sources lues' },
	'cases.draftReadyState': { en: 'Draft ready', fr: 'Projet pret' },
	'cases.jurisdictionDetected': { en: 'Jurisdiction', fr: 'Juridiction' },
	'cases.sourceSummary': { en: 'Useful sources', fr: 'Sources utiles' },
	'cases.retrievedSourcePacket': { en: 'Retrieved source packet', fr: 'Paquet de sources récupéré' },
	'cases.retrievedSourcePacketDesc': {
		en: 'These are the passages Verdict retrieved before drafting this exercise.',
		fr: 'Voici les passages que Verdict a récupérés avant de rédiger cet exercice.'
	},
	'cases.sourcePacketCoverage': { en: 'Coverage', fr: 'Couverture' },
	'cases.sourcePacketExcerpts': { en: 'excerpts', fr: 'extraits' },
	'cases.coverageHigh': { en: 'High', fr: 'Élevée' },
	'cases.coverageMedium': { en: 'Medium', fr: 'Moyenne' },
	'cases.coverageLow': { en: 'Low', fr: 'Faible' },
	'cases.missingSources': { en: 'Missing material', fr: 'Documents manquants' },
	'cases.noMissingSources': { en: 'No major missing material flagged.', fr: 'Aucun document majeur manquant signalé.' },
	'cases.limits': { en: 'Limits', fr: 'Limites' },
	'cases.judgeModeFit': { en: 'Judge-mode fit', fr: 'Compatibilite mode juge' },
	'cases.judgeModeRationale': { en: 'Why this fits Judge mode', fr: 'Pourquoi cela convient au mode juge' },
	'cases.judgeFitHigh': { en: 'High fit', fr: 'Forte compatibilite' },
	'cases.judgeFitMedium': { en: 'Partial fit', fr: 'Compatibilite partielle' },
	'cases.judgeFitLow': { en: 'Low fit', fr: 'Faible compatibilite' },
	'cases.noLimits': { en: 'No major limits flagged.', fr: 'Aucune limite majeure signalée.' },
	'cases.confidenceHigh': { en: 'High confidence', fr: 'Confiance élevée' },
	'cases.confidenceMedium': { en: 'Medium confidence', fr: 'Confiance moyenne' },
	'cases.confidenceLow': { en: 'Low confidence', fr: 'Confiance faible' },
	'cases.draftNavigator': { en: 'Draft navigator', fr: 'Navigateur de projets' },
	'cases.primaryDraftTitle': { en: 'Judge-mode working file', fr: 'Dossier de travail du mode juge' },
	'cases.alternativeDirections': { en: 'Alternative directions', fr: 'Directions alternatives' },
	'cases.alternativeDirectionsDesc': {
		en: 'These stay secondary. Switch only if you want a different source-grounded angle.',
		fr: 'Ces pistes restent secondaires. Changez seulement si vous voulez un autre angle fonde sur les memes sources.'
	},
	'cases.noAlternativeDirections': {
		en: 'Verdict is keeping the conversation focused on one main draft right now.',
		fr: 'Verdict garde la conversation concentree sur un seul projet principal pour le moment.'
	},
	'cases.switchToAlternative': { en: 'Switch to this direction', fr: 'Basculer vers cette piste' },
	'cases.generatedOptions': { en: 'Generated practice options', fr: 'Options de pratique proposées' },
	'cases.generatedOptionsDesc': {
		en: 'Pick the option that best matches the class objective, then choose which side the student should argue.',
		fr: 'Choisissez l\'option qui correspond le mieux à l\'objectif du cours, puis choisissez le camp que l\'étudiant doit défendre.'
	},
	'cases.levelIntroductory': { en: 'Introductory', fr: 'Débutant' },
	'cases.levelIntermediate': { en: 'Intermediate', fr: 'Intermédiaire' },
	'cases.levelAdvanced': { en: 'Advanced', fr: 'Avancé' },
	'cases.practicePoints': { en: 'Practice points', fr: 'Points à pratiquer' },
	'cases.judgeBrief': { en: 'Judge brief', fr: 'Brief du juge' },
	'cases.judgeStudentTask': { en: 'Student task', fr: 'Tache de l etudiant' },
	'cases.judgeHearingFocus': { en: 'Hearing focus', fr: 'Focalisation de l audience' },
	'cases.judgeIssuesToProbe': { en: 'Issues to probe', fr: 'Questions a sonder' },
	'cases.judgePressurePoints': { en: 'Pressure points', fr: 'Points de pression' },
	'cases.judgeSuccessCriteria': { en: 'Success criteria', fr: 'Criteres de reussite' },
	'cases.judgeSourceBoundaries': { en: 'Source boundaries', fr: 'Limites imposees par les sources' },
	'cases.groundingStatus': { en: 'Grounding status', fr: 'État du rattachement' },
	'cases.sourceGrounded': { en: 'Source-grounded', fr: 'Fondé sur les sources' },
	'cases.needsReview': { en: 'Needs review', fr: 'À réviser' },
	'cases.insufficientSources': { en: 'Insufficient sources', fr: 'Sources insuffisantes' },
	'cases.groundingMap': { en: 'Source grounding map', fr: 'Carte de rattachement aux sources' },
	'cases.auditWarnings': { en: 'Audit warnings', fr: 'Avertissements d’audit' },
	'cases.groundingMainIssue': { en: 'Main issue', fr: 'Question principale' },
	'cases.groundingPlaintiffTheory': { en: 'Plaintiff theory', fr: 'Thèse du demandeur' },
	'cases.groundingDefendantTheory': { en: 'Defendant theory', fr: 'Thèse du défendeur' },
	'cases.groundingJudgePressure': { en: 'Judge pressure point', fr: 'Point de pression du juge' },
	'cases.groundingSuccessCriteria': { en: 'Success criteria', fr: 'Critère de réussite' },
	'cases.groundingSourceBoundary': { en: 'Source boundary', fr: 'Limite de source' },
	'cases.groundingOther': { en: 'Source link', fr: 'Lien source' },
	'cases.difficultyTrap': { en: 'Reasoning trap', fr: 'Piège de raisonnement' },
	'cases.selectCase': { en: 'Select case', fr: 'Sélectionner' },
	'cases.caseSelected': { en: 'Selected', fr: 'Sélectionné' },
	'cases.selectedCase': { en: 'Selected case', fr: 'Cas sélectionné' },
	'cases.documentPreview': { en: 'Exercise pack', fr: 'Pack d’exercice' },
	'cases.openExercisePaper': { en: 'Open paper', fr: 'Ouvrir le document' },
	'cases.closeExercisePaper': { en: 'Close paper', fr: 'Fermer le document' },
	'cases.documentNote': {
		en: 'Verdict built this pack from the conversation and selected sources. Review it, choose a side, then launch judge mode.',
		fr: 'Verdict a monté ce pack à partir de la conversation et des sources sélectionnées. Révisez-le, choisissez un camp, puis lancez le mode juge.'
	},
	'cases.documentEmptyTitle': { en: 'No exercise pack yet', fr: 'Aucun pack d’exercice pour le moment' },
	'cases.documentEmptyDesc': {
		en: 'Talk with Verdict first. When the direction is right, build the exercise pack and it will appear here.',
		fr: 'Parlez d’abord avec Verdict. Quand l’orientation est bonne, montez le pack d’exercice et il apparaîtra ici.'
	},
	'cases.roleRecommendation': { en: 'Recommended role', fr: 'Role recommande' },
	'cases.issueQuestion': { en: 'Main legal question', fr: 'Question juridique principale' },
	'cases.plaintiffPosition': { en: 'Plaintiff position', fr: 'Position du demandeur' },
	'cases.defendantPosition': { en: 'Defendant position', fr: 'Position du defendeur' },
	'cases.sourcesUsed': { en: 'Sources used', fr: 'Sources utilisées' },
	'cases.noSourceDetails': { en: 'No source details returned.', fr: 'Aucun détail de source retourné.' },
	'cases.sourceWarnings': { en: 'Source warnings', fr: 'Avertissements sur les sources' },
	'cases.noSourceWarnings': { en: 'No source warnings for this option.', fr: 'Aucun avertissement pour cette option.' },
	'cases.hideSources': { en: 'Hide sources', fr: 'Masquer les sources' },
	'cases.launchPanel': { en: 'Launch judge mode', fr: 'Lancer le mode juge' },
	'cases.saveDraft': { en: 'Save draft', fr: 'Enregistrer le brouillon' },
	'cases.updateDraft': { en: 'Update draft', fr: 'Mettre à jour le brouillon' },
	'cases.draftSaved': { en: 'Draft saved', fr: 'Brouillon enregistré' },
	'cases.draftSavedDesc': {
		en: 'You can reopen this paper from Drafts before sending it into judge mode.',
		fr: 'Vous pouvez rouvrir ce document depuis Brouillons avant de l’envoyer en mode juge.'
	},
	'cases.startPractice': { en: 'LAUNCH JUDGE MODE', fr: 'LANCER LE MODE JUGE' },
	'cases.shareCase': { en: 'Share', fr: 'Partager' },
	'cases.shareCreated': { en: 'Share link created.', fr: 'Lien de partage créé.' },
	'cases.shareCopied': { en: 'Share link copied.', fr: 'Lien de partage copié.' },
	'cases.shareFailed': { en: 'Unable to create the share link.', fr: 'Impossible de créer le lien de partage.' },
	'cases.shareManualCopy': { en: 'Copy the link manually.', fr: 'Copiez le lien manuellement.' },
	'cases.shareLinkReady': { en: 'Student link ready', fr: 'Lien élève prêt' },
	'cases.copyLink': { en: 'Copy link', fr: 'Copier le lien' },
	'cases.launchValidation': {
		en: 'Select a pack, source, and role, then complete the case fields before starting.',
		fr: 'Sélectionnez un pack, une source et un rôle, puis complétez les champs du cas avant de commencer.'
	},
	'share.sharedCase': { en: 'Shared exercise', fr: 'Exercice partagé' },
	'share.chooseSideDesc': {
		en: 'Read the exercise, choose the side you want to argue, then enter judge mode.',
		fr: 'Lisez l’exercice, choisissez le côté que vous voulez plaider, puis entrez en mode juge.'
	},
	'share.startJudge': { en: 'Go to judge mode', fr: 'Aller en mode juge' },
	'share.starting': { en: 'Opening...', fr: 'Ouverture...' },
	'share.sourceBoundary': {
		en: 'Judge mode will use only this published case capsule and its verified source packet.',
		fr: 'Le mode juge utilisera seulement cette capsule publiée et son paquet de sources vérifié.'
	},

	// ===== DRAFTS =====
	'drafts.title': { en: 'Drafts', fr: 'Brouillons' },
	'drafts.subtitle': {
		en: 'Saved exercise papers stay here until you decide to reopen them in Create or launch judge mode later.',
		fr: 'Les documents enregistrés restent ici jusqu’à ce que vous décidiez de les rouvrir dans Créer ou de lancer le mode juge plus tard.'
	},
	'drafts.emptyTitle': { en: 'No saved drafts yet', fr: 'Aucun brouillon enregistré' },
	'drafts.emptyDesc': {
		en: 'Build an exercise in Create, then save it before judge mode if you want to revisit it later.',
		fr: 'Créez un exercice dans Créer, puis enregistrez-le avant le mode juge si vous voulez y revenir plus tard.'
	},
	'drafts.openInCreate': { en: 'Open in Create', fr: 'Ouvrir dans Créer' },
	'drafts.preview': { en: 'Preview', fr: 'Aperçu' },
	'drafts.delete': { en: 'Delete', fr: 'Supprimer' },
	'drafts.savedPack': { en: 'Source pack', fr: 'Pack de sources' },
	'drafts.savedRole': { en: 'Saved side', fr: 'Camp enregistré' },
	'drafts.updated': { en: 'Updated', fr: 'Mis à jour' },

	// ===== DEBATE =====
	'debate.noCase': { en: 'No Active Case', fr: 'Aucune cause active' },
	'debate.noCaseDesc': { en: 'Open Create to prepare a source-grounded exercise before entering judge mode.', fr: 'Ouvrez Créer pour préparer un exercice fondé sur les sources avant d\'entrer en mode juge.' },
	'debate.launchCreate': { en: 'Open Create', fr: 'Ouvrir Créer' },
	'debate.activeCase': { en: 'Active Case', fr: 'Cause active' },
	'debate.pl': { en: 'PL', fr: 'DEM' },
	'debate.df': { en: 'DF', fr: 'DÉF' },
	'debate.vs': { en: 'vs', fr: 'c.' },
	'debate.synopsis': { en: 'Synopsis', fr: 'Résumé' },
	'debate.issues': { en: 'Issues', fr: 'Questions en litige' },
	'debate.learningObjective': { en: 'Learning Objective', fr: 'Objectif pedagogique' },
	'debate.skillFocus': { en: 'Skill Focus', fr: 'Competence ciblee' },
	'debate.na': { en: 'N/A', fr: 'S/O' },
	'debate.sources': { en: 'Sources', fr: 'Sources' },
	'debate.exitCourt': { en: '⟵ Exit Court', fr: '⟵ Quitter' },
	'debate.endCase': { en: '✕ End Case', fr: '✕ Terminer' },
	'debate.resetSim': { en: '↺ Reset Simulation', fr: '↺ Recommencer' },
	'debate.thinking': { en: 'thinking…', fr: 'réflexion…' },
	'debate.reviewingBench': { en: 'Reviewing submission…', fr: 'Analyse de la soumission…' },
	'debate.inputPlaceholder': { en: 'Enter your argument...', fr: 'Entrez votre argument...' },
	'debate.sendMessage': { en: 'Send Message', fr: 'Envoyer le message' },
	'debate.litigantSpeaker': { en: 'You', fr: 'Vous' },
	'debate.systemSpeaker': { en: '⚠ System', fr: '⚠ Système' },
	'debate.tipTitle': { en: 'How to write a strong argument', fr: 'Comment rédiger un argument solide' },
	'debate.tipCite': {
		en: 'Cite specific articles: "Under Art. 1457 C.c.Q., negligence requires duty, breach, causation, and damage."',
		fr: 'Citez des articles précis : « En vertu de l\'art. 1457 C.c.Q., la faute exige un devoir, un manquement, un lien causal et un préjudice. »'
	},
	'debate.tipStructure': {
		en: 'Structure your reasoning: state the rule, apply it to the facts, then conclude.',
		fr: 'Structurez votre raisonnement : énoncez la règle, appliquez-la aux faits, puis concluez.'
	},
	'debate.tipCounter': {
		en: 'Address the judge\'s concerns directly before restating your position.',
		fr: 'Répondez directement aux réserves du juge avant de reformuler votre position.'
	},
	'debate.panel': { en: 'Panel', fr: 'Panel' },
	'debate.judgeLabel': { en: 'Judge', fr: 'Juge' },
	'debate.judgeFocus': { en: 'Judge Focus', fr: 'Focus du juge' },
	'debate.hearingBlueprint': { en: 'Hearing blueprint', fr: 'Plan de l audience' },
	'debate.liveBenchRead': { en: 'Live bench read', fr: 'Lecture actuelle du banc' },
	'debate.leaningPlaintiff': { en: 'Leaning Plaintiff', fr: 'Penche demandeur' },
	'debate.leaningDefense': { en: 'Leaning Defense', fr: 'Penche défendeur' },
	'debate.awaitingArgs': { en: 'Awaiting Arguments', fr: 'En attente des arguments' },
	'debate.plaintiffLabel': { en: 'Plaintiff', fr: 'Demandeur' },
	'debate.defenseLabel': { en: 'Defense', fr: 'Défendeur' },
	'debate.undecided': { en: 'Undecided', fr: 'Indécis' },
	'debate.avgScore': { en: 'Avg Score', fr: 'Score moyen' },
	'debate.judgeMindTitle': { en: "Inside the Judge's Mind", fr: 'Dans l\'esprit du juge' },
	'debate.sourceDrawerTitle': { en: 'Source Verification', fr: 'Vérification de la source' },
	'debate.sourceDrawerDesc': {
		en: 'This part of the judge response is tied to the source below.',
		fr: 'Cette partie de la réponse du juge est rattachée à la source ci-dessous.'
	},
	'debate.citedPassage': { en: 'Cited passage', fr: 'Passage cité' },
	'debate.matchedExcerpt': { en: 'Matched excerpt', fr: 'Extrait retrouvé' },
	'debate.openFullSource': { en: 'Open full source', fr: 'Ouvrir la source complète' },
	'debate.hideFullSource': { en: 'Hide full source', fr: 'Masquer la source complète' },
	'debate.fullSource': { en: 'Full source', fr: 'Source complète' },
	'debate.loadingSourceText': { en: 'Loading source…', fr: 'Chargement de la source…' },
	'debate.sourceTextUnavailable': {
		en: 'Full source text is not available for this citation.',
		fr: 'Le texte complet de la source n’est pas disponible pour cette citation.'
	},
	'debate.noSourceExcerpt': {
		en: 'No excerpt was stored for this citation.',
		fr: 'Aucun extrait n’a été enregistré pour cette citation.'
	},
	'debate.openOriginalSource': { en: 'Open source file', fr: 'Ouvrir le fichier source' },
	'debate.sourceUnavailable': { en: 'Source unavailable', fr: 'Source indisponible' },
	'debate.unverifiedCitationWarning': {
		en: 'Some cited references could not be fully verified.',
		fr: 'Certaines références citées n’ont pas pu être vérifiées complètement.'
	},
	'debate.assessment': { en: 'Assessment', fr: 'Évaluation' },
	'debate.concerns': { en: 'Concerns', fr: 'Préoccupations' },
	'debate.leaning': { en: 'Leaning', fr: 'Tendance' },
	'debate.listening': { en: 'Listening for details...', fr: 'À l\'écoute des détails...' },
	'debate.logic': { en: 'Logic', fr: 'Logique' },
	'debate.evidence': { en: 'Evidence', fr: 'Preuve' },
	'debate.tone': { en: 'Tone', fr: 'Ton' },
	'debate.stancePlaintiff': { en: '→ Plaintiff', fr: '→ Demandeur' },
	'debate.stanceDefense': { en: '→ Defense', fr: '→ Défendeur' },
	'debate.stanceUndecided': { en: 'Undecided', fr: 'Indécis' },
	'debate.errorFallback': { en: 'Unable to process your argument.', fr: 'Impossible de traiter votre argument.' },
	'debate.sourcesUsed': { en: 'sources matched', fr: 'sources trouvées' },
	'debate.noSources': { en: 'No matching content found in your uploaded documents. Make sure your sources are indexed.', fr: 'Aucun contenu correspondant trouvé dans vos documents. Assurez-vous que vos sources sont indexées.' },
	'debate.roundCounter': { en: 'Rounds', fr: 'Tours' },
	'debate.roundLimitReached': { en: 'Round limit reached', fr: 'Limite de tours atteinte' },
	'debate.roundLimitDesc': { en: 'You\'ve used all rounds for this debate. End the case to receive your score.', fr: 'Vous avez utilisé tous vos tours pour ce débat. Terminez la cause pour obtenir votre note.' },
	'debate.performanceTitle': { en: 'Case Performance', fr: 'Performance de la cause' },
	'debate.scoringNow': { en: 'Scoring your advocacy performance...', fr: 'Évaluation de votre performance en plaidoirie...' },
	'debate.metricPersuasion': { en: 'Persuasion', fr: 'Persuasion' },
	'debate.metricLawCited': { en: 'Law Cited', fr: 'Droit cité' },
	'debate.metricStructure': { en: 'Structure', fr: 'Structure' },
	'debate.metricResponsiveness': { en: 'Responsiveness', fr: 'Réactivité' },
	'debate.metricFactFidelity': { en: 'Fact Fidelity', fr: 'Fidélité aux faits' },
	'debate.metricAverage': { en: 'Average', fr: 'Moyenne' },
	'debate.keepPracticing': { en: 'Keep Practicing', fr: 'Continuer à pratiquer' },
	'debate.closeCase': { en: 'Close Case', fr: 'Clore la cause' },
	'debate.scoreFallbackSummary': {
		en: 'You showed useful advocacy signals in this session. Keep tightening references to sources, answer opposing points more directly, and maintain factual precision to raise your final score.',
		fr: 'Vous avez montré de bons signaux de plaidoirie dans cette session. Continuez à renforcer vos références aux sources, répondez plus directement aux points adverses et maintenez une grande précision factuelle pour améliorer votre score final.'
	},
	'debate.coachStrengths': { en: 'What worked', fr: 'Ce qui a fonctionné' },
	'debate.coachWeaknesses': { en: 'What was weak', fr: 'Ce qui était faible' },
	'debate.coachNextTime': { en: 'Next time', fr: 'La prochaine fois' },

	// ===== COURT =====
	'court.header': { en: 'Chambers Overview', fr: 'Vue d\'ensemble' },
	'court.hub': { en: 'Court Hub', fr: 'Centre de la cour' },
	'court.description': {
		en: 'Review every practice exercise staged inside Verdict. Ongoing sessions stay active; finished rulings are preserved for later study.',
		fr: 'Consultez chaque exercice de pratique créé dans Verdict. Les sessions en cours restent actives; les décisions terminées sont archivées.'
	},
	'court.ongoing': { en: 'Ongoing', fr: 'En cours' },
	'court.finished': { en: 'Finished', fr: 'Terminé' },
	'court.stageNew': { en: 'Open Create', fr: 'Ouvrir Créer' },
	'court.refineSources': { en: 'Refine Library Sources', fr: 'Raffiner les sources' },
	'court.activeDockets': { en: 'Active Dockets', fr: 'Dossiers actifs' },
	'court.ongoingCases': { en: 'Ongoing Cases', fr: 'Causes en cours' },
	'court.lastUpdated': { en: 'Last updated', fr: 'Dernière mise à jour' },
	'court.emptyOngoing': {
		en: 'No active cases yet. Stage a dispute to enter oral argument.',
		fr: 'Aucune cause active. Créez un litige pour commencer la plaidoirie.'
	},
	'court.ongoingBadge': { en: 'Ongoing', fr: 'En cours' },
	'court.issuesLabel': { en: 'Issues', fr: 'Questions' },
	'court.lastActivity': { en: 'Last Activity', fr: 'Dernière activité' },
	'court.plaintiffRole': { en: 'Plaintiff / Appellant', fr: 'Demandeur / Appelant' },
	'court.defendantRole': { en: 'Defendant / Respondent', fr: 'Défendeur / Intimé' },
	'court.litigant': { en: 'Litigant', fr: 'Partie' },
	'court.reenter': { en: 'Re-enter Court', fr: 'Reprendre' },
	'court.markFinished': { en: 'Mark Finished', fr: 'Terminer' },
	'court.closedMatters': { en: 'Closed Matters', fr: 'Dossiers clos' },
	'court.finishedCases': { en: 'Finished Cases', fr: 'Causes terminées' },
	'court.lastClosure': { en: 'Last closure', fr: 'Dernière clôture' },
	'court.emptyFinished': {
		en: 'Once you end a case, the dossier will be archived here.',
		fr: 'Les dossiers terminés seront archivés ici.'
	},
	'court.finishedBadge': { en: 'Finished', fr: 'Terminé' },
	'court.opened': { en: 'Opened', fr: 'Ouvert le' },
	'court.closed': { en: 'Closed', fr: 'Fermé le' },
	'court.reopen': { en: 'Reopen Case', fr: 'Rouvrir' },
	'court.removeDossier': { en: 'Remove Dossier', fr: 'Supprimer' },
	'court.performance': { en: 'Performance', fr: 'Performance' },
	'court.noScoreRecorded': {
		en: 'No score was recorded for this case. End the case from Debate to save a performance score.',
		fr: 'Aucun score n\'a été enregistré pour cette cause. Terminez la cause depuis le débat pour sauvegarder un score.'
	},
	'court.footer': { en: 'SYSTEM // Ready for first filing', fr: 'SYSTÈME // Prêt pour le premier dépôt' },
	'court.momentsAgo': { en: 'moments ago', fr: 'à l\'instant' },
	'court.minAgo': { en: 'min ago', fr: 'min' },
	'court.hourAgo': { en: 'hr ago', fr: 'h' },
	'court.hoursAgo': { en: 'hrs ago', fr: 'h' },
	'court.dayAgo': { en: 'day ago', fr: 'jour' },
	'court.daysAgo': { en: 'days ago', fr: 'jours' },
	'court.welcomeKicker': { en: 'Welcome to Verdict', fr: 'Bienvenue sur Verdict' },
	'court.welcomeTitle': { en: 'Build your first exercise in 90 seconds', fr: 'Créez votre premier exercice en 90 secondes' },
	'court.welcomeDesc': {
		en: 'Pick a legal pack, describe the skill to train, and send a grounded exercise into judge mode. We\'ll stay inside your sources.',
		fr: 'Choisissez un pack juridique, décrivez la compétence à entraîner et envoyez un exercice fondé en mode juge. Tout reste dans vos sources.'
	},
	'court.welcomeStart': { en: 'Open Create', fr: 'Ouvrir Créer' },
	'court.welcomeHow': { en: 'How it works', fr: 'Comment ça marche' },

	// ===== LIBRARY =====
	'library.title': { en: 'Library', fr: 'Bibliothèque' },
	'library.helpBtn': { en: 'Help', fr: 'Aide' },
	'library.quebec': { en: 'Quebec', fr: 'Québec' },
	'library.quebecSub': { en: 'Provincial statutes and codes', fr: 'Lois et codes provinciaux' },
	'library.canada': { en: 'Canada', fr: 'Canada' },
	'library.canadaSub': { en: 'Federal legislation', fr: 'Législation fédérale' },
	'library.documents': { en: 'documents', fr: 'documents' },
	'library.placeholder': { en: '⚠ Placeholder content', fr: '⚠ Contenu provisoire' },
	'library.selectDoc': { en: 'Select a document to open the reader.', fr: 'Sélectionnez un document pour l\'ouvrir.' },
	'library.loading': { en: 'Loading document…', fr: 'Chargement du document…' },
	'library.unavailable': { en: 'Document unavailable. Ensure the source exists and is readable.', fr: 'Document indisponible. Vérifiez que la source existe et est lisible.' },
	'library.addSourceUrl': { en: 'Add Source URL', fr: 'Ajouter une URL de source' },
	'library.sourceUrl': { en: 'Source URL', fr: 'URL de la source' },
	'library.ingesting': { en: 'Analyzing...', fr: 'Analyse...' },
	'library.preview': { en: 'Preview', fr: 'Aperçu' },
	'library.ingestFailed': { en: 'Unable to ingest this URL.', fr: 'Impossible d\'ingérer cette URL.' },
	'library.unverifiedWarning': {
		en: 'This domain is unverified. Review the source carefully before using it in simulation.',
		fr: 'Ce domaine n\'est pas vérifié. Vérifiez bien la source avant de l\'utiliser en simulation.'
	},
	'library.saveSource': { en: 'Save Source', fr: 'Enregistrer la source' },
	'error.notFound': { en: 'Page not found', fr: 'Page introuvable' },
	'error.generic': { en: 'Something went wrong', fr: 'Une erreur est survenue' },
	'error.backHome': { en: 'Back to Home', fr: 'Retour à l\'accueil' },
	'library.statsChars': { en: 'characters', fr: 'caractères' },
	'library.statsPages': { en: 'pages (est.)', fr: 'pages (est.)' },
	'library.statsChunks': { en: 'AI sections (est.)', fr: 'sections IA (est.)' },
	'library.remove': { en: 'Remove', fr: 'Retirer' },
	'library.myPacks': { en: 'My Source Packs', fr: 'Mes packs de sources' },
	'library.createPack': { en: 'Create Pack', fr: 'Créer un pack' },
	'library.editPack': { en: 'Edit Pack', fr: 'Modifier le pack' },
	'library.edit': { en: 'Edit', fr: 'Modifier' },
	'library.delete': { en: 'Delete', fr: 'Supprimer' },
	'library.addUrl': { en: 'Add URL', fr: 'Ajouter URL' },
	'library.uploadPdf': { en: 'Upload PDF', fr: 'Téléverser PDF' },
	'library.uploadDoc': { en: 'Upload Document', fr: 'Téléverser un document' },
	'library.pasteText': { en: 'Paste Text', fr: 'Coller texte' },
	'library.noPackSelected': { en: 'Select a source pack to view and manage its documents.', fr: 'Sélectionnez un pack de sources pour voir et gérer ses documents.' },
	'library.packName': { en: 'Pack name', fr: 'Nom du pack' },
	'library.packLanguage': { en: 'Pack language', fr: 'Langue du pack' },
	'library.languageEnglish': { en: 'English', fr: 'Anglais' },
	'library.languageFrench': { en: 'French', fr: 'Français' },
	'library.packDomain': { en: 'Domain', fr: 'Domaine' },
	'library.packDescription': { en: 'Description', fr: 'Description' },
	'library.cancel': { en: 'Cancel', fr: 'Annuler' },
	'library.save': { en: 'Save', fr: 'Enregistrer' },
	'library.addSourceToPack': { en: 'Add source to pack', fr: 'Ajouter une source au pack' },
	'library.sourceTitle': { en: 'Source title', fr: 'Titre de la source' },
	'library.sourceDescription': { en: 'Source description', fr: 'Description de la source' },
	'library.sourceText': { en: 'Paste source text', fr: 'Coller le texte de la source' },
	'library.fileRequired': { en: 'Please select a file first.', fr: 'Veuillez d\'abord sélectionner un fichier.' },
	'library.pasteRequired': { en: 'Please provide a title and text.', fr: 'Veuillez fournir un titre et du texte.' },
	'library.pdfParseFailed': { en: 'Failed to extract text from document.', fr: 'Impossible d\'extraire le texte du document.' },
	'library.pdfSupported': { en: 'Upload a PDF or Word document (.docx) — text will be extracted and indexed automatically.', fr: 'Téléversez un PDF ou un document Word (.docx) — le texte sera extrait et indexé automatiquement.' },
	'library.parsingPdf': { en: 'Extracting text...', fr: 'Extraction du texte...' },
	'library.largeFileWarning': { en: 'Large file detected. For best results with very long documents (e.g. full Criminal Code), consider uploading specific parts or chapters.', fr: 'Fichier volumineux détecté. Pour de meilleurs résultats avec les très longs documents (ex. Code criminel complet), envisagez de téléverser des parties ou chapitres spécifiques.' },
	'library.extractingPages': { en: 'Loading PDF...', fr: 'Chargement du PDF...' },
	'library.extractingPageN': { en: 'Extracting page {current} of {total}...', fr: 'Extraction de la page {current} sur {total}...' },
	'library.extractingWord': { en: 'Extracting Word document...', fr: 'Extraction du document Word...' },
	'library.uploadingOriginal': { en: 'Uploading original file...', fr: 'Téléversement du fichier original...' },
	'library.storingChunks': { en: 'Storing chunks...', fr: 'Stockage des fragments...' },
	'library.noTextExtracted': { en: 'No text could be extracted from this document.', fr: 'Aucun texte n\'a pu être extrait de ce document.' },
	'library.unsupportedFormat': { en: 'Unsupported file format. Please upload a PDF or Word document (.docx).', fr: 'Format de fichier non supporté. Veuillez téléverser un PDF ou un document Word (.docx).' },
	'library.openDocument': { en: 'Open document', fr: 'Ouvrir le document' },
	'library.structureReady': { en: 'Classroom-ready structure', fr: 'Structure prête pour la classe' },
	'library.structureReview': { en: 'Structure needs review', fr: 'Structure à vérifier' },
	'library.structureFallback': { en: 'Generic text indexing', fr: 'Indexation texte générique' },
	'library.structureUnits': { en: '{count} legal units', fr: '{count} unités juridiques' },
	'library.structureScore': { en: '{score}% quality', fr: 'qualité {score} %' },
	'library.bilingualRisk': { en: 'Language mixing detected', fr: 'Mélange de langues détecté' },
	'library.rename': { en: 'Rename', fr: 'Renommer' },
	'library.renameTitle': { en: 'Rename document', fr: 'Renommer le document' },
	'library.downloadOriginal': { en: 'Download original', fr: 'Télécharger l\'original' },
	'library.openInNewTab': { en: 'Open in new tab', fr: 'Ouvrir dans un nouvel onglet' },
	'library.preparingPreview': { en: 'Preparing document...', fr: 'Préparation du document...' },
	'library.previewFailed': { en: 'Could not load original file. Showing extracted text instead.', fr: 'Impossible de charger le fichier original. Affichage du texte extrait à la place.' },
	'library.legacyNoOriginal': { en: 'Original file not stored. This document was uploaded before file preview was available — re-upload to see the original layout.', fr: 'Fichier original non disponible. Ce document a été téléversé avant l\'activation de l\'aperçu — re-téléversez-le pour voir la mise en page d\'origine.' },
	'library.docxRendered': { en: 'Word document rendered for preview. Click Download for the original .docx file.', fr: 'Document Word rendu pour l\'aperçu. Cliquez sur Télécharger pour le fichier .docx original.' },
	'library.emptyPack': {
		en: 'No sources yet — click "Upload Document" to add your first law or jurisprudence.',
		fr: 'Aucune source — cliquez sur « Téléverser un document » pour ajouter votre première loi ou jurisprudence.'
	},
	'library.helpTitle': { en: 'How to Use the Library', fr: 'Comment utiliser la bibliothèque' },
	'library.helpWhatPackTitle': { en: 'What is a Source Pack?', fr: 'Qu\'est-ce qu\'un pack de sources ?' },
	'library.helpWhatPackDesc': {
		en: 'A Source Pack is a folder for the documents you want Verdict to read. Create one for a course, topic, or assignment; Create and judge mode will stay inside the selected documents.',
		fr: 'Un pack de sources est un dossier pour les documents que Verdict doit lire. Créez-en un pour un cours, un sujet ou un devoir; Créer et le mode juge resteront dans les documents sélectionnés.'
	},
	'library.helpCreatePackTitle': { en: 'How to Create a Pack', fr: 'Comment créer un pack' },
	'library.helpCreateStep1': {
		en: '1. Click the "Create Pack" button in the sidebar on the left.',
		fr: '1. Cliquez sur le bouton « Créer un pack » dans la barre latérale à gauche.'
	},
	'library.helpCreateStep2': {
		en: '2. Give it a name, language, and optional domain (e.g. Criminal, Civil).',
		fr: '2. Donnez-lui un nom, une langue et un domaine optionnel (ex. Criminel, Civil).'
	},
	'library.helpCreateStep3': {
		en: '3. Done! Your pack is ready — now upload PDFs or Word documents into it.',
		fr: '3. Voilà ! Votre pack est prêt — téléversez-y maintenant des PDF ou documents Word.'
	},
	'library.helpUploadTitle': { en: 'How to Upload Documents', fr: 'Comment téléverser des documents' },
	'library.helpUploadStep1': {
		en: '1. Find the law or court decision you need on an official website (e.g. laws-lois.justice.gc.ca, canlii.ca, legifrance.gouv.fr).',
		fr: '1. Trouvez la loi ou la décision de justice sur un site officiel (ex. laws-lois.justice.gc.ca, canlii.ca, legifrance.gouv.fr).'
	},
	'library.helpUploadStep2': {
		en: '2. Download it as a PDF or Word document (.docx).',
		fr: '2. Téléchargez-la en PDF ou en document Word (.docx).'
	},
	'library.helpUploadStep3': {
		en: '3. Select a pack, then click "Upload Document" and pick your file.',
		fr: '3. Sélectionnez un pack, puis cliquez sur « Téléverser un document » et choisissez votre fichier.'
	},
	'library.helpUploadStep4': {
		en: '4. The AI will automatically extract and index every article so it can cite them during your debates.',
		fr: '4. L\'IA extraira et indexera automatiquement chaque article pour les citer durant vos débats.'
	},
	'library.helpExampleTitle': { en: 'Example: A Completed Pack', fr: 'Exemple : Un pack complété' },
	'library.helpExamplePackName': { en: 'Canadian Federal Law', fr: 'Droit fédéral canadien' },
	'library.helpExampleNote': {
		en: 'Upload law PDFs and court decisions — the AI will search all of them simultaneously during your debates.',
		fr: 'Téléversez les PDF de lois et les décisions de justice — l\'IA les consultera tous simultanément durant vos débats.'
	},
	'library.helpGotIt': { en: 'Got it!', fr: 'Compris !' },
	'library.readerShowing': { en: 'Showing {shown} of {total} characters', fr: 'Affichage de {shown} caractères sur {total}' },
	'library.readerLoadMore': { en: 'Load more text', fr: 'Charger plus de texte' },

	// ===== ABOUT =====
	'about.title': { en: 'About Verdict', fr: 'À propos de Verdict' },
	'about.kicker': { en: 'What is Verdict?', fr: 'Qu\'est-ce que Verdict ?' },
	'about.description': {
		en: 'Verdict is your AI-powered legal reasoning coach. Upload real laws as PDFs, build a case, and argue before a demanding AI judge — then get scored on your performance.',
		fr: 'Verdict est votre coach de raisonnement juridique propulsé par l\'IA. Téléversez de vraies lois en PDF, construisez une cause et plaidez devant un juge IA exigeant — puis recevez une note sur votre performance.'
	},
	'about.mission': { en: 'Why Verdict?', fr: 'Pourquoi Verdict ?' },
	'about.missionText': {
		en: 'Law school teaches you the rules — Verdict lets you practice using them. Whether you\'re a student preparing for moots, a professional sharpening advocacy skills, or simply curious about legal reasoning, Verdict gives you a safe space to argue, fail, learn, and improve.',
		fr: 'L\'école de droit enseigne les règles — Verdict vous permet de les mettre en pratique. Que vous soyez étudiant(e) préparant un procès simulé, professionnel(le) perfectionnant vos compétences de plaidoirie, ou simplement curieux du raisonnement juridique, Verdict offre un espace sûr pour argumenter, échouer, apprendre et progresser.'
	},
	'about.highlightsTitle': { en: 'What You Get', fr: 'Ce que vous obtenez' },
	'about.highlightPacksLabel': { en: 'Your Own Legal Library', fr: 'Votre propre bibliothèque juridique' },
	'about.highlightPacksText': {
		en: 'Upload PDF legislation (Criminal Code, Labour Code, etc.) into organized packs. The AI reads and indexes them so it can cite real law during debates.',
		fr: 'Téléversez des lois en PDF (Code criminel, Code du travail, etc.) dans des packs organisés. L\'IA les lit et les indexe pour citer le vrai droit durant les débats.'
	},
	'about.highlightDebateLabel': { en: 'Judge-Led Practice', fr: 'Pratique guidée par le juge' },
	'about.highlightDebateText': {
		en: 'Pick plaintiff or defendant and face an AI judge that pressures your argument with source-bound questions, credibility checks, and legal reasoning.',
		fr: 'Choisissez demandeur ou défendeur et faites face à un juge IA qui met votre argument à l\'épreuve avec des questions fondées sur les sources, des vérifications de crédibilité et du raisonnement juridique.'
	},
	'about.highlightScoreLabel': { en: 'Performance Feedback', fr: 'Retour de performance' },
	'about.highlightScoreText': {
		en: 'Every case ends with a detailed scorecard across five pillars — legal accuracy, argument structure, persuasion, responsiveness, and fact usage — so you know exactly what to improve.',
		fr: 'Chaque cause se termine par un bulletin détaillé sur cinq piliers — exactitude juridique, structure d\'argument, persuasion, réactivité et utilisation des faits — pour savoir exactement quoi améliorer.'
	},
	'about.return': { en: 'Return to Dashboard', fr: 'Retour au tableau de bord' },

	// ===== HOW IT WORKS =====
	'how.title': { en: 'How It Works', fr: 'Comment ça marche' },
	'how.kicker': { en: 'Getting Started', fr: 'Pour commencer' },
	'how.subtitle': { en: 'From uploading your first law to winning your first case — here\'s how Verdict works, step by step.', fr: 'Du téléversement de votre première loi à la victoire de votre première cause — voici comment Verdict fonctionne, étape par étape.' },
	'how.sectionLibrary': { en: 'Step 1 — Build Your Legal Library', fr: 'Étape 1 — Construire votre bibliothèque juridique' },
	'how.step1Title': { en: 'Create a Legal Pack', fr: 'Créer un pack juridique' },
	'how.step1Desc': {
		en: 'Go to Library and create a new pack (e.g. "Canadian Criminal Law"). A pack is a folder that groups related laws together.',
		fr: 'Allez dans Bibliothèque et créez un nouveau pack (ex. « Droit criminel canadien »). Un pack est un dossier qui regroupe des lois connexes.'
	},
	'how.step2Title': { en: 'Upload PDF Legislation', fr: 'Téléverser des lois en PDF' },
	'how.step2Desc': {
		en: 'Find the law you need online (e.g. from government websites), download it as PDF, and upload it to your pack. The AI will automatically read and index the content so it can reference it during debates.',
		fr: 'Trouvez la loi dont vous avez besoin en ligne (ex. sites gouvernementaux), téléchargez-la en PDF et téléversez-la dans votre pack. L\'IA lira et indexera automatiquement le contenu pour le référencer durant les débats.'
	},
	'how.sectionCase': { en: 'Step 2 — Set Up Your Case', fr: 'Étape 2 — Préparer votre cause' },
	'how.step3Title': { en: 'Select Your Pack', fr: 'Sélectionner votre pack' },
	'how.step3Desc': {
		en: 'Go to Cases and pick the legal pack you just created. This tells the AI which laws apply to your case.',
		fr: 'Allez dans Causes et choisissez le pack juridique que vous venez de créer. Cela indique à l\'IA quelles lois s\'appliquent à votre cause.'
	},
	'how.step4Title': { en: 'Fill In or Auto-Generate', fr: 'Remplir ou générer automatiquement' },
	'how.step4Desc': {
		en: 'Choose your side (plaintiff or defendant). Then either write your own case details or hit Auto-Fill to let the AI generate a realistic scenario based on your uploaded laws.',
		fr: 'Choisissez votre camp (demandeur ou défendeur). Ensuite, rédigez vos détails de cause ou appuyez sur Remplissage auto pour que l\'IA génère un scénario réaliste basé sur vos lois téléversées.'
	},
	'how.sectionDebate': { en: 'Step 3 — Debate & Get Scored', fr: 'Étape 3 — Débattre et être noté' },
	'how.step5Title': { en: 'Argue Your Case', fr: 'Plaidez votre cause' },
	'how.step5Desc': {
		en: 'Enter the courtroom and present your arguments. The AI judge responds with source-grounded questions, concerns, and direction in real time.',
		fr: 'Entrez dans la salle d\'audience et présentez vos arguments. Le juge IA répond en temps réel avec des questions, des réserves et des orientations fondées sur les sources.'
	},
	'how.step6Title': { en: 'Get Your Verdict', fr: 'Obtenez votre verdict' },
	'how.step6Desc': {
		en: 'When you\'re ready, close the case. You\'ll receive a detailed scorecard covering legal accuracy, argument structure, persuasion, responsiveness, and fact usage. Your results are saved so you can track your progress over time.',
		fr: 'Quand vous êtes prêt(e), clôturez la cause. Vous recevrez un bulletin détaillé couvrant l\'exactitude juridique, la structure d\'argument, la persuasion, la réactivité et l\'utilisation des faits. Vos résultats sont sauvegardés pour suivre votre progression.'
	},
	'how.tipTitle': { en: 'Pro Tips', fr: 'Conseils pratiques' },
	'how.tip1': {
		en: 'You can upload multiple PDFs into one pack — the AI searches all of them during a debate.',
		fr: 'Vous pouvez téléverser plusieurs PDF dans un pack — l\'IA les consulte tous durant un débat.'
	},
	'how.tip2': {
		en: 'Auto-Fill creates realistic cases based on your actual uploaded laws — great for quick practice.',
		fr: 'Le remplissage auto crée des causes réalistes basées sur vos lois téléversées — idéal pour la pratique rapide.'
	},
	'how.tip3': {
		en: 'Try both sides! Arguing as plaintiff and defendant on the same case doubles your learning.',
		fr: 'Essayez les deux camps ! Plaider comme demandeur et défendeur sur la même cause double votre apprentissage.'
	},
	'how.return': { en: 'Return to Dashboard', fr: 'Retour au tableau de bord' },

	// ===== PRICING =====
	'pricing.kicker': { en: 'Plans & Pricing', fr: 'Plans et tarifs' },
	'pricing.title': { en: 'Choose Your Plan', fr: 'Choisissez votre plan' },
	'pricing.subtitle': {
		en: 'Start free, upgrade when you need more advocacy practice.',
		fr: 'Commencez gratuitement, passez au Pro pour plus de pratique.'
	},
	'pricing.month': { en: 'month', fr: 'mois' },
	'pricing.popular': { en: 'Most Popular', fr: 'Le plus populaire' },
	'pricing.currentPlan': { en: 'Current Plan', fr: 'Plan actuel' },
	'pricing.subscribe': { en: 'Subscribe', fr: 'S\'abonner' },
	'pricing.manageSub': { en: 'Manage Subscription', fr: 'Gérer l\'abonnement' },
	'pricing.redirecting': { en: 'Redirecting to checkout…', fr: 'Redirection vers le paiement…' },
	'pricing.openingPortal': { en: 'Opening billing portal…', fr: 'Ouverture du portail…' },
	'pricing.talkToUs': { en: 'Talk to Us', fr: 'Contactez-nous' },
	'pricing.contactUs': { en: 'Custom Pricing', fr: 'Tarif sur mesure' },
	'pricing.contactTitle': { en: 'Get in Touch', fr: 'Prenez contact' },
	'pricing.contactSubtitle': {
		en: 'Tell us about your needs and we\'ll get back to you within 24 hours.',
		fr: 'Décrivez vos besoins et nous vous répondrons dans les 24 heures.'
	},
	'pricing.contactNameLabel': { en: 'Full Name', fr: 'Nom complet' },
	'pricing.contactNamePlaceholder': { en: 'Jane Doe', fr: 'Jean Tremblay' },
	'pricing.contactEmailLabel': { en: 'Email', fr: 'Courriel' },
	'pricing.contactEmailPlaceholder': { en: 'jane@firm.com', fr: 'jean@cabinet.ca' },
	'pricing.contactMessageLabel': { en: 'Message', fr: 'Message' },
	'pricing.contactMessagePlaceholder': {
		en: 'Tell us about your team, use case, or any questions...',
		fr: 'Parlez-nous de votre équipe, cas d\'utilisation ou questions...'
	},
	'pricing.contactSend': { en: 'Send Message', fr: 'Envoyer' },
	'pricing.contactSending': { en: 'Sending…', fr: 'Envoi…' },
	'pricing.contactSentTitle': { en: 'Message Sent!', fr: 'Message envoyé!' },
	'pricing.contactSentDesc': {
		en: 'We\'ll review your inquiry and get back to you shortly.',
		fr: 'Nous examinerons votre demande et vous répondrons rapidement.'
	},
	'pricing.contactClose': { en: 'Close', fr: 'Fermer' },
	'pricing.contactAllRequired': {
		en: 'Please fill in all fields.',
		fr: 'Veuillez remplir tous les champs.'
	},
	'pricing.contactError': {
		en: 'Something went wrong. Please try again.',
		fr: 'Une erreur est survenue. Veuillez réessayer.'
	},
	'pricing.successMessage': {
		en: 'Welcome to Verdict Pro! You now have access to 30 debates per month.',
		fr: 'Bienvenue dans Verdict Pro! Vous avez maintenant accès à 30 débats par mois.'
	},
	'pricing.canceledMessage': {
		en: 'Checkout was canceled. You can try again anytime.',
		fr: 'Le paiement a été annulé. Vous pouvez réessayer à tout moment.'
	},
	'pricing.freeName': { en: 'Free', fr: 'Gratuit' },
	'pricing.freeDesc': {
		en: 'Get started — no credit card needed.',
		fr: 'Commencez — aucune carte requise.'
	},
	'pricing.freeFeature1': { en: '3 debates per month', fr: '3 débats par mois' },
	'pricing.freeFeature2': { en: 'Up to 10 rounds each', fr: 'Jusqu\'à 10 tours chacun' },
	'pricing.freeFeature3': { en: 'AI scoring & feedback', fr: 'Notation et rétroaction IA' },
	'pricing.proName': { en: 'Pro', fr: 'Pro' },
	'pricing.proDesc': {
		en: 'For students and professionals who practice regularly.',
		fr: 'Pour étudiants et professionnels qui pratiquent régulièrement.'
	},
	'pricing.proFeature1': { en: '20 debates per month', fr: '20 débats par mois' },
	'pricing.proFeature2': { en: 'Up to 15 rounds each', fr: 'Jusqu\'à 15 tours chacun' },
	'pricing.proFeature3': { en: 'Case history & persistence', fr: 'Historique et sauvegarde des causes' },
	'pricing.proFeature4': { en: 'PDF upload & AI indexing', fr: 'Téléversement PDF et indexation IA' },
	'pricing.proPlusName': { en: 'Pro+', fr: 'Pro+' },
	'pricing.proPlusDesc': {
		en: 'Maximum firepower for power users.',
		fr: 'Puissance maximale pour les utilisateurs avancés.'
	},
	'pricing.proPlusFeature1': { en: '60 debates per month', fr: '60 débats par mois' },
	'pricing.proPlusFeature2': { en: 'Up to 20 rounds each', fr: 'Jusqu\'à 20 tours chacun' },
	'pricing.proPlusFeature3': { en: 'Longer, deeper arguments', fr: 'Arguments plus longs et approfondis' },
	'pricing.proPlusFeature4': { en: 'Everything in Pro', fr: 'Tout ce qui est dans Pro' },
	'pricing.enterpriseName': { en: 'Enterprise', fr: 'Entreprise' },
	'pricing.enterpriseDesc': {
		en: 'For law firms, schools, and institutions.',
		fr: 'Pour cabinets, écoles et institutions.'
	},
	'pricing.entFeature1': { en: 'Unlimited debates', fr: 'Débats illimités' },
	'pricing.entFeature2': { en: 'Volume pricing', fr: 'Tarification en volume' },
	'pricing.entFeature3': { en: 'Dedicated support', fr: 'Support dédié' },
	'pricing.entFeature4': { en: 'Custom onboarding', fr: 'Intégration personnalisée' },
	'pricing.limitReached': {
		en: 'You\'ve reached your credit limit for this period.',
		fr: 'Vous avez atteint votre limite de crédits pour cette période.'
	},
	'pricing.limitDesc': {
		en: 'Upgrade your plan for more credits and longer debates.',
		fr: 'Passez à un plan supérieur pour plus de crédits et des débats plus longs.'
	},
	'pricing.upgradePro': { en: 'Upgrade', fr: 'Passer au supérieur' },
	'pricing.debatesRemaining': { en: 'Credits remaining', fr: 'Crédits restants' },
	'nav.pricing': { en: 'Pricing', fr: 'Tarifs' },

	// ===== DASHBOARD =====
	'dashboard.kicker': { en: 'Your Account', fr: 'Votre compte' },
	'dashboard.title': { en: 'Dashboard', fr: 'Tableau de bord' },
	'dashboard.subscription': { en: 'Subscription', fr: 'Abonnement' },
	'dashboard.renewsOn': { en: 'Renews on', fr: 'Renouvellement le' },
	'dashboard.freeDesc': { en: 'Limited to 3 credits. Upgrade for more credits and longer debates.', fr: 'Limité à 3 crédits. Passez au supérieur pour plus de crédits.' },
	'dashboard.cases': { en: 'Cases', fr: 'Causes' },
	'dashboard.totalCases': { en: 'Total', fr: 'Total' },
	'dashboard.creditsUsed': { en: 'Credits Used', fr: 'Crédits utilisés' },
	'dashboard.maxRounds': { en: 'Max Rounds / Debate', fr: 'Tours max / débat' },
	'dashboard.performance': { en: 'Overall Performance', fr: 'Performance globale' },
	'dashboard.noScores': { en: 'No scored debates yet. End a case to see your performance.', fr: 'Aucun débat noté. Terminez une cause pour voir votre performance.' },
	'dashboard.basedOn': { en: 'Based on', fr: 'Basé sur' },
	'dashboard.debate': { en: 'debate', fr: 'débat' },
	'dashboard.debates': { en: 'debates', fr: 'débats' },

	// ===== V2 STUDIO (source-bound create + hearing) =====
	'v2.title': { en: 'Create a Case', fr: 'Créer une cause' },
	'v2.subtitle': {
		en: 'Describe the exercise. Verdict grounds it only in your selected sources.',
		fr: 'Décrivez l\'exercice. Verdict le fonde uniquement sur vos sources sélectionnées.'
	},
	'v2.pack': { en: 'Legal pack', fr: 'Trousse juridique' },
	'v2.noPacks': {
		en: 'No legal packs yet. Add sources in the Library first.',
		fr: 'Aucune trousse juridique. Ajoutez d\'abord des sources dans Sources.'
	},
	'v2.sources': { en: 'Sources', fr: 'Sources' },
	'v2.allSources': { en: 'All sources in pack', fr: 'Toutes les sources de la trousse' },
	'v2.role': { en: 'Argue as', fr: 'Plaider en tant que' },
	'v2.plaintiff': { en: 'Plaintiff', fr: 'Demandeur' },
	'v2.defendant': { en: 'Defendant', fr: 'Défendeur' },
	'v2.yourSide': { en: 'You argue as', fr: 'Vous plaidez pour' },
	'v2.requestLabel': { en: 'Your request', fr: 'Votre demande' },
	'v2.requestPlaceholder': {
		en: 'e.g. Build a case on article 1457 about civil liability',
		fr: 'ex. Fais un cas sur l\'article 1457 sur la responsabilité civile'
	},
	'v2.build': { en: 'Build dossier', fr: 'Construire le dossier' },
	'v2.building': { en: 'Building…', fr: 'Construction…' },
	'v2.grounded': { en: 'Grounded in sources', fr: 'Fondé sur les sources' },
	'v2.notGrounded': { en: 'Limited source support', fr: 'Appui documentaire limité' },
	'v2.facts': { en: 'Facts', fr: 'Faits' },
	'v2.issues': { en: 'Issues', fr: 'Questions en litige' },
	'v2.remedy': { en: 'Remedy sought', fr: 'Réparation demandée' },
	'v2.objective': { en: 'Objective', fr: 'Objectif' },
	'v2.citations': { en: 'Verified citations', fr: 'Citations vérifiées' },
	'v2.boundaries': { en: 'Source boundaries', fr: 'Limites des sources' },
	'v2.warnings': { en: 'Honest notes', fr: 'Notes de transparence' },
	'v2.enterHearing': { en: 'Enter the hearing', fr: 'Entrer à l\'audience' },
	'v2.newCase': { en: 'New case', fr: 'Nouvelle cause' },
	'v2.leaveHearing': { en: 'Leave', fr: 'Quitter' },
	'v2.viewCase': { en: 'View case file', fr: 'Voir le dossier' },
	'v2.openingPrompt': { en: 'The bench is seated. Make your opening submission.', fr: 'La cour est constituée. Présentez vos premières observations.' },
	'v2.judgeMind': { en: 'The bench', fr: 'La cour' },
	'v2.judgeMindHint': { en: 'How your case is landing — grounded only in the record.', fr: 'Comment votre cause est reçue — fondée uniquement sur le dossier.' },
	'v2.persuasion': { en: 'Persuaded', fr: 'Convaincue' },
	'v2.leanUndecided': { en: 'Undecided — the record is balanced.', fr: 'Indécise — le dossier est équilibré.' },
	'v2.thoughts': { en: 'On the bench\u2019s mind', fr: 'Réflexions de la cour' },
	'v2.citationCheck': { en: 'On your authorities', fr: 'Sur vos autorités' },
	'v2.nextChallenge': { en: 'What would move the bench', fr: 'Ce qui ferait pencher la cour' },
	'v2.mindEmpty': { en: 'Make a submission and the bench will weigh in.', fr: 'Présentez vos observations et la cour se prononcera.' },
	'v2.hearing': { en: 'The Hearing', fr: 'L\'audience' },
	'v2.you': { en: 'You', fr: 'Vous' },
	'v2.submitPlaceholder': { en: 'Make your submission to the Court…', fr: 'Présentez vos arguments à la Cour…' },
	'v2.submit': { en: 'Submit', fr: 'Soumettre' },
	'v2.thinking': { en: 'The Court is considering…', fr: 'La Cour délibère…' },
	'v2.refused': {
		en: 'The Court declined to rely on unsupported authority.',
		fr: 'La Cour a refusé de s\'appuyer sur une autorité non étayée.'
	},
	'v2.error': { en: 'Something went wrong. Please try again.', fr: 'Une erreur est survenue. Veuillez réessayer.' },
	'v2.emptyRequest': { en: 'Describe the case you want to build.', fr: 'Décrivez la cause à construire.' },
	'v2.noSources': { en: 'Select at least one source.', fr: 'Sélectionnez au moins une source.' },
	'v2.chatIntro': {
		en: 'Tell me about the case you want to build from your sources. I\'ll only use what\'s in them.',
		fr: 'Parlez-moi de la cause que vous voulez bâtir à partir de vos sources. Je n\'utiliserai que ce qu\'elles contiennent.'
	},
	'v2.chatPlaceholder': {
		en: 'Ask Verdict',
		fr: 'Demandez à Verdict'
	},
	'v2.send': { en: 'Send', fr: 'Envoyer' },
	'v2.assistant': { en: 'Assistant', fr: 'Assistant' },
	'v2.chatThinking': { en: 'Reading your sources…', fr: 'Lecture de vos sources…' },
	'v2.buildNow': { en: 'Build this case', fr: 'Construire cette cause' },
	'v2.readyHint': { en: 'Ready when you are — or keep refining.', fr: 'Prêt quand vous l\'êtes — ou continuez à préciser.' },
	'v2.openCase': { en: 'Open the case file', fr: 'Ouvrir le dossier' },
	'v2.close': { en: 'Close', fr: 'Fermer' },
	'v2.editSources': { en: 'Sources & role', fr: 'Sources et rôle' },

	// Teacher assignments — publish, student entry, recorded review
	'assignment.assignToStudents': { en: 'Assign to students', fr: 'Attribuer aux étudiants' },
	'assignment.publishTitle': { en: 'Assign this exercise', fr: 'Attribuer cet exercice' },
	'assignment.publishHint': {
		en: 'Freeze this case so every student argues the exact same exercise. Their hearings are recorded for your review.',
		fr: 'Figez cette cause pour que chaque étudiant plaide exactement le même exercice. Leurs audiences sont enregistrées pour votre révision.'
	},
	'assignment.instructionsLabel': { en: 'Guidelines for students (optional)', fr: 'Consignes pour les étudiants (facultatif)' },
	'assignment.instructionsPlaceholder': {
		en: 'e.g. Focus on the duty of good faith. You represent the defendant. Address the bench formally.',
		fr: 'p. ex. Concentrez-vous sur l\'obligation de bonne foi. Vous représentez le défendeur. Adressez-vous formellement à la cour.'
	},
	'assignment.publishCta': { en: 'Create assignment link', fr: 'Créer le lien d\'exercice' },
	'assignment.publishing': { en: 'Creating…', fr: 'Création…' },
	'assignment.loginToPublish': { en: 'Please sign in to assign exercises.', fr: 'Veuillez vous connecter pour attribuer des exercices.' },
	'assignment.shareLink': { en: 'Share this link with your students', fr: 'Partagez ce lien avec vos étudiants' },
	'assignment.shareLinkHint': {
		en: 'Everyone who opens it argues the identical case. Track their work under Assignments.',
		fr: 'Tous ceux qui l\'ouvrent plaident la cause identique. Suivez leur travail sous Exercices.'
	},
	'assignment.copyLink': { en: 'Copy link', fr: 'Copier le lien' },
	'assignment.copied': { en: 'Copied', fr: 'Copié' },
	// Student entry
	'assignment.label': { en: 'Assigned exercise', fr: 'Exercice attribué' },
	'assignment.youRepresent': { en: 'You represent', fr: 'Vous représentez' },
	'assignment.guidelines': { en: 'Instructions', fr: 'Consignes' },
	'assignment.identify': { en: 'Before you begin', fr: 'Avant de commencer' },
	'assignment.identifyHint': {
		en: 'Your name and email let your instructor identify your recorded hearing.',
		fr: 'Votre nom et votre courriel permettent à votre enseignant d\'identifier votre audience enregistrée.'
	},
	'assignment.fullName': { en: 'Full name', fr: 'Nom complet' },
	'assignment.email': { en: 'Email', fr: 'Courriel' },
	'assignment.nameRequired': { en: 'Please enter your name.', fr: 'Veuillez saisir votre nom.' },
	'assignment.emailRequired': { en: 'Please enter a valid email.', fr: 'Veuillez saisir un courriel valide.' },
	'assignment.enterHearing': { en: 'Enter the hearing', fr: 'Entrer dans l\'audience' },
	'assignment.entering': { en: 'Entering…', fr: 'Entrée…' },
	'assignment.recordedNotice': {
		en: 'Your hearing is recorded and shared with your instructor.',
		fr: 'Votre audience est enregistrée et transmise à votre enseignant.'
	},
	// Finish + submitted
	'assignment.finishSubmit': { en: 'Finish & submit', fr: 'Terminer et soumettre' },
	'assignment.submitting': { en: 'Submitting…', fr: 'Soumission…' },
	'assignment.submittedTitle': { en: 'Hearing submitted', fr: 'Audience soumise' },
	'assignment.submittedBody': {
		en: 'Your hearing has been recorded and sent to your instructor. You may close this window.',
		fr: 'Votre audience a été enregistrée et transmise à votre enseignant. Vous pouvez fermer cette fenêtre.'
	},
	'assignment.done': { en: 'Done', fr: 'Terminé' },
	// Teacher roster / review
	'assignment.rosterTitle': { en: 'Assignments', fr: 'Exercices' },
	'assignment.rosterHint': {
		en: 'Exercises you have assigned and the hearings your students recorded.',
		fr: 'Les exercices que vous avez attribués et les audiences enregistrées par vos étudiants.'
	},
	'assignment.rosterEmpty': {
		en: 'No assignments yet. Build a case, then choose “Assign to students”.',
		fr: 'Aucun exercice pour l\'instant. Construisez une cause, puis choisissez « Attribuer aux étudiants ».'
	},
	'assignment.submissionsCount': { en: '{n} submissions', fr: '{n} soumissions' },
	'assignment.review': { en: 'Review', fr: 'Réviser' },
	'assignment.hide': { en: 'Hide', fr: 'Masquer' },
	'assignment.loading': { en: 'Loading…', fr: 'Chargement…' },
	'assignment.noSubmissions': { en: 'No submissions yet.', fr: 'Aucune soumission pour l\'instant.' },
	'assignment.turns': { en: '{n} submissions made', fr: '{n} interventions' },
	'assignment.submittedAt': { en: 'Submitted', fr: 'Soumis le' }
} as const;

type TranslationKey = keyof typeof translations;

export const t = (key: TranslationKey, lang: Lang): string => {
	const entry = translations[key];
	if (!entry) return key;
	return entry[lang] ?? entry.en;
};

export default translations;
