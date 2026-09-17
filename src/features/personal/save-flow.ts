export type SaveOutcome = 'busy' | 'saved' | 'save-failed' | 'navigation-failed';
export type SaveStage = 'save-start' | 'save-success' | 'save-failed' | 'navigation-start' | 'navigation-success' | 'navigation-failed';

// A successful write is never repeated by this editor, even if navigation fails.
export function createSaveFlow() {
  let busy = false, committedId: string | undefined;
  return {
    async run(persist: () => Promise<number>, navigate: (id: string) => void | Promise<void>, report: (stage: SaveStage) => void): Promise<SaveOutcome> {
      if (busy) return 'busy';
      busy = true;
      try {
        if (committedId === undefined) {
          report('save-start');
          try {
            const id = await persist();
            committedId = String(id);
            report('save-success');
          } catch {
            report('save-failed');
            return 'save-failed';
          }
        }
        report('navigation-start');
        try { await navigate(committedId); report('navigation-success'); return 'saved'; }
        catch { report('navigation-failed'); return 'navigation-failed'; }
      } finally { busy = false; }
    },
  };
}
