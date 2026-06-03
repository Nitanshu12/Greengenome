const pool = require("./postgres");

async function initSchema() {
  const conn = await pool.getConnection();
  try {
    await conn.query(`
      CREATE TABLE IF NOT EXISTS vendors (
        vendor_code    VARCHAR(50) PRIMARY KEY,
        business_name  VARCHAR(300) NOT NULL,
        address        TEXT,
        email          VARCHAR(200),
        phone          VARCHAR(50),
        contact_person VARCHAR(150),
        created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB
    `);

    await conn.query(`
      CREATE TABLE IF NOT EXISTS items (
        item_code        VARCHAR(50) PRIMARY KEY,
        name             VARCHAR(500) NOT NULL,
        specification    TEXT,
        category         VARCHAR(100) NOT NULL,
        product_category VARCHAR(100),
        material         VARCHAR(100),
        unit             VARCHAR(50) NOT NULL,
        unit_cost        DECIMAL(12,2) NOT NULL DEFAULT 0,
        gst_percent      DECIMAL(5,2)  NOT NULL DEFAULT 0,
        min_stock        INT NOT NULL DEFAULT 0,
        created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB
    `);


    await conn.query(`
      CREATE TABLE IF NOT EXISTS item_vendors (
        item_code   VARCHAR(50) NOT NULL,
        vendor_code VARCHAR(50) NOT NULL,
        offer_price DECIMAL(12,2),
        lead_time   VARCHAR(100),
        created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (item_code, vendor_code),
        FOREIGN KEY (item_code) REFERENCES items(item_code) ON DELETE CASCADE,
        FOREIGN KEY (vendor_code) REFERENCES vendors(vendor_code) ON DELETE CASCADE
      ) ENGINE=InnoDB
    `);

    // Add brand column if it doesn't exist yet (safe to re-run)
    await conn.query(`
      ALTER TABLE items ADD COLUMN IF NOT EXISTS brand VARCHAR(200) DEFAULT NULL
    `);

    await conn.query(`
      CREATE TABLE IF NOT EXISTS bom_disaster (
        item_code    VARCHAR(50) PRIMARY KEY,
        item_name    VARCHAR(500) NOT NULL,
        required_qty INT NOT NULL DEFAULT 0,
        created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB
    `);

    // ── Extend item_vendors with full relationship fields ─────────
    await conn.query(`ALTER TABLE item_vendors ADD COLUMN IF NOT EXISTS is_preferred        TINYINT(1)   NOT NULL DEFAULT 0`);
    await conn.query(`ALTER TABLE item_vendors ADD COLUMN IF NOT EXISTS min_order_qty       INT          DEFAULT NULL`);
    await conn.query(`ALTER TABLE item_vendors ADD COLUMN IF NOT EXISTS payment_terms       VARCHAR(200) DEFAULT NULL`);
    await conn.query(`ALTER TABLE item_vendors ADD COLUMN IF NOT EXISTS contract_start_date DATE         DEFAULT NULL`);
    await conn.query(`ALTER TABLE item_vendors ADD COLUMN IF NOT EXISTS vendor_rating       DECIMAL(3,1) DEFAULT NULL`);
    await conn.query(`ALTER TABLE item_vendors ADD COLUMN IF NOT EXISTS remarks             TEXT         DEFAULT NULL`);
    await conn.query(`ALTER TABLE item_vendors ADD COLUMN IF NOT EXISTS status            VARCHAR(50) DEFAULT 'active'`);

    // ── Vendor documents (multiple PDFs / links per vendor) ───────
    await conn.query(`
      CREATE TABLE IF NOT EXISTS vendor_documents (
        id            INT AUTO_INCREMENT PRIMARY KEY,
        vendor_code   VARCHAR(50)  NOT NULL,
        document_name VARCHAR(200) NOT NULL,
        document_url  TEXT         NOT NULL,
        created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (vendor_code) REFERENCES vendors(vendor_code) ON DELETE CASCADE
      ) ENGINE=InnoDB
    `);
    console.log("✅ MariaDB schema ready");
  } catch (err) {
    console.error("❌ MariaDB schema init failed:", err.message);
    throw err;
  } finally {
    conn.release();
  }
}

module.exports = initSchema;
