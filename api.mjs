import { neon } from '@neondatabase/serverless';

const TABLES = new Set([
  "colaboradores",
  "presenca_diaria",
  "historico_escala",
  "logirotator_diaristas_diarios",
  "logirotator_perfis"
]);

function ident(value) {
  if (typeof value !== "string" || !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(value)) {
    throw new Error("Nome de coluna inválido.");
  }
  return `"${value}"`;
}

function json(status, payload) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    }
  });
}

function buildWhere(filters = [], values = []) {
  const clauses = [];
  for (const f of filters) {
    const col = ident(f.column);
    if (f.op === "eq" || f.op === "neq" || f.op === "gte" || f.op === "lte") {
      values.push(f.value);
      const op = { eq: "=", neq: "<>", gte: ">=", lte: "<=" }[f.op];
      clauses.push(`${col} ${op} $${values.length}`);
    } else if (f.op === "is") {
      if (f.value === null) clauses.push(`${col} IS NULL`);
      else if (f.value === true) clauses.push(`${col} IS TRUE`);
      else if (f.value === false) clauses.push(`${col} IS FALSE`);
      else throw new Error("Filtro IS não suportado.");
    } else if (f.op === "not") {
      if (f.operator === "is" && f.value === null) clauses.push(`${col} IS NOT NULL`);
      else throw new Error("Filtro NOT não suportado.");
    } else if (f.op === "in") {
      const arr = Array.isArray(f.values) ? f.values : [];
      if (!arr.length) clauses.push("FALSE");
      else {
        const marks = arr.map(v => { values.push(v); return `$${values.length}`; });
        clauses.push(`${col} IN (${marks.join(",")})`);
      }
    } else {
      throw new Error("Operador de filtro não permitido.");
    }
  }
  return clauses.length ? " WHERE " + clauses.join(" AND ") : "";
}

async function processarRequisicao(request, env) {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    }});
  }
  if (request.method !== "POST") {
    return json(405, { error: "Método não permitido." });
  }
  try {
    const sql = neon(env.DATABASE_URL);
    const body = await request.json();
    const { table, action = "select", columns = "*", values: inputValues, filters = [], orders = [], limit, range, conflict, returning = false, single = false } = body;
    if (!TABLES.has(table)) return json(400, { error: "Tabela não autorizada." });

    let result;
    if (action === "select") {
      const selected = columns === "*" ? "*" : String(columns).split(",").map(x => ident(x.trim())).join(", ");
      const params = [];
      let sqlText = `SELECT ${selected} FROM ${ident(table)}` + buildWhere(filters, params);
      if (orders.length) {
        const orderSql = orders.map(o => `${ident(o.column)} ${o.ascending === false ? "DESC" : "ASC"}`).join(", ");
        sqlText += ` ORDER BY ${orderSql}`;
      }
      if (range && Number.isInteger(range.from) && Number.isInteger(range.to)) {
        sqlText += ` LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
        params.push(Math.max(0, range.to - range.from + 1), Math.max(0, range.from));
      } else if (Number.isInteger(limit) && limit >= 0) {
        sqlText += ` LIMIT $${params.length + 1}`;
        params.push(limit);
      }
      result = await sql.query(sqlText, params);
    } else if (action === "insert" || action === "upsert") {
      const rows = Array.isArray(inputValues) ? inputValues : [inputValues];
      if (!rows.length || !rows[0] || typeof rows[0] !== "object") throw new Error("Dados para gravação inválidos.");
      const cols = [...new Set(rows.flatMap(r => Object.keys(r)))];
      if (!cols.length) throw new Error("Nenhuma coluna informada.");
      const params = [];
      const tuples = rows.map(row => {
        const marks = cols.map(col => {
          params.push(row[col] === undefined ? null : row[col]);
          return `$${params.length}`;
        });
        return `(${marks.join(",")})`;
      });
      let sqlText = `INSERT INTO ${ident(table)} (${cols.map(ident).join(",")}) VALUES ${tuples.join(",")}`;
      if (action === "upsert") {
        const conflictCols = String(conflict || "").split(",").filter(Boolean);
        if (!conflictCols.length) throw new Error("Informe a coluna de conflito para upsert.");
        const updates = cols.filter(c => !conflictCols.includes(c));
        sqlText += ` ON CONFLICT (${conflictCols.map(ident).join(",")}) `;
        sqlText += updates.length ? `DO UPDATE SET ${updates.map(c => `${ident(c)} = EXCLUDED.${ident(c)}`).join(", ")}` : "DO NOTHING";
      }
      sqlText += " RETURNING *";
      result = await sql.query(sqlText, params);
    } else if (action === "update" || action === "delete") {
      const params = [];
      const where = buildWhere(filters, params);
      if (!filters.length) throw new Error("Operação sem filtro bloqueada por segurança.");
      let sqlText;
      if (action === "delete") sqlText = `DELETE FROM ${ident(table)}${where} RETURNING *`;
      else {
        if (!inputValues || typeof inputValues !== "object" || Array.isArray(inputValues)) throw new Error("Dados de atualização inválidos.");
        const sets = Object.entries(inputValues).map(([col, val]) => {
          params.push(val);
          return `${ident(col)} = $${params.length}`;
        });
        if (!sets.length) throw new Error("Nenhuma alteração informada.");
        sqlText = `UPDATE ${ident(table)} SET ${sets.join(", ")}${where} RETURNING *`;
      }
      result = await sql.query(sqlText, params);
    } else {
      return json(400, { error: "Operação não permitida." });
    }
    
    let data = result === undefined ? null : result;
    if (single && Array.isArray(data)) data = data[0] || null;
    return json(200, { data, count: Array.isArray(result) ? result.length : 0 });

  } catch (error) {
    console.error("Neon API:", error);
    return json(500, { error: error.message || "Erro interno na API Neon." });
  }
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    // Intercepta apenas as rotas da API
    if (url.pathname === "/api" || url.pathname === "/.netlify/functions/api") {
      return processarRequisicao(request, env);
    }
    // Entrega os arquivos estáticos (index.html) para o resto
    return env.ASSETS.fetch(request);
  }
};