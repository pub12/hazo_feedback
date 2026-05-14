import { generate_ref_id } from '../ref/ref_id.js';

const CROCKFORD_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const CROCKFORD_RE = new RegExp(`^[${CROCKFORD_ALPHABET}]{7}$`);

describe('generate_ref_id', () => {
  const UUID_A = '550e8400-e29b-41d4-a716-446655440000';
  const UUID_B = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';

  describe('output format', () => {
    it('returns a string starting with the uppercased appId followed by a dash', () => {
      const result = generate_ref_id(UUID_A, 'myapp', 1);
      expect(result.startsWith('MYAPP-')).toBe(true);
    });

    it('preserves appId casing after toUpperCase', () => {
      const result = generate_ref_id(UUID_A, 'TestApp', 1);
      expect(result.startsWith('TESTAPP-')).toBe(true);
    });

    it('encodes exactly 7 characters from the Crockford base32 alphabet after the dash', () => {
      const result = generate_ref_id(UUID_A, 'app', 1);
      const encoded = result.split('-').slice(1).join('-');
      expect(CROCKFORD_RE.test(encoded)).toBe(true);
    });

    it('produces a result in the form APPID-XXXXXXX (8 chars after removing prefix)', () => {
      const result = generate_ref_id(UUID_A, 'fb', 1);
      // "FB-" + 7 encoded chars
      expect(result).toMatch(/^FB-[0-9A-HJKMNP-TV-Z]{7}$/);
    });
  });

  describe('uniqueness', () => {
    it('different UUIDs produce different ref_ids for the same attempt', () => {
      const r1 = generate_ref_id(UUID_A, 'app', 1);
      const r2 = generate_ref_id(UUID_B, 'app', 1);
      expect(r1).not.toBe(r2);
    });

    it('attempt 1, 2, and 3 produce different ref_ids for the same UUID', () => {
      const r1 = generate_ref_id(UUID_A, 'app', 1);
      const r2 = generate_ref_id(UUID_A, 'app', 2);
      const r3 = generate_ref_id(UUID_A, 'app', 3);
      // All three must be distinct (UUID_A has varied bytes across all 12 covered bytes)
      expect(r1).not.toBe(r2);
      expect(r2).not.toBe(r3);
      expect(r1).not.toBe(r3);
    });
  });

  describe('byte-slice selection per attempt', () => {
    // UUID: 550e8400-e29b-41d4-a716-446655440000
    // Hex: 550e8400 e29b41d4 a716 4466 55440000
    // Bytes 0-3  (attempt 1): 550e8400
    // Bytes 4-7  (attempt 2): e29b41d4
    // Bytes 8-11 (attempt 3): a7164466
    //
    // We verify that each attempt encodes a different hex slice by checking
    // that swapping UUIDs whose bytes differ only in the relevant window
    // changes the result for the matching attempt but not others.

    it('attempt 1 uses the first 4 bytes (hex chars 0-7) of the UUID', () => {
      // Build two UUIDs that share bytes 4-15 but differ in bytes 0-3
      const uuid1 = '00000001-e29b-41d4-a716-446655440000';
      const uuid2 = '00000002-e29b-41d4-a716-446655440000';

      const r1 = generate_ref_id(uuid1, 'app', 1);
      const r2 = generate_ref_id(uuid2, 'app', 1);
      expect(r1).not.toBe(r2);

      // Attempt 2 should be the same because bytes 4-7 are identical
      const r1_att2 = generate_ref_id(uuid1, 'app', 2);
      const r2_att2 = generate_ref_id(uuid2, 'app', 2);
      expect(r1_att2).toBe(r2_att2);
    });

    it('attempt 2 uses bytes 4-7 of the UUID', () => {
      // Differ only in bytes 4-7
      const uuid1 = '550e8400-0000-0001-a716-446655440000';
      const uuid2 = '550e8400-0000-0002-a716-446655440000';

      const r1 = generate_ref_id(uuid1, 'app', 2);
      const r2 = generate_ref_id(uuid2, 'app', 2);
      expect(r1).not.toBe(r2);

      // Attempt 1 uses bytes 0-3, which are identical
      const r1_att1 = generate_ref_id(uuid1, 'app', 1);
      const r2_att1 = generate_ref_id(uuid2, 'app', 1);
      expect(r1_att1).toBe(r2_att1);
    });

    it('attempt 3 uses bytes 8-11 of the UUID', () => {
      // Differ only in bytes 8-11 (characters 16-23 of the stripped hex)
      // UUID format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
      // Bytes 8-11 span the 3rd segment and start of 4th: positions 16-23
      const uuid1 = '550e8400-e29b-41d4-0001-446655440000';
      const uuid2 = '550e8400-e29b-41d4-0002-446655440000';

      const r1 = generate_ref_id(uuid1, 'app', 3);
      const r2 = generate_ref_id(uuid2, 'app', 3);
      expect(r1).not.toBe(r2);

      // Attempts 1 and 2 use bytes 0-3 and 4-7, which are identical
      expect(generate_ref_id(uuid1, 'app', 1)).toBe(generate_ref_id(uuid2, 'app', 1));
      expect(generate_ref_id(uuid1, 'app', 2)).toBe(generate_ref_id(uuid2, 'app', 2));
    });
  });

  describe('appId handling', () => {
    it('correctly prepends the appId in uppercase', () => {
      const result = generate_ref_id(UUID_A, 'feedback', 1);
      expect(result.startsWith('FEEDBACK-')).toBe(true);
    });

    it('single-character appId is handled correctly', () => {
      const result = generate_ref_id(UUID_A, 'x', 1);
      expect(result.startsWith('X-')).toBe(true);
      const encoded = result.slice(2);
      expect(CROCKFORD_RE.test(encoded)).toBe(true);
    });

    it('numeric characters in appId are uppercased and preserved', () => {
      const result = generate_ref_id(UUID_A, 'app2', 1);
      expect(result.startsWith('APP2-')).toBe(true);
    });
  });

  describe('determinism', () => {
    it('returns the same value for the same inputs', () => {
      const r1 = generate_ref_id(UUID_A, 'app', 1);
      const r2 = generate_ref_id(UUID_A, 'app', 1);
      expect(r1).toBe(r2);
    });

    it('is deterministic across all three attempts', () => {
      for (const attempt of [1, 2, 3] as const) {
        expect(generate_ref_id(UUID_B, 'hazo', attempt)).toBe(
          generate_ref_id(UUID_B, 'hazo', attempt)
        );
      }
    });
  });
});
