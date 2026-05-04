import initSqlJs from 'sql.js';
import sqlWasmUrl from 'sql.js/dist/sql-wasm.wasm?url';

const TABLE_CANDIDATES = ['Articles', 'articles', 'ARTICLE', 'Article'];
const COLUMN_ALIASES = {
  reference: ['ref', 'reference', 'part number', 'part_number', 'partnumber', 'code', 'article', 'itemcode', 'item_code'],
  designation: ['design', 'designation', 'nom', 'name', 'description', 'libelle', 'label'],
  quantity: ['quantite', 'quantité', 'stock', 'qty', 'quantity'],
  barcode: ['code_barres', 'code barres', 'codebarres', 'barcode', 'ean', 'ean13']
};

let sqlJsPromise;

function normalizeColumnName(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase();
}

function pickColumn(columns, aliases) {
  const normalizedColumns = columns.map((column) => ({
    original: column,
    normalized: normalizeColumnName(column)
  }));

  for (const alias of aliases) {
    const normalizedAlias = normalizeColumnName(alias);
    const directMatch = normalizedColumns.find((column) => column.normalized === normalizedAlias);
    if (directMatch) {
      return directMatch.original;
    }
  }

  for (const alias of aliases) {
    const normalizedAlias = normalizeColumnName(alias);
    const containsMatch = normalizedColumns.find((column) => column.normalized.includes(normalizedAlias));
    if (containsMatch) {
      return containsMatch.original;
    }
  }

  return '';
}

async function getSqlJs() {
  if (!sqlJsPromise) {
    sqlJsPromise = initSqlJs({
      locateFile: () => sqlWasmUrl
    });
  }
  return sqlJsPromise;
}

function findCandidateTable(db) {
  for (const table of TABLE_CANDIDATES) {
    try {
      const probe = db.exec(`SELECT * FROM "${table}" LIMIT 1`);
      if (probe.length) {
        return table;
      }
    } catch {
      // Ignore and continue.
    }
  }

  const tables = db.exec(`
    SELECT name
    FROM sqlite_master
    WHERE type='table'
      AND name NOT LIKE 'sqlite_%'
    ORDER BY name
  `);
  const names = tables?.[0]?.values?.map((entry) => String(entry[0] || '')) || [];
  if (!names.length) {
    throw new Error('Aucune table exploitable trouvée dans la base SQLite.');
  }
  return names[0];
}

function mapRows(rows, columns) {
  const referenceColumn = pickColumn(columns, COLUMN_ALIASES.reference);
  const designationColumn = pickColumn(columns, COLUMN_ALIASES.designation);
  const quantityColumn = pickColumn(columns, COLUMN_ALIASES.quantity);
  const barcodeColumn = pickColumn(columns, COLUMN_ALIASES.barcode);

  if (!referenceColumn || !designationColumn) {
    throw new Error('La base doit contenir au minimum une colonne référence et une colonne désignation.');
  }

  const articles = rows
    .map((row, index) => {
      const reference = String(row[referenceColumn] || '').trim();
      const designation = String(row[designationColumn] || '').trim();
      if (!reference && !designation) {
        return null;
      }

      const quantityValue = Number(row[quantityColumn]);
      return {
        id: `${reference || 'article'}-${index}`,
        reference,
        designation,
        quantity: Number.isFinite(quantityValue) && quantityValue > 0 ? Math.round(quantityValue) : null,
        barcode: String(row[barcodeColumn] || '').trim()
      };
    })
    .filter(Boolean);

  const unique = new Map();
  articles.forEach((article) => {
    const key = normalizeColumnName(article.reference) || `${normalizeColumnName(article.designation)}-${article.id}`;
    if (!unique.has(key)) {
      unique.set(key, article);
    }
  });

  return Array.from(unique.values());
}

export async function importCatalogFromSqlite(file) {
  const buffer = await file.arrayBuffer();
  return importCatalogFromArrayBuffer(buffer, file.name);
}

export async function importCatalogFromArrayBuffer(buffer, fileName = 'stock_android.sqlite') {
  const SQL = await getSqlJs();
  const db = new SQL.Database(new Uint8Array(buffer));

  try {
    const tableName = findCandidateTable(db);
    const result = db.exec(`SELECT * FROM "${tableName}"`);
    const columns = result?.[0]?.columns || [];
    const values = result?.[0]?.values || [];
    const rows = values.map((row) => Object.fromEntries(columns.map((column, index) => [column, row[index]])));
    const articles = mapRows(rows, columns);

    if (!articles.length) {
      throw new Error('La base SQLite a été lue, mais aucun article exploitable n’a été trouvé.');
    }

    return {
      fileName,
      tableName,
      importedAt: Date.now(),
      articleCount: articles.length,
      articles
    };
  } finally {
    db.close();
  }
}
