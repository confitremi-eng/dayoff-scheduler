import { neon } from "@netlify/neon";

async function initDB(sql) {
  await sql`
    CREATE TABLE IF NOT EXISTS app_data (
      key TEXT PRIMARY KEY,
      value JSONB NOT NULL,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
}

const DEFAULTS = {
  config: { maxWeekday: 2, maxWeekend: 1, maxHoliday: 1, maxPerMonth: 5, maxHolidayMonth: 2 },
  employees: ["王小明","李美玲","張大偉","陳怡君","林志豪","黃淑芬","吳建宏","周雅婷","鄭宗翰","蔡佳穎"],
  leaves: {},
  closedDays: [],
  blockedDays: [],
  skipLeave: {},
  specialIntent: {},
  partTimeEmployees: ["陳小瑜", "林阿明", "吳小花"],
  partTimeSlots: {},
};

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Content-Type": "application/json",
};

export default async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });

  try {
    const sql = neon();
    await initDB(sql);
    const url = new URL(req.url);
    const action = url.searchParams.get("action");

    if (req.method === "GET" && action === "getAll") {
      const rows = await sql`SELECT key, value FROM app_data`;
      const data = {};
      for (const r of rows) data[r.key] = r.value;
      for (const [k, v] of Object.entries(DEFAULTS)) if (!(k in data)) data[k] = v;
      return new Response(JSON.stringify(data), { status: 200, headers });
    }

    if (req.method === "POST" && action === "set") {
      const { key, value } = await req.json();
      if (!key || value === undefined) {
        return new Response(JSON.stringify({ error: "需要 key 和 value" }), { status: 400, headers });
      }
      await sql`
        INSERT INTO app_data (key, value, updated_at)
        VALUES (${key}, ${JSON.stringify(value)}::jsonb, NOW())
        ON CONFLICT (key) DO UPDATE SET value = ${JSON.stringify(value)}::jsonb, updated_at = NOW()
      `;
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers });
    }

    return new Response(JSON.stringify({ error: "未知 action" }), { status: 400, headers });
  } catch (err) {
    console.error("DB Error:", err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers });
  }
};

export const config = { path: "/api/db" };
