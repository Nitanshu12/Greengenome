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
      CREATE TABLE IF NOT EXISTS item_documents (
        id            INT AUTO_INCREMENT PRIMARY KEY,
        item_code     VARCHAR(50)  NOT NULL,
        document_name VARCHAR(200) NOT NULL,
        document_url  TEXT         NOT NULL,
        created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (item_code) REFERENCES items(item_code) ON DELETE CASCADE
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
      CREATE TABLE IF NOT EXISTS stock_batch_documents (
        id            INT AUTO_INCREMENT PRIMARY KEY,
        batch_id      INT          NOT NULL,
        document_name VARCHAR(200) NOT NULL,
        document_url  TEXT         NOT NULL,
        created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (batch_id) REFERENCES stock_batches(batch_id) ON DELETE CASCADE
      ) ENGINE=InnoDB
    `);

    await conn.query(`
      CREATE TABLE IF NOT EXISTS purchase_orders (
        id           INT AUTO_INCREMENT PRIMARY KEY,
        po_number    VARCHAR(20)   DEFAULT NULL,
        vendor_code  VARCHAR(50)   NOT NULL,
        status       ENUM('draft','sent','received','cancelled') NOT NULL DEFAULT 'draft',
        total_amount DECIMAL(14,2) NOT NULL DEFAULT 0,
        gst_amount   DECIMAL(14,2) NOT NULL DEFAULT 0,
        net_total    DECIMAL(14,2) NOT NULL DEFAULT 0,
        notes        TEXT          DEFAULT NULL,
        created_by   VARCHAR(100)  DEFAULT NULL,
        created_at   TIMESTAMP     DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (vendor_code) REFERENCES vendors(vendor_code) ON DELETE RESTRICT
      ) ENGINE=InnoDB
    `);

    await conn.query(`
      CREATE TABLE IF NOT EXISTS purchase_order_items (
        id          INT AUTO_INCREMENT PRIMARY KEY,
        po_id       INT           NOT NULL,
        item_code   VARCHAR(50)   NOT NULL,
        item_name   VARCHAR(500)  NOT NULL,
        quantity    INT           NOT NULL DEFAULT 0,
        unit        VARCHAR(50)   DEFAULT NULL,
        unit_price  DECIMAL(12,2) NOT NULL DEFAULT 0,
        gst_percent DECIMAL(5,2)  NOT NULL DEFAULT 0,
        line_total  DECIMAL(14,2) NOT NULL DEFAULT 0,
        FOREIGN KEY (po_id) REFERENCES purchase_orders(id) ON DELETE CASCADE
      ) ENGINE=InnoDB
    `);

    // Link stock_batches to purchase_orders (safe — runs after both tables exist)
    await conn.query(`ALTER TABLE stock_batches ADD COLUMN IF NOT EXISTS po_id INT DEFAULT NULL`);
    try {
      await conn.query(`
        ALTER TABLE stock_batches
          ADD CONSTRAINT fk_sb_po FOREIGN KEY (po_id) REFERENCES purchase_orders(id) ON DELETE SET NULL
      `);
    } catch(e) {
      if (!e.message?.includes("Duplicate") && !e.message?.includes("already exists")) throw e;
    }

    // Date the batch was actually supplied/delivered (distinct from mfg_date) — used later for warranty calc
    await conn.query(`ALTER TABLE stock_batches ADD COLUMN IF NOT EXISTS supply_date DATE DEFAULT NULL`);

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

    // Reset old-format PO numbers (e.g. "3/26") to NULL, then regenerate in new format
    await conn.query(`
      UPDATE purchase_orders SET po_number = NULL
      WHERE po_number REGEXP '^[0-9]+/[0-9]{2}$'
    `);
    await conn.query(`
      UPDATE purchase_orders
      SET po_number = CONCAT(YEAR(created_at), '/', LPAD(MONTH(created_at), 2, '0'), '/', id)
      WHERE po_number IS NULL
    `);

    // Add 'short' status to purchase_orders ENUM (safe to re-run)
    await conn.query(`
      ALTER TABLE purchase_orders
      MODIFY COLUMN status ENUM('draft','sent','received','cancelled','short') NOT NULL DEFAULT 'draft'
    `);

    // ── Sub-kits ────────────────────────────────────────────────
    // A sub-kit (e.g. "IV Cannulation Kit") is still just a row in items —
    // is_subkit only tags it so BOM/box-template/UI can tell it apart from a
    // raw item. Everything that already keys off items.item_code (BOM,
    // stock_batches, kit_box_template) needs zero changes to support it.
    await conn.query(`ALTER TABLE items ADD COLUMN IF NOT EXISTS is_subkit TINYINT(1) NOT NULL DEFAULT 0`);

    // The recipe: which raw items (and how much of each) make ONE unit of a sub-kit.
    await conn.query(`
      CREATE TABLE IF NOT EXISTS sub_kit_components (
        id                  INT AUTO_INCREMENT PRIMARY KEY,
        sub_kit_item_code   VARCHAR(50) NOT NULL,
        component_item_code VARCHAR(50) NOT NULL,
        qty_per_unit        INT NOT NULL DEFAULT 1,
        created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (sub_kit_item_code)   REFERENCES items(item_code) ON DELETE CASCADE,
        FOREIGN KEY (component_item_code) REFERENCES items(item_code) ON DELETE RESTRICT,
        UNIQUE KEY uq_subkit_component (sub_kit_item_code, component_item_code)
      ) ENGINE=InnoDB
    `);

    // ── Cube/Box template ──────────────────────────────────────
    // Static, admin-editable map of which item (raw or sub-kit) goes in which
    // cube/box and how much. box_no is VARCHAR because a couple of slots in
    // the reference layout are named sections ("Air Evacuation Set..."), not
    // numbered boxes. Brand/OEM/docs are deliberately NOT stored here — they
    // come live from items/item_documents at read time.
    await conn.query(`
      CREATE TABLE IF NOT EXISTS kit_box_template (
        id         INT AUTO_INCREMENT PRIMARY KEY,
        cube_no    INT NOT NULL,
        box_no     VARCHAR(50) NOT NULL,
        item_code  VARCHAR(50) DEFAULT NULL,
        qty        INT NOT NULL DEFAULT 1,
        row_order  INT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (item_code) REFERENCES items(item_code) ON DELETE RESTRICT
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    // item_code is nullable: a row whose Excel item name has no exact match in
    // items yet still gets imported (nothing is silently dropped) — it just
    // carries the raw text here until an admin links it to a real item/sub-kit.
    await conn.query(`ALTER TABLE kit_box_template MODIFY COLUMN item_code VARCHAR(50) DEFAULT NULL`);
    await conn.query(`ALTER TABLE kit_box_template ADD COLUMN IF NOT EXISTS item_name_raw VARCHAR(500) DEFAULT NULL`);
    // Excel-pasted item names carry odd Unicode (narrow no-break spaces, en
    // dashes, ×) that plain latin1/utf8 columns reject outright. Force
    // utf8mb4 explicitly rather than relying on the database's default —
    // safe/idempotent to re-run even if the table was already created.
    await conn.query(`ALTER TABLE kit_box_template CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);

    console.log("✅ MariaDB schema ready");
  } catch (err) {
    console.error("❌ MariaDB schema init failed:", err.message);
    throw err;
  } finally {
    conn.release();
  }
}

module.exports = initSchema;
