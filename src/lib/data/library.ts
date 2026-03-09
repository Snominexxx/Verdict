export type LibraryDocument = {
	id: string;
	title: string;
	jurisdiction: string;
	description: string;
	filePath?: string;
	lastUpdated: string;
	sourceUrl?: string;
	content?: string;
	docType?: 'statute' | 'regulation' | 'case-law' | 'secondary';
	trustLevel?: 'official' | 'recognized' | 'unverified';
	isCustom?: boolean;
	note?: string;
};

export const libraryDocuments: LibraryDocument[] = [
	// ─────────────────────────────────────────────────────────────
	// QUEBEC
	// ─────────────────────────────────────────────────────────────
	{
		id: 'civil-code-quebec',
		title: 'Civil Code of Québec',
		jurisdiction: 'Quebec',
		description: 'Foundational statute governing persons, obligations, property, and civil remedies.',
		filePath: '/library/civil-code-of-quebec.md',
		lastUpdated: '2023-12-01',
		note: 'Full text is sizable. Replace this placeholder file with the official consolidated version when ready.'
	},
	{
		id: 'code-civil-procedure-quebec',
		title: 'Code of Civil Procedure',
		jurisdiction: 'Quebec',
		description: 'Governs the conduct of civil litigation in Quebec courts, including pleadings, evidence, and enforcement.',
		filePath: '/library/code-of-civil-procedure-quebec.md',
		lastUpdated: '2024-01-01',
		note: 'Placeholder — replace with official consolidated text from LégisQuébec.'
	},
	{
		id: 'charter-human-rights-quebec',
		title: 'Charter of Human Rights and Freedoms',
		jurisdiction: 'Quebec',
		description: "Quebec's quasi-constitutional human rights statute protecting fundamental freedoms, equality, and economic/social rights.",
		filePath: '/library/charter-human-rights-quebec.md',
		lastUpdated: '2024-01-01',
		note: 'Placeholder — replace with official consolidated text from LégisQuébec.'
	},
	{
		id: 'labour-standards-quebec',
		title: 'Act Respecting Labour Standards',
		jurisdiction: 'Quebec',
		description: 'Sets minimum employment conditions: wages, hours, leaves, termination, and psychological harassment protections.',
		filePath: '/library/labour-standards-quebec.md',
		lastUpdated: '2024-01-01',
		note: 'Placeholder — replace with official consolidated text from LégisQuébec.'
	},
	{
		id: 'legal-publicity-enterprises-quebec',
		title: 'Act Respecting the Legal Publicity of Enterprises',
		jurisdiction: 'Quebec',
		description: 'Requires registration of businesses in the enterprise register and governs public disclosure of corporate information.',
		filePath: '/library/legal-publicity-enterprises-quebec.md',
		lastUpdated: '2024-01-01',
		note: 'Placeholder — replace with official consolidated text from LégisQuébec.'
	},
	{
		id: 'business-corporations-quebec',
		title: 'Business Corporations Act',
		jurisdiction: 'Quebec',
		description: 'Governs incorporation, governance, shareholder rights, and dissolution of Quebec business corporations.',
		filePath: '/library/business-corporations-quebec.md',
		lastUpdated: '2024-01-01',
		note: 'Placeholder — replace with official consolidated text from LégisQuébec.'
	},
	{
		id: 'cooperatives-quebec',
		title: 'Cooperatives Act',
		jurisdiction: 'Quebec',
		description: 'Framework for the constitution, operation, and dissolution of cooperatives in Quebec.',
		filePath: '/library/cooperatives-quebec.md',
		lastUpdated: '2024-01-01',
		note: 'Placeholder — replace with official consolidated text from LégisQuébec.'
	},
	{
		id: 'consumer-protection-quebec',
		title: 'Consumer Protection Act',
		jurisdiction: 'Quebec',
		description: 'Protects consumers in contracts for goods and services, regulates warranties, credit disclosure, and prohibited commercial practices.',
		filePath: '/library/consumer-protection-quebec.md',
		lastUpdated: '2024-01-01',
		note: 'Placeholder — replace with the official consolidated Act respecting the protection of the consumer (CQLR c P-40.1).' 
	},
	{
		id: 'cities-towns-act-quebec',
		title: 'Cities and Towns Act',
		jurisdiction: 'Quebec',
		description: 'Governs municipal powers, council procedures, taxation, expropriation, and contracts for Quebec cities and towns.',
		filePath: '/library/cities-and-towns-act-quebec.md',
		lastUpdated: '2024-01-01',
		note: 'Placeholder — replace with the official consolidated text from LégisQuébec.'
	},
	{
		id: 'highway-safety-code-quebec',
		title: 'Highway Safety Code',
		jurisdiction: 'Quebec',
		description: 'Sets out traffic rules, licensing requirements, vehicle standards, and enforcement powers for Quebec road users.',
		filePath: '/library/highway-safety-code-quebec.md',
		lastUpdated: '2024-01-01',
		note: 'Placeholder — replace with official consolidated text from LégisQuébec.'
	},
	// ─────────────────────────────────────────────────────────────
	// CANADA (FEDERAL)
	// ─────────────────────────────────────────────────────────────
	{
		id: 'canadian-charter',
		title: 'Canadian Charter of Rights and Freedoms',
		jurisdiction: 'Canada',
		description: 'Constitution Act, 1982, Part I — entrenches fundamental freedoms, democratic rights, mobility, legal rights, equality, and language protections.',
		filePath: '/library/canadian-charter-of-rights-and-freedoms.md',
		lastUpdated: '2023-12-01'
	},
	{
		id: 'criminal-code-canada',
		title: 'Criminal Code',
		jurisdiction: 'Canada',
		description: 'Federal statute codifying most criminal offences, procedures, and sentencing principles in Canada.',
		filePath: '/library/criminal-code-canada.md',
		lastUpdated: '2024-01-01',
		note: 'Placeholder — replace with official consolidated text from Justice Laws Website.'
	},
	{
		id: 'cbca-canada',
		title: 'Canada Business Corporations Act',
		jurisdiction: 'Canada',
		description: 'Governs federally incorporated corporations: duties, shareholder remedies, corporate governance, and reorganizations.',
		filePath: '/library/cbca-canada.md',
		lastUpdated: '2024-01-01',
		note: 'Placeholder — replace with official consolidated text from Justice Laws Website.'
	},
	{
		id: 'divorce-act-canada',
		title: 'Divorce Act',
		jurisdiction: 'Canada',
		description: 'Federal statute governing divorce, parenting arrangements, child support, and spousal support.',
		filePath: '/library/divorce-act-canada.md',
		lastUpdated: '2024-01-01',
		note: 'Placeholder — replace with official consolidated text from Justice Laws Website.'
	},
	{
		id: 'income-tax-act-canada',
		title: 'Income Tax Act',
		jurisdiction: 'Canada',
		description: 'Primary federal statute imposing income tax on individuals, corporations, and trusts; includes deductions, credits, and anti-avoidance rules.',
		filePath: '/library/income-tax-act-canada.md',
		lastUpdated: '2024-01-01',
		note: 'Placeholder — extremely large statute. Consider including key parts only.'
	},
	{
		id: 'competition-act-canada',
		title: 'Competition Act',
		jurisdiction: 'Canada',
		description: 'Regulates anti-competitive conduct, deceptive marketing practices, mergers, and abuse of dominance at the federal level.',
		filePath: '/library/competition-act-canada.md',
		lastUpdated: '2024-01-01',
		note: 'Placeholder — replace with official consolidated text from the Justice Laws Website.'
	},
	{
		id: 'pipeda-canada',
		title: 'Personal Information Protection and Electronic Documents Act',
		jurisdiction: 'Canada',
		description: 'Federal privacy statute governing how private-sector organizations collect, use, and disclose personal information in commercial activities.',
		filePath: '/library/pipeda-canada.md',
		lastUpdated: '2024-01-01',
		note: 'Placeholder — replace with the official consolidated PIPEDA text from the Justice Laws Website.'
	},
	{
		id: 'young-offenders-act-canada',
		title: 'Young Offenders Act',
		jurisdiction: 'Canada',
		description: 'Legacy youth justice statute governing procedures, sentencing, and protections for young persons prior to the YCJA transition.',
		filePath: '/library/young-offenders-act-canada.md',
		lastUpdated: '2024-01-01',
		note: 'Placeholder — include key provisions still referenced in transitional or historical contexts.'
	},
	{
		id: 'cdsa-canada',
		title: 'Controlled Drugs and Substances Act',
		jurisdiction: 'Canada',
		description: 'Federal statute regulating possession, trafficking, production, and import/export of controlled substances, precursors, and analogues.',
		filePath: '/library/cdsa-canada.md',
		lastUpdated: '2024-01-01',
		note: 'Placeholder — replace with official consolidated text from the Justice Laws Website.'
	}
];
