const pool = require("./postgres");

const SQL = `
  CREATE TABLE IF NOT EXISTS items (
    id                  SERIAL PRIMARY KEY,

    item_code           VARCHAR(50) UNIQUE NOT NULL,
    name                VARCHAR(500) NOT NULL,
    specification       TEXT,

    category            VARCHAR(100) NOT NULL,
    category2           VARCHAR(100),
    sub_category        VARCHAR(100),
    product_category    VARCHAR(100),
    material            VARCHAR(100),

    is_reusable         BOOLEAN DEFAULT FALSE,

    unit                VARCHAR(50) NOT NULL,
    unit_cost           DECIMAL(12,2) NOT NULL DEFAULT 0,
    gst_percent         DECIMAL(5,2) NOT NULL DEFAULT 0,

    min_stock           INTEGER NOT NULL DEFAULT 0,
    max_stock           INTEGER,

    created_at          TIMESTAMP DEFAULT NOW(),
    updated_at          TIMESTAMP DEFAULT NOW()
  );

  CREATE OR REPLACE FUNCTION update_updated_at()
  RETURNS TRIGGER AS $$
  BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
  END;
  $$ LANGUAGE plpgsql;

  DROP TRIGGER IF EXISTS items_updated_at ON items;
  CREATE TRIGGER items_updated_at
    BEFORE UPDATE ON items
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
`;

async function initSchema() {
  try {
    await pool.query(SQL);
    console.log("✅ NeonDB schema ready (items table)");
  } catch (err) {
    console.error("❌ NeonDB schema init failed:", err.message);
    throw err;
  }
}

module.exports = initSchema;
