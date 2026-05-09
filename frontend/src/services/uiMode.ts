export type UiMode = 'guided' | 'expert';

const UI_MODE_STORAGE_KEY = 'aubm.uiMode';
const UI_MODE_CHOSEN_STORAGE_KEY = 'aubm.uiModeChosen';

export const getUiMode = (): UiMode => {
  const stored = localStorage.getItem(UI_MODE_STORAGE_KEY);
  return stored === 'expert' ? 'expert' : 'guided';
};

export const saveUiMode = (mode: UiMode) => {
  localStorage.setItem(UI_MODE_STORAGE_KEY, mode);
  localStorage.setItem(UI_MODE_CHOSEN_STORAGE_KEY, 'true');
};

export const hasSavedUiMode = (): boolean => {
  const stored = localStorage.getItem(UI_MODE_STORAGE_KEY);
  return localStorage.getItem(UI_MODE_CHOSEN_STORAGE_KEY) === 'true' && (stored === 'guided' || stored === 'expert');
};
