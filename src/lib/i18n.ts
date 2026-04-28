import type { Lang } from '$lib/stores/language';

const translations = {
	// ===== LAYOUT =====
	'nav.stage': { en: 'Stage', fr: 'Créer' },
	'nav.court': { en: 'Court', fr: 'Cour' },
	'nav.library': { en: 'Library', fr: 'Sources' },
	'nav.about': { en: 'About Verdict', fr: 'À propos' },
	'nav.howItWorks': { en: 'How it Works', fr: 'Comment ça marche' },
	'nav.contact': { en: 'Contact', fr: 'Contact' },
	'layout.resumePrefix': { en: 'Ongoing case:', fr: 'Cause en cours :' },
	'layout.resumeButton': { en: 'Resume', fr: 'Reprendre' },
	'meta.description': {
		en: 'Verdict — debate against AI counsel and five autonomous jurors.',
		fr: 'Verdict — débattez contre un avocat IA devant cinq jurés autonomes.'
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
	'auth.tagline': { en: 'Argue your case. Face the jury.', fr: 'Plaidez votre cause. Faites face au jury.' },
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
		en: 'Build your legal library, set up a case, and argue it before AI counsel and jurors.',
		fr: 'Créez votre bibliothèque juridique, montez un dossier et plaidez devant un avocat et des jurés IA.'
	},
	'home.initCase': { en: 'Initialize Case', fr: 'Créer une cause' },
	'home.browseLibrary': { en: 'Browse Library', fr: 'Parcourir les sources' },

	// ===== CASES =====
	'cases.header': { en: 'Start a Case', fr: 'Créer une cause' },
	'cases.subheader': {
		en: 'Keep it simple. Tell the story in plain words.',
		fr: 'Restez simple. Racontez l\'histoire en mots clairs.'
	},
	'cases.resetForm': { en: 'Reset Form', fr: 'Réinitialiser' },
	'cases.mode': { en: 'Mode', fr: 'Mode' },
	'cases.jury': { en: 'Jury', fr: 'Jury' },
	'cases.judge': { en: 'Judge', fr: 'Juge' },
	'cases.autoFill': { en: 'Auto-fill', fr: 'Remplir auto' },
	'cases.generating': { en: 'Generating...', fr: 'Génération...' },
	'cases.juryDesc': {
		en: 'Jury Trial — Debate against an AI advocate in front of 5 citizen jurors. Persuade real people, not a textbook. Each juror scores you based on credibility, logic, and fairness.',
		fr: 'Procès devant jury — Débattez contre un avocat IA devant 5 jurés citoyens. Convainquez de vraies personnes, pas un manuel. Chaque juré vous évalue sur la crédibilité, la logique et l\'équité.'
	},
	'cases.judgeDesc': {
		en: 'Bench Trial — Argue your case before a single AI judge. No jury, no persuasion — just law. Cite statutes, reference cases, and present structured legal arguments. The judge demands authority, not emotion.',
		fr: 'Procès devant juge — Argumentez votre cause devant un seul juge IA. Pas de jury, pas de persuasion — juste le droit. Citez des lois, référencez des arrêts et présentez des arguments juridiques structurés.'
	},
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
		en: 'Please select a Legal Pack first — the AI needs your uploaded laws to generate a case.',
		fr: 'Veuillez d\'abord sélectionner un Pack juridique — l\'IA a besoin de vos lois téléversées pour générer une cause.'
	},
	'cases.noSourcesInPack': {
		en: 'This pack has no sources yet. Add sources from the library.',
		fr: 'Ce pack ne contient pas encore de sources. Ajoutez des sources depuis la bibliothèque.'
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
	'cases.includeSourcesDesc': { en: 'Uncheck any source you want excluded from the AI generation.', fr: 'Décochez les sources que vous voulez exclure de la génération IA.' },
	'cases.allOn': { en: 'Select all', fr: 'Tout cocher' },
	'cases.allOff': { en: 'Deselect all', fr: 'Tout décocher' },
	'cases.chooseSide': { en: 'Choose Your Side', fr: 'Choisissez votre camp' },
	'cases.chooseSideDesc': { en: 'Now that you\'ve seen the case, which side do you want to argue?', fr: 'Maintenant que vous avez vu la cause, quel camp voulez-vous défendre?' },
	'cases.youArgue': { en: 'You\'ll argue:', fr: 'Vous plaiderez :' },
	'cases.noPacksYet': { en: 'No legal packs yet. Upload sources in the Library first.', fr: 'Aucun pack juridique. Téléversez des sources dans la Bibliothèque d\'abord.' },
	'cases.goToLibrary': { en: 'Go to Library', fr: 'Aller à la Bibliothèque' },
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

	// ===== DEBATE =====
	'debate.noCase': { en: 'No Active Case', fr: 'Aucune cause active' },
	'debate.interjection.relevance': { en: 'RELEVANCE', fr: 'PERTINENCE' },
	'debate.interjection.authority': { en: 'AUTHORITY', fr: 'AUTORITÉ' },
	'debate.interjection.procedure': { en: 'PROCEDURE', fr: 'PROCÉDURE' },
	'debate.interjection.decorum': { en: 'DECORUM', fr: 'TENUE' },
	'debate.interjection.clarification': { en: 'CLARIFICATION', fr: 'PRÉCISION' },
	'debate.noCaseDesc': { en: 'Initialize a case to enter the arena.', fr: 'Créez une cause pour entrer dans l\'arène.' },
	'debate.launchBuilder': { en: 'Launch Case Builder', fr: 'Créer une cause' },
	'debate.activeCase': { en: 'Active Case', fr: 'Cause active' },
	'debate.pl': { en: 'PL', fr: 'DEM' },
	'debate.df': { en: 'DF', fr: 'DÉF' },
	'debate.vs': { en: 'vs', fr: 'c.' },
	'debate.synopsis': { en: 'Synopsis', fr: 'Résumé' },
	'debate.issues': { en: 'Issues', fr: 'Questions en litige' },
	'debate.na': { en: 'N/A', fr: 'S/O' },
	'debate.sources': { en: 'Sources', fr: 'Sources' },
	'debate.exitCourt': { en: '⟵ Exit Court', fr: '⟵ Quitter' },
	'debate.endCase': { en: '✕ End Case', fr: '✕ Terminer' },
	'debate.resetSim': { en: '↺ Reset Simulation', fr: '↺ Recommencer' },
	'debate.thinking': { en: 'thinking…', fr: 'réflexion…' },
	'debate.reviewingBench': { en: 'Reviewing submission…', fr: 'Analyse de la soumission…' },
	'debate.formulatingJury': { en: 'Formulating counter-argument…', fr: 'Formulation du contre-argument…' },
	'debate.inputPlaceholder': { en: 'Enter your argument...', fr: 'Entrez votre argument...' },
	'debate.sendMessage': { en: 'Send Message', fr: 'Envoyer le message' },
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
		en: 'Address the opponent\'s arguments directly before presenting your own.',
		fr: 'Répondez directement aux arguments de l\'adversaire avant de présenter les vôtres.'
	},
	'debate.panel': { en: 'Panel', fr: 'Panel' },
	'debate.juryLabel': { en: 'Jury', fr: 'Jury' },
	'debate.judgeLabel': { en: 'Judge', fr: 'Juge' },
	'debate.leaningPlaintiff': { en: 'Leaning Plaintiff', fr: 'Penche demandeur' },
	'debate.leaningDefense': { en: 'Leaning Defense', fr: 'Penche défendeur' },
	'debate.splitJury': { en: 'Split Jury', fr: 'Jury divisé' },
	'debate.awaitingArgs': { en: 'Awaiting Arguments', fr: 'En attente des arguments' },
	'debate.plaintiffLabel': { en: 'Plaintiff', fr: 'Demandeur' },
	'debate.defenseLabel': { en: 'Defense', fr: 'Défendeur' },
	'debate.undecided': { en: 'Undecided', fr: 'Indécis' },
	'debate.avgScore': { en: 'Avg Score', fr: 'Score moyen' },
	'debate.judgeMindTitle': { en: "Inside the Judge's Mind", fr: 'Dans l\'esprit du juge' },
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
	'debate.jurorListening': { en: 'Listening...', fr: 'À l\'écoute...' },
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
		en: 'Review every dispute staged inside Verdict. Ongoing matters live on the left; finished rulings are preserved for later study.',
		fr: 'Consultez chaque litige créé dans Verdict. Les dossiers en cours sont à gauche; les décisions rendues sont archivées.'
	},
	'court.ongoing': { en: 'Ongoing', fr: 'En cours' },
	'court.finished': { en: 'Finished', fr: 'Terminé' },
	'court.stageNew': { en: 'Stage New Case', fr: 'Nouvelle cause' },
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
	'court.welcomeKicker': { en: 'Welcome to Verdict', fr: 'Bienvenue sur Verdict' },
	'court.welcomeTitle': { en: 'Stage your first case in 90 seconds', fr: 'Créez votre première cause en 90 secondes' },
	'court.welcomeDesc': {
		en: 'Pick a legal pack, describe a dispute, debate it before an AI judge or jury. We\'ll cite the law for you.',
		fr: 'Choisissez un pack juridique, décrivez un litige, plaidez devant un juge ou jury IA. Nous citons le droit pour vous.'
	},
	'court.welcomeStart': { en: 'Stage a Case', fr: 'Créer une cause' },
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
	'library.indexing': { en: 'Indexing document for AI search...', fr: 'Indexation du document pour la recherche IA...' },
	'library.indexingBadge': { en: 'Indexing…', fr: 'Indexation…' },
	'error.notFound': { en: 'Page not found', fr: 'Page introuvable' },
	'error.generic': { en: 'Something went wrong', fr: 'Une erreur est survenue' },
	'error.backHome': { en: 'Back to Home', fr: 'Retour à l\'accueil' },
	'library.indexed': { en: 'Indexed — {count} sections ready for AI', fr: 'Indexé — {count} sections prêtes pour l\'IA' },
	'library.indexError': { en: 'Indexing failed — the document was saved but won\'t be searchable by AI', fr: 'Échec de l\'indexation — le document est sauvegardé mais ne sera pas recherchable par l\'IA' },
	'library.statsChars': { en: 'characters', fr: 'caractères' },
	'library.statsPages': { en: 'pages (est.)', fr: 'pages (est.)' },
	'library.statsChunks': { en: 'AI sections (est.)', fr: 'sections IA (est.)' },
	'library.remove': { en: 'Remove', fr: 'Retirer' },
	'library.myPacks': { en: 'My Legal Packs', fr: 'Mes packs juridiques' },
	'library.createPack': { en: 'Create Pack', fr: 'Créer un pack' },
	'library.editPack': { en: 'Edit Pack', fr: 'Modifier le pack' },
	'library.edit': { en: 'Edit', fr: 'Modifier' },
	'library.delete': { en: 'Delete', fr: 'Supprimer' },
	'library.addUrl': { en: 'Add URL', fr: 'Ajouter URL' },
	'library.uploadPdf': { en: 'Upload PDF', fr: 'Téléverser PDF' },
	'library.uploadDoc': { en: 'Upload Document', fr: 'Téléverser un document' },
	'library.pasteText': { en: 'Paste Text', fr: 'Coller texte' },
	'library.noPackSelected': { en: 'Select a legal pack to view and manage its sources.', fr: 'Sélectionnez un pack juridique pour voir et gérer ses sources.' },
	'library.packName': { en: 'Pack name', fr: 'Nom du pack' },
	'library.packJurisdiction': { en: 'Jurisdiction', fr: 'Juridiction' },
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
	'library.helpWhatPackTitle': { en: 'What is a Legal Pack?', fr: 'Qu\'est-ce qu\'un pack juridique ?' },
	'library.helpWhatPackDesc': {
		en: 'A Legal Pack is a folder that groups related laws together. For example, you might create one pack for "Canadian Criminal Law" and another for "Quebec Civil Law." When you start a debate, you pick a pack — and the AI will only cite the laws inside it.',
		fr: 'Un pack juridique est un dossier qui regroupe des lois connexes. Par exemple, vous pourriez créer un pack « Droit criminel canadien » et un autre pour « Droit civil québécois. » Quand vous lancez un débat, vous choisissez un pack — et l\'IA ne citera que les lois qu\'il contient.'
	},
	'library.helpCreatePackTitle': { en: 'How to Create a Pack', fr: 'Comment créer un pack' },
	'library.helpCreateStep1': {
		en: '1. Click the "Create Pack" button in the sidebar on the left.',
		fr: '1. Cliquez sur le bouton « Créer un pack » dans la barre latérale à gauche.'
	},
	'library.helpCreateStep2': {
		en: '2. Give it a name, jurisdiction (e.g. Canada, France), and a domain (e.g. Criminal, Civil).',
		fr: '2. Donnez-lui un nom, une juridiction (ex. Canada, France) et un domaine (ex. Criminel, Civil).'
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
		en: 'Verdict is your AI-powered legal debate coach. Upload real laws as PDFs, build a case, and argue against an adaptive AI opponent — then get scored on your performance.',
		fr: 'Verdict est votre coach de débat juridique propulsé par l\'IA. Téléversez de vraies lois en PDF, construisez une cause et plaidez contre un adversaire IA adaptatif — puis recevez une note sur votre performance.'
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
	'about.highlightDebateLabel': { en: 'Realistic Courtroom Debates', fr: 'Débats judiciaires réalistes' },
	'about.highlightDebateText': {
		en: 'Pick plaintiff or defendant, choose jury or bench trial, and face an AI lawyer that adapts to your arguments and pushes back with real legal reasoning.',
		fr: 'Choisissez demandeur ou défendeur, procès devant jury ou juge seul, et affrontez un avocat IA qui s\'adapte à vos arguments et réplique avec un raisonnement juridique réel.'
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
		en: 'Choose your side (plaintiff or defendant) and court mode (jury or bench). Then either write your own case details or hit Auto-Fill to let the AI generate a realistic scenario based on your uploaded laws.',
		fr: 'Choisissez votre camp (demandeur ou défendeur) et le mode de procès (jury ou juge seul). Ensuite, rédigez vos détails de cause ou appuyez sur Remplissage auto pour que l\'IA génère un scénario réaliste basé sur vos lois téléversées.'
	},
	'how.sectionDebate': { en: 'Step 3 — Debate & Get Scored', fr: 'Étape 3 — Débattre et être noté' },
	'how.step5Title': { en: 'Argue Your Case', fr: 'Plaidez votre cause' },
	'how.step5Desc': {
		en: 'Enter the courtroom and present your arguments. The AI opponent responds with counter-arguments citing your uploaded laws. Jurors or the judge react in real time.',
		fr: 'Entrez dans la salle d\'audience et présentez vos arguments. L\'adversaire IA réplique avec des contre-arguments citant vos lois téléversées. Les jurés ou le juge réagissent en temps réel.'
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

	// ===== JURY TELEMETRY =====
	'jury.title': { en: 'Jury Telemetry', fr: 'Télémétrie du jury' },
	'jury.subtitle': {
		en: 'Monitor how every persona is trending mid-hearing.',
		fr: 'Suivez les tendances de chaque juré en cours d\'audience.'
	},
	'jury.description': {
		en: 'The MVP keeps juror reasoning explainable: each agent stores scoring matrices in Supabase so you can replay how they shifted between plaintiff, defense, or hung outcomes.',
		fr: 'Le MVP garde le raisonnement des jurés explicable: chaque agent stocke ses matrices de score dans Supabase pour que vous puissiez revoir comment ils ont évolué.'
	},
	'jury.signatureMove': { en: 'Signature move:', fr: 'Trait distinctif:' },
	'jury.telemetryFeed': { en: 'Telemetry feed:', fr: 'Flux de données:' },
	'jury.telemetryPlaceholder': {
		en: 'Score progression snapshots will appear here once LLM hooks are connected.',
		fr: 'Les aperçus de progression des scores apparaîtront ici une fois les connexions IA établies.'
	},
	'jury.scoringRubric': { en: 'Scoring rubric blueprint', fr: 'Grille d\'évaluation' },
	'jury.scoringDesc': {
		en: 'Submissions are graded across persuasion, citation discipline, and realism.',
		fr: 'Les soumissions sont évaluées selon la persuasion, la rigueur des citations et le réalisme.'
	},
	'jury.weightPersuasion': {
		en: 'Weight persuasive clarity (40%) — track concessions and reframed issues.',
		fr: 'Clarté de persuasion (40 %) — suivi des concessions et des reformulations.'
	},
	'jury.weightCitation': {
		en: 'Weight citation discipline (35%) — penalize references outside uploaded packets.',
		fr: 'Rigueur des citations (35 %) — pénaliser les références hors des documents soumis.'
	},
	'jury.weightRealism': {
		en: 'Weight realism (25%) — how practical is the remedy or defence.',
		fr: 'Réalisme (25 %) — le caractère pratique du recours ou de la défense.'
	},
	'jury.scoresExport': {
		en: 'Scores and rationales are saved for dashboards and performance tracking.',
		fr: 'Les scores et justifications sont sauvegardés pour les tableaux de bord et le suivi.'
	},

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
	'dashboard.debates': { en: 'debates', fr: 'débats' }
} as const;

type TranslationKey = keyof typeof translations;

export const t = (key: TranslationKey, lang: Lang): string => {
	const entry = translations[key];
	if (!entry) return key;
	return entry[lang] ?? entry.en;
};

export default translations;
