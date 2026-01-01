import { writable, derived } from 'svelte/store';
import type { AIState, AIOperation, AICostSummary, AIEditResult } from '$lib/types/ai';

const defaultAIState: AIState = {
	isProcessing: false,
	currentOperation: null,
	error: null,
	lastResult: null,
	costSummary: null
};

export const aiState = writable<AIState>(defaultAIState);

// Derived stores
export const isAIProcessing = derived(aiState, ($ai) => $ai.isProcessing);
export const aiError = derived(aiState, ($ai) => $ai.error);
export const costSummary = derived(aiState, ($ai) => $ai.costSummary);

// Actions
export function startAIOperation(operation: AIOperation): void {
	aiState.update((state) => ({
		...state,
		isProcessing: true,
		currentOperation: operation,
		error: null
	}));
}

export function completeAIOperation(result: AIEditResult): void {
	aiState.update((state) => ({
		...state,
		isProcessing: false,
		currentOperation: null,
		lastResult: result,
		error: null
	}));
}

export function failAIOperation(error: string): void {
	aiState.update((state) => ({
		...state,
		isProcessing: false,
		currentOperation: null,
		error
	}));
}

export function clearAIError(): void {
	aiState.update((state) => ({
		...state,
		error: null
	}));
}

export function updateCostSummary(summary: AICostSummary): void {
	aiState.update((state) => ({
		...state,
		costSummary: summary
	}));
}

export function resetAIState(): void {
	aiState.set(defaultAIState);
}
