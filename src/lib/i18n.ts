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
	'cases.whatHappened': { en: 'What Happened', fr: 'Les faits' },
	'cases.whatHappenedPlaceholder': { en: '> Short, clear summary of the facts.', fr: '> Résumé court et clair des faits.' },
	'cases.mainQuestion': { en: 'Main Question', fr: 'Question principale' },
	'cases.mainQuestionPlaceholder': { en: '> What should the court decide?', fr: '> Que devrait décider le tribunal?' },
	'cases.whatYouWant': { en: 'What You Want', fr: 'Ce que vous demandez' },
	'cases.whatYouWantPlaceholder': { en: '> The outcome you want.', fr: '> Le résultat souhaité.' },
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

	// ===== ABOUT =====
	'about.title': { en: 'About Verdict', fr: 'À propos de Verdict' },
	'about.description': {
		en: 'An advanced litigation simulator designed to sharpen advocacy skills through high-fidelity AI adversarial sparring.',
		fr: 'Un simulateur de litige avancé conçu pour affûter vos compétences en plaidoirie grâce à des joutes adversariales avec l\'IA.'
	},
	'about.mission': { en: 'The Mission', fr: 'La mission' },
	'about.missionText': {
		en: 'Verdict provides a safe, rigorous "flight simulator" for legal professionals. By modeling opposing counsel and judicial logic, we allow advocates to test arguments, find weaknesses in their logic, and practice oral/written submissions without the stakes of a real courtroom.',
		fr: 'Verdict offre un « simulateur de vol » sécuritaire et rigoureux pour les professionnels du droit. En modélisant l\'avocat adverse et la logique judiciaire, nous permettons aux plaideurs de tester leurs arguments, de trouver les failles dans leur raisonnement et de pratiquer leurs soumissions sans les enjeux d\'un vrai tribunal.'
	},
	'about.return': { en: 'Return to Dashboard', fr: 'Retour au tableau de bord' },

	// ===== HOW IT WORKS =====
	'how.title': { en: 'How It Works', fr: 'Comment ça marche' },
	'how.subtitle': { en: 'A step-by-step guide to the Verdict engine.', fr: 'Guide étape par étape du moteur Verdict.' },
	'how.workflow': { en: 'The Workflow', fr: 'Le processus' },
	'how.step1Title': { en: 'Initialize a Case', fr: 'Créer une cause' },
	'how.step1Desc': {
		en: 'Define the facts, the legal issues, and your role (plaintiff/defendant).',
		fr: 'Définissez les faits, les questions juridiques et votre rôle (demandeur/défendeur).'
	},
	'how.step2Title': { en: 'Curate the Library', fr: 'Choisir les sources' },
	'how.step2Desc': {
		en: 'Restrict the AI to specific statutes or case law to ensure doctrinal accuracy.',
		fr: 'Limitez l\'IA à des lois ou jurisprudences précises pour assurer la rigueur doctrinale.'
	},
	'how.step3Title': { en: 'Enter Court', fr: 'Entrer en cour' },
	'how.step3Desc': {
		en: 'Submit your arguments. The AI Opposing Counsel will rebut them instantly.',
		fr: 'Soumettez vos arguments. L\'avocat IA adverse les réfutera instantanément.'
	},
	'how.aiDebater': { en: 'AI Debater', fr: 'Débatteur IA' },
	'how.aiDebaterDesc': {
		en: 'Trained on verified legal texts, the Opposing Counsel engine analyzes your submissions for logical fallacies, missing citations, and weak inferences. It constructs counter-arguments based solely on the provided case library, mimicking a well-prepared adversary.',
		fr: 'Entraîné sur des textes juridiques vérifiés, le moteur de l\'avocat adverse analyse vos soumissions pour détecter les sophismes, les citations manquantes et les inférences faibles. Il construit des contre-arguments basés uniquement sur la bibliothèque fournie, imitant un adversaire bien préparé.'
	},
	'how.aiJury': { en: 'AI Jury', fr: 'Jury IA' },
	'how.aiJuryDesc': {
		en: 'Five distinct "juror" personas observe the debate silently. At any point, you can poll the jury to see real-time persuasion metrics. They evaluate clarity, emotional resonance, and logical soundness independently, providing a composite "Verdict" score.',
		fr: 'Cinq « jurés » aux personnalités distinctes observent le débat en silence. À tout moment, vous pouvez sonder le jury pour voir les métriques de persuasion en temps réel. Ils évaluent la clarté, la résonance émotionnelle et la solidité logique de manière indépendante.'
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
	}
} as const;

type TranslationKey = keyof typeof translations;

export const t = (key: TranslationKey, lang: Lang): string => {
	const entry = translations[key];
	if (!entry) return key;
	return entry[lang] ?? entry.en;
};

export default translations;
