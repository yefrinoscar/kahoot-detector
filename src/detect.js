import {unzipSync, strFromU8} from 'fflate';
import {XMLParser} from 'fast-xml-parser';

/** Inspect workbook metadata only; the selected parser validates its worksheets. */
export function detectScoreUpload(bytes) {
  if (!bytes.length) throw Error('El Excel está vacío.');
  const files = unzipSync(bytes,{filter:item => {
    if (item.name !== 'xl/workbook.xml') return false;
    if (item.originalSize > 20 * 1024 * 1024) throw Error('El contenido del Excel supera el límite de lectura de 20 MB.');
    return true;
  }});
  if (!files['xl/workbook.xml']) throw Error('El archivo no es un Excel .xlsx compatible.');
  const source = strFromU8(files['xl/workbook.xml']);
  if (/<!DOCTYPE|<!ENTITY/i.test(source)) throw Error('El Excel contiene una definición XML no compatible.');
  const workbook = new XMLParser({ignoreAttributes:false,attributeNamePrefix:'@',parseTagValue:false}).parse(source);
  const sheets = workbook.workbook?.sheets?.sheet;
  const names = (sheets === undefined ? [] : Array.isArray(sheets) ? sheets : [sheets]).map(sheet => String(sheet['@name'] || '').trim());
  if (!names.length || names.length > 250) throw Error('El Excel no tiene una estructura de hojas compatible.');
  const hackathon = names.some(name => name.toLowerCase() === 'general');
  const kahoot = names.some(name => /^\d+\s+(?:Multiple-select\s+)?Quiz$/i.test(name));
  if (hackathon && kahoot) throw Error('El Excel mezcla hojas de Kahoot y hackatón. Sube cada reporte en su propio archivo.');
  if (hackathon) return 'hackathon';
  if (kahoot) return 'kahoot';
  throw Error('No se reconoció el reporte. Sube el Excel detallado de Kahoot con las hojas de preguntas o el consolidado de hackatón con la hoja GENERAL.');
}
