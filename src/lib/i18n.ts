import type { Lang } from '$lib/stores/language';

const translations = {
	// ===== LAYOUT =====
	'nav.stage': { en: 'Stage', fr: 'Créer' },
	'nav.court': { en: 'Court', fr: 'Cour' },
	'nav.library': { en: 'Library', fr: 'Sources' },
	'nav.about': { en: 'About Verdict', fr: 'À propos' },
	'nav.howItWorks': { en: 'How it Works', fr: 'Comment ça marche' },
	'meta.description': {
		en: 'Verdict — debate against AI counsel and five autonomous jurors.',
		fr: 'Verdict — débattez contre un avocat IA devant cinq jurés autonomes.'
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
		en: 'Choose a case, upload your sources, and step into a clean, focused advocacy cockpit.',
		fr: 'Choisissez une cause, ajoutez vos sources, et entrez dans un simulateur de plaidoirie.'
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
	'cases.noSourcesInPack': {
		en: 'This pack has no sources yet. Add sources from the library.',
		fr: 'Ce pack ne contient pas encore de sources. Ajoutez des sources depuis la bibliothèque.'
	},
	'cases.sources': { en: 'Sources (Optional)', fr: 'Sources (Optionnel)' },
	'cases.selected': { en: 'Selected', fr: 'Sélectionnées' },
	'cases.initializeCase': { en: 'INITIALIZE CASE', fr: 'CRÉER LA CAUSE' },
	'cases.processing': { en: 'PROCESSING...', fr: 'TRAITEMENT...' },
	'cases.systemReady': { en: 'SYSTEM_READY // WAITING_FOR_INPUT', fr: 'SYSTÈME_PRÊT // EN_ATTENTE' },
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

	// ===== LIBRARY =====
	'library.title': { en: 'Library', fr: 'Bibliothèque' },
	'library.subtitle': { en: 'Authoritative Sources', fr: 'Sources officielles' },
	'library.description': {
		en: 'Browse foundational Canadian authorities organized by jurisdiction.',
		fr: 'Parcourez les autorités canadiennes fondamentales organisées par juridiction.'
	},
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
	'library.remove': { en: 'Remove', fr: 'Retirer' },
	'library.myPacks': { en: 'My Legal Packs', fr: 'Mes packs juridiques' },
	'library.createPack': { en: 'Create Pack', fr: 'Créer un pack' },
	'library.editPack': { en: 'Edit Pack', fr: 'Modifier le pack' },
	'library.edit': { en: 'Edit', fr: 'Modifier' },
	'library.delete': { en: 'Delete', fr: 'Supprimer' },
	'library.addUrl': { en: 'Add URL', fr: 'Ajouter URL' },
	'library.uploadPdf': { en: 'Upload File', fr: 'Téléverser fichier' },
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
	'library.pdfParseFailed': { en: 'Failed to extract text from PDF.', fr: 'Impossible d\'extraire le texte du PDF.' },
	'library.pdfSupported': { en: 'PDF files supported — text will be extracted automatically.', fr: 'Fichiers PDF supportés — le texte sera extrait automatiquement.' },
	'library.parsingPdf': { en: 'Extracting text...', fr: 'Extraction du texte...' },

	// ===== ABOUT =====
	'about.title': { en: 'About Verdict', fr: 'À propos de Verdict' },
	'about.kicker': { en: 'Platform Overview', fr: 'Aperçu de la plateforme' },
	'about.description': {
		en: 'A focused advocacy simulator where you build a case, constrain legal context with packs, and practice against adaptive AI counsel.',
		fr: 'Un simulateur de plaidoirie ciblé où vous construisez une cause, encadrez le contexte juridique avec des packs et pratiquez contre un avocat IA adaptatif.'
	},
	'about.mission': { en: 'The Mission', fr: 'La mission' },
	'about.missionText': {
		en: 'Verdict gives legal professionals a safe, rigorous practice loop: stage facts, run adversarial exchanges, and close the case with actionable scoring feedback.',
		fr: 'Verdict offre aux professionnels du droit une boucle d\'entraînement sécuritaire et rigoureuse : structurer les faits, mener des échanges contradictoires et clôturer la cause avec un retour de performance concret.'
	},
	'about.highlightsTitle': { en: 'What You Can Do', fr: 'Ce que vous pouvez faire' },
	'about.highlightPacksLabel': { en: 'Legal Packs', fr: 'Packs juridiques' },
	'about.highlightPacksText': {
		en: 'Group your statutes, links, and uploaded documents by jurisdiction or topic to keep each simulation scoped and reusable.',
		fr: 'Regroupez vos lois, liens et documents téléversés par juridiction ou sujet pour garder chaque simulation ciblée et réutilisable.'
	},
	'about.highlightDebateLabel': { en: 'Adversarial Debate', fr: 'Débat contradictoire' },
	'about.highlightDebateText': {
		en: 'Argue as plaintiff or defendant while Advocate AI responds from the opposite side in jury or bench mode.',
		fr: 'Plaidez comme demandeur ou défendeur pendant que l\'avocat IA répond du côté opposé, en mode jury ou juge seul.'
	},
	'about.highlightScoreLabel': { en: 'Performance Scoring', fr: 'Notation de performance' },
	'about.highlightScoreText': {
		en: 'End each case with a concise summary and five scoring pillars so you can track what to improve next.',
		fr: 'Terminez chaque cause avec un résumé concis et cinq piliers de score pour cibler vos prochaines améliorations.'
	},
	'about.return': { en: 'Return to Dashboard', fr: 'Retour au tableau de bord' },

	// ===== HOW IT WORKS =====
	'how.title': { en: 'How It Works', fr: 'Comment ça marche' },
	'how.kicker': { en: 'Workflow Guide', fr: 'Guide du flux' },
	'how.subtitle': { en: 'A simple five-step loop from case setup to scored review.', fr: 'Une boucle simple en cinq étapes, de la création de cause au bilan noté.' },
	'how.workflow': { en: 'The Workflow', fr: 'Le processus' },
	'how.step1Title': { en: 'Initialize a Case', fr: 'Créer une cause' },
	'how.step1Desc': {
		en: 'Define the facts, the legal issues, and your role (plaintiff/defendant).',
		fr: 'Définissez les faits, les questions juridiques et votre rôle (demandeur/défendeur).'
	},
	'how.step2Title': { en: 'Curate the Library', fr: 'Choisir les sources' },
	'how.step2Desc': {
		en: 'Select a legal pack and add URL/PDF/text sources relevant to your dispute.',
		fr: 'Sélectionnez un pack juridique et ajoutez des sources URL/PDF/texte pertinentes à votre litige.'
	},
	'how.step3Title': { en: 'Enter Court', fr: 'Entrer en cour' },
	'how.step3Desc': {
		en: 'Submit arguments and receive immediate opposition from Advocate AI.',
		fr: 'Soumettez vos arguments et recevez immédiatement une opposition de l\'avocat IA.'
	},
	'how.step4Title': { en: 'Track Live Signals', fr: 'Suivre les signaux en direct' },
	'how.step4Desc': {
		en: 'Monitor juror/judge reactions and adapt your strategy round by round.',
		fr: 'Surveillez les réactions du jury/juge et adaptez votre stratégie à chaque tour.'
	},
	'how.step5Title': { en: 'Close with Scoring', fr: 'Clore avec une note' },
	'how.step5Desc': {
		en: 'End the case to generate a concise performance summary and five score pillars saved in Court history.',
		fr: 'Terminez la cause pour générer un résumé de performance concis et cinq piliers de score sauvegardés dans l\'historique de la Cour.'
	},
	'how.aiDebater': { en: 'AI Debater', fr: 'Débatteur IA' },
	'how.aiDebaterDesc': {
		en: 'Advocate AI stays on the opposite side, challenges weak reasoning, and pushes you to defend facts and legal authority.',
		fr: 'L\'avocat IA reste du côté opposé, met en cause les raisonnements faibles et vous pousse à défendre les faits et l\'autorité juridique.'
	},
	'how.aiScoring': { en: 'AI + Rule Scoring', fr: 'Notation IA + règles' },
	'how.aiScoringDesc': {
		en: 'Final scoring blends adaptive AI evaluation with deterministic checks for law citation, structure, responsiveness, and fact fidelity.',
		fr: 'La note finale combine une évaluation IA adaptative et des vérifications déterministes sur la citation du droit, la structure, la réactivité et la fidélité aux faits.'
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
	'pricing.talkToUs': { en: 'Talk to Us', fr: 'Contactez-nous' },
	'pricing.contactUs': { en: 'Custom Pricing', fr: 'Tarif sur mesure' },
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
		en: 'Try Verdict with up to 3 credits.',
		fr: 'Essayez Verdict avec jusqu\'à 3 crédits.'
	},
	'pricing.freeFeature1': { en: '3 credits per month', fr: '3 crédits par mois' },
	'pricing.freeFeature2': { en: '10 rounds per debate', fr: '10 tours par débat' },
	'pricing.freeFeature3': { en: 'Performance scoring', fr: 'Notation de performance' },
	'pricing.proName': { en: 'Pro', fr: 'Pro' },
	'pricing.proDesc': {
		en: '20 credits per month for serious practitioners.',
		fr: '20 crédits par mois pour les praticiens sérieux.'
	},
	'pricing.proFeature1': { en: '20 credits per month', fr: '20 crédits par mois' },
	'pricing.proFeature2': { en: '15 rounds per debate', fr: '15 tours par débat' },
	'pricing.proFeature3': { en: 'Full case history & analytics', fr: 'Historique complet et analytique' },
	'pricing.proFeature4': { en: 'Unlimited legal packs', fr: 'Packs juridiques illimités' },
	'pricing.proPlusName': { en: 'Pro+', fr: 'Pro+' },
	'pricing.proPlusDesc': {
		en: '60 credits per month for power users.',
		fr: '60 crédits par mois pour les utilisateurs avancés.'
	},
	'pricing.proPlusFeature1': { en: '60 credits per month', fr: '60 crédits par mois' },
	'pricing.proPlusFeature2': { en: '20 rounds per debate', fr: '20 tours par débat' },
	'pricing.proPlusFeature3': { en: 'Priority AI processing', fr: 'Traitement IA prioritaire' },
	'pricing.proPlusFeature4': { en: 'Everything in Pro', fr: 'Tout le contenu Pro inclus' },
	'pricing.enterpriseName': { en: 'Enterprise', fr: 'Entreprise' },
	'pricing.enterpriseDesc': {
		en: 'For law firms, schools, and institutions.',
		fr: 'Pour cabinets, écoles et institutions.'
	},
	'pricing.entFeature1': { en: 'Everything in Pro+', fr: 'Tout ce qui est dans Pro+' },
	'pricing.entFeature2': { en: 'Custom deployment', fr: 'Déploiement personnalisé' },
	'pricing.entFeature3': { en: 'Dedicated support', fr: 'Support dédié' },
	'pricing.entFeature4': { en: 'Custom integrations', fr: 'Intégrations sur mesure' },
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
