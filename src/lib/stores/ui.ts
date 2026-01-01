import { writable, derived } from 'svelte/store';

export interface PanelState {
	visible: boolean;
	collapsed: boolean;
}

export interface UIState {
	leftPanelWidth: number;
	rightPanelWidth: number;
	panels: {
		layers: PanelState;
		toolOptions: PanelState;
		ai: PanelState;
		color: PanelState;
		history: PanelState;
	};
	dialogs: {
		newDocument: boolean;
		export: boolean;
		preferences: boolean;
	};
}

const defaultUIState: UIState = {
	leftPanelWidth: 256,
	rightPanelWidth: 256,
	panels: {
		layers: { visible: true, collapsed: false },
		toolOptions: { visible: true, collapsed: false },
		ai: { visible: true, collapsed: false },
		color: { visible: true, collapsed: false },
		history: { visible: false, collapsed: false }
	},
	dialogs: {
		newDocument: false,
		export: false,
		preferences: false
	}
};

export const uiState = writable<UIState>(defaultUIState);

// Derived stores for common checks
export const isAnyDialogOpen = derived(uiState, ($ui) =>
	Object.values($ui.dialogs).some((open) => open)
);

// Actions
export function togglePanel(panel: keyof UIState['panels']): void {
	uiState.update((ui) => ({
		...ui,
		panels: {
			...ui.panels,
			[panel]: {
				...ui.panels[panel],
				visible: !ui.panels[panel].visible
			}
		}
	}));
}

export function collapsePanel(panel: keyof UIState['panels'], collapsed: boolean): void {
	uiState.update((ui) => ({
		...ui,
		panels: {
			...ui.panels,
			[panel]: {
				...ui.panels[panel],
				collapsed
			}
		}
	}));
}

export function openDialog(dialog: keyof UIState['dialogs']): void {
	uiState.update((ui) => ({
		...ui,
		dialogs: {
			...ui.dialogs,
			[dialog]: true
		}
	}));
}

export function closeDialog(dialog: keyof UIState['dialogs']): void {
	uiState.update((ui) => ({
		...ui,
		dialogs: {
			...ui.dialogs,
			[dialog]: false
		}
	}));
}

export function closeAllDialogs(): void {
	uiState.update((ui) => ({
		...ui,
		dialogs: {
			newDocument: false,
			export: false,
			preferences: false
		}
	}));
}
