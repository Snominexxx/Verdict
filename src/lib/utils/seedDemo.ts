import { browser } from '$app/environment';
import { get } from 'svelte/store';
import { userKey } from '$lib/stores/userSession';
import { legalPacksStore } from '$lib/stores/legalPacks';
import { caseHistoryStore } from '$lib/stores/caseHistory';
import { libraryDocuments } from '$lib/data/library';
import { saveTurns } from '$lib/stores/debate';
import type { StagedCase, DebateTurn } from '$lib/types';

const SEEDED_KEY = 'verdict.demoSeeded.v1';

/**
 * Seeds a starter pack and a demo "ongoing" case for first-time users.
 * Idempotent — sets a per-user flag once seeded so it never runs twice.
 */
export const maybeSeedDemo = async (lang: 'en' | 'fr' = 'en') => {
	if (!browser) return;

	const flagKey = userKey(SEEDED_KEY);
	if (!flagKey) return;
	if (localStorage.getItem(flagKey)) return;

	// Only seed if both packs and history are truly empty
	const packs = get(legalPacksStore);
	const history = get(caseHistoryStore);
	if (packs.length > 0 || history.length > 0) {
		localStorage.setItem(flagKey, '1');
		return;
	}

	// Build starter pack from existing library docs
	const starterDocIds = ['civil-code-quebec', 'labour-standards-quebec', 'charter-human-rights-quebec'];
	const sources = libraryDocuments
		.filter((d) => starterDocIds.includes(d.id))
		.map((d) => ({ ...d, isCustom: false }));

	if (sources.length === 0) {
		localStorage.setItem(flagKey, '1');
		return;
	}

	legalPacksStore.createPack({
		name: lang === 'fr' ? 'Démo — Droit civil québécois' : 'Demo — Quebec Civil Law',
		jurisdiction: 'Quebec',
		domain: lang === 'fr' ? 'Travail / Civil' : 'Employment / Civil',
		description:
			lang === 'fr'
				? 'Pack de démonstration prêt à débattre. Code civil, normes du travail, Charte.'
				: 'Demo pack ready to debate. Civil Code, Labour Standards, Charter.',
		sources
	});

	// Find the freshly created pack
	const created = get(legalPacksStore).find((p) =>
		p.name.startsWith(lang === 'fr' ? 'Démo' : 'Demo')
	);
	if (!created) {
		localStorage.setItem(flagKey, '1');
		return;
	}

	// Build demo case
	const now = new Date().toISOString();
	const caseId = `case-demo-${Date.now()}`;
	const demoCase: StagedCase = {
		id: caseId,
		title:
			lang === 'fr'
				? 'Tremblay c. Logistique Boréale inc.'
				: 'Tremblay v. Boreal Logistics Inc.',
		synopsis:
			lang === 'fr'
				? "Mme Tremblay, employée pendant 4 ans comme coordonnatrice logistique, a été congédiée sans préavis. L'employeur invoque une « restructuration », mais a embauché un remplaçant deux semaines plus tard."
				: "Ms. Tremblay, employed for 4 years as a logistics coordinator, was dismissed without notice. The employer cites 'restructuring' but hired a replacement two weeks later.",
		issues:
			lang === 'fr'
				? "Le congédiement constitue-t-il un congédiement sans cause juste et suffisante au sens de la Loi sur les normes du travail? Mme Tremblay a-t-elle droit à une indemnité?"
				: "Was the dismissal made without good and sufficient cause under the Act Respecting Labour Standards? Is Ms. Tremblay entitled to compensation?",
		remedy:
			lang === 'fr'
				? "Réintégration ou indemnité équivalant à 6 mois de salaire et dommages moraux."
				: "Reinstatement or compensation equivalent to 6 months' salary plus moral damages.",
		role: 'plaintiff',
		sources: starterDocIds,
		packId: created.id,
		courtType: 'bench',
		createdAt: now
	};

	caseHistoryStore.registerCase(demoCase);

	// Seed two opening turns so the case feels "in progress"
	const turns: DebateTurn[] = [
		{
			role: 'judge',
			speaker: lang === 'fr' ? 'Hon. juge Beaulieu' : 'Hon. Justice Beaulieu',
			message:
				lang === 'fr'
					? `**Tremblay c. Logistique Boréale**\n\nAffaire entendue devant juge seul. Maître, vous représentez la demanderesse. Présentez votre théorie du dossier.`
					: `**Tremblay v. Boreal Logistics**\n\nBench hearing. Counsel, you represent the plaintiff. Please present your theory of the case.`,
			timestamp: now
		},
		{
			role: 'litigant',
			speaker: 'You',
			message:
				lang === 'fr'
					? "Votre Honneur, ma cliente a été congédiée après 4 ans de service exemplaire sous prétexte de restructuration. Or, deux semaines plus tard, son poste a été comblé. Il s'agit d'un congédiement sans cause juste et suffisante au sens de l'article 124 de la Loi sur les normes du travail."
					: "Your Honour, my client was dismissed after 4 years of exemplary service under the pretext of restructuring. Two weeks later, her position was refilled. This is a dismissal without good and sufficient cause under section 124 of the Act Respecting Labour Standards.",
			timestamp: new Date(Date.now() + 1000).toISOString()
		}
	];

	await saveTurns(caseId, turns);

	localStorage.setItem(flagKey, '1');
};
