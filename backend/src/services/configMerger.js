// Full path: backend/src/services/configMerger.js

const xml2js = require('xml2js');

class ConfigMerger {
  /**
   * Merge multiple JSON files
   */
  async mergeJSONFiles(files) {
    const mergedConfig = {};
    const conflicts = [];
    
    files.forEach((file, fileIndex) => {
      try {
        const data = JSON.parse(file.content);
        this.mergeObject(mergedConfig, data, conflicts, file.filename, fileIndex);
      } catch (error) {
        conflicts.push({
          type: 'parse_error',
          file: file.filename,
          message: `Failed to parse JSON: ${error.message}`
        });
      }
    });

    return {
      mergedConfig,
      conflicts,
      format: 'json'
    };
  }

  /**
   * Merge multiple XML files
   */
  async mergeXMLFiles(files) {
    const parser = new xml2js.Parser();
    const builder = new xml2js.Builder();
    
    const mergedConfig = {};
    const conflicts = [];
    
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      try {
        const result = await parser.parseStringPromise(file.content);
        this.mergeObject(mergedConfig, result, conflicts, file.filename, i);
      } catch (error) {
        conflicts.push({
          type: 'parse_error',
          file: file.filename,
          message: `Failed to parse XML: ${error.message}`
        });
      }
    }

    return {
      mergedConfig,
      conflicts,
      format: 'xml',
      xmlOutput: builder.buildObject(mergedConfig)
    };
  }

  /**
   * Recursively merge objects and detect conflicts
   */
  mergeObject(target, source, conflicts, filename, fileIndex, path = '') {
    Object.keys(source).forEach(key => {
      const currentPath = path ? `${path}.${key}` : key;
      
      if (typeof source[key] === 'object' && !Array.isArray(source[key]) && source[key] !== null) {
        // Source is an object
        
        if (!target[key]) {
          // Target doesn't have this key, create it
          target[key] = {};
          this.mergeObject(target[key], source[key], conflicts, filename, fileIndex, currentPath);
        } else if (typeof target[key] === 'object' && !Array.isArray(target[key]) && target[key] !== null) {
          // Both target and source are objects, recursively merge
          this.mergeObject(target[key], source[key], conflicts, filename, fileIndex, currentPath);
        } else {
          // TYPE MISMATCH: target is a primitive/array but source is an object
          conflicts.push({
            type: 'type_mismatch',
            key: currentPath,
            file: filename,
            existingValue: target[key],
            existingType: Array.isArray(target[key]) ? 'array' : typeof target[key],
            newValue: source[key],
            newType: 'object',
            fileIndex,
            message: `Cannot merge: "${currentPath}" is ${Array.isArray(target[key]) ? 'an array' : 'a ' + typeof target[key]} in existing config but an object in ${filename}`
          });
          // Don't overwrite - keep the existing value
        }
      } else {
        // Source is a primitive value or array
        
        if (target.hasOwnProperty(key)) {
          // Key exists in target
          
          if (typeof target[key] === 'object' && !Array.isArray(target[key]) && target[key] !== null) {
            // TYPE MISMATCH: target is an object but source is primitive/array
            conflicts.push({
              type: 'type_mismatch',
              key: currentPath,
              file: filename,
              existingValue: target[key],
              existingType: 'object',
              newValue: source[key],
              newType: Array.isArray(source[key]) ? 'array' : typeof source[key],
              fileIndex,
              message: `Cannot merge: "${currentPath}" is an object in existing config but ${Array.isArray(source[key]) ? 'an array' : 'a ' + typeof source[key]} in ${filename}`
            });
            // Don't overwrite - keep the existing value
          } else if (target[key] !== source[key]) {
            // Both are primitives/arrays but with different values
            const isDifferent = Array.isArray(target[key]) && Array.isArray(source[key])
              ? JSON.stringify(target[key]) !== JSON.stringify(source[key])
              : target[key] !== source[key];
            
            if (isDifferent) {
              conflicts.push({
                type: 'value_conflict',
                key: currentPath,
                file: filename,
                existingValue: target[key],
                newValue: source[key],
                fileIndex,
                message: `Different values for "${currentPath}": existing="${target[key]}" vs ${filename}="${source[key]}"`
              });
              // Don't overwrite - keep the existing value
            }
          }
          // If values are the same, do nothing
        } else {
          // Key doesn't exist in target, add it
          target[key] = source[key];
        }
      }
    });
  }

  /**
   * Resolve conflicts based on user choices
   */
  resolveConflicts(mergedConfig, resolutions) {
    resolutions.forEach(resolution => {
      const keys = resolution.key.split('.');
      let current = mergedConfig;
      
      // Navigate to the parent object
      for (let i = 0; i < keys.length - 1; i++) {
        if (!current[keys[i]]) {
          current[keys[i]] = {};
        }
        current = current[keys[i]];
      }
      
      // Set the resolved value
      const lastKey = keys[keys.length - 1];
      
      if (resolution.action === 'use_existing') {
        // Keep existing value (already there, do nothing)
        return;
      } else if (resolution.action === 'use_new') {
        // Use new value
        current[lastKey] = resolution.newValue;
      } else if (resolution.action === 'use_custom') {
        // Use custom value provided by user
        try {
          current[lastKey] = JSON.parse(resolution.customValue);
        } catch (e) {
          // If parsing fails, treat as string
          current[lastKey] = resolution.customValue;
        }
      }
    });
    
    return mergedConfig;
  }

  /**
   * Format merged configuration
   */
  formatOutput(mergedConfig, format) {
    if (format === 'xml') {
      const builder = new xml2js.Builder();
      return builder.buildObject(mergedConfig);
    } else {
      return JSON.stringify(mergedConfig, null, 2);
    }
  }

  /**
   * Export merged config to string
   */
  exportConfig(mergedConfig, format) {
    if (format === 'xml') {
      const builder = new xml2js.Builder();
      return builder.buildObject(mergedConfig);
    } else {
      return JSON.stringify(mergedConfig, null, 2);
    }
  }

  /**
   * Get config file statistics
   */
  getConfigStats(mergedConfig) {
    const stats = {
      totalKeys: 0,
      depth: 0,
      arrays: 0,
      objects: 0,
      primitives: 0
    };

    const traverse = (obj, currentDepth = 1) => {
      stats.depth = Math.max(stats.depth, currentDepth);
      
      Object.keys(obj).forEach(key => {
        stats.totalKeys++;
        
        if (Array.isArray(obj[key])) {
          stats.arrays++;
        } else if (typeof obj[key] === 'object' && obj[key] !== null) {
          stats.objects++;
          traverse(obj[key], currentDepth + 1);
        } else {
          stats.primitives++;
        }
      });
    };

    traverse(mergedConfig);
    return stats;
  }
}

module.exports = new ConfigMerger();
