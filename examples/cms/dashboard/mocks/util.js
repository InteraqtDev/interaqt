// Mock for util module in browser environment
export function promisify(fn) {
  return function(...args) {
    return new Promise((resolve, reject) => {
      fn(...args, (err, result) => {
        if (err) reject(err);
        else resolve(result);
      });
    });
  };
}

export function inspect(obj, options = {}) {
  return JSON.stringify(obj, null, 2);
}

export function format(f, ...args) {
  let i = 0;
  const str = String(f).replace(/%[sdj%]/g, (x) => {
    if (x === '%%') return x;
    if (i >= args.length) return x;
    switch (x) {
      case '%s': return String(args[i++]);
      case '%d': return Number(args[i++]);
      case '%j':
        try {
          return JSON.stringify(args[i++]);
        } catch (_) {
          return '[Circular]';
        }
      default:
        return x;
    }
  });
  return str;
}

export default {
  promisify,
  inspect,
  format
}; 