/**
 * Reverse the PNG row predictors (DecodeParms /Predictor >= 10) that
 * FlateDecode image streams commonly use.
 * @param {Uint8Array} data - Inflated stream: one filter-type byte + row bytes per row
 * @param {number} columns - Pixels per row
 * @param {number} colors - Components per pixel
 * @param {number} bpc - Bits per component
 * @returns {Uint8Array} Raw, unfiltered sample rows
 */
export function unpredictPng(data, columns, colors, bpc) {
  const bpp = Math.max(1, Math.ceil((colors * bpc) / 8));
  const rowLen = Math.ceil((columns * colors * bpc) / 8);
  const rows = Math.floor(data.length / (rowLen + 1));
  const out = new Uint8Array(rows * rowLen);
  let prev = new Uint8Array(rowLen);

  for (let r = 0; r < rows; r++) {
    const filter = data[r * (rowLen + 1)];
    const src = r * (rowLen + 1) + 1;
    const cur = out.subarray(r * rowLen, (r + 1) * rowLen);

    for (let i = 0; i < rowLen; i++) {
      const raw = data[src + i];
      const left = i >= bpp ? cur[i - bpp] : 0;
      const up = prev[i];
      const upLeft = i >= bpp ? prev[i - bpp] : 0;

      switch (filter) {
        case 0: cur[i] = raw; break;
        case 1: cur[i] = (raw + left) & 0xff; break;
        case 2: cur[i] = (raw + up) & 0xff; break;
        case 3: cur[i] = (raw + ((left + up) >> 1)) & 0xff; break;
        case 4: {
          const p = left + up - upLeft;
          const pa = Math.abs(p - left);
          const pb = Math.abs(p - up);
          const pc = Math.abs(p - upLeft);
          const pred = pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft;
          cur[i] = (raw + pred) & 0xff;
          break;
        }
        default:
          throw new Error(`Unsupported PNG filter type ${filter}`);
      }
    }
    prev = cur;
  }

  return out;
}
