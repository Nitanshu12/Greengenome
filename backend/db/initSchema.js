const pool = require("./postgres");

async function initSchema() {
  const conn = await pool.getConnection();
  try {
    await conn.query(`
      CREATE TABLE IF NOT EXISTS vendors (
        id             INT AUTO_INCREMENT PRIMARY KEY,
        vendor_code    VARCHAR(50) UNIQUE NOT NULL,
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
        category2        VARCHAR(100),
        sub_category     VARCHAR(100),
        product_category VARCHAR(100),
        material         VARCHAR(100),
        is_reusable      TINYINT(1) DEFAULT 0,
        unit             VARCHAR(50) NOT NULL,
        unit_cost        DECIMAL(12,2) NOT NULL DEFAULT 0,
        gst_percent      DECIMAL(5,2)  NOT NULL DEFAULT 0,
        min_stock        INT NOT NULL DEFAULT 0,
        created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
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
