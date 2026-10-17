// =====================================================================
// images.js ― 写真のリサイズ・JPEG 圧縮(Canvas)
//   本体:長辺1024px・品質0.7 から、data URL 長が 750,000 以下になるまで品質/サイズを下げる
//   サムネ:長辺240px、data URL 長 45,000 以下
//   EXIF の向き:createImageBitmap(file, {imageOrientation:'from-image'})
// =====================================================================
import { fitSize, compressionAttempts } from './utils.js';
import { LIMITS } from './schema.js';

export const PHOTO_MAX_LONG = 1024;
export const PHOTO_QUALITY = 0.7;
export const PHOTO_TARGET_LEN = 750000;
export const THUMB_MAX_LONG = 240;
export const THUMB_QUALITY = 0.7;
export const THUMB_TARGET_LEN = 45000;

/** 画像ファイルをデコード(向き補正込み) */
async function decode(file) {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch {
      try { return await createImageBitmap(file); } catch { /* 下のフォールバックへ */ }
    }
  }
  // フォールバック:<img>(最近のブラウザは EXIF の向きを自動適用)
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await img.decode();
    return img;
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

function sourceSize(src) {
  return { w: src.width || src.naturalWidth, h: src.height || src.naturalHeight };
}

function render(src, maxLong, quality) {
  const { w, h } = sourceSize(src);
  const size = fitSize(w, h, maxLong);
  const canvas = document.createElement('canvas');
  canvas.width = size.width;
  canvas.height = size.height;
  const ctx = canvas.getContext('2d');
  // 透過 PNG 対策:白(生成り)で下地を塗る
  ctx.fillStyle = '#FBF7EE';
  ctx.fillRect(0, 0, size.width, size.height);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, 0, 0, size.width, size.height);
  const data = canvas.toDataURL('image/jpeg', quality);
  canvas.width = 0; canvas.height = 0; // メモリ解放(iOS)
  return { data, width: size.width, height: size.height };
}

function encodeWithin(src, maxLong, quality, targetLen, minLong) {
  const attempts = compressionAttempts(maxLong, quality, { minLong, minQuality: 0.3 });
  let last = null;
  for (const a of attempts) {
    const r = render(src, a.maxLong, a.quality);
    if (!r.data.startsWith(LIMITS.JPEG_PREFIX)) throw new Error('JPEG に変換できませんでした');
    last = r;
    if (r.data.length <= targetLen) return r;
  }
  if (last && last.data.length <= targetLen) return last;
  throw new Error('写真を十分に小さくできませんでした');
}

/**
 * 画像ファイル → {data, thumb, width, height}
 * @param {File|Blob} file
 */
export async function processImage(file) {
  if (!file || !/^image\//.test(file.type || 'image/')) throw new Error('画像ファイルではありません');
  const src = await decode(file);
  try {
    const main = encodeWithin(src, PHOTO_MAX_LONG, PHOTO_QUALITY, PHOTO_TARGET_LEN, 320);
    const thumb = encodeWithin(src, THUMB_MAX_LONG, THUMB_QUALITY, THUMB_TARGET_LEN, 96);
    return { data: main.data, width: main.width, height: main.height, thumb: thumb.data };
  } finally {
    if (typeof src.close === 'function') src.close();
  }
}
