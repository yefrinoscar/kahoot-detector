import {test} from 'node:test';
import assert from 'node:assert/strict';
import {detectScoreUpload, parseKahoot} from '../src/index.js';
import {buildXlsx} from './helpers.js';

const overview = {name: 'Overview', rows: [['Quiz de prueba'], ['Played on', '30 Oct 2026']]};
const single = {name: '1 Quiz', rows: [
  ['Answer options', 'Lima', 'Cusco', 'No sé'],
  ['Is answer correct?', 'Yes', 'No', 'Yes'],
  ['Player', 'Answer'],
  ['ana', 'Lima'],
  ['beto', 'Cusco'],
  ['carla', 'No sé'],
]};
const multiple = {name: '2 Multiple-select Quiz', rows: [
  ['Answer options', 'A', 'B', 'C'],
  ['Is answer correct?', 'Yes', 'Yes', 'No'],
  ['Player', 'Answer'],
  ['ana', 'A, B'],
  ['beto', 'A'],
  ['carla', 'A, B, C'],
]};

test('detecta un reporte de Kahoot por sus hojas de preguntas', () => {
  assert.equal(detectScoreUpload(buildXlsx([overview, single])), 'kahoot');
});

test('detecta el consolidado de hackatón por la hoja GENERAL', () => {
  assert.equal(detectScoreUpload(buildXlsx([{name: 'GENERAL', rows: [['Equipo']]}])), 'hackathon');
});

test('rechaza archivos que mezclan ambos formatos o no se reconocen', () => {
  assert.throws(() => detectScoreUpload(buildXlsx([single, {name: 'General', rows: []}])), /mezcla/);
  assert.throws(() => detectScoreUpload(buildXlsx([{name: 'Hoja1', rows: []}])), /No se reconoció/);
  assert.throws(() => detectScoreUpload(new Uint8Array()), /vacío/);
});

test('calcula aciertos, excluye «No sé» y exige el conjunto completo en selección múltiple', () => {
  const result = parseKahoot(buildXlsx([overview, single, multiple]));
  assert.equal(result.title, 'Quiz de prueba');
  assert.equal(result.playedOn, '30 Oct 2026');
  assert.equal(result.total, 2);
  assert.equal(result.excludedUncertain, 1);
  assert.deepEqual(result.players, [
    {nickname: 'ana', correct: 2, answered: 2, total: 2},
    {nickname: 'beto', correct: 0, answered: 2, total: 2},
    {nickname: 'carla', correct: 0, answered: 2, total: 2},
  ]);
});

test('rechaza apodos repetidos', () => {
  const repeated = {...single, rows: [...single.rows, ['ana', 'Lima']]};
  assert.throws(() => parseKahoot(buildXlsx([repeated])), /repetidos/);
});
