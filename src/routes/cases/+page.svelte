<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { get } from 'svelte/store';
	import { stageCase } from '$lib/stores/stagedCase';
	import { seedTranscript, saveTurns, debateStore } from '$lib/stores/debate';
	import { caseDraftStore } from '$lib/stores/caseDraft';
	import { caseHistoryStore } from '$lib/stores/caseHistory';
	import { draftsStore } from '$lib/stores/drafts';
	import { legalPacksStore, selectedLegalPackId } from '$lib/stores/legalPacks';
	import { language } from '$lib/stores/language';
	import { t } from '$lib/i18n';
	import { subscriptionStore, TIER_CONFIG } from '$lib/stores/subscription';
	import {
		classifyCaseStudioIntent,
		type CaseStudioIntent,
		type CaseStudioMode
	} from '$lib/caseStudioIntent';
	import type { CaseStudioGroundingAudit, CaseStudioOption, CaseStudioResponse, CourtType, ExercisePaperSnapshot, JudgeExerciseBrief, JudgePacket, SavedDraft, StagedCase } from '$lib/types';

	const totalCases = $derived($caseHistoryStore.length);
	const tier = $derived($subscriptionStore.tier);
	const currentLimit = $derived(TIER_CONFIG[tier].credits);
	const debatesRemaining = $derived(Math.max(0, currentLimit - totalCases));
	const limitReached = $derived(totalCases >= currentLimit);

	type FormSubmission = {
		title: string;
		synopsis: string;
		issues: string;
		remedy: string;
		objective: string;
		targetSkill: string;
		practicePoints: string[];
		judgeBrief: JudgeExerciseBrief | null;
		groundingAudit: CaseStudioGroundingAudit | null;
		defendantPosition: string;
		role: '' | 'plaintiff' | 'defendant';
		sources: string[];
		courtType: CourtType;
	};

	type StudioMessage = {
		id: string;
		role: 'user' | 'assistant' | 'system';
		content: string;
		synthetic?: boolean;
	};

	type StudioMode = CaseStudioMode;
	type StudioActivity = 'idle' | 'thinking' | 'reading' | 'building' | 'auditing';
	type PendingStudioAction = {
		kind: 'build';
		prompt: string;
		sourceSignature: string;
	};

	const FIELD_MIN = {
		title: 5,
		synopsis: 50,
		issues: 10,
		remedy: 5,
		defendantPosition: 5
	} as const;
	const REMOTE_STAGE_TIMEOUT_MS = 1500;

	let formData: FormSubmission = $state(get(caseDraftStore));
	let studioPrompt = $state('');
	let studioMessages = $state<StudioMessage[]>([]);
	let studioAnalysis = $state<CaseStudioResponse['analysis'] | null>(null);
	let studioWorkflow = $state<CaseStudioResponse['workflow'] | null>(null);
	let studioOptions = $state<CaseStudioOption[]>([]);
	let selectedOptionId = $state('');
	let submission: StagedCase | null = $state(null);
	let submitting = $state(false);
	let generating = $state(false);
	let studioActivity = $state<StudioActivity>('idle');
	let errorMessage = $state('');
	let formSubmitAttempted = $state(false);
	let packMissing = $state(false);
	let showSourceEditor = $state(false);
	let autoSelectedPackId = $state('');
	let paperViewerOpen = $state(false);
	let draftSaving = $state(false);
	let draftStatusMessage = $state('');
	let sharingCase = $state(false);
	let shareLink = $state('');
	let shareStatusMessage = $state('');
	let shareErrorMessage = $state('');
	let loadedDraftId = $state('');
	let pendingStudioAction: PendingStudioAction | null = $state(null);
	let chatLogElement: HTMLDivElement | null = $state(null);
	let studioComposerElement: HTMLTextAreaElement | null = $state(null);
	let activityTimers: Array<ReturnType<typeof setTimeout>> = [];

	onMount(() => {
		legalPacksStore.hydrate();
		selectedLegalPackId.hydrate();
		const packs = $legalPacksStore;
		if (!$selectedLegalPackId && packs.length === 1) {
			selectedLegalPackId.select(packs[0].id);
			autoSelectedPackId = packs[0].id;
			formData = { ...formData, sources: packs[0].sources.map((doc) => doc.id) };
		}
		void tick().then(() => autoResizeStudioComposer());
	});

	$effect(() => {
		caseDraftStore.set({ ...formData });
	});

	const selectedPack = $derived($legalPacksStore.find((pack) => pack.id === $selectedLegalPackId) ?? null);
	const selectedSources = $derived(
		selectedPack ? selectedPack.sources.filter((source) => formData.sources.includes(source.id)) : []
	);
	const sourceSelectionSignature = $derived(
		selectedPack ? `${selectedPack.id}:${selectedSources.map((source) => source.id).sort().join('|')}` : ''
	);
	const draftQueryId = $derived($page.url.searchParams.get('draft') ?? '');
	const activeSavedDraft = $derived($draftsStore.find((draft) => draft.id === draftQueryId) ?? null);
	const selectedCase = $derived(studioOptions.find((option) => option.id === selectedOptionId) ?? studioOptions[0] ?? null);
	const hasGroundedDraft = $derived(Boolean(selectedCase));
	const chatPlaceholder = $derived(
		selectedCase ? t('cases.refineDraftPlaceholder', $language) : t('cases.caseStudioPlaceholder', $language)
	);
	const launchReady = $derived(
		formData.title.trim().length >= FIELD_MIN.title &&
		formData.synopsis.trim().length >= FIELD_MIN.synopsis &&
		formData.issues.trim().length >= FIELD_MIN.issues &&
		formData.remedy.trim().length >= FIELD_MIN.remedy &&
		formData.defendantPosition.trim().length >= FIELD_MIN.defendantPosition &&
		Boolean(formData.role) &&
		Boolean($selectedLegalPackId) &&
		formData.sources.length > 0
	);

	$effect(() => {
		if (selectedPack && formData.sources.length === 0 && autoSelectedPackId !== selectedPack.id) {
			autoSelectedPackId = selectedPack.id;
			formData = { ...formData, sources: selectedPack.sources.map((doc) => doc.id) };
		}
	});

	$effect(() => {
		if (!activeSavedDraft || loadedDraftId === activeSavedDraft.id) return;

		if (activeSavedDraft.packId) {
			selectedLegalPackId.select(activeSavedDraft.packId);
			autoSelectedPackId = activeSavedDraft.packId;
		}

		formData = { ...activeSavedDraft.draftData };
		studioAnalysis = activeSavedDraft.analysis ?? null;
		studioWorkflow = activeSavedDraft.workflow ?? null;
		studioOptions = [activeSavedDraft.selectedOption];
		selectedOptionId = activeSavedDraft.selectedOption.id;
		studioMessages = [];
		errorMessage = '';
		formSubmitAttempted = false;
		packMissing = false;
		showSourceEditor = false;
		paperViewerOpen = false;
		draftStatusMessage = '';
		loadedDraftId = activeSavedDraft.id;
	});

	$effect(() => {
		studioMessages.length;
		generating;

		void tick().then(() => {
			chatLogElement?.scrollTo({
				top: chatLogElement.scrollHeight,
				behavior: 'smooth'
			});
		});
	});

	$effect(() => {
		studioPrompt;
		void tick().then(() => autoResizeStudioComposer());
	});

	const makeId = () => `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
	const makeCaseId = () => `local-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

	const clearActivityTimers = () => {
		activityTimers.forEach((timer) => clearTimeout(timer));
		activityTimers = [];
	};

	const autoResizeStudioComposer = () => {
		if (!studioComposerElement) return;
		const minHeight = 120;
		const maxHeight = 320;
		studioComposerElement.style.height = '0px';
		const nextHeight = Math.min(studioComposerElement.scrollHeight, maxHeight);
		studioComposerElement.style.height = `${Math.max(nextHeight, minHeight)}px`;
		studioComposerElement.style.overflowY = studioComposerElement.scrollHeight > maxHeight ? 'auto' : 'hidden';
	};

	const startStudioActivity = (mode: StudioMode, sourceBoundRequest: boolean) => {
		clearActivityTimers();
		if (mode === 'build') {
			studioActivity = 'reading';
			activityTimers = [
				setTimeout(() => (studioActivity = 'building'), 1400),
				setTimeout(() => (studioActivity = 'auditing'), 5200)
			];
			return;
		}
		if (sourceBoundRequest) {
			studioActivity = 'reading';
			activityTimers = [setTimeout(() => (studioActivity = 'thinking'), 2200)];
			return;
		}
		studioActivity = 'thinking';
	};

	const stopStudioActivity = () => {
		clearActivityTimers();
		studioActivity = 'idle';
	};

	const levelLabel = (level: CaseStudioOption['level']) => {
		if (level === 'advanced') return t('cases.levelAdvanced', $language);
		if (level === 'introductory') return t('cases.levelIntroductory', $language);
		return t('cases.levelIntermediate', $language);
	};

	const roleLabel = (role: 'plaintiff' | 'defendant') =>
		role === 'defendant' ? t('cases.defendant', $language) : t('cases.plaintiff', $language);

	const judgeFitLabel = (fit: CaseStudioResponse['analysis']['judgeModeFit']) => {
		if (fit === 'high') return t('cases.judgeFitHigh', $language);
		if (fit === 'low') return t('cases.judgeFitLow', $language);
		return t('cases.judgeFitMedium', $language);
	};

	const sourceCoverageLabel = (coverage: 'high' | 'medium' | 'low') => {
		if (coverage === 'high') return t('cases.coverageHigh', $language);
		if (coverage === 'low') return t('cases.coverageLow', $language);
		return t('cases.coverageMedium', $language);
	};

	const groundingStatusLabel = (status?: CaseStudioGroundingAudit['status']) => {
		if (status === 'source-grounded') return t('cases.sourceGrounded', $language);
		if (status === 'insufficient-sources') return t('cases.insufficientSources', $language);
		return t('cases.needsReview', $language);
	};

	const groundingMapAreaLabel = (area: string) => {
		if (area === 'mainIssue') return t('cases.groundingMainIssue', $language);
		if (area === 'plaintiffTheory') return t('cases.groundingPlaintiffTheory', $language);
		if (area === 'defendantTheory') return t('cases.groundingDefendantTheory', $language);
		if (area === 'judgePressurePoint') return t('cases.groundingJudgePressure', $language);
		if (area === 'successCriteria') return t('cases.groundingSuccessCriteria', $language);
		if (area === 'sourceBoundary') return t('cases.groundingSourceBoundary', $language);
		return t('cases.groundingOther', $language);
	};

	const activityLabel = (activity: StudioActivity) => {
		if (activity === 'reading') return t('cases.activityReading', $language);
		if (activity === 'building') return t('cases.activityBuilding', $language);
		if (activity === 'auditing') return t('cases.activityAuditing', $language);
		return t('cases.activityThinking', $language);
	};

	const activityDescription = (activity: StudioActivity) => {
		if (activity === 'reading') return t('cases.activityReadingDesc', $language);
		if (activity === 'building') return t('cases.activityBuildingDesc', $language);
		if (activity === 'auditing') return t('cases.activityAuditingDesc', $language);
		return t('cases.activityThinkingDesc', $language);
	};

	const activityStepStatus = (step: Exclude<StudioActivity, 'idle' | 'thinking'>) => {
		const order: Record<Exclude<StudioActivity, 'idle' | 'thinking'>, number> = {
			reading: 1,
			building: 2,
			auditing: 3
		};
		const current = studioActivity === 'reading' || studioActivity === 'building' || studioActivity === 'auditing'
			? order[studioActivity]
			: 0;
		return current > order[step] ? 'done' : current === order[step] ? 'active' : 'waiting';
	};

	const detectExplicitPromptLanguage = (input: string): 'en' | 'fr' | null => {
		const text = input.toLowerCase();
		if (/\b(en anglais|in english|write in english|answer in english|anglais)\b/.test(text)) return 'en';
		if (/\b(en francais|en français|in french|write in french|answer in french|francais|français)\b/.test(text)) return 'fr';
		return null;
	};

	const detectPromptLanguage = (input: string, fallback: 'en' | 'fr' = $language): 'en' | 'fr' => {
		const explicit = detectExplicitPromptLanguage(input);
		if (explicit) return explicit;
		if (/[àâçéèêëîïôûùüÿœ]/i.test(input)) return 'fr';
		if (/\b(le|la|les|des|du|de|un|une|je|tu|vous|nous|faire|pratiquer|exercice|cas|source|sources|article|juge|droit)\b/i.test(input)) return 'fr';
		return fallback;
	};

	const resolveCaseLanguages = () => {
		const sourceLanguage = selectedPack?.language === 'fr'
			? 'fr'
			: selectedPack?.language === 'en'
				? 'en'
				: detectPromptLanguage(
					[
						formData.objective,
						formData.targetSkill,
						formData.synopsis,
						formData.issues,
						formData.remedy,
						formData.defendantPosition
					].join('\n')
				);

		return {
			sourceLanguage,
			draftLanguage: sourceLanguage,
			hearingLanguage: sourceLanguage
		};
	};

	const recentStudioLanguage = (): 'en' | 'fr' | null => {
		for (let index = studioMessages.length - 1; index >= 0; index -= 1) {
			const entry = studioMessages[index];
			if (!entry?.content?.trim() || entry.role === 'system') continue;
			return detectPromptLanguage(entry.content, $language);
		}
		return null;
	};

	const resolveStudioRequestLanguage = (_intent: CaseStudioIntent, prompt: string): 'en' | 'fr' => {
		const explicit = detectExplicitPromptLanguage(prompt);
		if (explicit) return explicit;
		return detectPromptLanguage(prompt, recentStudioLanguage() ?? $language);
	};

	const classifyStudioIntent = (input: string): CaseStudioIntent => classifyCaseStudioIntent(input, {
		hasSelectedSources: Boolean(selectedPack?.sources.length),
		hasGroundedDraft
	});

	const clearPendingStudioAction = () => {
		pendingStudioAction = null;
	};

	const defaultApprovedBuildPrompt = (userApproval: string, requestLanguage: 'en' | 'fr') =>
		requestLanguage === 'fr'
			? `L enseignant vient d approuver l action proposee avec: "${userApproval}". Construis maintenant un exercice de mode juge source-fonde a partir des sources selectionnees et de la conversation precedente. Si une orientation a deja ete discutee, utilise-la. Sinon, choisis l angle le plus solide que les sources appuient clairement.`
			: `The teacher approved the proposed action with: "${userApproval}". Now build a source-grounded Judge-mode exercise from the selected sources and the previous conversation. If a direction was already discussed, use it. Otherwise, choose the strongest angle the sources clearly support.`;

	const resolveStudioExecutionPrompt = (intent: CaseStudioIntent, typedPrompt: string, requestLanguage: 'en' | 'fr') => {
		const approval = intent.signals.includes('approval-build');
		const activePendingAction = pendingStudioAction?.kind === 'build' && pendingStudioAction.sourceSignature === sourceSelectionSignature
			? pendingStudioAction
			: null;
		if (!approval) return typedPrompt;
		if (activePendingAction) return `${activePendingAction.prompt}\n\nTeacher approval: ${typedPrompt}`;
		return defaultApprovedBuildPrompt(typedPrompt, requestLanguage);
	};

	const updatePendingStudioAction = (response: CaseStudioResponse, requestLanguage: 'en' | 'fr', mode: StudioMode) => {
		if (mode === 'build' || response.workflow.stage !== 'source-reviewed' || response.options.length > 0 || selectedSources.length === 0) {
			pendingStudioAction = null;
			return;
		}

		pendingStudioAction = {
			kind: 'build',
			sourceSignature: sourceSelectionSignature,
			prompt: requestLanguage === 'fr'
				? `Construis maintenant le meilleur exercice de mode juge appuye par les sources selectionnees et par la conversation precedente. Utilise l analyse des sources deja faite comme orientation, mais fonde le cas seulement sur les passages recuperes.`
				: `Now build the strongest Judge-mode exercise supported by the selected sources and the previous conversation. Use the source analysis already completed as direction, but ground the case only in retrieved passages.`
		};
	};

	const setPack = (packId: string) => {
		selectedLegalPackId.select(packId);
		clearPendingStudioAction();
		packMissing = false;
		errorMessage = '';
		studioAnalysis = null;
		studioWorkflow = null;
		studioOptions = [];
		selectedOptionId = '';
		showSourceEditor = false;
		paperViewerOpen = false;
		autoSelectedPackId = packId;
		const pack = $legalPacksStore.find((candidate) => candidate.id === packId);
		formData = {
			...formData,
			sources: pack ? pack.sources.map((doc) => doc.id) : []
		};
	};

	const toggleSource = (id: string) => {
		clearPendingStudioAction();
		if (formData.sources.includes(id)) {
			formData = { ...formData, sources: formData.sources.filter((sourceId) => sourceId !== id) };
		} else {
			formData = { ...formData, sources: [...formData.sources, id] };
		}
	};

	const selectAllSources = () => {
		if (!selectedPack) return;
		clearPendingStudioAction();
		formData = { ...formData, sources: selectedPack.sources.map((source) => source.id) };
	};

	const deselectAllSources = () => {
		clearPendingStudioAction();
		formData = { ...formData, sources: [] };
	};

	const resetForm = () => {
		caseDraftStore.clear();
		formData = get(caseDraftStore);
		studioPrompt = '';
		studioMessages = [];
		studioAnalysis = null;
		studioWorkflow = null;
		studioOptions = [];
		clearPendingStudioAction();
		selectedOptionId = '';
		submission = null;
		errorMessage = '';
		formSubmitAttempted = false;
		packMissing = false;
		showSourceEditor = false;
		paperViewerOpen = false;
		autoSelectedPackId = '';
		draftStatusMessage = '';
		loadedDraftId = '';
		if (draftQueryId) {
			void goto('/create', { replaceState: true, noScroll: true });
		}
	};

	const buildPackPayload = () => selectedPack
		? {
				packId: selectedPack.id,
				packName: selectedPack.name,
				jurisdiction: selectedPack.jurisdiction,
				language: selectedPack.language,
				domain: selectedPack.domain,
				jurisdictions: [...new Set((selectedSources.length ? selectedSources : selectedPack.sources).map((source) => source.jurisdiction).filter(Boolean))],
				sourceTitles: (selectedSources.length ? selectedSources : selectedPack.sources).map((source) => source.title).slice(0, 12),
				sourceIds: selectedSources.map((source) => source.id)
			}
		: null;

	const buildCurrentDraftPayload = () => {
		if (
			!formData.judgeBrief &&
			!formData.title.trim() &&
			!formData.objective.trim() &&
			!formData.synopsis.trim() &&
			!formData.issues.trim() &&
			!formData.remedy.trim() &&
			!formData.defendantPosition.trim()
		) {
			return null;
		}

		return {
			id: selectedCase?.id,
			title: formData.title,
			objective: formData.objective,
			targetSkill: formData.targetSkill,
			synopsis: formData.synopsis,
			issues: formData.issues,
			plaintiffPosition: formData.remedy,
			defendantPosition: formData.defendantPosition,
			practicePoints: formData.practicePoints,
			judgeBrief: formData.judgeBrief,
			groundingAudit: formData.groundingAudit
		};
	};

	const buildPaperSnapshot = (): ExercisePaperSnapshot | null => {
		if (!selectedCase) return null;
		const { sourceLanguage, draftLanguage, hearingLanguage } = resolveCaseLanguages();

		return {
			title: formData.title.trim() || selectedCase.title,
			level: selectedCase.level,
			sourceLanguage,
			draftLanguage,
			hearingLanguage,
			objective: formData.objective.trim() || selectedCase.objective,
			targetSkill: formData.targetSkill.trim() || selectedCase.targetSkill,
			synopsis: formData.synopsis.trim() || selectedCase.synopsis,
			issues: formData.issues.trim() || selectedCase.issues,
			plaintiffPosition: formData.remedy.trim() || selectedCase.plaintiffPosition,
			defendantPosition: formData.defendantPosition.trim() || selectedCase.defendantPosition,
			practicePoints: [...formData.practicePoints],
			recommendedRole: selectedCase.recommendedRole,
			selectedRole: formData.role === 'defendant' ? 'defendant' : (formData.role || selectedCase.recommendedRole),
			difficultyTrap: selectedCase.difficultyTrap || undefined,
			sourcesUsed: selectedCase.sourcesUsed,
			judgeBrief: formData.judgeBrief ?? selectedCase.judgeBrief,
			groundingAudit: formData.groundingAudit ?? selectedCase.groundingAudit,
			sourceBundle: selectedCase.sourceBundle,
			packMemory: selectedCase.packMemory,
			evidenceSufficiency: selectedCase.evidenceSufficiency
		};
	};

	const buildServerEvidencePaperSnapshot = (snapshot: ExercisePaperSnapshot | null): ExercisePaperSnapshot | null => {
		if (!snapshot) return null;
		return {
			...snapshot,
			packMemory: undefined,
		};
	};

	const buildJudgePacket = (snapshot: ExercisePaperSnapshot | null, selectedRole: 'plaintiff' | 'defendant'): JudgePacket | undefined => {
		if (!snapshot) return undefined;
		return {
			version: 'judge-packet-v1',
			createdAt: new Date().toISOString(),
			paper: snapshot,
			sourcePacket: snapshot.sourceBundle,
			judgeBrief: snapshot.judgeBrief,
			sourceBoundaries: snapshot.judgeBrief?.sourceBoundaries ?? [],
			selectedRole,
			language: snapshot.hearingLanguage ?? snapshot.sourceLanguage ?? selectedPack?.language
		};
	};

	const buildPackContext = () =>
		selectedPack
			? {
					id: selectedPack.id,
					name: selectedPack.name,
					jurisdiction: selectedPack.jurisdiction,
					domain: selectedPack.domain,
					language: selectedPack.language,
					sourceLanguage: selectedPack.language,
					draftLanguage: selectedPack.language,
					hearingLanguage: selectedPack.language
				}
			: undefined;

	const makeDraftId = () => `draft-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

	const saveCurrentDraft = async () => {
		if (!selectedCase) return;
		const paperSnapshot = buildPaperSnapshot();
		if (!paperSnapshot) return;

		draftSaving = true;
		errorMessage = '';
		draftStatusMessage = '';

		try {
			const now = new Date().toISOString();
			const draftId = activeSavedDraft?.id || loadedDraftId || makeDraftId();
			const record: SavedDraft = {
				id: draftId,
				title: paperSnapshot.title,
				draftData: { ...formData },
				selectedOption: selectedCase,
				paperSnapshot,
				analysis: studioAnalysis ?? undefined,
				workflow: studioWorkflow ?? undefined,
				packId: $selectedLegalPackId || undefined,
				packContext: buildPackContext(),
				createdAt: activeSavedDraft?.createdAt ?? now,
				updatedAt: now
			};

			draftsStore.saveDraft(record);
			loadedDraftId = draftId;
			draftStatusMessage = t('cases.draftSavedDesc', $language);
			await goto(`/create?draft=${encodeURIComponent(draftId)}`, { replaceState: true, noScroll: true });
		} finally {
			draftSaving = false;
		}
	};

	const shareCurrentCase = async () => {
		if (!selectedCase) return;
		const paperSnapshot = buildPaperSnapshot();
		if (!paperSnapshot) return;

		sharingCase = true;
		shareErrorMessage = '';
		shareStatusMessage = '';
		try {
			const response = await fetch('/api/shared-cases', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					paperSnapshot,
					packContext: buildPackContext()
				})
			});
			const payload = await response.json().catch(() => null) as { url?: string; message?: string } | null;
			if (!response.ok || !payload?.url) {
				throw new Error(payload?.message ?? t('cases.shareFailed', $language));
			}
			shareLink = payload.url;
			shareStatusMessage = t('cases.shareCreated', $language);
			try {
				await navigator.clipboard?.writeText(payload.url);
				shareStatusMessage = t('cases.shareCopied', $language);
			} catch {
				// Clipboard can fail on non-HTTPS/local contexts; the link is still shown.
			}
		} catch (err) {
			shareErrorMessage = err instanceof Error ? err.message : t('cases.shareFailed', $language);
		} finally {
			sharingCase = false;
		}
	};

	const copyShareLink = async () => {
		if (!shareLink) return;
		try {
			await navigator.clipboard?.writeText(shareLink);
			shareStatusMessage = t('cases.shareCopied', $language);
		} catch {
			shareStatusMessage = t('cases.shareManualCopy', $language);
		}
	};

	const readErrorMessage = async (response: Response) => {
		const text = await response.text();
		try {
			const parsed = JSON.parse(text) as { message?: string; error?: string };
			return parsed.message ?? parsed.error ?? text;
		} catch {
			return text || ($language === 'fr' ? 'La demande a echoue.' : 'The request failed.');
		}
	};

	const runCaseStudio = async (intent: CaseStudioIntent) => {
		const typedPrompt = studioPrompt.trim();
		const mode = intent.mode;
		const requestLanguage = resolveStudioRequestLanguage(intent, typedPrompt);
		const prompt = resolveStudioExecutionPrompt(intent, typedPrompt, requestLanguage);

		if (!typedPrompt) {
			errorMessage = t('cases.studioRequestRequired', $language);
			return;
		}

		if (limitReached) return;

		const sourceBoundRequest = intent.sourceBound;
		if (sourceBoundRequest && (!$selectedLegalPackId || !selectedPack)) {
			const userMessage: StudioMessage | null = typedPrompt
				? { id: makeId(), role: 'user', content: typedPrompt }
				: null;
			studioMessages = [
				...(userMessage ? [...studioMessages, userMessage] : studioMessages),
				{ id: makeId(), role: 'assistant', content: t('cases.selectPackFirst', $language) }
			];
			studioPrompt = '';
			errorMessage = '';
			packMissing = true;
			return;
		}

		packMissing = false;
		errorMessage = '';
		generating = true;
		startStudioActivity(mode, sourceBoundRequest);

		const resettingBuild = intent.signals.includes('reset-build');
		const currentDraft = resettingBuild ? null : buildCurrentDraftPayload();
		const previousOptions = studioOptions;
		const currentSelectedId = resettingBuild ? '' : selectedCase?.id ?? selectedOptionId;
		const history = (resettingBuild ? [] : studioMessages)
			.filter((message) => !message.synthetic)
			.slice(-6)
			.map(({ role, content }) => ({ role, content }));
		if (resettingBuild) {
			studioAnalysis = null;
			studioWorkflow = null;
			clearPendingStudioAction();
			paperViewerOpen = false;
		}

		const userMessage: StudioMessage | null = typedPrompt
			? { id: makeId(), role: 'user', content: typedPrompt }
			: null;
		const nextMessages: StudioMessage[] = userMessage ? [...studioMessages, userMessage] : studioMessages;
		studioMessages = nextMessages;
		studioPrompt = '';

		try {
			const response = await fetch('/api/case-studio', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					mode,
					message: prompt,
					history,
					currentDraft,
					otherDrafts: resettingBuild ? [] : previousOptions.filter((option) => option.id !== currentSelectedId),
					currentOptions: resettingBuild ? [] : studioOptions,
					language: requestLanguage,
					pack: buildPackPayload()
				})
			});

			if (!response.ok) throw new Error(await readErrorMessage(response));

			const data = (await response.json()) as CaseStudioResponse;
			studioAnalysis = data.analysis;
			studioWorkflow = data.workflow;
			updatePendingStudioAction(data, requestLanguage, mode);
			const serverReturnedDraftArtifacts = Boolean(data.draft || data.options?.length);
			if (mode === 'build' || serverReturnedDraftArtifacts) {
				const nextOptions = data.options?.length
					? data.options
					: currentDraft && previousOptions.length
						? previousOptions
						: [];
				studioOptions = nextOptions;
				const nextOption = data.draft ?? nextOptions.find((option) => option.id === currentSelectedId) ?? nextOptions[0];
				if (nextOption) {
					selectOption(nextOption);
				} else if (!currentDraft) {
					selectedOptionId = '';
				}
			}

			studioMessages = [...nextMessages, { id: makeId(), role: 'assistant', content: data.assistantMessage }];
		} catch (err) {
			const message = err instanceof Error ? err.message : ($language === 'fr' ? 'Generation impossible.' : 'Generation failed.');
			errorMessage = message;
			studioMessages = [...nextMessages, { id: makeId(), role: 'system', content: message }];
		} finally {
			generating = false;
			stopStudioActivity();
		}
	};

	const submitStudioPrompt = () => {
		if (generating || limitReached || !studioPrompt.trim()) return;
		void runCaseStudio(classifyStudioIntent(studioPrompt));
	};

	const buildPendingStudioAction = () => {
		if (generating || limitReached || !pendingStudioAction) return;
		const approval = $language === 'fr' ? 'Vas-y' : 'Go';
		studioPrompt = approval;
		void runCaseStudio(classifyStudioIntent(approval));
	};

	const handleStudioSubmit = (event: Event) => {
		event.preventDefault();
		submitStudioPrompt();
	};

	const handleStudioComposerKeydown = (event: KeyboardEvent) => {
		if (event.key !== 'Enter' || event.shiftKey || event.isComposing) return;
		event.preventDefault();
		submitStudioPrompt();
	};

	const selectOption = (option: CaseStudioOption) => {
		selectedOptionId = option.id;
		formData = {
			...formData,
			title: option.title,
			synopsis: option.synopsis,
			issues: option.issues,
			remedy: option.plaintiffPosition,
			objective: option.objective,
			targetSkill: option.targetSkill,
			practicePoints: option.practicePoints,
			judgeBrief: option.judgeBrief,
			groundingAudit: option.groundingAudit ?? null,
			defendantPosition: option.defendantPosition,
			role: option.recommendedRole,
			courtType: 'bench'
		};
		formSubmitAttempted = false;
		errorMessage = '';
	};

	const selectNextOption = () => {
		if (studioOptions.length < 2 || !selectedCase) return;
		const currentIndex = studioOptions.findIndex((option) => option.id === selectedCase.id);
		const nextOption = studioOptions[(currentIndex + 1) % studioOptions.length];
		if (nextOption) selectOption(nextOption);
	};

	const handleSubmit = async () => {
		formSubmitAttempted = true;
		if (limitReached) {
			errorMessage = `${t('pricing.limitReached', $language)} ${t('pricing.limitDesc', $language)}`;
			return;
		}
		if (!selectedCase) return;
		if (!$selectedLegalPackId || !formData.sources.length) {
			errorMessage = t('cases.selectPackFirst', $language);
			return;
		}
		if (!formData.role) {
			formData = { ...formData, role: selectedCase.recommendedRole };
		}
		submitting = true;
		errorMessage = '';
		try {
			const paperSnapshot = buildPaperSnapshot();
			const serverEvidenceSnapshot = buildServerEvidencePaperSnapshot(paperSnapshot);
			const selectedRole: 'plaintiff' | 'defendant' = paperSnapshot?.selectedRole === 'defendant'
				? 'defendant'
				: 'plaintiff';
			const judgePacket = buildJudgePacket(paperSnapshot, selectedRole);
			const roleAlignedRemedy = selectedRole === 'plaintiff'
				? (paperSnapshot?.plaintiffPosition || formData.remedy)
				: (paperSnapshot?.defendantPosition || formData.defendantPosition);
			const launchJudgeBrief = formData.judgeBrief
				? {
					...formData.judgeBrief,
					goal: paperSnapshot?.objective || formData.judgeBrief.goal,
					primarySkill: paperSnapshot?.targetSkill || formData.judgeBrief.primarySkill
				}
				: undefined;
			const casePayload = {
				title: paperSnapshot?.title || formData.title,
				synopsis: paperSnapshot?.synopsis || formData.synopsis,
				issues: paperSnapshot?.issues || formData.issues,
				remedy: roleAlignedRemedy,
				objective: paperSnapshot?.objective || formData.objective,
				targetSkill: paperSnapshot?.targetSkill || formData.targetSkill,
				practicePoints: formData.practicePoints,
				judgeBrief: launchJudgeBrief,
				groundingAudit: formData.groundingAudit,
				paperSnapshot: serverEvidenceSnapshot,
				judgePacket,
				role: selectedRole,
				sources: formData.sources,
				packId: $selectedLegalPackId,
				courtType: formData.courtType
			};
			let payload: StagedCase | null = null;

			try {
				const controller = new AbortController();
				const timeout = setTimeout(() => controller.abort(), REMOTE_STAGE_TIMEOUT_MS);
				const response = await fetch('/api/cases', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify(casePayload),
					signal: controller.signal
				});
				clearTimeout(timeout);

				const responsePayload = await response.json().catch(() => null);
				if (!response.ok || !responsePayload) {
					if (response.status === 401 || response.status === 403) {
						throw new Error(responsePayload?.message ?? (
							$language === 'fr'
								? 'Authentification requise pour lancer le mode juge.'
								: 'Authentication is required to launch Judge mode.'
						));
					}
					console.warn('Remote case staging failed; launching with local staged case.', {
						status: response.status,
						payload: responsePayload
					});
				} else {
					payload = responsePayload as StagedCase;
				}
			} catch (err) {
				if (!(err instanceof TypeError) && !(err instanceof DOMException && err.name === 'AbortError')) throw err;
				console.warn('Remote case staging was unreachable; launching with local staged case.', err);
			}

			const stagedPayload: StagedCase = payload ?? {
					id: makeCaseId(),
					title: casePayload.title,
					synopsis: casePayload.synopsis,
					issues: casePayload.issues,
					remedy: casePayload.remedy,
					objective: casePayload.objective,
					targetSkill: casePayload.targetSkill,
					practicePoints: casePayload.practicePoints,
					judgeBrief: casePayload.judgeBrief,
					groundingAudit: casePayload.groundingAudit ?? undefined,
					paperSnapshot: casePayload.paperSnapshot ?? undefined,
					role: casePayload.role,
					sources: casePayload.sources,
					packId: casePayload.packId || undefined,
					judgePacket,
					courtType: 'bench',
					createdAt: new Date().toISOString()
				};

			const staged = stageCase({
				...stagedPayload,
				objective: stagedPayload.objective ?? formData.objective,
				targetSkill: stagedPayload.targetSkill ?? formData.targetSkill,
				practicePoints: stagedPayload.practicePoints ?? formData.practicePoints,
				judgeBrief: stagedPayload.judgeBrief ?? launchJudgeBrief,
				groundingAudit: stagedPayload.groundingAudit ?? formData.groundingAudit ?? undefined,
				paperSnapshot: paperSnapshot ?? stagedPayload.paperSnapshot ?? undefined,
				judgePacket: stagedPayload.judgePacket ?? judgePacket,
				packContext: selectedPack
					? {
							id: selectedPack.id,
							name: selectedPack.name,
							jurisdiction: selectedPack.jurisdiction,
							domain: selectedPack.domain,
							language: selectedPack.language
						}
					: undefined
			});
			seedTranscript(staged);
			caseHistoryStore.registerCase(staged);
			const openingTurns = get(debateStore);
			if (openingTurns.length) saveTurns(staged.id, openingTurns);
			submission = staged;
			caseDraftStore.clear();
			await goto('/debate?local=1');
		} catch (err) {
			console.error('Case creation failed', err);
			errorMessage = err instanceof Error ? err.message : 'Something went wrong while staging the case.';
		} finally {
			submitting = false;
		}
	};
</script>

<div class="min-h-full">
		<div class="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
			<div class="space-y-6">
				{#if limitReached}
					<div class="rounded-[1.5rem] border border-white/12 bg-white/5 p-5 text-center shadow-[0_18px_48px_rgba(0,0,0,0.24)]">
						<p class="text-sm font-semibold text-white">{t('pricing.limitReached', $language)}</p>
						<p class="mt-2 text-sm text-white/60">{t('pricing.limitDesc', $language)}</p>
						{#if tier !== 'enterprise'}
							<a href="/pricing" class="mt-4 inline-flex rounded-full bg-white px-5 py-2 text-xs font-bold uppercase tracking-[0.16em] text-black transition hover:bg-[#f3eadf]">{t('pricing.upgradePro', $language)}</a>
						{/if}
					</div>
				{:else if errorMessage}
					<div class="rounded-[1.5rem] border border-red-400/35 bg-red-500/10 p-4 text-sm font-semibold text-red-100 shadow-[0_16px_36px_rgba(0,0,0,0.24)]">
						{errorMessage}
					</div>
				{/if}

				{#if !selectedPack}
					<section class="quiet-panel flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
						<p class="text-[11px] font-bold uppercase tracking-[0.18em] text-white/35 font-mono">{t('cases.sourcePack', $language)}</p>
						<p class="text-base text-white/72">{t('cases.selectPackFirst', $language)}</p>
						<a href="/library" class="quiet-chip self-start sm:self-auto">{t('cases.goToLibrary', $language)}</a>
					</section>
				{/if}

				<section class="flex flex-col items-center w-full">
					<section class="flex flex-col relative min-h-[76vh] lg:h-[82vh] w-full max-w-4xl mx-auto bg-transparent">
						<div class="flex flex-wrap items-start justify-between gap-3 py-4 shrink-0 w-full">
							<div class="flex min-w-0 flex-1 flex-wrap items-center gap-4">
								{#if $legalPacksStore.length > 0}
									<div class="min-w-0 flex items-center gap-3">
										<p class="text-[10px] font-bold uppercase tracking-[0.18em] text-white/35 font-mono">{t('cases.activePackLabel', $language)}</p>
										<div class="relative flex min-w-[12rem] max-w-[20rem] items-center rounded-lg border border-white/10 bg-white/[0.02] hover:bg-white/[0.05] transition-colors">
											<select
												class="w-full appearance-none bg-transparent py-2 pl-4 pr-10 text-[13px] font-medium text-white outline-none cursor-pointer placeholder-white/30"
												value={$selectedLegalPackId}
												onchange={(e) => setPack(e.currentTarget.value)}
											>
												<option class="bg-white text-slate-700" value="" disabled>{t('cases.selectPackFirst', $language)}</option>
												{#each $legalPacksStore as pack}
													<option class="bg-white text-slate-900" value={pack.id}>{pack.name}</option>
												{/each}
											</select>
											<div class="pointer-events-none absolute right-3 text-white/40">
												<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>
											</div>
										</div>
									</div>
								{/if}
							</div>
							
							{#if selectedPack}
										<div class="relative flex flex-wrap items-start justify-end gap-2">
									<button 
										type="button" 
											class={`flex items-center gap-2 rounded-lg border px-3 py-2 text-left transition ${showSourceEditor ? 'border-white/20 bg-white/[0.08] text-white' : 'border-white/10 bg-white/[0.04] text-white/78 hover:bg-white/[0.07] hover:text-white'}`} 
										onclick={() => showSourceEditor = !showSourceEditor} 
										title={t('cases.includedSourcesLabel', $language)}
									>
										<span class="text-[10px] font-bold uppercase tracking-[0.16em] text-white/40 font-mono">{t('cases.includedSourcesLabel', $language)}</span>
										<span class="text-[12px] font-medium text-white/90">{formData.sources.length}/{selectedPack.sources.length}</span>
									</button>

									{#if showSourceEditor}
										<div class="absolute right-0 top-full mt-3 w-[20rem] sm:w-[22rem] z-50 rounded-2xl border border-white/10 bg-[#020617] p-4 shadow-card backdrop-blur-xl">
											<div class="mb-4 flex items-center justify-between">
												<div>
													<p class="text-[10px] font-bold uppercase tracking-[0.2em] text-white/40 font-mono">{t('cases.includedSourcesLabel', $language)} ({formData.sources.length}/{selectedPack.sources.length})</p>
													<p class="mt-1 text-[11px] text-white/50">{t('cases.includedSourcesHint', $language)}</p>
												</div>
												<div class="flex gap-2">
													<button type="button" class="text-[10px] font-bold uppercase tracking-[0.1em] text-white/50 hover:text-white transition" onclick={selectAllSources}>{t('cases.allOn', $language)}</button>
													<span class="text-white/20">|</span>
													<button type="button" class="text-[10px] font-bold uppercase tracking-[0.1em] text-white/50 hover:text-white transition" onclick={deselectAllSources}>{t('cases.allOff', $language)}</button>
												</div>
											</div>
											<div class="max-h-[50vh] overflow-y-auto space-y-2 pr-2 custom-scrollbar">
												{#each selectedPack.sources as doc}
													{@const checked = formData.sources.includes(doc.id)}
													<label class={`flex items-start gap-3 rounded-xl border p-3 cursor-pointer transition ${checked ? 'border-white/20 bg-white/5' : 'border-white/5 bg-white/[0.02] hover:bg-white/5'}`}>
															<input type="checkbox" {checked} onchange={() => toggleSource(doc.id)} class="mt-0.5 h-4 w-4 shrink-0 accent-accent bg-transparent border-white/20 rounded" />
														<div class="min-w-0 flex-1">
															<p class="text-[13px] font-medium text-white/90 truncate">{doc.title}</p>
															<div class="mt-1.5 flex items-center gap-2 text-[9px] font-mono uppercase tracking-wider text-white/40">
																<span class="px-1.5 py-0.5 rounded pl-1 border border-white/10 bg-white/5">{doc.docType || 'TXT'}</span>
																<span class="truncate">{doc.originalFileName || t('cases.source', $language)}</span>
															</div>
														</div>
													</label>
												{/each}
											</div>
										</div>
									{/if}
								</div>
							{/if}
						</div>

						<div class="relative flex-1 overflow-y-auto px-2 sm:px-4 pb-52 pt-6 w-full custom-scrollbar" bind:this={chatLogElement} aria-live="polite">
							{#if studioMessages.length}
								<div class="flex flex-col gap-6 max-w-3xl mx-auto w-full">
									{#each studioMessages as message}
										<article class={`flex flex-col gap-1 w-full ${message.role === 'user' ? 'items-end' : 'items-start'}`}>
											<p class={`text-sm font-semibold tracking-wide ${
												message.role === 'assistant' ? 'text-accent' : message.role === 'system' ? 'text-red-400' : 'text-white/80'
											}`}>
												{message.role === 'assistant' ? t('cases.verdictSpeaker', $language) : message.role === 'user' ? t('debate.litigantSpeaker', $language) : t('debate.systemSpeaker', $language)}
											</p>
											<div class={`text-base leading-relaxed max-w-[90%] ${message.role === 'user' ? 'text-white/92 bg-white/5 border border-white/10 rounded-2xl rounded-tr-sm px-5 py-4 text-left' : 'text-white/80 text-left'}`}>
												<p class="whitespace-pre-wrap">{message.content}</p>
											</div>
										</article>
									{/each}

									{#if generating}
										<article class="flex flex-col gap-1 w-full" aria-live="polite" aria-busy="true">
											<p class="text-sm font-semibold tracking-wide text-accent">{t('cases.verdictSpeaker', $language)}</p>
											<div class="flex items-center gap-4 bg-white/[0.02] border border-white/5 rounded-2xl p-4 w-full max-w-[80%]">
												<div class="flex items-center gap-1.5" aria-hidden="true">
													<div class="w-2 h-2 rounded-full bg-accent animate-pulse"></div>
													<div class="w-2 h-2 rounded-full bg-accent animate-pulse" style="animation-delay: 150ms"></div>
													<div class="w-2 h-2 rounded-full bg-accent animate-pulse" style="animation-delay: 300ms"></div>
												</div>
												<div class="min-w-0 flex-1">
													<p class="text-sm font-semibold text-white/90">{activityLabel(studioActivity)}</p>
													<p class="text-xs text-white/50">{activityDescription(studioActivity)}</p>
												</div>
											</div>
										</article>
									{/if}

									{#if pendingStudioAction && !hasGroundedDraft && !generating}
										<button type="button" class="group flex items-center gap-4 p-5 rounded-2xl border border-accent/30 bg-accent/5 hover:bg-accent/10 transition-colors w-full text-left" onclick={buildPendingStudioAction}>
											<div class="flex items-center justify-center w-10 h-10 rounded-full bg-accent/20 text-accent group-hover:bg-accent/30 transition-colors" aria-hidden="true">
												<svg viewBox="0 0 24 24" class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
													<path d="M5 12h14" />
													<path d="m13 6 6 6-6 6" />
												</svg>
											</div>
											<div class="min-w-0 flex-1">
												<span class="block text-sm font-bold text-accent tracking-wide">{t('cases.buildNow', $language)}</span>
												<span class="block mt-0.5 text-sm text-white/70">{t('cases.buildNowDesc', $language)}</span>
											</div>
										</button>
									{/if}

											{#if hasGroundedDraft && selectedCase}
												<button type="button" class="group flex items-center gap-4 p-5 rounded-2xl border border-white/10 bg-white/[0.02] hover:bg-white/[0.05] transition-colors w-full max-w-3xl mx-auto text-left" onclick={() => (paperViewerOpen = true)}>
													<div class="flex items-center justify-center w-10 h-10 rounded-full bg-white/10 text-white group-hover:bg-white/20 transition-colors" aria-hidden="true">
														<svg viewBox="0 0 24 24" class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
															<path d="M7 3.75h7.5L19.5 8.75v11.5a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1v-15.5a1 1 0 0 1 1-1Z" />
															<path d="M14.5 3.75v5h5" />
															<path d="M9 12h6" />
															<path d="M9 16h4" />
														</svg>
													</div>
													<div class="min-w-0 flex-1">
														<span class="block text-sm font-bold text-white tracking-wide">{t('cases.documentPreview', $language)}</span>
														<span class="block mt-0.5 text-sm text-white/70 truncate">{formData.title || selectedCase.title}</span>
													</div>
													<span class="text-xs font-bold uppercase tracking-wider text-white/40 group-hover:text-white/70 transition-colors">{t('cases.openExercisePaper', $language)}</span>
												</button>
											{/if}
								</div>
							{:else}
								<div class="flex-1 flex flex-col items-center justify-center min-h-[55vh] px-4 w-full max-w-2xl mx-auto text-center">
									<section class="animate-fade-in-up space-y-6 w-full" style="animation-delay: 0.08s">
										<h3 class="text-3xl font-display font-bold text-white tracking-tight">{t('cases.chatEmptyTitle', $language)}</h3>
										<p class="mx-auto max-w-2xl text-lg text-white/55 leading-relaxed font-light">{t('cases.chatEmptyDesc', $language)}</p>
										{#if !selectedPack}
											<div class="inline-block mt-2 rounded-xl border border-amber-500/20 bg-amber-500/10 px-5 py-3 text-sm text-amber-200/90 font-medium tracking-wide">
												<p>{t('cases.selectPackFirst', $language)}</p>
											</div>
										{/if}
									</section>
								</div>
							{/if}
						</div>

						<form class="absolute bottom-0 left-0 w-full bg-gradient-to-t from-slate-950 via-slate-950/80 to-transparent pt-10 pb-6 px-4 shrink-0" onsubmit={handleStudioSubmit}>
							<div class="flex flex-col relative w-full max-w-4xl mx-auto bg-white/[0.04] border border-white/10 rounded-[1.5rem] shadow-2xl focus-within:border-white/20 focus-within:bg-white/[0.06] transition-colors">
								<textarea
									class="w-full bg-transparent px-5 py-4 pr-16 text-base leading-relaxed text-white outline-none resize-none min-h-[120px] max-h-[320px] custom-scrollbar placeholder:text-white/30"
									bind:this={studioComposerElement}
									bind:value={studioPrompt}
									rows="4"
									enterkeyhint="send"
									placeholder={chatPlaceholder}
									oninput={autoResizeStudioComposer}
									onkeydown={handleStudioComposerKeydown}
								></textarea>
								<button
									type="submit"
									title={t('cases.sendToStudio', $language)}
									disabled={generating || limitReached || !studioPrompt.trim()}
									class="absolute bottom-4 right-4 flex items-center justify-center w-10 h-10 rounded-full bg-white text-black transition-transform hover:scale-105 disabled:opacity-30 disabled:pointer-events-none"
								>
									<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-4" aria-hidden="true">
										<path d="M5 12h14" />
										<path d="m13 6 6 6-6 6" />
									</svg>
								</button>
							</div>
						</form>
					</section>

						{#if paperViewerOpen}
							<div class="fixed inset-0 z-50 overflow-y-auto bg-slate-950/80 p-3 sm:p-6" role="dialog" aria-modal="true" aria-label={t('cases.documentPreview', $language)} tabindex="0" onclick={(event) => {
								if (event.target === event.currentTarget) {
									paperViewerOpen = false;
								}
							}} onkeydown={(event) => {
								if (event.key === 'Escape') {
									paperViewerOpen = false;
								}
							}}>
								<div class="mx-auto max-w-3xl">

									<!-- Toolbar -->
									<div class="paper-toolbar">
										<span class="paper-kicker-label">{t('cases.documentPreview', $language)}</span>
										<div class="flex items-center gap-2">
											{#if studioOptions.length > 1}
												<button type="button" class="paper-action-btn" onclick={selectNextOption}>{t('cases.switchToAlternative', $language)}</button>
											{/if}
											<button type="button" class="paper-action-btn" onclick={() => (paperViewerOpen = false)}>
												<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>
												{t('cases.closeExercisePaper', $language)}
											</button>
										</div>
									</div>

									<!-- Paper card -->
									<article class="paper-shell">

										<!-- ZONE 1: Identity -->
										<header class="paper-identity">
											<div class="paper-badges">
												<span class="paper-badge">{levelLabel(selectedCase.level)}</span>
												{#if formData.targetSkill}
													<span class="paper-badge">{formData.targetSkill}</span>
												{/if}
												<span class="paper-badge">{t('cases.roleRecommendation', $language)}: {roleLabel(selectedCase.recommendedRole)}</span>
												{#if selectedCase.groundingAudit}
													<span class={`paper-badge paper-badge--${selectedCase.groundingAudit.status}`}>{groundingStatusLabel(selectedCase.groundingAudit.status)}</span>
												{/if}
											</div>
											<input
												id="case-title-editor"
												type="text"
												class="paper-title"
												bind:value={formData.title}
												placeholder={t('cases.caseTitlePlaceholder', $language)}
											/>
										</header>

										<!-- ZONE 2: Scenario -->
										<section class="paper-zone">
											<p class="paper-zone__label">{t('cases.whatHappened', $language)}</p>
											<textarea class="paper-prose" bind:value={formData.synopsis} rows="5"></textarea>
										</section>

										<!-- ZONE 3: Legal question -->
										<section class="paper-zone">
											<div class="paper-question-box">
												<p class="paper-question-box__label">{t('cases.issueQuestion', $language)}</p>
												<textarea class="paper-prose paper-prose--question" bind:value={formData.issues} rows="2"></textarea>
											</div>
										</section>

										<!-- ZONE 4: Plaintiff vs Defendant -->
										<section class="paper-zone">
											<div class="paper-sides">
												<div class="paper-side paper-side--plaintiff">
													<p class="paper-side__label">{t('cases.plaintiff', $language)}</p>
													<textarea class="paper-prose" bind:value={formData.remedy} rows="5"></textarea>
												</div>
												<div class="paper-side paper-side--defendant">
													<p class="paper-side__label">{t('cases.defendant', $language)}</p>
													<textarea class="paper-prose" bind:value={formData.defendantPosition} rows="5"></textarea>
												</div>
											</div>
										</section>

										<!-- ZONE 5: Practice points -->
										{#if formData.practicePoints.length}
											<section class="paper-zone">
												<p class="paper-zone__label">{t('cases.practicePoints', $language)}</p>
												<ol class="paper-practice-list">
													{#each formData.practicePoints as point, i}
														<li class="paper-practice-item">
															<span class="paper-practice-num">{i + 1}</span>
															<span>{point}</span>
														</li>
													{/each}
												</ol>
												{#if selectedCase.difficultyTrap}
													<div class="paper-trap">
														<p class="paper-trap__label">{t('cases.difficultyTrap', $language)}</p>
														<p class="paper-trap__text">{selectedCase.difficultyTrap}</p>
													</div>
												{/if}
											</section>
										{/if}

										<!-- ZONE 6: Edit fields -->
										<section class="paper-zone paper-zone--edit">
											<div class="paper-edit-grid">
												<div>
													<label for="case-objective-editor" class="paper-zone__label">{t('cases.learningObjective', $language)}</label>
													<textarea id="case-objective-editor" class="paper-field" bind:value={formData.objective} rows="2"></textarea>
												</div>
												<div>
													<label for="case-skill-editor" class="paper-zone__label">{t('cases.skillFocus', $language)}</label>
													<input id="case-skill-editor" type="text" class="paper-field" bind:value={formData.targetSkill} />
												</div>
											</div>
										</section>

										<!-- ZONE 7: Choose side + Launch -->
										<section class="paper-launch-zone">
											<div class="paper-choose-side">
												<p class="paper-zone__label">{t('cases.chooseSide', $language)}</p>
												<p class="paper-choose-desc">{t('cases.chooseSideDesc', $language)}</p>
												<div class="paper-role-grid">
													<button
														type="button"
														onclick={() => (formData = { ...formData, role: 'plaintiff' })}
														class={`paper-role-btn paper-role-btn--plaintiff ${formData.role === 'plaintiff' ? 'paper-role-btn--active' : ''}`}
													>
														<span class="paper-role-btn__name">{t('cases.plaintiff', $language)}</span>
														<span class="paper-role-btn__state">{formData.role === 'plaintiff' ? t('cases.caseSelected', $language) : t('cases.selectCase', $language)}</span>
													</button>
													<button
														type="button"
														onclick={() => (formData = { ...formData, role: 'defendant' })}
														class={`paper-role-btn paper-role-btn--defendant ${formData.role === 'defendant' ? 'paper-role-btn--active' : ''}`}
													>
														<span class="paper-role-btn__name">{t('cases.defendant', $language)}</span>
														<span class="paper-role-btn__state">{formData.role === 'defendant' ? t('cases.caseSelected', $language) : t('cases.selectCase', $language)}</span>
													</button>
												</div>
												{#if formSubmitAttempted && !formData.role}
													<p class="paper-validation-error">{t('cases.selectSideRequired', $language)}</p>
												{/if}
											</div>

											<div class="paper-actions">
												<button
													type="button"
													onclick={saveCurrentDraft}
													disabled={draftSaving || !selectedCase}
													class="paper-btn paper-btn--ghost"
												>
													{draftSaving ? t('cases.processing', $language) : loadedDraftId ? t('cases.updateDraft', $language) : t('cases.saveDraft', $language)}
												</button>
												<button
													type="button"
													onclick={shareCurrentCase}
													disabled={sharingCase || !selectedCase || !launchReady}
													class="paper-btn paper-btn--outline"
												>
													{sharingCase ? t('cases.processing', $language) : t('cases.shareCase', $language)}
												</button>
												<button
													type="button"
													onclick={handleSubmit}
													disabled={submitting || limitReached || !selectedCase}
													class="paper-btn paper-btn--launch"
												>
													{submitting ? t('cases.processing', $language) : t('cases.startPractice', $language)}
												</button>
											</div>

											{#if shareLink}
												<div class="paper-message paper-message--share">
													<p class="paper-message__label">{t('cases.shareLinkReady', $language)}</p>
													<div class="paper-share-row">
														<a href={shareLink} target="_blank" rel="noreferrer" class="paper-share-url">{shareLink}</a>
														<button type="button" onclick={copyShareLink} class="paper-btn paper-btn--ghost">{t('cases.copyLink', $language)}</button>
													</div>
													{#if shareStatusMessage}
														<p class="paper-message__status">{shareStatusMessage}</p>
													{/if}
												</div>
											{/if}
											{#if shareErrorMessage}
												<p class="paper-error">{shareErrorMessage}</p>
											{/if}
											{#if draftStatusMessage}
												<div class="paper-message paper-message--success">
													<p class="paper-message__label">{t('cases.draftSaved', $language)}</p>
													<p class="paper-message__status">{draftStatusMessage}</p>
												</div>
											{/if}
											{#if formSubmitAttempted && (!$selectedLegalPackId || formData.sources.length === 0)}
												<p class="paper-error">{t('cases.selectPackFirst', $language)}</p>
											{/if}
											{#if limitReached}
												<p class="paper-error">{t('pricing.limitReached', $language)} {t('pricing.limitDesc', $language)}</p>
											{/if}
											{#if errorMessage}
												<p class="paper-error">{errorMessage}</p>
											{/if}
										</section>

										<!-- COLLAPSED: Judge brief -->
										{#if formData.judgeBrief}
											<details class="paper-drawer">
												<summary class="paper-drawer__trigger">
													<span>{t('cases.judgeBrief', $language)}</span>
													<svg class="paper-drawer__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>
												</summary>
												<div class="paper-drawer__body">
													<div class="paper-edit-grid">
														<div class="space-y-4">
															{#if formData.judgeBrief.goal}
																<div>
																	<p class="paper-drawer__field-label">{t('cases.learningObjective', $language)}</p>
																	<p class="paper-drawer__text">{formData.judgeBrief.goal}</p>
																</div>
															{/if}
															{#if formData.judgeBrief.studentTask}
																<div>
																	<p class="paper-drawer__field-label">{t('cases.judgeStudentTask', $language)}</p>
																	<p class="paper-drawer__text">{formData.judgeBrief.studentTask}</p>
																</div>
															{/if}
															{#if formData.judgeBrief.hearingFocus}
																<div>
																	<p class="paper-drawer__field-label">{t('cases.judgeHearingFocus', $language)}</p>
																	<p class="paper-drawer__text">{formData.judgeBrief.hearingFocus}</p>
																</div>
															{/if}
															{#if selectedCase.difficultyTrap}
																<div>
																	<p class="paper-drawer__field-label">{t('cases.difficultyTrap', $language)}</p>
																	<p class="paper-drawer__text">{selectedCase.difficultyTrap}</p>
																</div>
															{/if}
														</div>
														<div class="space-y-4">
															{#if formData.judgeBrief.issuesToProbe?.length}
																<div>
																	<p class="paper-drawer__field-label">{t('cases.judgeIssuesToProbe', $language)}</p>
																	<ul class="paper-drawer__list">
																		{#each formData.judgeBrief.issuesToProbe as item}<li>{item}</li>{/each}
																	</ul>
																</div>
															{/if}
															{#if formData.judgeBrief.pressurePoints?.length}
																<div>
																	<p class="paper-drawer__field-label">{t('cases.judgePressurePoints', $language)}</p>
																	<ul class="paper-drawer__list">
																		{#each formData.judgeBrief.pressurePoints as item}<li>{item}</li>{/each}
																	</ul>
																</div>
															{/if}
															{#if formData.judgeBrief.successCriteria?.length}
																<div>
																	<p class="paper-drawer__field-label">{t('cases.judgeSuccessCriteria', $language)}</p>
																	<ul class="paper-drawer__list">
																		{#each formData.judgeBrief.successCriteria as item}<li>{item}</li>{/each}
																	</ul>
																</div>
															{/if}
															{#if formData.judgeBrief.sourceBoundaries?.length}
																<div>
																	<p class="paper-drawer__field-label">{t('cases.judgeSourceBoundaries', $language)}</p>
																	<ul class="paper-drawer__list">
																		{#each formData.judgeBrief.sourceBoundaries as item}<li>{item}</li>{/each}
																	</ul>
																</div>
															{/if}
														</div>
													</div>
												</div>
											</details>
										{/if}

										<!-- COLLAPSED: Grounding map -->
										{#if selectedCase.groundingAudit?.groundingMap.length}
											<details class="paper-drawer" open={selectedCase.groundingAudit.status === 'insufficient-sources'}>
												<summary class="paper-drawer__trigger">
													<span>{t('cases.groundingMap', $language)}</span>
													<div class="flex items-center gap-2">
														<span class={`paper-badge paper-badge--${selectedCase.groundingAudit.status}`}>{groundingStatusLabel(selectedCase.groundingAudit.status)}</span>
														<svg class="paper-drawer__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>
													</div>
												</summary>
												<div class="paper-drawer__body">
													{#if selectedCase.groundingAudit.warnings.length || selectedCase.groundingAudit.blockedReasons.length}
														<div class="paper-audit-warnings">
															<p class="paper-drawer__field-label">{t('cases.auditWarnings', $language)}</p>
															<ul class="paper-drawer__list">
																{#each [...selectedCase.groundingAudit.blockedReasons, ...selectedCase.groundingAudit.warnings] as warning}
																	<li>{warning}</li>
																{/each}
															</ul>
														</div>
													{/if}
													<div class="space-y-3 mt-3">
														{#each selectedCase.groundingAudit.groundingMap as item}
															<div class={`paper-grounding-item paper-grounding-item--${item.status}`}>
																<div class="flex flex-wrap items-center gap-2">
																	<span class={`paper-badge paper-badge--${item.status}`}>{groundingMapAreaLabel(item.area)}</span>
																	<span class="paper-grounding-item__source">{item.sourceTitle}{item.citation ? ` · ${item.citation}` : ''}</span>
																</div>
																<p class="paper-grounding-item__claim">{item.claim}</p>
																{#if item.excerpt}
																	<blockquote class="paper-grounding-item__quote">{item.excerpt}</blockquote>
																{/if}
																{#if item.note}
																	<p class="paper-grounding-item__note">{item.note}</p>
																{/if}
															</div>
														{/each}
													</div>
												</div>
											</details>
										{/if}

										<!-- COLLAPSED: Source passages -->
										{#if selectedCase.sourceBundle?.excerpts.length}
											<details class="paper-drawer">
												<summary class="paper-drawer__trigger">
													<span>{t('cases.retrievedSourcePacket', $language)}</span>
													<div class="flex items-center gap-2">
														<span class="paper-badge">{selectedCase.sourceBundle.excerptCount} {t('cases.sourcePacketExcerpts', $language)}</span>
														<svg class="paper-drawer__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>
													</div>
												</summary>
												<div class="paper-drawer__body space-y-3">
													{#each selectedCase.sourceBundle.excerpts.slice(0, 4) as excerpt}
														<div class="paper-excerpt">
															<div class="flex flex-wrap items-center gap-2">
																<span class="paper-badge">{excerpt.docType || t('cases.source', $language)}</span>
																<span class="paper-excerpt__title">{excerpt.sourceTitle}{excerpt.citation ? ` · ${excerpt.citation}` : ''}</span>
															</div>
															{#if excerpt.heading}
																<p class="paper-excerpt__heading">{excerpt.heading}</p>
															{/if}
															<blockquote class="paper-excerpt__quote">{excerpt.excerpt}</blockquote>
															<p class="paper-excerpt__reason">{excerpt.reason}</p>
														</div>
													{/each}
												</div>
											</details>
										{/if}

									</article>
								</div>
							</div>
						{/if}
				</section>

				{#if !hasGroundedDraft && studioOptions.length === 0}
					<div class="pt-4">
						<p class="text-center text-[10px] font-bold uppercase tracking-[0.2em] text-white/20 font-mono">{t('disclaimer.banner', $language)}</p>
					</div>
				{/if}
			</div>
		</div>
	</div>

	<style>
	@keyframes fadeInUp {
		from {
			opacity: 0;
			transform: translateY(24px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	.animate-fade-in-up {
		animation: fadeInUp 0.6s cubic-bezier(0.16, 1, 0.3, 1) both;
	}

	.quiet-panel {
		border: 1px solid rgba(255, 255, 255, 0.08);
		border-radius: 1.9rem;
		background: rgba(255, 255, 255, 0.02);
		backdrop-filter: blur(24px);
		box-shadow: 0 24px 70px rgba(0, 0, 0, 0.28);
		padding: 1.35rem;
	}

	.chat-shell {
		padding: 0;
	}

	.chat-shell--open {
		border: 1px solid rgba(255, 255, 255, 0.08);
		border-radius: 1.1rem;
		background: linear-gradient(180deg, rgba(15, 23, 42, 0.78) 0%, rgba(2, 6, 23, 0.94) 100%);
		backdrop-filter: blur(14px);
		box-shadow: 0 18px 44px rgba(0, 0, 0, 0.22);
	}

	.create-chat-toolbar {
		border-bottom: 1px solid rgba(255, 255, 255, 0.08);
		background: linear-gradient(180deg, rgba(255, 255, 255, 0.03), rgba(255, 255, 255, 0.01));
	}

	.create-chat-brand {
		display: grid;
		gap: 0.22rem;
		padding-top: 0.15rem;
	}

	.create-chat-brand__eyebrow {
		font-family: var(--font-mono, monospace);
		font-size: 0.62rem;
		font-weight: 700;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: rgba(255, 255, 255, 0.46);
	}

	.create-chat-brand__title {
		font-size: 0.95rem;
		font-weight: 700;
		letter-spacing: 0.01em;
		color: rgba(255, 255, 255, 0.94);
	}

	@media (min-width: 768px) {
		.quiet-panel {
			padding: 1.75rem;
		}
	}

	.quiet-chip {
		border: 1px solid rgba(255, 255, 255, 0.12);
		border-radius: 999px;
		padding: 0.7rem 1rem;
		font-size: 0.72rem;
		font-weight: 700;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: rgba(255, 255, 255, 0.72);
		transition: 160ms ease;
	}

	.quiet-chip:hover {
		background: rgba(255, 255, 255, 0.08);
		color: rgba(255, 255, 255, 0.94);
	}

	.trust-chip {
		border: 1px solid rgba(255, 255, 255, 0.14);
		border-radius: 999px;
		padding: 0.7rem 1rem;
		font-size: 0.72rem;
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: rgba(255, 255, 255, 0.78);
	}

	.trust-chip--source-grounded {
		border-color: rgba(110, 231, 183, 0.34);
		background: rgba(16, 185, 129, 0.1);
		color: rgba(209, 250, 229, 0.95);
	}

	.trust-chip--needs-review {
		border-color: rgba(251, 191, 36, 0.34);
		background: rgba(245, 158, 11, 0.1);
		color: rgba(254, 243, 199, 0.95);
	}

	.trust-chip--insufficient-sources {
		border-color: rgba(248, 113, 113, 0.34);
		background: rgba(239, 68, 68, 0.1);
		color: rgba(254, 226, 226, 0.95);
	}

	.exercise-icon-button {
		display: inline-flex;
		align-items: center;
		gap: 0.45rem;
		max-width: 12rem;
		border: 1px solid rgba(255, 255, 255, 0.12);
		border-radius: 0.8rem;
		background: rgba(15, 23, 42, 0.62);
		padding: 0.55rem 0.75rem;
		font-size: 0.75rem;
		font-weight: 650;
		color: rgba(255, 255, 255, 0.86);
		white-space: nowrap;
		transition: background-color 160ms ease, border-color 160ms ease, color 160ms ease;
	}

	.exercise-icon-button:hover {
		border-color: rgba(255, 255, 255, 0.24);
		background: rgba(255, 255, 255, 0.08);
		color: white;
	}

	.exercise-icon-button:focus-visible,
	.exercise-artifact:focus-visible {
		outline: 2px solid rgba(125, 211, 252, 0.62);
		outline-offset: 3px;
	}

	.exercise-artifact {
		display: flex;
		align-items: center;
		gap: 0.7rem;
		width: min(100%, 32rem);
		border: 1px solid rgba(255, 255, 255, 0.12);
		border-radius: 0.9rem;
		background: rgba(15, 23, 42, 0.62);
		padding: 0.72rem 0.85rem;
		text-align: left;
		color: rgba(255, 255, 255, 0.9);
		transition: background-color 160ms ease, border-color 160ms ease, transform 160ms ease;
	}

	.exercise-artifact:hover {
		border-color: rgba(255, 255, 255, 0.22);
		background: rgba(255, 255, 255, 0.065);
	}

	.exercise-artifact__icon {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 2rem;
		height: 2rem;
		border-radius: 0.65rem;
		border: 1px solid rgba(255, 255, 255, 0.1);
		background: rgba(255, 255, 255, 0.04);
		color: rgba(255, 255, 255, 0.86);
		flex: 0 0 auto;
	}

	.exercise-artifact__label {
		display: block;
		font-family: var(--font-mono, monospace);
		font-size: 0.62rem;
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: rgba(255, 255, 255, 0.45);
	}

	.exercise-artifact__title {
		display: block;
		margin-top: 0.12rem;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		font-size: 0.9rem;
		font-weight: 650;
		color: rgba(255, 255, 255, 0.92);
	}

	.exercise-artifact__open {
		flex: 0 0 auto;
		font-size: 0.74rem;
		font-weight: 700;
		color: rgba(255, 255, 255, 0.62);
	}

	@media (max-width: 520px) {
		.exercise-artifact__open {
			display: none;
		}
	}

	.authority-card {
		display: flex;
		align-items: flex-start;
		gap: 0.85rem;
		border: 1px solid rgba(255, 255, 255, 0.08);
		border-radius: 1.15rem;
		background: rgba(255, 255, 255, 0.03);
		padding: 1rem;
		transition: 160ms ease;
		cursor: pointer;
	}

	.authority-card--checked {
		border-color: rgba(255, 255, 255, 0.22);
		background: rgba(255, 255, 255, 0.08);
	}

	.chat-log {
		min-height: 0;
		overflow-y: auto;
		display: flex;
		flex-direction: column;
		padding-inline: 0.65rem;
		scrollbar-width: thin;
		scrollbar-color: rgba(255,255,255,0.1) transparent;
	}

	.chat-log::-webkit-scrollbar {
		width: 6px;
	}
	.chat-log::-webkit-scrollbar-track {
		background: transparent;
	}
	.chat-log::-webkit-scrollbar-thumb {
		background-color: rgba(255,255,255,0.1);
		border-radius: 20px;
	}

	.studio-thread {
		width: min(100%, 62rem);
		margin: 0 auto;
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.studio-thread--intro {
		justify-content: center;
		min-height: 100%;
	}

	.verdict-intro {
		display: grid;
		gap: 1rem;
		padding: clamp(1.25rem, 2.4vw, 2rem);
		border: 1px solid rgba(255, 255, 255, 0.08);
		border-radius: 1.4rem;
		background: linear-gradient(180deg, rgba(248, 250, 252, 0.06) 0%, rgba(15, 23, 42, 0.12) 100%);
		box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.03);
	}

	.verdict-intro__eyebrow {
		font-family: var(--font-mono, monospace);
		font-size: 0.66rem;
		font-weight: 700;
		letter-spacing: 0.16em;
		text-transform: uppercase;
		color: rgba(255, 255, 255, 0.46);
	}

	.verdict-intro__title {
		font-family: var(--font-display, inherit);
		font-size: clamp(1.4rem, 2vw, 1.9rem);
		line-height: 1.1;
		color: rgba(255, 255, 255, 0.96);
	}

	.verdict-intro__desc {
		max-width: 42rem;
		font-size: 0.98rem;
		line-height: 1.7;
		color: rgba(255, 255, 255, 0.7);
	}

	.verdict-intro__pack {
		display: inline-flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.55rem;
		width: fit-content;
		max-width: 100%;
		padding: 0.7rem 0.9rem;
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 999px;
		background: rgba(255, 255, 255, 0.04);
	}

	.verdict-intro__pack-name {
		font-size: 0.86rem;
		font-weight: 700;
		color: rgba(255, 255, 255, 0.94);
	}

	.verdict-intro__pack-meta {
		font-size: 0.76rem;
		font-weight: 600;
		color: rgba(255, 255, 255, 0.58);
	}

	.verdict-intro__alert {
		display: inline-flex;
		align-items: center;
		gap: 0.75rem;
		width: fit-content;
		max-width: 100%;
		padding: 0.85rem 1rem;
		border: 1px solid rgba(251, 191, 36, 0.18);
		border-radius: 1rem;
		background: rgba(251, 191, 36, 0.08);
		font-size: 0.92rem;
		line-height: 1.5;
		color: rgba(254, 240, 138, 0.96);
	}

	.studio-starters {
		display: grid;
		gap: 0.9rem;
	}

	@media (min-width: 768px) {
		.studio-starters {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}

	.studio-starter {
		display: grid;
		gap: 0.28rem;
		padding: 1rem 1rem 1.05rem;
		border: 1px solid rgba(255, 255, 255, 0.08);
		border-radius: 1.15rem;
		background: rgba(255, 255, 255, 0.035);
		text-align: left;
		transition: transform 160ms ease, border-color 160ms ease, background-color 160ms ease;
	}

	.studio-starter:hover {
		transform: translateY(-1px);
		border-color: rgba(255, 255, 255, 0.16);
		background: rgba(255, 255, 255, 0.06);
	}

	.studio-starter__eyebrow {
		font-family: var(--font-mono, monospace);
		font-size: 0.62rem;
		font-weight: 700;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: rgba(255, 255, 255, 0.42);
	}

	.studio-starter__label {
		font-size: 1rem;
		font-weight: 700;
		color: rgba(255, 255, 255, 0.96);
	}

	.studio-starter__desc {
		font-size: 0.88rem;
		line-height: 1.55;
		color: rgba(255, 255, 255, 0.62);
	}

	.studio-message {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
		max-width: 100%;
	}

	.studio-message--user {
		align-items: flex-end;
	}

	.studio-message__label {
		font-size: 0.64rem;
		font-weight: 700;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		font-family: var(--font-mono, monospace);
	}

	.studio-message__content {
		max-width: min(100%, 48rem);
		border: 1px solid rgba(255, 255, 255, 0.08);
		border-radius: 1.1rem;
		background: linear-gradient(180deg, rgba(30, 41, 59, 0.82) 0%, rgba(15, 23, 42, 0.92) 100%);
		padding: 1rem 1.05rem;
		font-size: 0.98rem;
		line-height: 1.65;
		color: rgba(255, 255, 255, 0.9);
		box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.02);
	}

	.studio-message--assistant .studio-message__content {
		border-color: rgba(252, 211, 77, 0.16);
		background: linear-gradient(180deg, rgba(255, 248, 235, 0.08) 0%, rgba(30, 41, 59, 0.9) 100%);
		color: rgba(255, 255, 255, 0.96);
	}

	.studio-message--user .studio-message__content {
		max-width: min(100%, 38rem);
		border-color: rgba(148, 163, 184, 0.24);
		background: linear-gradient(180deg, rgba(71, 85, 105, 0.48) 0%, rgba(30, 41, 59, 0.76) 100%);
		color: rgba(255, 255, 255, 0.98);
	}

	.studio-message--system .studio-message__content {
		max-width: min(100%, 42rem);
		border-color: rgba(248, 113, 113, 0.2);
		background: rgba(127, 29, 29, 0.16);
		color: rgba(252, 165, 165, 0.96);
	}

	.activity-card {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		width: min(100%, 28rem);
		border: 1px solid rgba(255, 255, 255, 0.08);
		border-radius: 1rem;
		background: rgba(15, 23, 42, 0.7);
		padding: 0.8rem 0.9rem;
	}

	.activity-orb {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 0.22rem;
		width: 1.9rem;
		height: 1.9rem;
		border: 1px solid rgba(125, 211, 252, 0.18);
		border-radius: 999px;
		background: rgba(125, 211, 252, 0.09);
		flex: 0 0 auto;
	}

	.activity-orb span {
		width: 0.34rem;
		height: 0.34rem;
		border-radius: 999px;
		background: rgba(186, 230, 253, 0.96);
		animation: typingPulse 1.2s ease-in-out infinite;
	}

	.activity-orb span:nth-child(2) {
		animation-delay: 0.16s;
	}

	.activity-orb span:nth-child(3) {
		animation-delay: 0.32s;
	}

	.activity-title {
		font-size: 0.88rem;
		font-weight: 750;
		line-height: 1.2;
		color: rgba(255, 255, 255, 0.94);
	}

	.activity-desc {
		margin-top: 0.14rem;
		font-size: 0.78rem;
		line-height: 1.4;
		color: rgba(255, 255, 255, 0.58);
	}

	.activity-steps {
		display: none;
		flex-wrap: wrap;
		gap: 0.38rem;
		margin-top: 0.72rem;
	}

	.activity-step {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-width: 4.5rem;
		border: 1px solid rgba(255, 255, 255, 0.08);
		border-radius: 999px;
		padding: 0.34rem 0.62rem;
		font-size: 0.68rem;
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: rgba(255, 255, 255, 0.42);
	}

	.activity-step--active {
		border-color: rgba(125, 211, 252, 0.38);
		background: rgba(125, 211, 252, 0.12);
		color: rgba(224, 242, 254, 0.96);
	}

	.activity-step--done {
		border-color: rgba(110, 231, 183, 0.3);
		background: rgba(16, 185, 129, 0.1);
		color: rgba(209, 250, 229, 0.9);
	}

	.studio-composer {
		padding: 0.75rem 0 0;
		background: transparent;
	}

	.studio-composer__surface {
		width: min(100%, 62rem);
		margin: 0 auto;
		position: relative;
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 1rem;
		background: linear-gradient(180deg, rgba(2, 6, 23, 0.9) 0%, rgba(15, 23, 42, 0.9) 100%);
		box-shadow: none;
	}

	.studio-composer__textarea {
		width: 100%;
		min-height: 4.75rem;
		max-height: 24rem;
		resize: vertical;
		border: none;
		background: transparent;
		padding: 1rem 1rem 0.85rem;
		font-size: 0.98rem;
		line-height: 1.6;
		color: rgba(255, 255, 255, 0.96);
		outline: none;
	}

	.studio-composer__textarea::placeholder {
		color: rgba(255, 255, 255, 0.42);
	}

	.studio-composer__footer {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.8rem;
		padding: 0 0.95rem 0.95rem;
	}

	.studio-composer__hint {
		font-family: var(--font-mono, monospace);
		font-size: 0.68rem;
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: rgba(255, 255, 255, 0.4);
	}

	.studio-composer__actions {
		display: flex;
		align-items: center;
		justify-content: flex-end;
		gap: 0.75rem;
	}

	.studio-send {
		display: inline-flex;
		align-items: center;
		gap: 0.55rem;
		border: 1px solid rgba(255, 255, 255, 0.08);
		border-radius: 999px;
		background: #f8fafc;
		padding: 0.72rem 0.95rem;
		font-size: 0.7rem;
		font-weight: 700;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: #0f172a;
		transition: background-color 160ms ease, border-color 160ms ease, color 160ms ease;
	}

	.studio-send:hover:not(:disabled) {
		background: white;
	}

	.studio-send:disabled {
		cursor: not-allowed;
		opacity: 0.45;
	}

	@media (max-width: 640px) {
		.studio-composer__footer {
			align-items: flex-start;
			flex-direction: column;
		}

		.studio-composer__actions {
			width: 100%;
		}

		.studio-send {
			width: 100%;
			justify-content: center;
		}
	}

	@keyframes typingPulse {
		0%,
		80%,
		100% {
			opacity: 0.3;
			transform: translateY(0);
		}

		40% {
			opacity: 1;
			transform: translateY(-3px);
		}
	}

	.studio-typing {
		display: inline-flex;
		align-items: center;
		gap: 0.45rem;
		padding-top: 0.2rem;
	}

	.studio-typing span {
		width: 0.55rem;
		height: 0.55rem;
		border-radius: 999px;
		background: rgba(125, 211, 252, 0.92);
		animation: typingPulse 1.2s ease-in-out infinite;
	}

	.studio-typing span:nth-child(2) {
		animation-delay: 0.18s;
	}

	.studio-typing span:nth-child(3) {
		animation-delay: 0.36s;
	}

	/* ── PAPER TOOLBAR ───────────────────────── */

	.paper-toolbar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		position: sticky;
		top: 0.75rem;
		z-index: 1;
		margin-bottom: 0.75rem;
	}

	.paper-kicker-label {
		font-family: var(--font-mono, monospace);
		font-size: 0.66rem;
		font-weight: 700;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: rgba(255, 255, 255, 0.4);
	}

	.paper-action-btn {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		border: 1px solid rgba(255, 255, 255, 0.15);
		border-radius: 999px;
		background: rgba(15, 23, 42, 0.72);
		backdrop-filter: blur(12px);
		padding: 0.5rem 0.85rem;
		font-size: 0.72rem;
		font-weight: 600;
		color: rgba(255, 255, 255, 0.75);
		transition: background-color 150ms ease, border-color 150ms ease, color 150ms ease;
	}

	.paper-action-btn:hover {
		background: rgba(30, 41, 59, 0.9);
		border-color: rgba(255, 255, 255, 0.28);
		color: white;
	}

	/* ── PAPER SHELL ──────────────────────────── */

	.paper-shell {
		border-radius: 1.15rem;
		border: 1px solid #e2e8f0;
		background: white;
		box-shadow: 0 24px 60px rgba(15, 23, 42, 0.22), 0 2px 8px rgba(15, 23, 42, 0.08);
		overflow: hidden;
	}

	/* ── IDENTITY ─────────────────────────────── */

	.paper-identity {
		padding: 1.75rem 1.75rem 1.5rem;
		border-bottom: 1px solid #f1f5f9;
	}

	@media (min-width: 768px) {
		.paper-identity {
			padding: 2.25rem 2.5rem 2rem;
		}
	}

	.paper-badges {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
		margin-bottom: 1rem;
	}

	.paper-badge {
		display: inline-flex;
		align-items: center;
		border-radius: 999px;
		border: 1px solid #e2e8f0;
		background: #f8fafc;
		padding: 0.3rem 0.65rem;
		font-size: 0.71rem;
		font-weight: 650;
		color: #64748b;
	}

	.paper-badge--source-grounded {
		border-color: #a7f3d0;
		background: #ecfdf5;
		color: #065f46;
	}

	.paper-badge--needs-review {
		border-color: #fde68a;
		background: #fffbeb;
		color: #92400e;
	}

	.paper-badge--insufficient-sources {
		border-color: #fecaca;
		background: #fef2f2;
		color: #991b1b;
	}

	.paper-badge--grounded {
		border-color: #a7f3d0;
		background: #ecfdf5;
		color: #065f46;
	}

	.paper-badge--unsupported {
		border-color: #fecaca;
		background: #fef2f2;
		color: #991b1b;
	}

	.paper-title {
		display: block;
		width: 100%;
		border: none;
		background: transparent;
		padding: 0;
		font-size: clamp(1.6rem, 3vw, 2.25rem);
		line-height: 1.15;
		font-weight: 700;
		color: #0f172a;
		font-family: inherit;
		overflow-wrap: anywhere;
	}

	.paper-title:focus {
		outline: none;
	}

	/* ── ZONES ────────────────────────────────── */

	.paper-zone {
		padding: 1.5rem 1.75rem;
		border-top: 1px solid #f1f5f9;
	}

	@media (min-width: 768px) {
		.paper-zone {
			padding: 1.75rem 2.5rem;
		}
	}

	.paper-zone--edit {
		background: #fafafa;
	}

	.paper-zone__label {
		font-size: 0.72rem;
		font-weight: 700;
		letter-spacing: 0.07em;
		text-transform: uppercase;
		color: #94a3b8;
		margin-bottom: 0.65rem;
		display: block;
	}

	/* ── PROSE TEXTAREA ───────────────────────── */

	.paper-prose {
		display: block;
		width: 100%;
		border: none;
		background: transparent;
		padding: 0;
		font-size: 0.96rem;
		line-height: 1.7;
		color: #1e293b;
		font-family: inherit;
		resize: none;
	}

	.paper-prose:focus {
		outline: none;
	}

	.paper-prose--question {
		font-size: 1.05rem;
		font-weight: 500;
	}

	/* ── LEGAL QUESTION BOX ───────────────────── */

	.paper-question-box {
		border-left: 3px solid #6366f1;
		background: #f5f3ff;
		border-radius: 0 0.6rem 0.6rem 0;
		padding: 1rem 1.2rem;
	}

	.paper-question-box__label {
		font-size: 0.68rem;
		font-weight: 700;
		letter-spacing: 0.09em;
		text-transform: uppercase;
		color: #6366f1;
		margin-bottom: 0.5rem;
		display: block;
	}

	/* ── SIDES ────────────────────────────────── */

	.paper-sides {
		display: grid;
		gap: 1rem;
	}

	@media (min-width: 640px) {
		.paper-sides {
			grid-template-columns: 1fr 1fr;
		}
	}

	.paper-side {
		border-radius: 0.7rem;
		padding: 1rem 1.15rem;
	}

	.paper-side--plaintiff {
		background: #eff6ff;
		border: 1px solid #bfdbfe;
	}

	.paper-side--defendant {
		background: #f8fafc;
		border: 1px solid #e2e8f0;
	}

	.paper-side__label {
		font-size: 0.68rem;
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: #64748b;
		margin-bottom: 0.5rem;
		display: block;
	}

	.paper-side--plaintiff .paper-side__label {
		color: #2563eb;
	}

	/* ── PRACTICE POINTS ──────────────────────── */

	.paper-practice-list {
		display: flex;
		flex-direction: column;
		gap: 0.55rem;
		list-style: none;
		padding: 0;
		margin: 0;
	}

	.paper-practice-item {
		display: flex;
		align-items: flex-start;
		gap: 0.75rem;
		font-size: 0.92rem;
		line-height: 1.55;
		color: #334155;
	}

	.paper-practice-num {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
		width: 1.5rem;
		height: 1.5rem;
		border-radius: 999px;
		background: #0f172a;
		color: white;
		font-size: 0.65rem;
		font-weight: 700;
		margin-top: 0.1rem;
	}

	.paper-trap {
		margin-top: 0.9rem;
		border-radius: 0.55rem;
		border: 1px solid #fde68a;
		background: #fffbeb;
		padding: 0.7rem 0.9rem;
	}

	.paper-trap__label {
		font-size: 0.68rem;
		font-weight: 700;
		letter-spacing: 0.07em;
		text-transform: uppercase;
		color: #b45309;
		margin-bottom: 0.3rem;
	}

	.paper-trap__text {
		font-size: 0.88rem;
		line-height: 1.55;
		color: #92400e;
	}

	/* ── EDIT FIELDS ──────────────────────────── */

	.paper-edit-grid {
		display: grid;
		gap: 1rem;
	}

	@media (min-width: 640px) {
		.paper-edit-grid {
			grid-template-columns: 1fr 1fr;
		}
	}

	.paper-field {
		display: block;
		width: 100%;
		border: 1px solid #e2e8f0;
		border-radius: 0.5rem;
		background: white;
		padding: 0.65rem 0.85rem;
		font-size: 0.9rem;
		line-height: 1.55;
		color: #0f172a;
		font-family: inherit;
		margin-top: 0.4rem;
		resize: none;
	}

	.paper-field:focus {
		outline: none;
		border-color: #6366f1;
		box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.12);
	}

	/* ── LAUNCH ZONE ──────────────────────────── */

	.paper-launch-zone {
		display: flex;
		flex-direction: column;
		gap: 1.25rem;
		padding: 1.75rem;
		border-top: 2px solid #f1f5f9;
		background: #f8fafc;
	}

	@media (min-width: 768px) {
		.paper-launch-zone {
			padding: 2rem 2.5rem;
		}
	}

	.paper-choose-side {
		display: flex;
		flex-direction: column;
		gap: 0.85rem;
	}

	.paper-choose-desc {
		font-size: 0.87rem;
		line-height: 1.55;
		color: #64748b;
	}

	.paper-role-grid {
		display: grid;
		gap: 0.75rem;
	}

	@media (min-width: 480px) {
		.paper-role-grid {
			grid-template-columns: 1fr 1fr;
		}
	}

	.paper-role-btn {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 0.3rem;
		border: 2px solid #e2e8f0;
		border-radius: 0.85rem;
		background: white;
		padding: 1rem 1.15rem;
		text-align: left;
		transition: border-color 150ms ease, background-color 150ms ease;
	}

	.paper-role-btn:hover {
		border-color: #94a3b8;
	}

	.paper-role-btn--plaintiff.paper-role-btn--active {
		border-color: #2563eb;
		background: #eff6ff;
	}

	.paper-role-btn--defendant.paper-role-btn--active {
		border-color: #0f172a;
		background: #f1f5f9;
	}

	.paper-role-btn__name {
		font-size: 0.82rem;
		font-weight: 700;
		color: #0f172a;
	}

	.paper-role-btn__state {
		font-size: 0.74rem;
		color: #94a3b8;
	}

	.paper-role-btn--plaintiff.paper-role-btn--active .paper-role-btn__state {
		color: #2563eb;
	}

	.paper-role-btn--defendant.paper-role-btn--active .paper-role-btn__state {
		color: #475569;
	}

	.paper-validation-error {
		font-size: 0.74rem;
		font-weight: 700;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: #b91c1c;
	}

	.paper-actions {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.65rem;
	}

	.paper-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		border-radius: 999px;
		padding: 0.7rem 1.15rem;
		font-size: 0.74rem;
		font-weight: 700;
		transition: background-color 140ms ease, border-color 140ms ease, color 140ms ease;
		white-space: nowrap;
	}

	.paper-btn:disabled {
		opacity: 0.45;
		pointer-events: none;
	}

	.paper-btn--ghost {
		border: 1px solid #cbd5e1;
		background: white;
		color: #475569;
	}

	.paper-btn--ghost:hover {
		border-color: #94a3b8;
		color: #0f172a;
	}

	.paper-btn--outline {
		border: 1px solid #0f172a;
		background: white;
		color: #0f172a;
	}

	.paper-btn--outline:hover {
		background: #f1f5f9;
	}

	.paper-btn--launch {
		border: 1px solid #0f172a;
		background: #0f172a;
		color: white;
	}

	.paper-btn--launch:hover:not(:disabled) {
		background: #1e293b;
		border-color: #1e293b;
	}

	.paper-message {
		border-radius: 0.7rem;
		border: 1px solid #e2e8f0;
		background: white;
		padding: 0.85rem 1rem;
	}

	.paper-message--success {
		border-color: #a7f3d0;
		background: #f0fdf4;
	}

	.paper-message--share {
		border-color: #bfdbfe;
		background: #eff6ff;
	}

	.paper-message__label {
		font-size: 0.68rem;
		font-weight: 700;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: #64748b;
		margin-bottom: 0.4rem;
	}

	.paper-message--success .paper-message__label {
		color: #065f46;
	}

	.paper-message--share .paper-message__label {
		color: #1d4ed8;
	}

	.paper-message__status {
		font-size: 0.87rem;
		line-height: 1.5;
		color: #475569;
	}

	.paper-share-row {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.5rem;
		margin-top: 0.4rem;
	}

	.paper-share-url {
		flex: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		border-radius: 0.4rem;
		border: 1px solid #dbeafe;
		background: white;
		padding: 0.45rem 0.65rem;
		font-size: 0.74rem;
		font-family: var(--font-mono, monospace);
		color: #1d4ed8;
	}

	.paper-share-url:hover {
		color: #1e3a8a;
	}

	.paper-error {
		font-size: 0.8rem;
		line-height: 1.5;
		color: #b91c1c;
	}

	/* ── DRAWERS (collapsed sections) ────────── */

	.paper-drawer {
		border-top: 1px solid #f1f5f9;
		overflow: hidden;
	}

	.paper-drawer summary {
		list-style: none;
	}

	.paper-drawer summary::-webkit-details-marker {
		display: none;
	}

	.paper-drawer__trigger {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		padding: 1.25rem 1.75rem;
		cursor: pointer;
		font-size: 0.84rem;
		font-weight: 600;
		color: #475569;
		transition: color 140ms ease;
	}

	@media (min-width: 768px) {
		.paper-drawer__trigger {
			padding: 1.25rem 2.5rem;
		}
	}

	.paper-drawer__trigger:hover {
		color: #0f172a;
	}

	.paper-drawer__icon {
		width: 1rem;
		height: 1rem;
		flex-shrink: 0;
		transition: transform 160ms ease;
	}

	details[open].paper-drawer .paper-drawer__icon {
		transform: rotate(180deg);
	}

	.paper-drawer__body {
		padding: 0 1.75rem 1.5rem;
	}

	@media (min-width: 768px) {
		.paper-drawer__body {
			padding: 0 2.5rem 1.75rem;
		}
	}

	.paper-drawer__field-label {
		font-size: 0.72rem;
		font-weight: 700;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: #94a3b8;
		margin-bottom: 0.35rem;
	}

	.paper-drawer__text {
		font-size: 0.9rem;
		line-height: 1.6;
		color: #334155;
	}

	.paper-drawer__list {
		list-style: disc;
		padding-left: 1.15rem;
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
		font-size: 0.88rem;
		line-height: 1.55;
		color: #475569;
	}

	/* ── GROUNDING ITEMS ──────────────────────── */

	.paper-audit-warnings {
		border-radius: 0.55rem;
		border: 1px solid #fde68a;
		background: #fffbeb;
		padding: 0.75rem 0.9rem;
		margin-bottom: 0.5rem;
	}

	.paper-grounding-item {
		border: 1px solid #e2e8f0;
		border-radius: 0.6rem;
		background: #fafafa;
		padding: 0.85rem;
	}

	.paper-grounding-item--grounded {
		border-color: #bbf7d0;
		background: #f0fdf4;
	}

	.paper-grounding-item--needs-review {
		border-color: #fde68a;
		background: #fffbeb;
	}

	.paper-grounding-item--unsupported {
		border-color: #fecaca;
		background: #fef2f2;
	}

	.paper-grounding-item__source {
		font-size: 0.74rem;
		font-weight: 600;
		color: #64748b;
		word-break: break-all;
	}

	.paper-grounding-item__claim {
		margin-top: 0.5rem;
		font-size: 0.88rem;
		font-weight: 600;
		line-height: 1.5;
		color: #1e293b;
	}

	.paper-grounding-item__quote {
		margin-top: 0.5rem;
		border-left: 2px solid #cbd5e1;
		padding-left: 0.65rem;
		font-size: 0.85rem;
		line-height: 1.55;
		color: #475569;
	}

	.paper-grounding-item__note {
		margin-top: 0.4rem;
		font-size: 0.78rem;
		line-height: 1.5;
		color: #94a3b8;
	}

	/* ── SOURCE EXCERPTS ──────────────────────── */

	.paper-excerpt {
		border: 1px solid #e2e8f0;
		border-radius: 0.6rem;
		background: white;
		padding: 0.85rem;
	}

	.paper-excerpt__title {
		font-size: 0.74rem;
		font-weight: 600;
		color: #64748b;
		word-break: break-all;
	}

	.paper-excerpt__heading {
		margin-top: 0.5rem;
		font-size: 0.88rem;
		font-weight: 600;
		color: #1e293b;
	}

	.paper-excerpt__quote {
		margin-top: 0.5rem;
		border-left: 2px solid #cbd5e1;
		padding-left: 0.65rem;
		font-size: 0.85rem;
		line-height: 1.6;
		color: #475569;
	}

	.paper-excerpt__reason {
		margin-top: 0.4rem;
		font-size: 0.76rem;
		line-height: 1.5;
		color: #94a3b8;
	}
</style>
