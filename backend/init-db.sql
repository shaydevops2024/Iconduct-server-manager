-- Full path: backend/init-db.sql
-- PostgreSQL database schema for IConduct Server Manager

-- DLL cache table
CREATE TABLE IF NOT EXISTS dll_cache (
    id SERIAL PRIMARY KEY,
    server_name VARCHAR(255) NOT NULL,
    server_group VARCHAR(255) NOT NULL,
    dll_name VARCHAR(500) NOT NULL,
    folder_name VARCHAR(500) NOT NULL,
    version VARCHAR(100),
    version_source VARCHAR(50),
    file_version VARCHAR(100),
    product_version VARCHAR(100),
    size_kb DECIMAL(10, 2),
    last_modified TIMESTAMP,
    full_path TEXT,
    last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(server_name, full_path)
);

-- Server status cache table
CREATE TABLE IF NOT EXISTS server_status (
    id SERIAL PRIMARY KEY,
    server_name VARCHAR(255) NOT NULL UNIQUE,
    server_group VARCHAR(255) NOT NULL,
    is_available BOOLEAN DEFAULT true,
    last_checked TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    error_message TEXT
);

-- Service cache table (optional - for future use)
CREATE TABLE IF NOT EXISTS service_cache (
    id SERIAL PRIMARY KEY,
    server_name VARCHAR(255) NOT NULL,
    server_group VARCHAR(255) NOT NULL,
    service_name VARCHAR(500) NOT NULL,
    display_name VARCHAR(500),
    status VARCHAR(50),
    cpu_percent INTEGER,
    ram_percent INTEGER,
    last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(server_name, service_name)
);

-- Index for faster queries
CREATE INDEX IF NOT EXISTS idx_dll_server ON dll_cache(server_name);
CREATE INDEX IF NOT EXISTS idx_dll_folder ON dll_cache(folder_name);
CREATE INDEX IF NOT EXISTS idx_server_status ON server_status(server_name);
CREATE INDEX IF NOT EXISTS idx_service_server ON service_cache(server_name);

-- Metadata table to track last full refresh
CREATE TABLE IF NOT EXISTS refresh_metadata (
    id SERIAL PRIMARY KEY,
    resource_type VARCHAR(50) NOT NULL UNIQUE,
    last_refresh TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO refresh_metadata (resource_type) VALUES ('dlls') ON CONFLICT (resource_type) DO NOTHING;
INSERT INTO refresh_metadata (resource_type) VALUES ('services') ON CONFLICT (resource_type) DO NOTHING;