const test = require('node:test');
const assert = require('node:assert/strict');
require('../src/core/semantic.js');
require('../src/core/library.js');
const G = globalThis.GridCalc;
const { parseModelJson, sanitize, isLocalEndpoint, buildPrompt } = G.semantic;

test('parseModelJson reads plain JSON, fenced JSON and JSON wrapped in prose', () => {
  assert.deepEqual(parseModelJson('{"a":1}'), { a: 1 });
  assert.deepEqual(parseModelJson('```json\n{"a":{"b":[1,2]}}\n```'), { a: { b: [1, 2] } });
  assert.deepEqual(parseModelJson('Sure! Here you go: {"a":"x } y"} hope that helps'), { a: 'x } y' });
  assert.deepEqual(parseModelJson('{"a":"quote \\" and brace {"}'), { a: 'quote " and brace {' });
});

test('parseModelJson fails clearly on no, broken or truncated JSON', () => {
  assert.throws(() => parseModelJson('no json here'), /did not return JSON/);
  assert.throws(() => parseModelJson('{"a": }'), /malformed/);
  assert.throws(() => parseModelJson('{"a": {"b": 1}'), /incomplete/);
  assert.throws(() => parseModelJson(undefined), /did not return JSON/);
});

test('sanitize bounds and normalises everything the model says', () => {
  const s = sanitize({
    description: `  ${'long '.repeat(200)}`,
    blocks: [{ text: 'Opernhaus Zürich', role: 'title' }, { text: 'x', role: 'wizard' }, { text: '   ' }, ...Array.from({ length: 60 }, (_, i) => ({ text: `line ${i}`, role: 'body' }))],
    typeface: { classification: 'neo-grotesque', candidates: ['Akzidenz-Grotesk', 'Helvetica', 'Univers', 'Arial', 'Frutiger'], confidence: 7 },
    tags: ['Swiss', 'swiss', 'FLUSH-LEFT', ...Array.from({ length: 30 }, (_, i) => `tag${i}`)],
    movement: 'International Typographic Style', designerGuess: { name: 'Josef Müller-Brockmann', confidence: 0.9 },
  }, { model: 'qwen', at: 5 });
  assert.ok(s.description.length <= 400);
  assert.equal(s.blocks.length, 24);
  assert.equal(s.blocks[0].role, 'title');
  assert.equal(s.blocks[1].role, 'other');
  assert.equal(s.typeface.candidates.length, 3);
  assert.equal(s.typeface.confidence, 1);
  assert.ok(s.tags.length <= 8);
  assert.equal(s.tags.filter((t) => t === 'swiss').length, 1);
  assert.equal(s.designerGuess.name, 'Josef Müller-Brockmann');
  assert.equal(s.model, 'qwen');
});

test('sanitize treats null-like answers as no answer and rejects non-objects', () => {
  const s = sanitize({ typeface: { classification: 'comic', confidence: 'high' }, movement: 'null', designerGuess: { name: 'unknown', confidence: 1 } });
  assert.equal(s.typeface.classification, 'unknown');
  assert.equal(s.typeface.confidence, 0);
  assert.equal(s.movement, null);
  assert.equal(s.designerGuess, null);
  assert.equal(sanitize(null), null);
  assert.equal(sanitize('text'), null);
  assert.equal(sanitize({ designerGuess: { name: null } }).designerGuess, null);
});

test('sanitize strips control characters and markup-free text stays text', () => {
  const s = sanitize({ description: 'a\u0000b\nc', blocks: [{ text: '<script>alert(1)</script>', role: 'body' }] });
  assert.equal(s.description, 'a b c');
  assert.equal(s.blocks[0].text, '<script>alert(1)</script>'); // kept as inert text; the UI only ever uses textContent
});

test('only a model on this computer is allowed', () => {
  ['http://localhost:11434', 'http://127.0.0.1:1234', 'https://localhost', 'http://[::1]:11434'].forEach((u) => assert.equal(isLocalEndpoint(u), true, u));
  ['http://example.com', 'http://192.168.1.5:11434', 'http://localhost.evil.com', 'ftp://localhost', 'localhost:11434', '', 'javascript:alert(1)', 'http://127.0.0.1.nip.io'].forEach((u) => assert.equal(isLocalEndpoint(u), false, u));
});

test('the prompt asks for JSON only and for honesty about uncertainty', () => {
  const p = buildPrompt();
  assert.match(p, /ONE JSON object/);
  assert.match(p, /not invent/i);
  assert.match(p, /unsure/);
});

test('a work saved with semantic notes keeps them sanitised in the library', () => {
  const analysis = { width: 100, height: 100, ratio: 1, coverage: 0.1, confidence: 1, warnings: [], blocks: [], clusters: [{ id: 0, size: 10, ascent: 8, xHeight: 5, blocks: [], lines: 3, leading: 12, leadingRatio: 1.2, ratioToBody: 1, role: 'body' }], baseline: null, axes: [], extremes: null, micro: null };
  const l = G.library.addWork(G.library.emptyLibrary(), { designer: 'A', analysis, semantic: { description: 'x'.repeat(900), designerGuess: { name: 'B', confidence: 3 } } }, { id: 'w1', now: 1 });
  const w = l.designers[0].works[0];
  assert.ok(w.semantic.description.length <= 400);
  assert.equal(w.semantic.designerGuess.confidence, 1);
  // the guess never changes where the work is filed
  assert.equal(l.designers[0].id, 'a');
});

test('re-validating a stored answer keeps the model name and time', () => {
  const first = sanitize({ description: 'x' }, { model: 'qwen3.6', at: 1234 });
  const again = sanitize(JSON.parse(JSON.stringify(first)));
  assert.equal(again.model, 'qwen3.6');
  assert.equal(again.at, 1234);
  const l = G.library.addWork(G.library.emptyLibrary(), { designer: 'A', semantic: first, analysis: { width: 100, height: 100, ratio: 1, coverage: 0.1, confidence: 1, warnings: [], blocks: [], clusters: [{ id: 0, size: 10, ascent: 8, xHeight: 5, blocks: [], lines: 3, leading: 12, leadingRatio: 1.2, ratioToBody: 1, role: 'body' }], baseline: null, axes: [], extremes: null, micro: null } }, { id: 'w1', now: 1 });
  assert.equal(l.designers[0].works[0].semantic.model, 'qwen3.6');
});
