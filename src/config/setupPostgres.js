// src/config/setupPostgres.js
// Run once: `npm run setup-db`
// Creates all relational tables for the structured data tier.

const pool = require('./postgres');

const schema = `

-- ── STAKEHOLDER TYPES ──────────────────────────────────────────────────────
-- Reflects the abstract: gov agencies, financial institutions, agro-tech
-- manufacturers, marketers, consumers all access the universal framework.

CREATE TABLE IF NOT EXISTS stakeholder_types (
  id          SERIAL PRIMARY KEY,
  name        VARCHAR(80) UNIQUE NOT NULL,  -- e.g. 'Government Agency'
  description TEXT
);

INSERT INTO stakeholder_types (name, description) VALUES
  ('Farm Owner / Operator',        'Individual or corporate farm operator'),
  ('Government Agency',            'Federal/State ministries and regulatory bodies'),
  ('Financial Institution',        'Banks and micro-finance institutions'),
  ('Agricultural Technology Co.',  'Farm input manufacturers and tech vendors'),
  ('Marketer / Aggregator',        'Produce buyers and commodity traders'),
  ('Research Institution',         'Universities and agricultural research centres'),
  ('Consumer',                     'End consumers accessing market data')
ON CONFLICT (name) DO NOTHING;


-- ── USERS (Single Sign-On) ─────────────────────────────────────────────────
-- Single sign-on as described in the abstract: one account covers multiple farms.

CREATE TABLE IF NOT EXISTS users (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name           VARCHAR(120) NOT NULL,
  email               VARCHAR(180) UNIQUE NOT NULL,
  password_hash       TEXT NOT NULL,
  phone               VARCHAR(30),
  stakeholder_type_id INT REFERENCES stakeholder_types(id),
  is_verified         BOOLEAN DEFAULT FALSE,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);


-- ── GEOGRAPHICAL ENCLAVES ──────────────────────────────────────────────────
-- Abstract: stakeholders require data about all farm units in a defined
-- geographical enclave. This table defines those zones.

CREATE TABLE IF NOT EXISTS geo_enclaves (
  id         SERIAL PRIMARY KEY,
  name       VARCHAR(100) NOT NULL,  -- e.g. 'Edo State'
  type       VARCHAR(40),            -- 'state', 'lga', 'region'
  country    VARCHAR(60) DEFAULT 'Nigeria',
  geojson    TEXT                    -- optional boundary polygon
);


-- ── FARMS ──────────────────────────────────────────────────────────────────
-- Core entity: a farm unit. Multiple farms can be owned by one user (SSO).

CREATE TABLE IF NOT EXISTS farms (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_code     VARCHAR(20) UNIQUE NOT NULL,  -- e.g. FRM-0041
  name          VARCHAR(150) NOT NULL,
  owner_id      UUID REFERENCES users(id) ON DELETE SET NULL,
  enclave_id    INT REFERENCES geo_enclaves(id),
  lga           VARCHAR(100),
  address       TEXT,
  size_hectares NUMERIC(10,2),
  primary_crop  VARCHAR(80),
  is_active     BOOLEAN DEFAULT TRUE,
  registered_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);


-- ── CROP YIELD RECORDS (Structured) ────────────────────────────────────────
-- Quantitative, tabular data → stays in PostgreSQL.

CREATE TABLE IF NOT EXISTS crop_yield_records (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id         UUID REFERENCES farms(id) ON DELETE CASCADE,
  crop_name       VARCHAR(80) NOT NULL,
  season          VARCHAR(40),        -- e.g. 'Wet Season 2025'
  year            INT,
  area_planted_ha NUMERIC(10,2),
  yield_kg        NUMERIC(12,2),
  yield_per_ha    NUMERIC(10,2) GENERATED ALWAYS AS (
                    CASE WHEN area_planted_ha > 0
                    THEN yield_kg / area_planted_ha ELSE NULL END
                  ) STORED,
  market_price_ngn NUMERIC(12,2),
  total_revenue_ngn NUMERIC(14,2) GENERATED ALWAYS AS (
                    yield_kg * market_price_ngn
                  ) STORED,
  recorded_at     TIMESTAMPTZ DEFAULT NOW()
);


-- ── FINANCIAL RECORDS (Structured) ─────────────────────────────────────────
-- For financial institutions that need loan/credit assessments.

CREATE TABLE IF NOT EXISTS financial_records (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id         UUID REFERENCES farms(id) ON DELETE CASCADE,
  record_type     VARCHAR(40) NOT NULL,   -- 'expense', 'revenue', 'loan', 'grant'
  category        VARCHAR(80),            -- 'seeds', 'fertiliser', 'labour', etc.
  amount_ngn      NUMERIC(14,2) NOT NULL,
  description     TEXT,
  transaction_date DATE,
  recorded_at     TIMESTAMPTZ DEFAULT NOW()
);


-- ── DATA UPLOAD LOG (Audit) ─────────────────────────────────────────────────
-- Tracks every upload across both DB tiers for governance & stakeholder access.

CREATE TABLE IF NOT EXISTS upload_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id         UUID REFERENCES farms(id),
  uploaded_by     UUID REFERENCES users(id),
  data_category   VARCHAR(80) NOT NULL,   -- 'crop_yield', 'soil_sensor', etc.
  db_tier         VARCHAR(10) NOT NULL,   -- 'postgres' | 'mongodb'
  file_name       VARCHAR(255),
  file_size_bytes BIGINT,
  mongo_doc_id    VARCHAR(60),            -- ref to MongoDB doc if unstructured
  season          VARCHAR(40),
  status          VARCHAR(20) DEFAULT 'pending',  -- pending|processed|failed
  uploaded_at     TIMESTAMPTZ DEFAULT NOW()
);


-- ── STAKEHOLDER DATA ACCESS ─────────────────────────────────────────────────
-- Tracks which stakeholders access which enclaves (for policy & analytics).

CREATE TABLE IF NOT EXISTS stakeholder_access (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID REFERENCES users(id),
  enclave_id        INT REFERENCES geo_enclaves(id),
  access_type       VARCHAR(30),   -- 'read', 'download', 'api'
  data_category     VARCHAR(80),
  accessed_at       TIMESTAMPTZ DEFAULT NOW()
);


-- ── INDEXES ────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_farms_owner       ON farms(owner_id);
CREATE INDEX IF NOT EXISTS idx_farms_enclave     ON farms(enclave_id);
CREATE INDEX IF NOT EXISTS idx_yield_farm        ON crop_yield_records(farm_id);
CREATE INDEX IF NOT EXISTS idx_financial_farm    ON financial_records(farm_id);
CREATE INDEX IF NOT EXISTS idx_upload_farm       ON upload_log(farm_id);
CREATE INDEX IF NOT EXISTS idx_upload_tier       ON upload_log(db_tier);
`;

async function setup() {
  try {
    console.log('[Setup] Running PostgreSQL schema...');
    await pool.query(schema);
    console.log('[Setup] ✓ All tables created successfully');

    // Seed a few geo enclaves
    await pool.query(`
      INSERT INTO geo_enclaves (name, type) VALUES
        ('Edo State', 'state'), ('Kano State', 'state'),
        ('Delta State', 'state'), ('Plateau State', 'state'),
        ('Ogun State', 'state'), ('Benue State', 'state')
      ON CONFLICT DO NOTHING;
    `);
    console.log('[Setup] ✓ Seed data inserted');
    process.exit(0);
  } catch (err) {
    console.error('[Setup] Error:', err.message);
    process.exit(1);
  }
}

setup();
