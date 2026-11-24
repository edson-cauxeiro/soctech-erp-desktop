import { describe, it, expect } from 'vitest';
import { canonicalize } from './canonical';

describe('canonicalize', () => {
  it('ordena chaves de forma determinística', () => {
    const a = { b: 1, a: { d: 4, c: 3 } };
    const b = { a: { c: 3, d: 4 }, b: 1 };
    expect(canonicalize(a)).toBe(canonicalize(b));
    expect(canonicalize(a)).toBe('{"a":{"c":3,"d":4},"b":1}');
  });

  it('preserva a ordem dos arrays e omite undefined', () => {
    expect(canonicalize({ x: [3, 1, 2], y: undefined, z: null })).toBe('{"x":[3,1,2],"z":null}');
  });
});
