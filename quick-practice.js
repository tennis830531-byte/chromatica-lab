(function exposeQuickPracticeCore(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.ChromaticaQuickPracticeCore = api;
}(typeof globalThis !== "undefined" ? globalThis : this, function createQuickPracticeCore() {
  function buildSnapshot(tasks, getProgress) {
    const items = (Array.isArray(tasks) ? tasks : []).map((task) => ({ task, progress: getProgress(task) }));
    return {
      total: items.length,
      done: items.filter(({ progress }) => progress.done).length,
      remaining: items.filter(({ progress }) => !progress.done),
    };
  }

  function getNext(snapshot) {
    return snapshot?.remaining?.[0] || null;
  }

  return { buildSnapshot, getNext };
}));
