(function (global) {
  'use strict';

  const VespaGame = (global.VespaGame = global.VespaGame || {});

  const SCORES_KEY = 'vespa_greeter_highscores_v1';
  const PREFS_KEY = 'vespa_greeter_prefs_v1';
  const MAX_ENTRIES = 5;

  function safeRead(key, fallback) {
    try {
      const raw = global.localStorage.getItem(key);
      if (!raw) return fallback;
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : fallback;
    } catch (err) {
      return fallback;
    }
  }

  function safeWrite(key, value) {
    try {
      global.localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (err) {
      return false;
    }
  }

  function getDefaultScores() {
    return { tour: [], endless: [] };
  }

  function getScores() {
    const data = safeRead(SCORES_KEY, getDefaultScores());
    return {
      tour: Array.isArray(data.tour) ? data.tour : [],
      endless: Array.isArray(data.endless) ? data.endless : []
    };
  }

  function getModeScores(mode) {
    const all = getScores();
    return mode === 'endless' ? all.endless : all.tour;
  }

  function getBestScore(mode) {
    const list = getModeScores(mode);
    return list.length > 0 ? list[0].score : 0;
  }

  function recordScore(mode, entry) {
    const bucket = mode === 'endless' ? 'endless' : 'tour';
    const all = getScores();
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const now = new Date();
    const dateStr = now.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

    const cleanEntry = {
      id,
      score: Math.round(entry.score || 0),
      bestStreak: Math.max(0, Math.round(entry.bestStreak || 0)),
      hits: Math.max(0, Math.round(entry.hits || 0)),
      wrongs: Math.max(0, Math.round(entry.wrongs || 0)),
      laps: Math.max(1, Math.round(entry.laps || 1)),
      colorId: entry.colorId || 'mint',
      atmosphereId: entry.atmosphereId || 'golden',
      date: dateStr
    };

    const list = all[bucket].slice();
    list.push(cleanEntry);
    list.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (b.bestStreak !== a.bestStreak) return b.bestStreak - a.bestStreak;
      return b.hits - a.hits;
    });

    const trimmed = list.slice(0, MAX_ENTRIES);
    all[bucket] = trimmed;
    safeWrite(SCORES_KEY, all);

    const rankIndex = trimmed.findIndex(item => item.id === id);
    return {
      entry: cleanEntry,
      rank: rankIndex >= 0 ? rankIndex + 1 : -1,
      isNewRecord: rankIndex === 0,
      list: trimmed
    };
  }

  function clearScores(mode) {
    const all = getScores();
    if (mode === 'tour' || mode === 'endless') {
      all[mode] = [];
    } else {
      all.tour = [];
      all.endless = [];
    }
    safeWrite(SCORES_KEY, all);
  }

  function getPrefs() {
    const data = safeRead(PREFS_KEY, {});
    return {
      colorId: data.colorId || 'mint',
      atmosphereId: data.atmosphereId || 'golden'
    };
  }

  function savePrefs(partial) {
    const next = Object.assign(getPrefs(), partial);
    safeWrite(PREFS_KEY, next);
    return next;
  }

  VespaGame.Storage = {
    getScores,
    getModeScores,
    getBestScore,
    recordScore,
    clearScores,
    getPrefs,
    savePrefs
  };
})(window);
