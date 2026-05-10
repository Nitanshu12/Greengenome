const pool = require("./postgres");

const SQL = `
  CREATE TABLE IF NOT EXISTS vendors (
    id              SERIAL PRIMARY KEY,
    vendor_code     VARCHAR(50) UNIQUE NOT NULL,
    business_name   VARCHAR(300) NOT NULL,
    address         TEXT,
    email           VARCHAR(200),
    phone           VARCHAR(50),
    contact_person  VARCHAR(150),
    created_at      TIMESTAMP DEFAULT NOW(),
    updated_at      TIMESTAMP DEFAULT NOW()
  );

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

  CREATE TABLE IF NOT EXISTS item_vendors (
    id            SERIAL PRIMARY KEY,
    item_id       INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    vendor_id     INTEGER NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
    offer_price   DECIMAL(12,2),
    lead_time     VARCHAR(100),
    created_at    TIMESTAMP DEFAULT NOW(),
    UNIQUE(item_id, vendor_id)
  );
`;

async function initSchema() {
  try {
    await pool.query(SQL);
    console.log("✅ NeonDB schema ready (items table)");
  } catch (err) {
    console.error("❌ NeonDB schema init failed:", err.message || err.code || err);
    throw err;
  }
}

module.exports = initSchema;
