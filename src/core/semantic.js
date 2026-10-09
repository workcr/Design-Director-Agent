/*
 * Semantic annotation by a *local* vision model (optional).
 *
 * The measurements — axes, baselines, sizes — come from deterministic image analysis, which is
 * more accurate than a vision model. A model is useful for what pixels cannot say: transcribing
 * the text, labelling roles, naming the likely typeface family, tagging the style. Its output is
 * untrusted: it is parsed tolerantly, validated strictly, and a designer guess is only ever a hint
 * for the user to confirm — never used to file a work automatically.
 */
(function () {
  const G = (globalThis.GridCalc = globalThis.GridCalc || {});
  if (typeof module !== 'undefined') require('./math.js');
  const { clamp } = G.math;

  const ROLES = ['title', 'subtitle', 'body', 'credits', 'caption', 'logo', 'other'];
  const FACES = ['neo-grotesque', 'grotesque', 'geometric-sans', 'humanist-sans', 'serif', 'slab', 'script', 'monospace', 'display', 'unknown'];

  const PROMPT = [
    'You are looking at a graphic design layout (a poster or a page). Describe only what is visible.',
    'Reply with ONE JSON object and nothing else, in exactly this shape:',
    '{',
    '  "description": "one or two sentences about the layout and typography",',
    `  "blocks": [{"text": "transcription of a block of text, max 80 characters", "role": "${ROLES.join('|')}"}],`,
    `  "typeface": {"classification": "${FACES.join('|')}", "candidates": ["up to 3 typeface names it resembles"], "confidence": 0.0},`,
    '  "tags": ["up to 6 style tags, e.g. swiss, international style, flush-left, solid setting, asymmetric, grid-based, minimalist"],',
    '  "movement": "design movement, or null",',
    '  "designerGuess": {"name": "designer name, or null", "confidence": 0.0}',
    '}',
    'Use null or "unknown" whenever you are unsure. Do not invent text that is not visible, and do not guess a designer unless the work is clearly recognisable.',
  ].join('\n');

  const buildPrompt = () => PROMPT;

  const str = (v, max) => String(v === undefined || v === null ? '' : v).replace(/[\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);

  /** Pulls the first balanced JSON object out of model output (which may include prose or code fences). */
  function parseModelJson(text) {
    const s = String(text || '');
    const start = s.indexOf('{');
    if (start < 0) throw new Error('The model did not return JSON.');
    let depth = 0; let inStr = false; let esc = false;
    for (let i = start; i < s.length; i++) {
      const c = s[i];
      if (inStr) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') inStr = false; continue; }
      if (c === '"') inStr = true;
      else if (c === '{') depth++;
      else if (c === '}' && --depth === 0) {
        try { return JSON.parse(s.slice(start, i + 1)); } catch (err) { throw new Error('The model returned malformed JSON.'); }
      }
    }
    throw new Error('The model returned incomplete JSON.');
  }

  /** Validates untrusted model output into a bounded, predictable object. */
  function sanitize(raw, meta = {}) {
    if (!raw || typeof raw !== 'object') return null;
    const tf = raw.typeface && typeof raw.typeface === 'object' ? raw.typeface : {};
    const guess = raw.designerGuess && typeof raw.designerGuess === 'object' ? raw.designerGuess : null;
    const guessName = guess ? str(guess.name, 80) : '';
    const conf = (v) => { const n = Number(v); return Number.isFinite(n) ? Math.round(clamp(n, 0, 1) * 100) / 100 : 0; };
    return {
      description: str(raw.description, 400),
      blocks: (Array.isArray(raw.blocks) ? raw.blocks : []).slice(0, 200).map((b) => ({ text: str(b && b.text, 120), role: ROLES.includes(b && b.role) ? b.role : 'other' })).filter((b) => b.text).slice(0, 24),
      typeface: {
        classification: FACES.includes(tf.classification) ? tf.classification : 'unknown',
        candidates: (Array.isArray(tf.candidates) ? tf.candidates : []).slice(0, 3).map((c) => str(c, 60)).filter(Boolean),
        confidence: conf(tf.confidence),
      },
      tags: [...new Set((Array.isArray(raw.tags) ? raw.tags : []).slice(0, 8).map((t) => str(t, 40).toLowerCase()).filter(Boolean))],
      movement: str(raw.movement, 60) && !/^null$/i.test(str(raw.movement, 60)) ? str(raw.movement, 60) : null,
      designerGuess: guessName && !/^(null|unknown|none|n\/a)$/i.test(guessName) ? { name: guessName, confidence: conf(guess.confidence) } : null,
      // metadata comes from the caller on a fresh answer, or from the stored copy when re-validating
      model: str(meta.model !== undefined ? meta.model : raw.model, 80),
      at: Number.isFinite(meta.at) ? meta.at : (Number.isFinite(raw.at) ? raw.at : 0),
    };
  }

  /** Layouts are people's work: only ever send them to a model running on this computer. */
  function isLocalEndpoint(url) {
    try {
      const u = new URL(url);
      return (u.protocol === 'http:' || u.protocol === 'https:') && ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname);
    } catch (err) {
      return false;
    }
  }

  G.semantic = { ROLES, FACES, buildPrompt, parseModelJson, sanitize, isLocalEndpoint };
  if (typeof module !== 'undefined') module.exports = G.semantic;
})();
