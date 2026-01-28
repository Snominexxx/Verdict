import { writable } from 'svelte/store';

/** 
 * focusMode toggles the immersive debate layout.
 * When true, global navigation and marketing chrome are hidden
 * so only the case context, transcript, and juror panel remain.
 */
export const focusMode = writable(false);
