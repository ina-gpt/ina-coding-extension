export class CacheSerializer {
  serialize<T>(value: T): string {
    return JSON.stringify(value, (_, v) => {
      if (v instanceof Map) return { __type: 'Map', entries: Array.from(v.entries()) };
      if (v instanceof Set) return { __type: 'Set', values: Array.from(v) };
      if (v instanceof Date) return { __type: 'Date', value: v.toISOString() };
      if (Buffer.isBuffer(v)) return { __type: 'Buffer', value: v.toString('base64') };
      return v;
    });
  }

  deserialize<T>(data: string): T {
    return JSON.parse(data, (_, v) => {
      if (v && typeof v === 'object' && v.__type) {
        switch (v.__type) {
          case 'Map': return new Map(v.entries);
          case 'Set': return new Set(v.values);
          case 'Date': return new Date(v.value);
          case 'Buffer': return Buffer.from(v.value, 'base64');
        }
      }
      return v;
    });
  }

  estimateSerializedSize<T>(value: T): number {
    if (value === null || value === undefined) return 4;
    if (typeof value === 'string') return (value as string).length * 2 + 2;
    if (typeof value === 'number' || typeof value === 'boolean') return 8;
    if (Array.isArray(value)) return (value as any[]).length * 16 + 2;
    try {
      return JSON.stringify(value).length * 2;
    } catch {
      return 512;
    }
  }
}
