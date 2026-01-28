import type { CaseSummary } from '$lib/types';

export const sampleCases: CaseSummary[] = [
	{
		id: 'smith-v-canada',
		title: 'Smith v. Canada (Attorney General)',
		jurisdiction: 'Federal Court • Charter s. 2(b)',
		synopsis:
			'A challenge to government limits on AI-generated speech in regulatory filings and whether the Charter protects synthetic advocacy.',
		complexity: 'Advanced',
		sources: [
			{
				id: 'oakes',
				title: 'R v. Oakes',
				citation: '[1986] 1 SCR 103',
				summary: 'The classic proportionality test for Charter justifications.'
			},
			{
				id: 'keegstra',
				title: 'R v. Keegstra',
				citation: '[1990] 3 SCR 697',
				summary: 'Defines limits on hateful expression within democratic discourse.'
			}
		]
	},
	{
		id: 'langlois-v-montreal',
		title: 'Langlois v. Ville de Montréal',
		jurisdiction: 'Quebec Superior Court • Civil liability',
		synopsis:
			'Bystander liability for a municipal chatbot that dispenses negligent advice about zoning appeals.',
		complexity: 'Intermediate',
		sources: [
			{
				id: 'ccq-1457',
				title: 'Article 1457 C.c.Q.',
				citation: 'Civil Code of Québec',
				summary: 'Foundational duty-of-care provision in Quebec civil law.'
			},
			{
				id: 'houle',
				title: 'Houle v. Canadian National Bank',
				citation: '[1990] 3 RCS 122',
				summary: 'Clarified extra-contractual responsibility for negligent misrepresentation.'
			}
		]
	},
	{
		id: 'nation-v-aerodyne',
		title: 'Nation v. Aerodyne Robotics',
		jurisdiction: 'Supreme Court of Canada • Torts & AI evidence',
		synopsis:
			'Contested admissibility of synthetic scene reconstructions when assessing catastrophic injury damages.',
		complexity: 'Introductory',
		sources: [
			{
				id: 'mohan',
				title: 'R v. Mohan',
				citation: '[1994] 2 SCR 9',
				summary: 'Gatekeeping factors for expert evidence.'
			},
			{
				id: 'white-burgess',
				title: 'White Burgess Langille Inman v. Abbott and Haliburton Co.',
				citation: '[2015] 2 SCR 182',
				summary: 'Clarified independence and impartiality for expert witnesses.'
			}
		]
	}
];
