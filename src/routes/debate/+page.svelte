<script lang="ts">
	import type { PageData } from './$types';
	import { debateStore, appendTurn, seedTranscript, saveTurns, loadTurns, clearSavedTurns } from '$lib/stores/debate';
	import { stagedCaseStore, hydrateStagedCase, loadStagedCase, clearStagedCase } from '$lib/stores/stagedCase';
	import { legalPacksStore } from '$lib/stores/legalPacks';
	import type { LibraryDocument } from '$lib/data/library';
	import { getJudgePersona } from '$lib/data/judge';
	import type { DebateTurn, StagedCase, VerifiedCitation } from '$lib/types';
	import { fly } from 'svelte/transition';
	import { focusMode } from '$lib/stores/ui';
	import { onDestroy, onMount, tick } from 'svelte';
	import { goto } from '$app/navigation';
	import { caseHistoryStore } from '$lib/stores/caseHistory';
	import { language, type Lang } from '$lib/stores/language';
	import { t } from '$lib/i18n';
	import { get } from 'svelte/store';
	import { subscriptionStore, TIER_CONFIG } from '$lib/stores/subscription';
	import SourceLinkedMessage from '$lib/components/SourceLinkedMessage.svelte';
	import CitationSourceDrawer from '$lib/components/CitationSourceDrawer.svelte';
	import ExercisePaperPreview from '$lib/components/ExercisePaperPreview.svelte';
	import type { ExercisePaperSnapshot } from '$lib/types';

	export let data: PageData;

	let prompt = '';
	let sending = false;
	let judgeMind: { assessment: string; concerns: string; leaning: string } | null = null;
	let contextReport: {
		tokenCount: number;
		tokenBudget: number;
		utilization: number;
		nearLimit: boolean;
		truncatedSources: Array<{ id: string; title: string }>;
	} | null = null;
	let stagedCase: StagedCase | null = null;
	let allowedSources: LibraryDocument[] = [];
	let focusArmed = false;
	let tipsOpen = false;
	let guideOpen = false;
	let judgeRailExpanded = false;
	let isDesktopJudgeViewport = false;
	let scoreModalOpen = false;
	let scoring = false;
	let scoreError = '';
	let scoreSummary = '';
	let scoreStrengths: string[] = [];
	let scoreWeaknesses: string[] = [];
	let scoreNextTime: string[] = [];
	let paperViewerOpen = false;
	let sourceDrawerOpen = false;
	let activeCitation: VerifiedCitation | null = null;
	let activeCitationSource: LibraryDocument | null = null;
	let activeCitationSourceText = '';
	let activeCitationSourceTextVisible = false;
	let activeCitationSourceLoading = false;
	let activeCitationSourceError = '';
	let activeCitationOriginalLoading = false;
	let composerTextarea: HTMLTextAreaElement | null = null;
	let judgeRailMediaQuery: MediaQueryList | null = null;
	let endScores = {
		persuasion: 50,
		lawCited: 50,
		structure: 50,
		responsiveness: 50,
		factFidelity: 50,
		average: 50
	};

	const scoreLabels = [
		{ key: 'persuasion', label: 'debate.metricPersuasion' },
		{ key: 'lawCited', label: 'debate.metricLawCited' },
		{ key: 'structure', label: 'debate.metricStructure' },
		{ key: 'responsiveness', label: 'debate.metricResponsiveness' },
		{ key: 'factFidelity', label: 'debate.metricFactFidelity' }
	] as const;

	let turnsLoaded = false;
	let debateLanguage = 'en';

	const currentDebateLanguage = (): Lang => (debateLanguage === 'fr' ? 'fr' : 'en');
	const tr = (key: Parameters<typeof t>[0]) => t(key, currentDebateLanguage());
	const closeGuide = () => {
		guideOpen = false;
	};
	const judgeRailVisible = () => (isDesktopJudgeViewport ? judgeRailExpanded : guideOpen);
	const contentWidthClass = () => (judgeRailExpanded ? 'max-w-[84rem]' : 'max-w-[98rem]');
	const syncJudgeViewport = (matches: boolean) => {
		isDesktopJudgeViewport = matches;
		if (matches) {
			guideOpen = false;
			return;
		}
		judgeRailExpanded = false;
	};
	const toggleJudgeRail = () => {
		if (isDesktopJudgeViewport) {
			judgeRailExpanded = !judgeRailExpanded;
			return;
		}
		guideOpen = true;
	};
	const closeJudgeRail = () => {
		if (isDesktopJudgeViewport) {
			judgeRailExpanded = false;
			return;
		}
		closeGuide();
	};
	const autoSizeComposer = () => {
		if (!composerTextarea) return;
		composerTextarea.style.height = '0px';
		const nextHeight = Math.min(Math.max(composerTextarea.scrollHeight, 72), 220);
		composerTextarea.style.height = `${nextHeight}px`;
	};

	const buildFallbackPaperSnapshot = (record: StagedCase): ExercisePaperSnapshot => ({
		title: record.title,
		level: 'intermediate',
		sourceLanguage: record.packContext?.sourceLanguage ?? record.packContext?.language,
		draftLanguage: record.packContext?.draftLanguage ?? record.packContext?.sourceLanguage ?? record.packContext?.language,
		hearingLanguage: record.packContext?.hearingLanguage ?? record.packContext?.sourceLanguage ?? record.packContext?.language,
		objective: record.objective ?? '',
		targetSkill: record.targetSkill ?? '',
		synopsis: record.synopsis,
		issues: record.issues,
		plaintiffPosition: record.role === 'plaintiff' ? record.remedy : '',
		defendantPosition: record.role === 'defendant' ? record.remedy : '',
		practicePoints: record.practicePoints ?? [],
		recommendedRole: record.role,
		selectedRole: record.role,
		sourcesUsed: [],
		judgeBrief: record.judgeBrief,
		groundingAudit: record.groundingAudit
	});

	const resolveCitationSource = (citation: VerifiedCitation): LibraryDocument | null => {
		if (citation.sourceId) {
			const byId = allowedSources.find((source) => source.id === citation.sourceId);
			if (byId) return byId;
		}
		if (citation.sourceTitle) {
			const byTitle = allowedSources.find((source) => source.title === citation.sourceTitle);
			if (byTitle) return byTitle;
		}
		return null;
	};

	const openCitationDrawer = (citation: VerifiedCitation) => {
		activeCitation = citation;
		activeCitationSource = resolveCitationSource(citation);
		activeCitationSourceText = '';
		activeCitationSourceTextVisible = false;
		activeCitationSourceLoading = false;
		activeCitationSourceError = '';
		activeCitationOriginalLoading = false;
		sourceDrawerOpen = true;
	};

	const closeCitationDrawer = () => {
		sourceDrawerOpen = false;
		activeCitation = null;
		activeCitationSource = null;
		activeCitationSourceText = '';
		activeCitationSourceTextVisible = false;
		activeCitationSourceLoading = false;
		activeCitationSourceError = '';
		activeCitationOriginalLoading = false;
	};

	const loadActiveCitationSourceText = async () => {
		if (!activeCitationSource) {
			activeCitationSourceError = tr('debate.sourceTextUnavailable');
			return;
		}

		if (activeCitationSourceText) {
			activeCitationSourceTextVisible = true;
			return;
		}

		activeCitationSourceLoading = true;
		activeCitationSourceError = '';
		try {
			if (activeCitationSource.isCustom) {
				const response = await fetch(`/api/library/source-text?sourceId=${encodeURIComponent(activeCitationSource.id)}`);
				if (!response.ok) {
					throw new Error(await response.text());
				}
				const payload = await response.json() as { text?: string };
				activeCitationSourceText = payload.text?.trim() ?? '';
			} else if (activeCitationSource.filePath) {
				const response = await fetch(activeCitationSource.filePath);
				if (!response.ok) {
					throw new Error(response.statusText || 'Failed to load source file.');
				}
				activeCitationSourceText = (await response.text()).trim();
			} else if (activeCitationSource.content?.trim()) {
				activeCitationSourceText = activeCitationSource.content.trim();
			} else {
				throw new Error(tr('debate.sourceTextUnavailable'));
			}

			if (!activeCitationSourceText) {
				throw new Error(tr('debate.sourceTextUnavailable'));
			}

			activeCitationSourceTextVisible = true;
		} catch (err) {
			activeCitationSourceError = err instanceof Error ? err.message : tr('debate.sourceTextUnavailable');
		} finally {
			activeCitationSourceLoading = false;
		}
	};

	const toggleActiveCitationSource = () => {
		if (activeCitationSourceTextVisible) {
			activeCitationSourceTextVisible = false;
			return;
		}
		void loadActiveCitationSourceText();
	};

	const openOriginalCitationSource = async () => {
		if (!activeCitationSource) return;
		activeCitationOriginalLoading = true;
		activeCitationSourceError = '';
		try {
			if (activeCitationSource.isCustom) {
				const response = await fetch(`/api/library/source-file-url?sourceId=${encodeURIComponent(activeCitationSource.id)}`);
				if (!response.ok) {
					throw new Error(await response.text());
				}
				const payload = await response.json() as { url?: string };
				if (!payload.url) throw new Error(tr('debate.sourceUnavailable'));
				window.open(payload.url, '_blank', 'noopener,noreferrer');
				return;
			}

			const target = activeCitationSource.filePath || activeCitationSource.sourceUrl;
			if (!target) throw new Error(tr('debate.sourceUnavailable'));
			window.open(target, '_blank', 'noopener,noreferrer');
		} catch (err) {
			activeCitationSourceError = err instanceof Error ? err.message : tr('debate.sourceUnavailable');
		} finally {
			activeCitationOriginalLoading = false;
		}
	};

	const verifiedCitationCount = (turn: DebateTurn) => turn.verifiedCitations?.filter((citation) => citation.status === 'verified').length ?? 0;
	const hasVerifiedCitations = (turn: DebateTurn) => verifiedCitationCount(turn) > 0;
	const unverifiedCitationCount = (turn: DebateTurn) => turn.verifiedCitations?.filter((citation) => citation.status === 'unverified').length ?? 0;

	const sharedPacketSources = (snapshot: ExercisePaperSnapshot | null | undefined): LibraryDocument[] => {
		const excerpts = snapshot?.sourceBundle?.excerpts ?? [];
		if (!excerpts.length) return [];
		const grouped = new Map<string, typeof excerpts>();
		for (const excerpt of excerpts) {
			const current = grouped.get(excerpt.sourceId) ?? [];
			current.push(excerpt);
			grouped.set(excerpt.sourceId, current);
		}
		return Array.from(grouped.entries()).map(([sourceId, sourceExcerpts]) => {
			const first = sourceExcerpts[0];
			return {
				id: sourceId,
				title: first.sourceTitle,
				jurisdiction: first.jurisdiction ?? 'Other',
				description: 'Shared case source packet passages.',
				lastUpdated: snapshot?.sourceBundle?.createdAt ?? new Date().toISOString().slice(0, 10),
				sourceUrl: `shared://${sourceId}`,
				content: sourceExcerpts
					.map((excerpt, index) => {
						const citationLine = excerpt.citation ? `Citation: ${excerpt.citation}\n` : '';
						const headingLine = excerpt.heading ? `Heading: ${excerpt.heading}\n` : '';
						return `Shared passage ${index + 1}\n${citationLine}${headingLine}${excerpt.excerpt}`.trim();
					})
					.join('\n\n'),
				docType: first.docType,
				isCustom: true,
				note: 'Shared case packet. This is not the teacher\'s full source pack.'
			};
		});
	};

	onMount(() => {
		legalPacksStore.hydrate();
		caseHistoryStore.hydrateCaseHistory();
		// If a staged case already exists (e.g. navigated from court page), load its turns
		let sc = get(stagedCaseStore) ?? loadStagedCase();
		if (!sc) {
			const fallbackOngoing = get(caseHistoryStore).find((entry) => entry.status === 'ongoing') ?? null;
			if (fallbackOngoing) {
				sc = fallbackOngoing;
				hydrateStagedCase(fallbackOngoing);
			}
		}
		if (sc && !turnsLoaded) {
			turnsLoaded = true;
			loadTurns(sc.id).then((found) => {
				if (!found) seedTranscript(sc);
			});
		}

		judgeRailMediaQuery = window.matchMedia('(min-width: 1024px)');
		const handleJudgeViewportChange = (event: MediaQueryList | MediaQueryListEvent) => {
			syncJudgeViewport(event.matches);
		};
		handleJudgeViewportChange(judgeRailMediaQuery);
		judgeRailMediaQuery.addEventListener('change', handleJudgeViewportChange);
		void tick().then(autoSizeComposer);

		return () => {
			judgeRailMediaQuery?.removeEventListener('change', handleJudgeViewportChange);
		};
	});

	$: if (composerTextarea) {
		prompt;
		void tick().then(autoSizeComposer);
	}

	$: stagedCase = $stagedCaseStore;
	$: historyMatch = (() => {
		const currentCase = stagedCase;
		if (!currentCase?.id) return null;
		return $caseHistoryStore.find((entry) => entry.id === currentCase.id) ?? null;
	})();
	$: if (stagedCase && historyMatch?.judgeBrief && !stagedCase.judgeBrief) {
		const mergedCase = { ...stagedCase, judgeBrief: historyMatch.judgeBrief };
		hydrateStagedCase(mergedCase);
		if (get(debateStore).length <= 2) seedTranscript(mergedCase);
	}
	$: if (data?.stagedCase && !$stagedCaseStore) {
		hydrateStagedCase(data.stagedCase);
		if (!turnsLoaded) {
			turnsLoaded = true;
			loadTurns(data.stagedCase.id).then((found) => {
				if (!found) seedTranscript(data.stagedCase);
			});
		}
	}
	$: allPackSources = $legalPacksStore.flatMap((pack) => pack.sources);
	$: activePack = (() => {
		const currentCase = stagedCase;
		if (!currentCase?.packId) return null;
		return $legalPacksStore.find((pack) => pack.id === currentCase.packId) ?? null;
	})();
	$: activePackContext = activePack || stagedCase?.packContext
		? {
				id: activePack?.id ?? stagedCase?.packContext?.id,
				name: activePack?.name ?? stagedCase?.packContext?.name,
				jurisdiction: activePack?.jurisdiction ?? stagedCase?.packContext?.jurisdiction,
				domain: activePack?.domain ?? stagedCase?.packContext?.domain,
				language: activePack?.language ?? stagedCase?.packContext?.language,
				sourceLanguage: stagedCase?.paperSnapshot?.sourceLanguage ?? stagedCase?.packContext?.sourceLanguage ?? activePack?.language,
				draftLanguage: stagedCase?.paperSnapshot?.draftLanguage ?? stagedCase?.packContext?.draftLanguage ?? activePack?.language,
				hearingLanguage: stagedCase?.paperSnapshot?.hearingLanguage ?? stagedCase?.packContext?.hearingLanguage ?? activePack?.language
			}
		: undefined;
	$: debateLanguage = stagedCase?.paperSnapshot?.hearingLanguage ?? activePackContext?.hearingLanguage ?? activePackContext?.sourceLanguage ?? activePackContext?.language ?? $language;
	$: judgePersona = getJudgePersona(currentDebateLanguage());
	$: paperSnapshot = stagedCase ? stagedCase.judgePacket?.paper ?? stagedCase.paperSnapshot ?? buildFallbackPaperSnapshot(stagedCase) : null;
	$: allowedSources = (() => {
		const currentCase = stagedCase;
		if (!currentCase) return allPackSources;
		const packetSources = sharedPacketSources(currentCase.judgePacket?.paper ?? currentCase.paperSnapshot);
		if (packetSources.length) return packetSources;
		if (activePack) {
			return currentCase.sources.length
				? activePack.sources.filter((doc) => currentCase.sources.includes(doc.id))
				: activePack.sources;
		}
		const localSources = allPackSources.filter((doc) => currentCase.sources.includes(doc.id));
		return localSources;
	})();
	$: if (stagedCase && !focusArmed) {
		focusMode.set(true);
		focusArmed = true;
	} else if (!stagedCase && focusArmed) {
		focusMode.set(false);
		focusArmed = false;
	}

	// Round cap enforcement
	$: litigantTurnCount = $debateStore.filter(t => t.role === 'litigant').length;
	$: maxRounds = TIER_CONFIG[$subscriptionStore.tier].maxRounds;
	$: roundCapReached = litigantTurnCount >= maxRounds;

	const submitPrompt = async () => {
		if (!prompt.trim() || !stagedCase) return;
		if (roundCapReached) return;
		const currentPrompt = prompt.trim();
		prompt = '';
		sending = true;
		const now = new Date().toISOString();
		const litigatorTurn: DebateTurn = {
			role: 'litigant',
			speaker: tr('debate.litigantSpeaker'),
			message: currentPrompt,
			timestamp: now
		};
		appendTurn(litigatorTurn);

		// Collect new turns to save
		const newTurns: DebateTurn[] = [litigatorTurn];

		// Build prior-exchange transcript (last 12 turns ≈ 6 rounds) so the AI
		// can track what's already been argued, conceded, or refuted instead of
		// reinventing the debate every turn. We strip large fields to keep the
		// payload small.
		const transcriptHistory = get(debateStore)
			.slice(0, -1) // exclude the litigant turn we just appended (it's sent as `prompt`)
			.slice(-12)
			.map((t) => ({
				role: t.role,
				speaker: t.speaker,
				message: t.message
			}));

		try {
			const response = await fetch('/api/debate', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					prompt: currentPrompt,
					case: stagedCase,
					packContext: activePackContext,
					sources: allowedSources.map((source) => ({
						id: source.id,
						title: source.title,
						jurisdiction: source.jurisdiction,
						description: source.description,
						content: source.content
					})),
					transcript: transcriptHistory,
					language: currentDebateLanguage()
				})
			});
			if (!response.ok) {
				const text = await response.text();
				let msg = text || 'Debate request failed.';
				try { msg = JSON.parse(text).message ?? msg; } catch {}
				throw new Error(msg);
			}
			const result = await response.json();
			if (result.sourceBundle && stagedCase) {
				const nextPaperSnapshot = stagedCase.paperSnapshot ?? buildFallbackPaperSnapshot(stagedCase);
				const nextStagedCase = {
					...stagedCase,
					paperSnapshot: {
						...nextPaperSnapshot,
						sourceBundle: result.sourceBundle,
						hearingLanguage: nextPaperSnapshot.hearingLanguage,
						evidenceSufficiency: result.evidenceSufficiency ?? nextPaperSnapshot.evidenceSufficiency
					}
				};
				hydrateStagedCase(nextStagedCase);
				stagedCase = nextStagedCase;
			}

			// Warn if no source chunks were matched (documents may not be indexed)
			if (result.sourcesUsed === 0) {
				const warnTurn: DebateTurn = {
					role: 'judge',
					speaker: tr('debate.systemSpeaker'),
					message: tr('debate.noSources'),
					timestamp: new Date().toISOString()
				};
				appendTurn(warnTurn);
				newTurns.push(warnTurn);
			}

			const replyTurn: DebateTurn = {
				...result.reply,
				timestamp: new Date().toISOString()
			};
			appendTurn(replyTurn);
			newTurns.push(replyTurn);

			// Save all new turns from this exchange
			if (stagedCase?.id) {
				saveTurns(stagedCase.id, newTurns);
			}

			judgeMind = result.judgeMind ?? null;
			contextReport = result.contextReport ?? null;
		} catch (err) {
			console.error('Debate endpoint failed', err);
			const errorMsg = err instanceof Error ? err.message : 'Unknown error';
			appendTurn({
				role: 'judge',
				speaker: judgePersona.name,
				message: `${tr('debate.errorFallback')} ${errorMsg}`,
				timestamp: new Date().toISOString()
			});
		} finally {
			sending = false;
		}
	};

	const restartDebate = () => {
		if (stagedCase?.id) clearSavedTurns(stagedCase.id);
		seedTranscript(stagedCase ?? undefined);
		judgeMind = null;
		prompt = '';
	};

	const leaveCourt = (finalize = false) => {
		if (!stagedCase) {
			focusMode.set(false);
			goto('/court');
			return;
		}

		if (finalize) {
			caseHistoryStore.markCaseFinished(stagedCase.id, {
				summary: scoreSummary || tr('debate.scoreFallbackSummary'),
				strengths: scoreStrengths,
				weaknesses: scoreWeaknesses,
				nextTime: scoreNextTime,
				scores: { ...endScores }
			});
		} else {
			caseHistoryStore.markCaseOngoing(stagedCase.id);
		}

		clearStagedCase();
		focusMode.set(false);
		goto('/court');
	};

	const clampScore = (value: number) => Math.max(0, Math.min(100, Math.round(value)));

	const tokenize = (text: string) =>
		text
			.toLowerCase()
			.replace(/[^a-z0-9\s]/g, ' ')
			.split(/\s+/)
			.filter((token) => token.length > 3);

	const keywordSet = (text: string) => {
		const stopWords = new Set(['with', 'that', 'this', 'from', 'have', 'will', 'your', 'about', 'their', 'there', 'would']);
		return new Set(tokenize(text).filter((token) => !stopWords.has(token)));
	};

	const computeResponsiveness = (transcript: DebateTurn[]) => {
		const ratios: number[] = [];
		for (let index = 1; index < transcript.length; index += 1) {
			const current = transcript[index];
			const previous = transcript[index - 1];
			if (current.role !== 'litigant' || previous.role === 'litigant') continue;

			const previousKeywords = keywordSet(previous.message);
			const currentKeywords = keywordSet(current.message);
			if (!previousKeywords.size || !currentKeywords.size) continue;

			let overlap = 0;
			for (const token of previousKeywords) {
				if (currentKeywords.has(token)) overlap += 1;
			}
			ratios.push(overlap / previousKeywords.size);
		}

		if (!ratios.length) return 40;
		const avgRatio = ratios.reduce((sum, ratio) => sum + ratio, 0) / ratios.length;
		// Fair scale: 0% overlap → 25, 50% overlap → 55, full overlap → 85
		return clampScore(25 + avgRatio * 60);
	};

	const computeDeterministicScores = (transcript: DebateTurn[]) => {
		const litigantTurns = transcript.filter((turn) => turn.role === 'litigant');
		const combinedLitigantText = litigantTurns.map((turn) => turn.message).join(' ');

		const legalMentions = (combinedLitigantText.match(/\b(section|article|charter|act|code|statute|regulation|precedent|case|v\.)\b/gi) ?? []).length;
		const sourceMentions = allowedSources.reduce((count, source) => {
			const titleCore = source.title.toLowerCase().replace(/[^a-z0-9\s]/g, ' ');
			const words = titleCore.split(/\s+/).filter((word) => word.length > 4);
			if (!words.length) return count;
			return words.some((word) => combinedLitigantText.toLowerCase().includes(word)) ? count + 1 : count;
		}, 0);

		const connectors = (combinedLitigantText.match(/\b(because|therefore|however|first|second|third|thus|since|consequently|moreover|furthermore|accordingly)\b/gi) ?? []).length;
		const avgTurnLength = litigantTurns.length
			? litigantTurns.reduce((sum, turn) => sum + tokenize(turn.message).length, 0) / litigantTurns.length
			: 0;

		const factualAnchor = keywordSet(`${stagedCase?.synopsis ?? ''} ${stagedCase?.issues ?? ''} ${stagedCase?.remedy ?? ''}`);
		const pedagogicalAnchor = keywordSet([
			stagedCase?.objective ?? '',
			stagedCase?.targetSkill ?? '',
			stagedCase?.practicePoints?.join(' ') ?? '',
			stagedCase?.judgeBrief?.goal ?? '',
			stagedCase?.judgeBrief?.studentTask ?? '',
			stagedCase?.judgeBrief?.hearingFocus ?? '',
			...(stagedCase?.judgeBrief?.issuesToProbe ?? []),
			...(stagedCase?.judgeBrief?.pressurePoints ?? []),
			...(stagedCase?.judgeBrief?.successCriteria ?? []),
			...(stagedCase?.judgeBrief?.sourceBoundaries ?? []),
			stagedCase?.paperSnapshot?.objective ?? '',
			stagedCase?.paperSnapshot?.targetSkill ?? '',
			stagedCase?.paperSnapshot?.issues ?? '',
			stagedCase?.paperSnapshot?.plaintiffPosition ?? '',
			stagedCase?.paperSnapshot?.defendantPosition ?? '',
			...(stagedCase?.paperSnapshot?.practicePoints ?? [])
		].join(' '));
		const litigantAnchor = keywordSet(combinedLitigantText);
		let factualOverlap = 0;
		for (const token of factualAnchor) {
			if (litigantAnchor.has(token)) factualOverlap += 1;
		}
		let pedagogicalOverlap = 0;
		for (const token of pedagogicalAnchor) {
			if (litigantAnchor.has(token)) pedagogicalOverlap += 1;
		}
		const factualFidelity = factualAnchor.size ? factualOverlap / factualAnchor.size : 0.5;
		const pedagogicalFidelity = pedagogicalAnchor.size ? pedagogicalOverlap / pedagogicalAnchor.size : factualFidelity;
		const fidelityBase = factualFidelity * 0.7 + pedagogicalFidelity * 0.3;

		const judgeLeaning = judgeMind?.leaning?.toLowerCase() ?? '';
		const judgeLeanScore = judgeLeaning.includes('undecided') ? 45
			: judgeLeaning.includes('plaintiff') && stagedCase?.role === 'plaintiff' ? 72
			: judgeLeaning.includes('defendant') && stagedCase?.role === 'defendant' ? 72
			: judgeLeaning.includes('plaintiff') || judgeLeaning.includes('defendant') ? 35
			: 45;
		const judgeConcernsLength = (judgeMind?.concerns ?? '').length;
		const judgeEngagement = Math.min(judgeConcernsLength / 4, 20);

		const persuasionBase = judgeLeanScore + judgeEngagement * 0.3;

		// Fair calibration: text signals start low, scale with real effort
		const textLegalScore = 15 + Math.min(legalMentions * 4, 40) + Math.min(sourceMentions * 8, 40);
		const lawCited = clampScore(textLegalScore);

		const textStructureScore = 25 + Math.min(connectors * 5, 30) + Math.min(avgTurnLength, 30);
		const structure = clampScore(textStructureScore);

		const responsiveness = computeResponsiveness(transcript);
		// Fidelity: 0% overlap → 20, 50% → 50, 100% → 80
		const factFidelity = clampScore(20 + fidelityBase * 60);
		const persuasion = clampScore(persuasionBase);

		return { persuasion, lawCited, structure, responsiveness, factFidelity };
	};

	const evaluatePerformance = async () => {
		if (!stagedCase) return;
		scoreModalOpen = true;
		scoring = true;
		scoreError = '';

		const transcript = get(debateStore);
		const deterministic = computeDeterministicScores(transcript);

		try {
			const response = await fetch('/api/debate/score', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					case: stagedCase,
					transcript,
					sources: allowedSources,
					deterministic,
					language: currentDebateLanguage(),
					packContext: activePackContext
				})
			});

			if (!response.ok) {
				throw new Error(await response.text());
			}

			const payload = await response.json();
			scoreSummary = payload.summary || tr('debate.scoreFallbackSummary');
			scoreStrengths = Array.isArray(payload.strengths) ? payload.strengths : [];
			scoreWeaknesses = Array.isArray(payload.weaknesses) ? payload.weaknesses : [];
			scoreNextTime = Array.isArray(payload.nextTime) ? payload.nextTime : [];
			endScores = {
				persuasion: clampScore(payload.scores?.persuasion ?? deterministic.persuasion),
				lawCited: clampScore(payload.scores?.lawCited ?? deterministic.lawCited),
				structure: clampScore(payload.scores?.structure ?? deterministic.structure),
				responsiveness: clampScore(payload.scores?.responsiveness ?? deterministic.responsiveness),
				factFidelity: clampScore(payload.scores?.factFidelity ?? deterministic.factFidelity),
				average: clampScore(payload.scores?.average ?? ((deterministic.persuasion + deterministic.lawCited + deterministic.structure + deterministic.responsiveness + deterministic.factFidelity) / 5))
			};
		} catch (err) {
			console.error('Performance scoring failed', err);
			scoreError = err instanceof Error ? err.message : 'Scoring failed.';
			scoreSummary = tr('debate.scoreFallbackSummary');
			scoreStrengths = [];
			scoreWeaknesses = [];
			scoreNextTime = [];
			endScores = {
				...deterministic,
				average: clampScore((deterministic.persuasion + deterministic.lawCited + deterministic.structure + deterministic.responsiveness + deterministic.factFidelity) / 5)
			};
		} finally {
			scoring = false;
		}
	};

	const exitCourt = () => leaveCourt(false);
	const endCase = () => {
		void evaluatePerformance();
	};
	const keepPracticing = () => {
		scoreModalOpen = false;
	};
	const finalizeCaseFromModal = () => {
		scoreModalOpen = false;
		leaveCourt(true);
	};

	const formatMetric = (value?: number) => `${Math.round(value ?? 50)}%`;
	
	const getScoreColor = (score: number) => {
		if (score > 60) return 'text-flare';
		if (score < 40) return 'text-pulse';
		return 'text-white/60';
	};

	onDestroy(() => {
		focusMode.set(false);
		focusArmed = false;
	});
</script>

{#if !stagedCase}
	<div class="h-full flex items-center justify-center p-8">
		<div class="text-center space-y-4 max-w-md">
			<div class="w-16 h-16 border border-white/15 rounded-full flex items-center justify-center mx-auto text-2xl mb-6">∅</div>
			<p class="text-sm uppercase tracking-[0.2em] text-white/60">{tr('debate.noCase')}</p>
			<h2 class="text-xl font-display text-white">{tr('debate.noCaseDesc')}</h2>
			<a href="/create" class="inline-block mt-4 px-6 py-2.5 border border-white/30 hover:bg-white/10 text-white text-sm font-mono uppercase transition rounded-sm">
				{tr('debate.launchCreate')}
			</a>
		</div>
	</div>
{:else}
	<div class={`relative flex h-[calc(100vh-3.5rem)] min-h-0 flex-col overflow-hidden lg:grid lg:transition-[grid-template-columns] lg:duration-300 ${judgeRailExpanded ? 'lg:grid-cols-[minmax(0,1fr)_320px] xl:grid-cols-[minmax(0,1fr)_340px]' : 'lg:grid-cols-[minmax(0,1fr)_0px]'}`}>
		{#if guideOpen}
			<button
				type="button"
				class="fixed inset-0 z-30 bg-black/50 backdrop-blur-sm lg:hidden"
				aria-label={tr('debate.judgeFocus')}
				on:click={closeGuide}
			></button>
		{/if}

		<main class="relative flex min-h-0 flex-col bg-transparent">
			<div class="border-b border-white/10 bg-black/15 px-3 py-2.5 backdrop-blur-md sm:px-4 lg:px-6">
				<div class={`mx-auto flex w-full ${contentWidthClass()} flex-wrap items-center justify-between gap-2.5`}>
					<div class="flex flex-wrap items-center gap-2">
						{#if paperSnapshot}
							<button
								type="button"
								on:click={() => (paperViewerOpen = true)}
								class="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/15 bg-white/[0.04] text-white/70 transition hover:border-white/30 hover:bg-white/[0.08] hover:text-white sm:h-auto sm:w-auto sm:gap-2 sm:px-3 sm:py-2"
								aria-label={tr('cases.openExercisePaper')}
								title={tr('cases.openExercisePaper')}
							>
								<svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
									<path d="M7 3.75h7.5L19.5 8.75v11.5a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1v-15.5a1 1 0 0 1 1-1Z" />
									<path d="M14.5 3.75v5h5" />
									<path d="M9 12h6" />
									<path d="M9 16h4" />
								</svg>
								<span class="hidden text-xs font-bold uppercase tracking-[0.16em] sm:inline">{tr('cases.openExercisePaper')}</span>
							</button>
						{/if}
						<button
							type="button"
							on:click={toggleJudgeRail}
							class={`inline-flex items-center gap-2 rounded-full border px-3 py-2 text-xs font-bold uppercase tracking-[0.16em] transition ${judgeRailVisible() ? 'border-white/25 bg-white/[0.08] text-white' : 'border-white/15 bg-white/[0.04] text-white/70 hover:border-white/30 hover:bg-white/[0.08] hover:text-white'}`}
							aria-controls="judge-mind-rail"
							aria-expanded={judgeRailVisible()}
						>
							<svg viewBox="0 0 24 24" class={`h-3.5 w-3.5 transition-transform duration-200 ${judgeRailVisible() ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
								<path d="M9 5l7 7-7 7" />
							</svg>
							{tr('debate.judgeFocus')}
						</button>
					</div>
					<div class="flex flex-wrap items-center gap-2">
						<span class="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-white/62">{tr('debate.roundCounter')}: {litigantTurnCount}/{maxRounds}</span>
						<button
							type="button"
							on:click={endCase}
							class="inline-flex items-center gap-2 rounded-full border border-flare/40 px-3.5 py-2 text-xs font-bold uppercase tracking-[0.16em] text-flare transition hover:border-flare hover:bg-flare/10"
						>
							{tr('debate.endCase')}
						</button>
					</div>
				</div>
			</div>

			<div class="flex-1 overflow-y-auto px-3 py-4 sm:px-4 lg:px-6 min-h-0">
				<div class={`mx-auto w-full ${contentWidthClass()}`}>
					<div class="space-y-4 sm:space-y-5">
						{#each $debateStore as turn}
							<div class={`flex w-full flex-col ${turn.role === 'litigant' ? 'ml-auto items-end max-w-[88%] xl:max-w-[82%]' : 'mr-auto items-start max-w-[92%] xl:max-w-[86%]'}`}
								in:fly={{ y: 10, duration: 300 }}>
								<p class="mb-1 px-1 text-[11px] font-mono uppercase tracking-[0.16em] text-white/45">{turn.speaker}</p>
								<div class={`w-full border p-4 text-[15px] leading-7 backdrop-blur-sm shadow-lg sm:p-5 sm:text-[15.5px] ${turn.role === 'litigant' ? 'rounded-t-2xl rounded-bl-2xl border-white/20 bg-white/[0.06] text-white' : 'rounded-t-2xl rounded-br-2xl border-white/10 bg-black/35 text-white'}`}>
									{#if turn.role === 'judge' && hasVerifiedCitations(turn)}
										<SourceLinkedMessage
											message={turn.message}
											citations={turn.verifiedCitations ?? []}
											on:open={(event) => openCitationDrawer(event.detail)}
										/>
									{:else}
										<span class="whitespace-pre-wrap break-words">{turn.message}</span>
									{/if}
								</div>
									{#if turn.role === 'judge' && unverifiedCitationCount(turn) > 0}
										<div class="mt-1.5 inline-flex items-center gap-2 rounded-full border border-amber-400/20 bg-amber-400/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-amber-200">
											<span class="h-1.5 w-1.5 rounded-full bg-amber-300"></span>
											{tr('debate.unverifiedCitationWarning')}
										</div>
									{:else if turn.citations?.length}
										<details class={`mt-1.5 max-w-full ${turn.role === 'litigant' ? 'self-end' : 'self-start'}`}>
											<summary class="inline-flex cursor-pointer list-none items-center gap-2 rounded-full border border-white/10 bg-black/20 px-3 py-1 text-[11px] font-mono text-white/45">
												{tr('debate.sources')} · {turn.citations.length}
											</summary>
											<div class={`mt-2 flex max-w-full flex-wrap gap-2 ${turn.role === 'litigant' ? 'justify-end' : 'justify-start'}`}>
												{#each turn.citations as cite}
													<span class="rounded-full border border-white/10 bg-black/20 px-2 py-0.5 text-xs font-mono text-white/40 break-all">{cite}</span>
												{/each}
											</div>
										</details>
									{/if}
							</div>
						{/each}

						{#if sending}
							<div class="mr-auto flex w-full max-w-[92%] flex-col items-start xl:max-w-[86%]" in:fly={{ y: 10, duration: 200 }}>
								<p class="mb-1 px-1 text-[11px] font-mono uppercase tracking-[0.16em] text-white/45">{judgePersona.name}</p>
								<div class="w-full rounded-t-2xl rounded-br-2xl border border-white/10 bg-black/30 p-4 text-[15px] leading-7 text-white/80 sm:p-5">
									<div class="flex items-center gap-2">
										<span class="w-2 h-2 rounded-full bg-white/40 animate-pulse"></span>
										<span class="text-sm font-mono text-white/70">{tr('debate.reviewingBench')}</span>
									</div>
								</div>
							</div>
						{/if}
					</div>
				</div>
			</div>

			<div class="border-t border-white/10 bg-[#05030b]/72 px-3 py-3 backdrop-blur-md sm:px-4 lg:px-6">
				<div class={`mx-auto w-full ${contentWidthClass()}`}>
					{#if roundCapReached}
						<div class="py-3 text-center">
							<p class="mb-1 text-sm font-semibold text-white/80">{tr('debate.roundLimitReached')}</p>
							<p class="text-sm text-white/50">{tr('debate.roundLimitDesc')}</p>
						</div>
					{:else}
						<div class="rounded-[1.35rem] border border-white/10 bg-[#090612]/92 p-2.5 shadow-[0_18px_45px_rgba(0,0,0,0.22)]">
							<div class="mb-2 flex items-center justify-between gap-3 px-1">
								<button
									type="button"
									on:click={() => (tipsOpen = !tipsOpen)}
									class="inline-flex items-center gap-1 text-[11px] text-amber-300/70 transition hover:text-amber-300"
								>
									<svg class="h-3.5 w-3.5" class:rotate-90={tipsOpen} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/></svg>
									{tr('debate.tipTitle')}
								</button>
								<span class="hidden text-[10px] font-mono uppercase tracking-[0.16em] text-white/40 sm:inline">CTRL+ENTER</span>
							</div>
							{#if tipsOpen}
								<div class="mb-2 space-y-1 rounded-xl border border-amber-500/15 bg-amber-900/15 p-2.5 text-[11px] text-amber-100/70" transition:fly={{ y: -8, duration: 150 }}>
									<p>• {tr('debate.tipCite')}</p>
									<p>• {tr('debate.tipStructure')}</p>
									<p>• {tr('debate.tipCounter')}</p>
								</div>
							{/if}
							<form class="relative" on:submit|preventDefault={submitPrompt}>
								<textarea
									bind:this={composerTextarea}
									bind:value={prompt}
									rows="1"
									class="min-h-[72px] max-h-[220px] w-full resize-none overflow-y-auto rounded-[1rem] border border-white/10 bg-[#0a0814] px-4 py-3 pr-16 font-mono text-[15px] leading-6 text-white transition-all focus:border-flare/50 focus:outline-none focus:ring-1 focus:ring-flare/50 sm:pr-20"
									placeholder={tr('debate.inputPlaceholder')}
									disabled={roundCapReached}
									on:input={autoSizeComposer}
									on:keydown={(e) => { if((e.ctrlKey || e.metaKey) && e.key === 'Enter') submitPrompt(); }}
								></textarea>
								<div class="absolute bottom-2.5 right-2.5 flex items-center gap-2">
									<button
										type="submit"
										aria-label={tr('debate.sendMessage')}
										class="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-white text-ink transition hover:bg-white/90 hover:text-black disabled:cursor-not-allowed disabled:opacity-50"
										disabled={sending || !prompt.trim() || roundCapReached}
									>
										<svg class="h-4 w-4 rotate-90" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="square" stroke-linejoin="miter" stroke-width="2" d="M12 19V5m-7 7l7-7 7 7"></path></svg>
									</button>
								</div>
							</form>
						</div>
					{/if}
				</div>
			</div>
		</main>

		<aside id="judge-mind-rail" class={`fixed inset-y-0 right-0 z-40 flex w-full max-w-sm min-h-0 flex-col overflow-hidden border-l border-white/10 bg-[#05030b]/95 backdrop-blur-xl transition-[transform,width,opacity] duration-300 ${guideOpen ? 'translate-x-0' : 'translate-x-full'} ${judgeRailExpanded ? 'lg:w-[320px] xl:w-[340px] lg:opacity-100 lg:pointer-events-auto' : 'lg:w-0 lg:border-l-0 lg:opacity-0 lg:pointer-events-none'} lg:static lg:z-0 lg:max-w-none lg:translate-x-0 lg:bg-black/20 lg:backdrop-blur-0`}>
			<div class="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3.5">
				<div class="min-w-0">
					<p class="text-[11px] uppercase tracking-[0.18em] text-white/55">{tr('debate.judgeMindTitle')}</p>
					{#if judgeMind}
						<p class="mt-1 text-[11px] text-white/38">{tr('debate.liveBenchRead')}</p>
					{/if}
				</div>
				<button
					type="button"
					on:click={closeJudgeRail}
					class="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/15 bg-white/[0.04] text-white/70 transition hover:border-white/30 hover:bg-white/[0.08] hover:text-white lg:hidden"
					aria-label={tr('debate.judgeFocus')}
				>
					<svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
						<path d="M15 18l-6-6 6-6" />
					</svg>
				</button>
			</div>

			<div class="flex-1 overflow-y-auto p-4 scrollbar-hide min-h-0">
				<div class="flex min-h-full flex-col gap-4">
				<section class="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
					{#if judgeMind}
							<div class="space-y-4">
								<div class="space-y-1.5">
									<p class="text-[10px] uppercase tracking-[0.16em] text-white/40">{tr('debate.assessment')}</p>
									<p class="break-words text-sm leading-relaxed text-white/90">{judgeMind.assessment}</p>
								</div>
								<div class="space-y-1.5 border-t border-white/10 pt-3">
									<p class="text-[10px] uppercase tracking-[0.16em] text-white/40">{tr('debate.concerns')}</p>
									<p class="break-words text-sm leading-relaxed text-white/82">{judgeMind.concerns}</p>
								</div>
								<div class="space-y-1.5 border-t border-white/10 pt-3">
									<p class="text-[10px] uppercase tracking-[0.16em] text-white/40">{tr('debate.leaning')}</p>
									<p class="break-words text-sm leading-relaxed text-white/82">{judgeMind.leaning}</p>
								</div>
						</div>
					{:else}
						<div class="rounded-xl border border-white/10 bg-black/20 p-4 text-sm italic text-white/60">{tr('debate.listening')}</div>
					{/if}
				</section>

					<div class="mt-auto grid grid-cols-2 gap-2 rounded-2xl border border-white/10 bg-white/[0.03] p-3">
					<button
						type="button"
						on:click={exitCourt}
							class="rounded-xl border border-white/15 px-3 py-2.5 text-[11px] font-bold uppercase tracking-[0.16em] text-white/75 transition hover:border-white/30 hover:text-white"
					>
						{tr('debate.exitCourt')}
					</button>
					<button
						type="button"
						on:click={restartDebate}
							class="rounded-xl border border-white/10 px-3 py-2.5 text-[11px] font-bold uppercase tracking-[0.16em] text-white/60 transition hover:border-white/20 hover:text-white"
					>
						{tr('debate.resetSim')}
					</button>
				</div>
				</div>
			</div>
		</aside>
	</div>
{/if}

{#if paperViewerOpen && paperSnapshot}
	<div
		class="fixed inset-0 z-50 overflow-y-auto bg-slate-950/70 p-3 sm:p-5"
		role="dialog"
		aria-modal="true"
		aria-label={tr('cases.documentPreview')}
		tabindex="0"
		on:click={(event) => {
			if (event.target === event.currentTarget) {
				paperViewerOpen = false;
			}
		}}
		on:keydown={(event) => {
			if (event.key === 'Escape') {
				paperViewerOpen = false;
			}
		}}
	>
		<div class="mx-auto max-w-5xl space-y-3">
			<div class="flex justify-end gap-2">
				<button type="button" class="inline-flex items-center rounded-full border border-white/15 bg-black/30 px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-white/80 transition hover:border-white/30 hover:bg-black/40 hover:text-white" on:click={() => (paperViewerOpen = false)}>{tr('cases.closeExercisePaper')}</button>
			</div>
			<ExercisePaperPreview paper={paperSnapshot} />
		</div>
	</div>
{/if}

<CitationSourceDrawer
	open={sourceDrawerOpen}
	citation={activeCitation}
	source={activeCitationSource}
	sourceText={activeCitationSourceText}
	sourceTextVisible={activeCitationSourceTextVisible}
	sourceTextLoading={activeCitationSourceLoading}
	sourceTextError={activeCitationSourceError}
	originalLoading={activeCitationOriginalLoading}
	on:close={closeCitationDrawer}
	on:toggleFullSource={toggleActiveCitationSource}
	on:openOriginal={() => void openOriginalCitationSource()}
/>

{#if scoreModalOpen}
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm px-4"
		role="dialog"
		aria-modal="true"
		tabindex="0"
		on:click={(event) => {
			if (event.target === event.currentTarget && !scoring) keepPracticing();
		}}
		on:keydown={(event) => {
			if (event.key === 'Escape' && !scoring) keepPracticing();
		}}
	>
		<div class="w-full max-w-3xl bg-ink border border-white/15 rounded-2xl p-6 space-y-5">
			<div class="flex items-center justify-between">
				<div>
					<h3 class="text-xl font-display text-white">{tr('debate.performanceTitle')}</h3>
					<p class="text-xs uppercase tracking-[0.2em] text-white/40 mt-1">{stagedCase?.title}</p>
				</div>
				{#if !scoring}
					<button type="button" class="text-white/60 hover:text-white" on:click={keepPracticing}>×</button>
				{/if}
			</div>

			{#if scoring}
				<div class="border border-white/10 rounded-xl p-5 bg-white/[0.02]">
					<p class="text-sm text-white/70">{tr('debate.scoringNow')}</p>
				</div>
			{:else}
				<div class="grid grid-cols-1 md:grid-cols-[220px_1fr] gap-4">
					<div class="border border-white/15 rounded-xl p-4 bg-white/[0.04] flex flex-col justify-between">
						<p class="text-xs uppercase tracking-widest text-white/50">{tr('debate.metricAverage')}</p>
						<p class={`text-4xl font-mono font-bold mt-3 ${getScoreColor(endScores.average)}`}>{endScores.average}%</p>
					</div>

					<div class="border border-white/10 rounded-xl p-4 bg-white/[0.02]">
						<p class="text-sm text-white/80 leading-relaxed">{scoreSummary}</p>
					</div>
				</div>

				<div class="grid grid-cols-2 md:grid-cols-5 gap-3">
					{#each scoreLabels as metric}
						<div class="border border-white/15 rounded-xl p-4 bg-white/[0.03] min-h-[108px] flex flex-col justify-between">
							<p class="text-[10px] uppercase tracking-widest text-white/50">{tr(metric.label)}</p>
							<p class={`text-2xl font-mono font-bold mt-2 ${getScoreColor(endScores[metric.key])}`}>{endScores[metric.key]}%</p>
						</div>
					{/each}
				</div>

				{#if scoreStrengths.length > 0 || scoreWeaknesses.length > 0 || scoreNextTime.length > 0}
					<div class="grid gap-3 md:grid-cols-3">
						{#if scoreStrengths.length > 0}
							<div class="border border-emerald-400/25 rounded-xl p-4 bg-emerald-400/[0.04]">
								<p class="text-[10px] uppercase tracking-widest text-emerald-300/80 font-bold mb-2">✓ {tr('debate.coachStrengths')}</p>
								<ul class="space-y-1.5">
									{#each scoreStrengths as item}
										<li class="text-xs text-white/85 leading-relaxed flex gap-2"><span class="text-emerald-300/70 shrink-0">•</span><span>{item}</span></li>
									{/each}
								</ul>
							</div>
						{/if}
						{#if scoreWeaknesses.length > 0}
							<div class="border border-amber-400/25 rounded-xl p-4 bg-amber-400/[0.04]">
								<p class="text-[10px] uppercase tracking-widest text-amber-300/80 font-bold mb-2">△ {tr('debate.coachWeaknesses')}</p>
								<ul class="space-y-1.5">
									{#each scoreWeaknesses as item}
										<li class="text-xs text-white/85 leading-relaxed flex gap-2"><span class="text-amber-300/70 shrink-0">•</span><span>{item}</span></li>
									{/each}
								</ul>
							</div>
						{/if}
						{#if scoreNextTime.length > 0}
							<div class="border border-sky-400/25 rounded-xl p-4 bg-sky-400/[0.04]">
								<p class="text-[10px] uppercase tracking-widest text-sky-300/80 font-bold mb-2">→ {tr('debate.coachNextTime')}</p>
								<ul class="space-y-1.5">
									{#each scoreNextTime as item}
										<li class="text-xs text-white/85 leading-relaxed flex gap-2"><span class="text-sky-300/70 shrink-0">•</span><span>{item}</span></li>
									{/each}
								</ul>
							</div>
						{/if}
					</div>
				{/if}

				{#if scoreError}
					<p class="text-xs text-flare">{scoreError}</p>
				{/if}

				<div class="flex justify-end gap-2 pt-1">
					<button type="button" on:click={keepPracticing} class="px-4 py-2 border border-white/20 rounded text-xs font-bold uppercase tracking-widest text-white/70">{tr('debate.keepPracticing')}</button>
					<button type="button" on:click={finalizeCaseFromModal} class="px-4 py-2 bg-white text-ink rounded text-xs font-bold uppercase tracking-widest">{tr('debate.closeCase')}</button>
				</div>
			{/if}
		</div>
	</div>
{/if}
