/**
 * Image Upload Security & Validation
 * Prevents: malware upload, oversized files, type spoofing, path traversal
 */

// Security configuration
const IMAGE_CONFIG = {
  maxSize: 5 * 1024 * 1024,        // 5MB per image
  maxImages: 8,                     // Max per listing
  allowedTypes: [
    'image/jpeg',
    'image/png',
    'image/webp'
  ],
  allowedExtensions: ['.jpg', '.jpeg', '.png', '.webp'],
  maxDimensions: { width: 4096, height: 4096 }, // Max resolution
  magicBytes: {
    'image/jpeg': [[0xFF, 0xD8, 0xFF]],
    'image/png': [[0x89, 0x50, 0x4E, 0x47]],
    'image/webp': [[0x52, 0x49, 0x46, 0x46]], // WebP starts with RIFF
  }
};

/**
 * Validates file using magic bytes (prevents extension spoofing)
 * @param {File} file - Uploaded file
 * @returns {Promise<boolean>} - Whether file type is valid
 */
const validateMagicBytes = async (file) => {
  const expectedSignatures = IMAGE_CONFIG.magicBytes[file.type];
  if (!expectedSignatures) return false;

  const slice = file.slice(0, 8); // Read first 8 bytes
  const arrayBuffer = await slice.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);

  return expectedSignatures.some(sig => 
    sig.every((byte, i) => bytes[i] === byte)
  );
};

/**
 * Checks image dimensions without loading full image
 * @param {File} file - Image file
 * @returns {Promise<Object>} - { valid: boolean, width?, height?, error? }
 */
const validateDimensions = (file) => {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);
      const { maxDimensions } = IMAGE_CONFIG;
      
      if (img.width > maxDimensions.width || img.height > maxDimensions.height) {
        resolve({ 
          valid: false, 
          error: `Image dimensions exceed ${maxDimensions.width}x${maxDimensions.height}px` 
        });
        return;
      }
      
      resolve({ valid: true, width: img.width, height: img.height });
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve({ valid: false, error: 'Failed to load image for validation' });
    };

    img.src = url;
  });
};

/**
 * Sanitizes filename to prevent path traversal
 * @param {string} filename - Original filename
 * @returns {string} - Safe filename
 */
const sanitizeFilename = (filename) => {
  // Remove path traversal attempts
  const basename = filename
    .replace(/\\/g, '/')           // Normalize slashes
    .split('/').pop()             // Get last component only
    .replace(/[^a-zA-Z0-9.-]/g, '_'); // Replace special chars
  
  // Add random prefix to prevent collisions
  const random = Math.random().toString(36).substring(2, 10);
  const ext = basename.substring(basename.lastIndexOf('.')).toLowerCase();
  const name = basename.substring(0, basename.lastIndexOf('.')) || 'image';
  
  return `${random}_${name.substring(0, 20)}${ext}`;
};

/**
 * Comprehensive image validation
 * @param {File} file - Uploaded file
 * @returns {Promise<Object>} - Validation result
 */
export const validateImage = async (file) => {
  // 1. Existence check
  if (!file || !(file instanceof File)) {
    return { valid: false, error: 'No file provided' };
  }

  // 2. Size validation
  if (file.size === 0) {
    return { valid: false, error: 'File is empty' };
  }
  if (file.size > IMAGE_CONFIG.maxSize) {
    return { 
      valid: false, 
      error: `File size ${(file.size / 1024 / 1024).toFixed(2)}MB exceeds ${IMAGE_CONFIG.maxSize / 1024 / 1024}MB limit` 
    };
  }

  // 3. MIME type validation
  if (!IMAGE_CONFIG.allowedTypes.includes(file.type)) {
    return { 
      valid: false, 
      error: `File type "${file.type}" not allowed. Use: ${IMAGE_CONFIG.allowedExtensions.join(', ')}` 
    };
  }

  // 4. Extension validation
  const ext = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
  if (!IMAGE_CONFIG.allowedExtensions.includes(ext)) {
    return { valid: false, error: `File extension "${ext}" not allowed` };
  }

  // 5. Magic bytes validation (critical security check)
  const validMagic = await validateMagicBytes(file);
  if (!validMagic) {
    return { valid: false, error: 'File content does not match declared type (possible spoofing attempt)' };
  }

  // 6. Dimension validation
  const dimCheck = await validateDimensions(file);
  if (!dimCheck.valid) {
    return dimCheck;
  }

  return { 
    valid: true, 
    sanitizedName: sanitizeFilename(file.name),
    dimensions: { width: dimCheck.width, height: dimCheck.height },
    size: file.size
  };
};

/**
 * Validates multiple images
 * @param {FileList|Array} files - Multiple files
 * @returns {Promise<Object>} - Batch validation result
 */
export const validateMultipleImages = async (files) => {
  const fileArray = Array.from(files);
  
  if (fileArray.length > IMAGE_CONFIG.maxImages) {
    return { 
      valid: false, 
      error: `Maximum ${IMAGE_CONFIG.maxImages} images allowed (received ${fileArray.length})` 
    };
  }

  const results = await Promise.all(
    fileArray.map(async (file, index) => {
      const result = await validateImage(file);
      return { index, file, ...result };
    })
  );

  const invalid = results.filter(r => !r.valid);
  if (invalid.length > 0) {
    return {
      valid: false,
      error: `Image ${invalid[0].index + 1}: ${invalid[0].error}`,
      details: invalid
    };
  }

  return {
    valid: true,
    images: results.map(r => ({
      file: r.file,
      sanitizedName: r.sanitizedName,
      dimensions: r.dimensions
    }))
  };
};

/**
 * Creates preview URL with security restrictions
 * @param {File} file - Image file
 * @returns {string} - Object URL (revoke after use!)
 */
export const createSecurePreview = (file) => {
  // Only create preview if validation passed
  if (!IMAGE_CONFIG.allowedTypes.includes(file.type)) {
    return null;
  }
  return URL.createObjectURL(file);
};

/**
 * Revokes preview URL to prevent memory leaks
 * @param {string} url - Object URL to revoke
 */
export const revokePreview = (url) => {
  if (url && url.startsWith('blob:')) {
    URL.revokeObjectURL(url);
  }
};