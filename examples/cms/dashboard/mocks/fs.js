// Mock for fs module in browser environment
export function readFile(path, options, callback) {
  if (typeof options === 'function') {
    callback = options;
    options = {};
  }
  // Mock implementation - always return empty content
  setTimeout(() => callback(null, ''), 0);
}

export function writeFile(path, data, options, callback) {
  if (typeof options === 'function') {
    callback = options;
    options = {};
  }
  // Mock implementation - always succeed
  setTimeout(() => callback(null), 0);
}

export function existsSync(path) {
  // Mock implementation - always return false
  return false;
}

export function mkdirSync(path, options) {
  // Mock implementation - do nothing
  return path;
}

export function readFileSync(path, options) {
  // Mock implementation - return empty content
  return '';
}

export function writeFileSync(path, data, options) {
  // Mock implementation - do nothing
}

export const promises = {
  readFile: function(path, options) {
    return Promise.resolve('');
  },
  writeFile: function(path, data, options) {
    return Promise.resolve();
  },
  mkdir: function(path, options) {
    return Promise.resolve(path);
  },
  access: function(path, mode) {
    return Promise.reject(new Error('File not found'));
  }
};

export default {
  readFile,
  writeFile,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  promises
}; 