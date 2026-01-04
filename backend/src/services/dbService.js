// Full path: backend/src/services/dbService.js

const { Pool } = require('pg');

class DBService {
  constructor() {
    this.pool = new Pool({
      host: process.env.DB_HOST || 'postgres',
      port: process.env.DB_PORT || 5432,
      database: process.env.DB_NAME || 'iconduct',
      user: process.env.DB_USER || 'iconduct',
      password: process.env.DB_PASSWORD || 'iconduct_password',
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    });

    this.pool.on('error', (err) => {
      console.error('Unexpected error on idle PostgreSQL client', err);
    });

    console.log('✅ PostgreSQL connection pool initialized');
  }

  async query(text, params) {
    const start = Date.now();
    try {
      const res = await this.pool.query(text, params);
      const duration = Date.now() - start;
      console.log(`📊 Query executed in ${duration}ms`);
      return res;
    } catch (error) {
      console.error('Database query error:', error);
      throw error;
    }
  }

  // ========================================
  // DLL CACHE OPERATIONS
  // ========================================

  async cacheDLLData(serverName, serverGroup, dlls) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // Delete existing DLLs for this server
      await client.query('DELETE FROM dll_cache WHERE server_name = $1', [serverName]);

      // Insert new DLL data
      for (const dll of dlls) {
        await client.query(
          `INSERT INTO dll_cache 
           (server_name, server_group, dll_name, folder_name, version, version_source, 
            file_version, product_version, size_kb, last_modified, full_path)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
           ON CONFLICT (server_name, full_path) 
           DO UPDATE SET 
             version = EXCLUDED.version,
             version_source = EXCLUDED.version_source,
             file_version = EXCLUDED.file_version,
             product_version = EXCLUDED.product_version,
             size_kb = EXCLUDED.size_kb,
             last_modified = EXCLUDED.last_modified,
             last_updated = CURRENT_TIMESTAMP`,
          [
            serverName,
            serverGroup,
            dll.Name,
            dll.Folder,
            dll.Version,
            dll.VersionSource,
            dll.FileVersion,
            dll.ProductVersion,
            dll.Size,
            dll.LastModified,
            dll.FullPath
          ]
        );
      }

      await client.query('COMMIT');
      console.log(`✅ Cached ${dlls.length} DLLs for ${serverName}`);
    } catch (error) {
      await client.query('ROLLBACK');
      console.error(`❌ Error caching DLLs for ${serverName}:`, error);
      throw error;
    } finally {
      client.release();
    }
  }

  async getCachedDLLs() {
    try {
      const result = await this.query(
        `SELECT server_name, server_group, dll_name, folder_name, version, 
                version_source, file_version, product_version, size_kb, 
                last_modified, full_path, last_updated
         FROM dll_cache
         ORDER BY server_name, folder_name, dll_name`
      );

      // Group by server
      const grouped = {};
      result.rows.forEach(row => {
        if (!grouped[row.server_name]) {
          grouped[row.server_name] = {
            serverName: row.server_name,
            serverGroup: row.server_group,
            dlls: []
          };
        }

        grouped[row.server_name].dlls.push({
          Name: row.dll_name,
          Folder: row.folder_name,
          Version: row.version,
          VersionSource: row.version_source,
          FileVersion: row.file_version,
          ProductVersion: row.product_version,
          Size: parseFloat(row.size_kb),
          LastModified: row.last_modified,
          FullPath: row.full_path
        });
      });

      return Object.values(grouped);
    } catch (error) {
      console.error('Error getting cached DLLs:', error);
      return [];
    }
  }

  async getCachedDLLsByServer(serverName) {
    try {
      const result = await this.query(
        `SELECT dll_name, folder_name, version, version_source, file_version, 
                product_version, size_kb, last_modified, full_path
         FROM dll_cache
         WHERE server_name = $1
         ORDER BY folder_name, dll_name`,
        [serverName]
      );

      return result.rows.map(row => ({
        Name: row.dll_name,
        Folder: row.folder_name,
        Version: row.version,
        VersionSource: row.version_source,
        FileVersion: row.file_version,
        ProductVersion: row.product_version,
        Size: parseFloat(row.size_kb),
        LastModified: row.last_modified,
        FullPath: row.full_path
      }));
    } catch (error) {
      console.error(`Error getting cached DLLs for ${serverName}:`, error);
      return [];
    }
  }

  async updateDLLRefreshTime() {
    try {
      await this.query(
        `UPDATE refresh_metadata 
         SET last_refresh = CURRENT_TIMESTAMP 
         WHERE resource_type = 'dlls'`
      );
    } catch (error) {
      console.error('Error updating DLL refresh time:', error);
    }
  }

  async getDLLLastRefresh() {
    try {
      const result = await this.query(
        `SELECT last_refresh FROM refresh_metadata WHERE resource_type = 'dlls'`
      );
      return result.rows[0]?.last_refresh || null;
    } catch (error) {
      console.error('Error getting DLL last refresh time:', error);
      return null;
    }
  }

  // ========================================
  // SERVER STATUS OPERATIONS
  // ========================================

  async updateServerStatus(serverName, serverGroup, isAvailable, errorMessage = null) {
    try {
      await this.query(
        `INSERT INTO server_status (server_name, server_group, is_available, error_message, last_checked)
         VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
         ON CONFLICT (server_name)
         DO UPDATE SET
           is_available = EXCLUDED.is_available,
           error_message = EXCLUDED.error_message,
           last_checked = CURRENT_TIMESTAMP`,
        [serverName, serverGroup, isAvailable, errorMessage]
      );
    } catch (error) {
      console.error(`Error updating server status for ${serverName}:`, error);
    }
  }

  async getServerStatus(serverName) {
    try {
      const result = await this.query(
        `SELECT is_available, error_message, last_checked 
         FROM server_status 
         WHERE server_name = $1`,
        [serverName]
      );
      
      if (result.rows.length === 0) {
        return { isAvailable: true, errorMessage: null };
      }
      
      return {
        isAvailable: result.rows[0].is_available,
        errorMessage: result.rows[0].error_message,
        lastChecked: result.rows[0].last_checked
      };
    } catch (error) {
      console.error(`Error getting server status for ${serverName}:`, error);
      return { isAvailable: true, errorMessage: null };
    }
  }

  async getAllServerStatuses() {
    try {
      const result = await this.query(
        `SELECT server_name, server_group, is_available, error_message, last_checked 
         FROM server_status 
         ORDER BY server_name`
      );
      
      const statuses = {};
      result.rows.forEach(row => {
        statuses[row.server_name] = {
          serverGroup: row.server_group,
          isAvailable: row.is_available,
          errorMessage: row.error_message,
          lastChecked: row.last_checked
        };
      });
      
      return statuses;
    } catch (error) {
      console.error('Error getting all server statuses:', error);
      return {};
    }
  }

  // ========================================
  // UTILITY OPERATIONS
  // ========================================

  async clearAllCache() {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('DELETE FROM dll_cache');
      await client.query('DELETE FROM service_cache');
      await client.query('DELETE FROM server_status');
      await client.query('COMMIT');
      console.log('✅ All cache cleared');
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Error clearing cache:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  async close() {
    await this.pool.end();
    console.log('PostgreSQL connection pool closed');
  }
}

module.exports = new DBService();
