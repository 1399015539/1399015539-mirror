declare module 'node-fetch' {
  interface RequestInit {
    credentials?: 'omit' | 'same-origin' | 'include';
  }
} 