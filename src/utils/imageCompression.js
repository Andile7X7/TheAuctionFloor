/**
 * imageCompression.js
 * Client-side image compression using HTML5 Canvas.
 * Reduces file size 60–70% before upload without visible quality loss.
 */

const DEFAULT_MAX_WIDTH  = 1920;
const DEFAULT_MAX_HEIGHT = 1080;
const DEFAULT_QUALITY    = 0.85;

/**
 * Compress an image File/Blob to JPEG using Canvas.
 * @param {File} file - The original image file
 * @param {object} options
 * @param {number} options.maxWidth  - Max output width  (default 1920)
 * @param {number} options.maxHeight - Max output height (default 1080)
 * @param {number} options.quality   - JPEG quality 0–1 (default 0.85)
 * @returns {Promise<Blob>} Compressed JPEG blob
 */
export const compressImage = (
  file,
  {
    maxWidth  = DEFAULT_MAX_WIDTH,
    maxHeight = DEFAULT_MAX_HEIGHT,
    quality   = DEFAULT_QUALITY,
  } = {}
) => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(objectUrl); // Free memory immediately

      // Calculate scaled dimensions preserving aspect ratio
      let { width, height } = img;
      const widthRatio  = maxWidth  / width;
      const heightRatio = maxHeight / height;
      const scale = Math.min(1, widthRatio, heightRatio); // Never upscale

      const targetWidth  = Math.round(width  * scale);
      const targetHeight = Math.round(height * scale);

      // Draw onto off-screen canvas
      const canvas = document.createElement('canvas');
      canvas.width  = targetWidth;
      canvas.height = targetHeight;

      const ctx = canvas.getContext('2d');
      ctx.imageSmoothingEnabled  = true;
      ctx.imageSmoothingQuality  = 'high';
      ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error('Canvas compression failed — toBlob returned null'));
            return;
          }
          resolve(blob);
        },
        'image/jpeg',
        quality
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Failed to load image for compression'));
    };

    img.src = objectUrl;
  });
};

/**
 * Convert a Supabase Storage public URL to a responsive transform URL.
 * Uses Supabase Image Transformations: ?width=X&height=Y&resize=cover&quality=Z
 *
 * @param {string} baseUrl   - The stored public URL
 * @param {object} options
 * @param {number} options.width   - Target width in pixels
 * @param {number} options.height  - Target height in pixels (optional)
 * @param {number} options.quality - JPEG quality 1-100 (default 80)
 * @param {string} options.format  - Output format: 'webp'|'jpeg'|'png' (default 'webp')
 * @returns {string} Transform URL
 */
export const getTransformUrl = (baseUrl, options = {}) => {
  if (!baseUrl) return '';
  
  const {
    width,
    height,
    quality = 80,
    format = 'webp'
  } = options;

  // Build transformation params
  const params = new URLSearchParams();
  if (width) params.set('width', String(width));
  if (height) params.set('height', String(height));
  if (quality) params.set('quality', String(quality));
  if (format) params.set('format', format);
  params.set('resize', 'cover'); // Always cover to avoid distortion

  // Check if URL already has params
  const separator = baseUrl.includes('?') ? '&' : '?';
  return `${baseUrl}${separator}${params.toString()}`;
};

/**
 * Build a srcSet string for responsive images.
 * Usage: <img srcSet={buildSrcSet(url)} sizes="..." />
 *
 * @param {string} baseUrl
 * @param {number[]} widths - Array of widths (default [200, 400, 800])
 * @returns {string}
 */
export const buildSrcSet = (baseUrl, widths = [200, 400, 800]) => {
  if (!baseUrl) return '';
  return widths
    .map(w => `${getTransformUrl(baseUrl, { width: w })} ${w}w`)
    .join(', ');
};

/**
 * Preload an image for smoother UX
 */
export const preloadImage = (url) => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(url);
    img.onerror = () => reject(url);
    img.src = url;
  });
};
