-- Ceramics Business Management System - Database Schema
-- Version 1.0
-- SQLite3 Database

-- Enable foreign keys
PRAGMA foreign_keys = ON;

-- Pieces table: Core inventory
CREATE TABLE IF NOT EXISTS pieces (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('vase', 'bowl', 'plate', 'mug', 'sculpture', 'planter', 'other')),
    dimensions TEXT,  -- e.g., "8x12x6 in" or "20x30x15 cm"
    glaze TEXT NOT NULL,
    price REAL CHECK (price >= 0),
    cost REAL CHECK (cost >= 0),  -- Production cost for profit tracking
    status TEXT NOT NULL DEFAULT 'in-progress' CHECK (status IN ('in-progress', 'ready-for-sale', 'listed', 'sold', 'archived', 'gifted')),
    series TEXT,  -- e.g., "Layered Blue", "Speckled Earth"
    created_date TEXT NOT NULL DEFAULT (datetime('now')),
    completed_date TEXT,
    listed_date TEXT,
    sold_date TEXT,
    notes TEXT,
    materials TEXT,  -- e.g., "Stoneware, cone 6"
    firing_type TEXT CHECK (firing_type IN ('bisque', 'glaze', 'raku', 'wood', 'gas', 'electric')),
    edition_number INTEGER,  -- For limited editions
    edition_total INTEGER,  -- Total in edition
    UNIQUE(id)
);

-- Photos table: Piece photography
CREATE TABLE IF NOT EXISTS photos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    piece_id TEXT NOT NULL,
    path TEXT NOT NULL,
    angle TEXT NOT NULL CHECK (angle IN ('front', 'side', 'detail', 'studio', 'lifestyle', 'back', 'top', 'bottom', 'other')),
    is_primary INTEGER DEFAULT 0 CHECK (is_primary IN (0, 1)),
    timestamp TEXT NOT NULL DEFAULT (datetime('now')),
    width INTEGER,
    height INTEGER,
    notes TEXT,
    FOREIGN KEY (piece_id) REFERENCES pieces(id) ON DELETE CASCADE,
    CHECK (is_primary <= 1)  -- At most one primary photo per piece
);

-- Sales table: Transaction tracking
CREATE TABLE IF NOT EXISTS sales (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    piece_id TEXT NOT NULL,
    sale_date TEXT NOT NULL DEFAULT (datetime('now')),
    sale_price REAL NOT NULL CHECK (sale_price >= 0),
    platform TEXT CHECK (platform IN ('etsy', 'shopify', 'instagram', 'in-person', 'gallery', 'show', 'wholesale', 'custom', 'other')),
    buyer_name TEXT,
    buyer_email TEXT,
    buyer_phone TEXT,
    shipping_address TEXT,
    tracking_number TEXT,
    shipped_date TEXT,
    payment_status TEXT DEFAULT 'paid' CHECK (payment_status IN ('pending', 'paid', 'refunded', 'partial')),
    notes TEXT,
    FOREIGN KEY (piece_id) REFERENCES pieces(id) ON DELETE CASCADE
);

-- Opportunities table: Galleries, shows, custom orders
CREATE TABLE IF NOT EXISTS opportunities (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL CHECK (type IN ('gallery', 'show', 'fair', 'wholesale', 'custom-order', 'collaboration', 'commission', 'other')),
    title TEXT NOT NULL,
    description TEXT,
    organization TEXT,  -- Gallery name, show organizer, etc.
    contact_name TEXT,
    contact_email TEXT,
    contact_phone TEXT,
    status TEXT NOT NULL DEFAULT 'lead' CHECK (status IN ('lead', 'contacted', 'interested', 'negotiating', 'confirmed', 'in-progress', 'completed', 'declined', 'archived')),
    followup_date TEXT,
    deadline TEXT,  -- Application deadline, show date, delivery date
    start_date TEXT,  -- Show start date, exhibition date
    end_date TEXT,  -- Show end date
    location TEXT,
    website TEXT,
    fee REAL CHECK (fee >= 0),
    estimated_revenue REAL CHECK (estimated_revenue >= 0),
    actual_revenue REAL CHECK (actual_revenue >= 0),
    notes TEXT,
    created_date TEXT NOT NULL DEFAULT (datetime('now')),
    updated_date TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Social posts table: Content calendar and analytics
CREATE TABLE IF NOT EXISTS social_posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    piece_id TEXT,  -- NULL for process posts, brand posts, etc.
    platform TEXT NOT NULL CHECK (platform IN ('instagram', 'tiktok', 'facebook', 'pinterest', 'website', 'newsletter')),
    post_date TEXT NOT NULL DEFAULT (datetime('now')),
    content TEXT NOT NULL,
    hashtags TEXT,
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'scheduled', 'posted', 'archived')),
    style TEXT CHECK (style IN ('aesthetic', 'casual', 'storytelling', 'technical', 'sale', 'process', 'collection')),
    likes INTEGER DEFAULT 0 CHECK (likes >= 0),
    comments INTEGER DEFAULT 0 CHECK (comments >= 0),
    saves INTEGER DEFAULT 0 CHECK (saves >= 0),
    shares INTEGER DEFAULT 0 CHECK (shares >= 0),
    views INTEGER DEFAULT 0 CHECK (views >= 0),
    link TEXT,  -- URL to the actual post
    scheduled_for TEXT,
    notes TEXT,
    created_date TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (piece_id) REFERENCES pieces(id) ON DELETE SET NULL
);

-- Analytics views for common queries

CREATE VIEW IF NOT EXISTS vw_inventory AS
SELECT
    p.id,
    p.name,
    p.type,
    p.glaze,
    p.price,
    p.status,
    p.series,
    p.created_date,
    COUNT(ph.id) as photo_count,
    MAX(CASE WHEN ph.is_primary = 1 THEN ph.path END) as primary_photo
FROM pieces p
LEFT JOIN photos ph ON p.id = ph.piece_id
GROUP BY p.id;

CREATE VIEW IF NOT EXISTS vw_sales_summary AS
SELECT
    p.id,
    p.name,
    p.type,
    p.glaze,
    p.price,
    s.sale_price,
    s.sale_date,
    s.platform,
    (s.sale_price - p.cost) as profit,
    p.series
FROM sales s
JOIN pieces p ON s.piece_id = p.id;

CREATE VIEW IF NOT EXISTS vw_opportunities_active AS
SELECT
    id,
    type,
    title,
    organization,
    status,
    followup_date,
    deadline,
    start_date,
    estimated_revenue,
    julianday(deadline) - julianday('now') as days_until_deadline,
    julianday(followup_date) - julianday('now') as days_until_followup
FROM opportunities
WHERE status NOT IN ('completed', 'declined', 'archived');

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_pieces_status ON pieces(status);
CREATE INDEX IF NOT EXISTS idx_pieces_series ON pieces(series);
CREATE INDEX IF NOT EXISTS idx_pieces_glaze ON pieces(glaze);
CREATE INDEX IF NOT EXISTS idx_pieces_type ON pieces(type);
CREATE INDEX IF NOT EXISTS idx_pieces_price ON pieces(price);
CREATE INDEX IF NOT EXISTS idx_pieces_created ON pieces(created_date);
CREATE INDEX IF NOT EXISTS idx_photos_piece ON photos(piece_id);
CREATE INDEX IF NOT EXISTS idx_photos_primary ON photos(piece_id, is_primary);
CREATE INDEX IF NOT EXISTS idx_sales_piece ON sales(piece_id);
CREATE INDEX IF NOT EXISTS idx_sales_date ON sales(sale_date);
CREATE INDEX IF NOT EXISTS idx_sales_platform ON sales(platform);
CREATE INDEX IF NOT EXISTS idx_opportunities_status ON opportunities(status);
CREATE INDEX IF NOT EXISTS idx_opportunities_followup ON opportunities(followup_date);
CREATE INDEX IF NOT EXISTS idx_social_posts_piece ON social_posts(piece_id);
CREATE INDEX IF NOT EXISTS idx_social_posts_date ON social_posts(post_date);
CREATE INDEX IF NOT EXISTS idx_social_posts_status ON social_posts(status);
CREATE INDEX IF NOT EXISTS idx_social_posts_platform ON social_posts(platform);

-- Triggers for data integrity

-- Ensure only one primary photo per piece
CREATE TRIGGER IF NOT EXISTS enforce_single_primary_photo
BEFORE INSERT ON photos
WHEN NEW.is_primary = 1 AND (
    SELECT COUNT(*) FROM photos WHERE piece_id = NEW.piece_id AND is_primary = 1
) >= 1
BEGIN
    UPDATE photos SET is_primary = 0 WHERE piece_id = NEW.piece_id;
END;

-- Update piece status when sold
CREATE TRIGGER IF NOT EXISTS update_piece_on_sale
AFTER INSERT ON sales
BEGIN
    UPDATE pieces SET status = 'sold', sold_date = NEW.sale_date WHERE id = NEW.piece_id;
END;

-- Update opportunity timestamp on changes
CREATE TRIGGER IF NOT EXISTS update_opportunity_timestamp
AFTER UPDATE ON opportunities
BEGIN
    UPDATE opportunities SET updated_date = datetime('now') WHERE id = NEW.id;
END;

-- Sample configuration table
CREATE TABLE IF NOT EXISTS config (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_date TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Insert default configuration
INSERT OR IGNORE INTO config (key, value) VALUES
    ('version', '1.0'),
    ('default_currency', 'USD'),
    ('photo_directory', '~/clawd/ceramics/photos/'),
    ('backup_directory', '~/clawd/ceramics/backups/');
