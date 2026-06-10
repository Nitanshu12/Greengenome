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

    // Add is_active column (default active) — safe to re-run
    await conn.query(`
      ALTER TABLE items ADD COLUMN IF NOT EXISTS is_active TINYINT(1) NOT NULL DEFAULT 1
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

    // Legacy migration — only relevant on old VPS installs that had a vendor_id column.
    // On a fresh database these columns don't exist, so skip silently.
    try { await conn.query(`ALTER TABLE item_vendors ADD COLUMN IF NOT EXISTS vendor_code_old VARCHAR(50) DEFAULT NULL`); } catch(e) {}
    try {
      await conn.query(`
        UPDATE item_vendors iv
          INNER JOIN vendors v ON iv.vendor_id = v.id
          SET iv.vendor_code = v.vendor_code
        WHERE iv.vendor_code IS NULL
      `);
    } catch(e) {}
    try { await conn.query(`ALTER TABLE item_vendors MODIFY COLUMN vendor_id INT DEFAULT NULL`); } catch(e) {}
    // Add unique constraint on (item_code, vendor_code) — ignore if already exists
    try {
      await conn.query(`ALTER TABLE item_vendors ADD UNIQUE KEY uq_iv_code (item_code, vendor_code)`);
    } catch (e) {
      if (!e.message.includes('Duplicate key name')) throw e;
    }

    // ── Extend item_vendors with full relationship fields ─────────
    await conn.query(`ALTER TABLE item_vendors ADD COLUMN IF NOT EXISTS is_preferred        TINYINT(1)   NOT NULL DEFAULT 0`);
    await conn.query(`ALTER TABLE item_vendors ADD COLUMN IF NOT EXISTS min_order_qty       INT          DEFAULT NULL`);
    await conn.query(`ALTER TABLE item_vendors ADD COLUMN IF NOT EXISTS payment_terms       VARCHAR(200) DEFAULT NULL`);
    await conn.query(`ALTER TABLE item_vendors ADD COLUMN IF NOT EXISTS contract_start_date DATE         DEFAULT NULL`);
    await conn.query(`ALTER TABLE item_vendors ADD COLUMN IF NOT EXISTS vendor_rating       DECIMAL(3,1) DEFAULT NULL`);
    await conn.query(`ALTER TABLE item_vendors ADD COLUMN IF NOT EXISTS remarks             TEXT         DEFAULT NULL`);
    await conn.query(`ALTER TABLE item_vendors ADD COLUMN IF NOT EXISTS status            VARCHAR(50) DEFAULT 'active'`);

    await conn.query(`
      UPDATE item_vendors iv
      JOIN items i ON i.item_code = iv.item_code
      SET iv.offer_price = i.unit_cost
      WHERE iv.offer_price IS NULL
    `);

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

    await conn.query(`
      CREATE TABLE IF NOT EXISTS stock_batches (
        batch_id          INT AUTO_INCREMENT PRIMARY KEY,
        supplier_batch_no VARCHAR(100)  DEFAULT NULL,
        item_code         VARCHAR(50)   NOT NULL,
        vendor_code       VARCHAR(50)   DEFAULT NULL,
        mfg_date          DATE          DEFAULT NULL,
        expiry_date       DATE          DEFAULT NULL,
        qty_received      INT           NOT NULL,
        qty_issued        INT           NOT NULL DEFAULT 0,
        unit              VARCHAR(50)   NOT NULL,
        storage_location  VARCHAR(200)  DEFAULT NULL,
        status            ENUM('active','expired','quarantined','returned') NOT NULL DEFAULT 'active',
        remarks           TEXT          DEFAULT NULL,
        created_at        TIMESTAMP     DEFAULT CURRENT_TIMESTAMP,
        updated_at        TIMESTAMP     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (item_code)   REFERENCES items(item_code)     ON DELETE RESTRICT,
        FOREIGN KEY (vendor_code) REFERENCES vendors(vendor_code) ON DELETE SET NULL
      ) ENGINE=InnoDB
    `);
    await conn.query(`
      CREATE OR REPLACE VIEW item_stock_summary AS
      SELECT
        s.item_code,
        i.name                                  AS item_name,
        i.unit,
        SUM(s.qty_received - s.qty_issued)      AS qty_in_hand,
        MIN(CASE WHEN s.expiry_date > CURDATE() THEN s.expiry_date ELSE NULL END) AS nearest_expiry,
        COUNT(*)                                 AS batch_count
      FROM stock_batches s
      JOIN items i ON i.item_code = s.item_code
      WHERE s.status = 'active'
      GROUP BY s.item_code, i.name, i.unit
    `);

    await conn.query(`
      CREATE TABLE IF NOT EXISTS assembled_kits (
        kit_id       INT AUTO_INCREMENT PRIMARY KEY,
        kit_name     VARCHAR(200) NOT NULL,
        qty_kits     INT NOT NULL DEFAULT 1,
        assembled_by VARCHAR(100),
        notes        TEXT,
        status       ENUM('assembled','partial','cancelled') NOT NULL DEFAULT 'assembled',
        created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB
    `);

    await conn.query(`
      CREATE TABLE IF NOT EXISTS kit_allocations (
        id            INT AUTO_INCREMENT PRIMARY KEY,
        kit_id        INT NOT NULL,
        item_code     VARCHAR(50) NOT NULL,
        batch_id      INT NOT NULL,
        qty_allocated INT NOT NULL,
        FOREIGN KEY (kit_id)    REFERENCES assembled_kits(kit_id)  ON DELETE CASCADE,
        FOREIGN KEY (item_code) REFERENCES items(item_code)        ON DELETE RESTRICT,
        FOREIGN KEY (batch_id)  REFERENCES stock_batches(batch_id) ON DELETE RESTRICT
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
