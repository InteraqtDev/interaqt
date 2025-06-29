// Mock ResizeObserver for testing environment
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

// Mock other DOM APIs that might be needed
global.IntersectionObserver = class IntersectionObserver {
  root = null;
  rootMargin = '0px';
  thresholds = [0];
  
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() { return []; }
} as any;