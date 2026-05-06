export type UiMode = 'guided' | 'expert';

const UI_MODE_STORAGE_KEY = 'aubm.uiMode';

export const getUiMode = (): UiMode => {
  const stored = localStorage.getItem(UI_MODE_STORAGE_KEY);
  return stored === 'expert' ? 'expert' : 'guided';
};

export const saveUiMode = (mode: UiMode) => {
  localStorage.setItem(UI_MODE_STORAGE_KEY, mode);
};
