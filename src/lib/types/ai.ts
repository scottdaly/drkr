export type AIOperation =
	| 'edit'
	| 'generate'
	| 'removeBackground'
	| 'upscale'
	| 'restoreFaces'
	| 'styleTransfer'
	| 'outpaint'
	| 'objectRemoval';

export type AIProvider = 'auto' | 'google' | 'openai' | 'stability' | 'replicate';

export interface AIEditOptions {
	previewMode: boolean;
	preferredProvider: AIProvider | null;
	optimizeForCost: boolean;
}

export interface AIEditResult {
	image: Uint8Array;
	provider: string;
	cached: boolean;
	cost?: number;
}

export interface AICostSummary {
	totalCents: number;
	monthlyCents: number;
	budgetCents: number | null;
	operationCount: number;
	lastOperationCents: number;
}

export interface AIState {
	isProcessing: boolean;
	currentOperation: AIOperation | null;
	error: string | null;
	lastResult: AIEditResult | null;
	costSummary: AICostSummary | null;
}
