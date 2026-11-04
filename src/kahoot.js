import {unzipSync, strFromU8} from 'fflate';
import {XMLParser} from 'fast-xml-parser';

export const MAX_KAHOOT_BYTES = 5 * 1024 * 1024;
const MAX_XML_BYTES = 20 * 1024 * 1024;
const parser = new XMLParser({ignoreAttributes: false, attributeNamePrefix: '@', parseTagValue: false, processEntities: true, htmlEntities: true});
const many = value => value === undefined ? [] : Array.isArray(value) ? value : [value];
const text = value => typeof value === 'string' || typeof value === 'number' ? String(value) : value && typeof value === 'object' ? text(value['#text']) : '';
const normalize = value => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/&nbsp;|\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
const uncertain = value => /^(no (?:sabe|se)(?:\s*\/.*)?|no estoy segur[oa@](?:\s*\/.*)?)$/.test(normalize(value));
const fail = () => { throw Error('El archivo no es un reporte detallado de Kahoot compatible. Exporta el reporte Excel con las hojas de cada pregunta.'); };

/** Solo lee celdas: nunca ejecuta fórmulas ni relaciones externas del Excel. */
export function parseKahoot(bytes) {
  if (!bytes.length || bytes.length > MAX_KAHOOT_BYTES) throw Error('Sube un Excel de Kahoot de hasta 5 MB.');
  let expanded = 0;
  const zip = unzipSync(bytes, {filter: item => {
    if (!/^xl\/(workbook\.xml|_rels\/workbook\.xml\.rels|sharedStrings\.xml|worksheets\/[^/]+\.xml)$/.test(item.name)) return false;
    expanded += item.originalSize;
    if (expanded > MAX_XML_BYTES) throw Error('El contenido del Excel supera el límite de lectura de 20 MB.');
    return true;
  }});
  function xml(path) {
    if (!zip[path]) fail();
    const source = strFromU8(zip[path]);
    if (/<!DOCTYPE|<!ENTITY/i.test(source)) fail();
    return parser.parse(source);
  }
  const strings = zip['xl/sharedStrings.xml'] ? many(xml('xl/sharedStrings.xml').sst?.si).map(item => item.t !== undefined ? text(item.t) : many(item.r).map(run => text(run.t)).join('')) : [];
  const relationships = new Map(many(xml('xl/_rels/workbook.xml.rels').Relationships?.Relationship).filter(item => !item['@TargetMode']).map(item => [item['@Id'], item['@Target']]));
  const sheets = many(xml('xl/workbook.xml').workbook?.sheets?.sheet);
  if (!sheets.length || sheets.length > 250) fail();
  const tables = sheets.map(sheet => {
    const target = relationships.get(sheet['@r:id']);
    if (typeof target !== 'string') fail();
    const path = target.startsWith('/xl/') ? target.slice(1) : 'xl/' + target;
    if (!/^xl\/worksheets\/[^/]+\.xml$/.test(path)) fail();
    const rows = many(xml(path).worksheet?.sheetData?.row).map(row => {
      const cells = {};
      for (const cell of many(row.c)) {
        const column = /^([A-Z]+)\d+$/.exec(cell['@r'] || '')?.[1];
        if (!column) fail();
        cells[column] = cell['@t'] === 's' ? strings[Number(text(cell.v))] || '' : cell['@t'] === 'inlineStr' ? text(cell.is?.t) || many(cell.is?.r).map(run => text(run.t)).join('') : text(cell.v);
      }
      return cells;
    });
    return {name: sheet['@name'], rows};
  });
  const questions = tables.filter(sheet => /^\d+\s+(?:Multiple-select\s+)?Quiz$/i.test(sheet.name));
  const overview = tables.find(sheet => sheet.name === 'Overview');
  if (!questions.length || questions.length > 200) fail();
  const players = new Map();
  let excludedUncertain = 0;
  for (const question of questions) {
    const optionRow = question.rows.find(row => row.A === 'Answer options');
    const correctRow = question.rows.find(row => row.A === 'Is answer correct?');
    const headerIndex = question.rows.findIndex(row => row.A === 'Player' && row.B === 'Answer');
    if (!optionRow || !correctRow || headerIndex < 0) fail();
    const correct = Object.keys(optionRow).filter(column => column !== 'A' && correctRow[column] === 'Yes').map(column => normalize(optionRow[column])).filter(answer => {
      if (uncertain(answer)) { excludedUncertain++; return false; }
      return true;
    });
    if (!correct.length) throw Error(`La pregunta ${question.name} no tiene una respuesta válida distinta de «No sé». Revisa la clave del Kahoot.`);
    const multiple = /Multiple-select/i.test(question.name), seen = new Set();
    for (const row of question.rows.slice(headerIndex + 1)) {
      const nickname = (row.A || '').trim();
      if (!nickname) continue;
      if (seen.has(nickname) || nickname.length > 100) throw Error('Hay apodos repetidos o inválidos. El reporte debe identificar a cada jugador de forma única.');
      seen.add(nickname);
      if (!players.has(nickname)) players.set(nickname, {nickname, correct: 0, answered: 0});
      const player = players.get(nickname), answer = normalize(row.B || '');
      if (answer) player.answered++;
      if (multiple) {
        // Kahoot informa puntos parciales; para acertar se exige el conjunto completo, sin opciones extra.
        const selected = answer.split(/,\s*/).filter(Boolean);
        if (selected.length === correct.length && new Set(selected).size === correct.length && correct.every(item => selected.includes(item))) player.correct++;
      } else if (correct.includes(answer)) player.correct++;
    }
  }
  if (!players.size || players.size > 500) fail();
  const title = (overview?.rows[0]?.A || tables[0].rows[0]?.A || 'Kahoot').slice(0, 120);
  const playedOn = overview?.rows.find(row => row.A === 'Played on')?.B || '';
  return {title, playedOn, total: questions.length, excludedUncertain, players: [...players.values()].map(player => ({...player, total: questions.length})).sort((a,b) => b.correct - a.correct || a.nickname.localeCompare(b.nickname, 'es'))};
}

