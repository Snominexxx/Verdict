<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import type { VerifiedCitation } from '$lib/types';

	type MessageSegment =
		| { kind: 'text'; content: string }
		| { kind: 'citation'; content: string; citation: VerifiedCitation };
	type CitationMatch = {
		citation: VerifiedCitation;
		start: number;
		end: number;
		content: string;
		length: number;
	};

	export let message = '';
	export let citations: VerifiedCitation[] = [];

	const dispatch = createEventDispatcher<{ open: VerifiedCitation }>();

	const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	const isCitationMatch = (value: CitationMatch | null): value is CitationMatch => Boolean(value);

	const buildSegments = (text: string, verifiedCitations: VerifiedCitation[]): MessageSegment[] => {
		if (!text) return [];

		const matches = verifiedCitations
			.map((citation) => {
				const target = citation.text?.trim();
				if (!target) return null;
				const match = new RegExp(escapeRegExp(target), 'i').exec(text);
				if (!match || match.index === undefined) return null;
				return {
					citation,
					start: match.index,
					end: match.index + match[0].length,
					content: match[0],
					length: match[0].length
				};
			})
			.filter(isCitationMatch)
			.sort((left, right) => left.start - right.start || right.length - left.length);

		if (!matches.length) return [{ kind: 'text', content: text }];

		const accepted: CitationMatch[] = [];
		let currentEnd = -1;
		for (const match of matches) {
			if (match.start < currentEnd) continue;
			accepted.push(match);
			currentEnd = match.end;
		}

		const segments: MessageSegment[] = [];
		let cursor = 0;
		for (const match of accepted) {
			if (match.start > cursor) {
				segments.push({ kind: 'text', content: text.slice(cursor, match.start) });
			}
			segments.push({ kind: 'citation', content: match.content, citation: match.citation });
			cursor = match.end;
		}

		if (cursor < text.length) {
			segments.push({ kind: 'text', content: text.slice(cursor) });
		}

		return segments;
	};

	$: verified = citations.filter((citation) => citation.status === 'verified' && (citation.sourceId || citation.sourceTitle));
	$: segments = buildSegments(message, verified);
</script>

<div class="linked-message" aria-label="Judge response with linked sources">
	{#each segments as segment}
		{#if segment.kind === 'citation'}
			<button
				type="button"
				class="linked-citation"
				on:click={() => dispatch('open', segment.citation)}
			>
				{segment.content}
			</button>
		{:else}
			<span>{segment.content}</span>
		{/if}
	{/each}
</div>

<style>
	.linked-message {
		white-space: pre-wrap;
	}

	.linked-citation {
		display: inline;
		margin: 0;
		padding: 0 0.18rem;
		border: 1px solid rgba(125, 211, 252, 0.28);
		border-radius: 0.35rem;
		background: rgba(125, 211, 252, 0.14);
		color: rgba(224, 242, 254, 0.96);
		text-decoration: underline;
		text-decoration-style: dotted;
		text-underline-offset: 0.16rem;
		transition: background-color 160ms ease, border-color 160ms ease, color 160ms ease;
	}

	.linked-citation:hover {
		border-color: rgba(186, 230, 253, 0.44);
		background: rgba(125, 211, 252, 0.2);
		color: rgba(240, 249, 255, 1);
	}

	.linked-citation:focus-visible {
		outline: 2px solid rgba(186, 230, 253, 0.65);
		outline-offset: 2px;
	}
</style>