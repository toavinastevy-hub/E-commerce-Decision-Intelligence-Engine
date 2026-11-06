import { SalesRow } from '../types';

/**
 * Parses SQL dumps containing CREATE TABLE and INSERT INTO statements.
 * Extracts column names and row values.
 */
export function parseSqlDump(sqlText: string): any[] {
  const rows: any[] = [];
  
  // Find INSERT INTO statements
  // Handles: INSERT INTO table_name (col1, col2, ...) VALUES (val1, val2, ...), (...);
  // or INSERT INTO table_name VALUES (...);
  const insertRegex = /INSERT\s+INTO\s+[`"']?(\w+)[`"']?\s*(?:\(([^)]+)\))?\s*VALUES\s*([\s\S]+?);/gi;
  
  let match: RegExpExecArray | null;
  while ((match = insertRegex.exec(sqlText)) !== null) {
    const rawCols = match[2];
    const rawValuesBlock = match[3];

    let columns: string[] = [];
    if (rawCols) {
      columns = rawCols
        .split(',')
        .map(c => c.trim().replace(/^[`"']|[`"']$/g, '').toLowerCase());
    }

    // Parse tuple values: (val1, val2, ...), (val3, val4, ...)
    const tupleRegex = /\(([\s\S]*?)\)(?:,|$)/g;
    let tupleMatch: RegExpExecArray | null;

    while ((tupleMatch = tupleRegex.exec(rawValuesBlock)) !== null) {
      const rawTuple = tupleMatch[1].trim();
      if (!rawTuple) continue;

      const parsedValues = parseSqlTupleValues(rawTuple);
      if (columns.length > 0) {
        const row: Record<string, any> = {};
        columns.forEach((col, idx) => {
          row[col] = parsedValues[idx] !== undefined ? parsedValues[idx] : null;
        });
        rows.push(row);
      } else {
        // If columns were not in INSERT statement, use col_0, col_1, etc.
        const row: Record<string, any> = {};
        parsedValues.forEach((val, idx) => {
          row[`col_${idx}`] = val;
        });
        rows.push(row);
      }
    }
  }

  return rows;
}

function parseSqlTupleValues(tupleStr: string): any[] {
  const values: any[] = [];
  let current = '';
  let inString = false;
  let quoteChar = '';

  for (let i = 0; i < tupleStr.length; i++) {
    const char = tupleStr[i];

    if (inString) {
      if (char === quoteChar) {
        if (tupleStr[i + 1] === quoteChar) {
          current += quoteChar;
          i++; // Skip escaped quote
        } else {
          inString = false;
        }
      } else {
        current += char;
      }
    } else {
      if (char === "'" || char === '"' || char === '`') {
        inString = true;
        quoteChar = char;
      } else if (char === ',') {
        values.push(cleanSqlValue(current));
        current = '';
      } else {
        current += char;
      }
    }
  }

  if (current.trim().length > 0 || values.length > 0) {
    values.push(cleanSqlValue(current));
  }

  return values;
}

function cleanSqlValue(val: string): any {
  const trimmed = val.trim();
  if (trimmed.toUpperCase() === 'NULL') return null;
  if (/^-?\d+$/.test(trimmed)) return parseInt(trimmed, 10);
  if (/^-?\d+\.\d+$/.test(trimmed)) return parseFloat(trimmed);
  // Remove wrapping quotes if present
  if ((trimmed.startsWith("'") && trimmed.endsWith("'")) || (trimmed.startsWith('"') && trimmed.endsWith('"'))) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}
