// Full path: backend/src/services/cacheService.js

class CacheService {
  constructor() {
    this.cache = new Map();
    this.TTL = 10000; // 10 seconds default TTL
  }

  /**
   * Get cached data
   */
  get(key) {
    const item = this.cache.get(key);
    if (!item) return null;
    
    if (Date.now() > item.expiry) {
      this.cache.delete(key);
      return null;
    }
    
    return item.data;
  }

  /**
   * Set cached data with TTL
   */
  set(key, data, ttl = this.TTL) {
    this.cache.set(key, {
      data,
      expiry: Date.now() + ttl
    });
  }

  /**
   * Clear all cache
   */
  clear() {
    this.cache.clear();
  }

  /**
   * Delete specific cache key
   */
  delete(key) {
    this.cache.delete(key);
  }

  /**
   * Get cache statistics
   */
  getStats() {
    const now = Date.now();
    let valid = 0;
    let expired = 0;

    this.cache.forEach((item) => {
      if (now <= item.expiry) {
        valid++;
      } else {
        expired++;
      }
    });

    return {
      total: this.cache.size,
      valid,
      expired
    };
  }
}

module.exports = new CacheService();
