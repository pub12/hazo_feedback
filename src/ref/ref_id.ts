const CROCKFORD_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

function encode_uint32_crockford(value: number): string {
  let n = value >>> 0;
  const chars: string[] = [];
  for (let i = 0; i < 7; i++) {
    chars.push(CROCKFORD_ALPHABET[n % 32]);
    n = Math.floor(n / 32);
  }
  return chars.reverse().join('');
}

export function generate_ref_id(uuid: string, appId: string, attempt: 1 | 2 | 3): string {
  const hex = uuid.replace(/-/g, '');
  const byte_offset = (attempt - 1) * 4;
  const hex_slice = hex.slice(byte_offset * 2, byte_offset * 2 + 8);
  const uint32 = parseInt(hex_slice, 16) >>> 0;
  const encoded = encode_uint32_crockford(uint32);
  return `${appId}-${encoded}`.toUpperCase();
}
