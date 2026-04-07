import React, { useState, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../Modules/SupabaseClient';
import styles from './AddListing.module.css';
import UniversalHeader from '../Modules/UniversalHeader';
import { FaArrowLeft, FaCloudUploadAlt, FaSpinner, FaTimes } from 'react-icons/fa';
import { 
  validateMultipleImages, 
  createSecurePreview, 
  revokePreview 
} from '../utils/imageSecurity';
import { getCurrentUser } from '../utils/authSecurity';
import { compressImage } from '../utils/imageCompression';
import { sanitizeListingField } from '../utils/contentSanitizer';

const AddListing = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  
  const [formData, setFormData] = useState({
    Make: '',
    Model: '',
    Year: '',
    ReservePrice: '',
    mileage: '',
    transmission: '',
    engine: '',
    location: ''
  });
  
  // Support up to 8 images with validation state
  const [imageFiles, setImageFiles] = useState(Array(8).fill(null));
  const [previewUrls, setPreviewUrls] = useState(Array(8).fill(null));
  const [imageErrors, setImageErrors] = useState({}); // Track validation errors per slot

  // ⬇️⬇️⬇️ CLEANUP PREVIEWS ON UNMOUNT ⬇️⬇️⬇️
  useEffect(() => {
    return () => {
      previewUrls.forEach(url => {
        if (url) revokePreview(url);
      });
    };
  }, []);
  // ⬆️⬆️⬆️ CLEANUP PREVIEWS ON UNMOUNT ⬆️⬆️⬆️

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  // ⬇️⬇️⬇️ REPLACE handleFileChange WITH SECURE VERSION ⬇️⬇️⬇️
  const handleFileChange = useCallback(async (index, e) => {
    if (!e.target.files || e.target.files.length === 0) return;
    
    const file = e.target.files[0];
    
    // Clear previous error for this slot
    setImageErrors(prev => {
      const updated = { ...prev };
      delete updated[index];
      return updated;
    });

    // Validate using security utility
    const validation = await validateMultipleImages([file]);
    
    if (!validation.valid) {
      setImageErrors(prev => ({ ...prev, [index]: validation.error }));
      // Reset file input
      e.target.value = '';
      return;
    }

    const imageData = validation.images[0];

    // ── Compress before storing (Canvas → JPEG, max 1920×1080 @ 85%) ──
    let compressedFile;
    try {
      const blob = await compressImage(file);
      compressedFile = new File([blob], imageData.sanitizedName, { type: 'image/jpeg' });
    } catch (compressionErr) {
      console.warn('[AddListing] Compression failed, using original:', compressionErr);
      compressedFile = file; // Graceful fallback — never block the upload
    }

    // Revoke old preview to prevent memory leak
    if (previewUrls[index]) {
      revokePreview(previewUrls[index]);
    }

    // Preview from original (instant) — upload uses compressed
    const securePreviewUrl = createSecurePreview(file);

    setImageFiles(prev => {
      const updated = [...prev];
      updated[index] = {
        file: compressedFile,          // Compressed file for upload
        sanitizedName: imageData.sanitizedName,
        dimensions: imageData.dimensions,
        validated: true
      };
      return updated;
    });

    setPreviewUrls(prev => {
      const updated = [...prev];
      updated[index] = securePreviewUrl;
      return updated;
    });
  }, [previewUrls]);
  // ⬆️⬆️⬆️ REPLACE handleFileChange WITH SECURE VERSION ⬆️⬆️⬆️

  // ⬇️⬇️⬇️ REPLACE removeImage WITH SECURE VERSION ⬇️⬇️⬇️
  const removeImage = useCallback((index) => {
    // Revoke preview URL to free memory
    if (previewUrls[index]) {
      revokePreview(previewUrls[index]);
    }

    setImageFiles(prev => {
      const updated = [...prev];
      updated[index] = null;
      return updated;
    });

    setPreviewUrls(prev => {
      const updated = [...prev];
      updated[index] = null;
      return updated;
    });

    // Clear error for this slot
    setImageErrors(prev => {
      const updated = { ...prev };
      delete updated[index];
      return updated;
    });
  }, [previewUrls]);
  // ⬆️⬆️⬆️ REPLACE removeImage WITH SECURE VERSION ⬆️⬆️⬆️

  // ⬇️⬇️⬇️ REPLACE uploadImage WITH SECURE VERSION ⬇️⬇️⬇️
  const uploadImage = useCallback(async (imageData, _userId, index) => {
    if (!imageData || !imageData.validated) {
      throw new Error(`Image ${index + 1} failed validation`);
    }

    // Unguessable path — use getRandomValues which works in both HTTP (dev) and HTTPS (prod).
    // crypto.randomUUID() requires a secure context and fails over local network HTTP.
    const uniqueId = ([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g, c =>
      (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)
    );
    const filePath = `listings/${uniqueId}_${imageData.sanitizedName}`;

    const { error: uploadError } = await supabase.storage
      .from('Images')
      .upload(filePath, imageData.file, {
        cacheControl: '31536000', // 1 year — images are immutable once uploaded
        upsert: false,
        contentType: 'image/jpeg', // Always JPEG after compression
      });

    if (uploadError) throw new Error(`Image ${index + 1} upload failed: ${uploadError.message}`);

    // Public URL — works with Supabase Image Transformations
    const { data } = supabase.storage
      .from('Images')
      .getPublicUrl(filePath);

    return data.publicUrl;
  }, []);
  // ⬆️⬆️⬆️ REPLACE uploadImage WITH SECURE VERSION ⬆️⬆️⬆️

  // ⬇️⬇️⬇️ REPLACE handleSubmit WITH SECURE VERSION ⬇️⬇️⬇️
  const handleSubmit = useCallback(async (e) => {
    e.preventDefault();
    setErrorMsg("");
    setLoading(true);

    try {
      // Use secure user getter
      const user = await getCurrentUser();
      if (!user) throw new Error("You must be logged in to create a listing.");

      // Check for any image validation errors
      const hasImageErrors = Object.keys(imageErrors).length > 0;
      if (hasImageErrors) {
        throw new Error("Please fix image errors before submitting.");
      }

      if (!imageFiles[0]) throw new Error("Please upload at least the primary vehicle image.");

      // Upload all provided images using validated data
      const imageUrls = {};
      for (let i = 0; i < imageFiles.length; i++) {
        if (imageFiles[i]) {
          const url = await uploadImage(imageFiles[i], user.id, i);
          if (i === 0) {
            imageUrls.ImageURL = url;
          } else if (i < 7) {
            // Postgres schema only has up to image7url. We safely drop extra images instead of crashing the Database insert.
            imageUrls[`image${i + 1}url`] = url;
          }
        }
      }

      // Sanitize listing text fields
      const sanitizedMake = sanitizeListingField(formData.Make, { maxLength: 100 });
      if (!sanitizedMake.valid) throw new Error(`Make: ${sanitizedMake.error}`);

      const sanitizedModel = sanitizeListingField(formData.Model, { maxLength: 150 });
      if (!sanitizedModel.valid) throw new Error(`Model: ${sanitizedModel.error}`);

      const sanitizedYear = formData.Year.trim();
      const yearNum = parseInt(sanitizedYear, 10);
      if (isNaN(yearNum) || yearNum < 1900 || yearNum > new Date().getFullYear() + 1) {
        throw new Error('Please enter a valid vehicle year (1900–' + (new Date().getFullYear() + 1) + ').');
      }

      const sanitizedMileage = formData.mileage?.trim() || null;
      const sanitizedTransmission = formData.transmission?.trim() || null;
      const sanitizedEngine = formData.engine?.trim() || null;

      // Validate price
      const reserveNum = parseFloat(formData.ReservePrice);
      if (isNaN(reserveNum) || reserveNum <= 5000) {
        throw new Error("Please enter a valid reserve price (minimum R5000).");
      }
      
      // Calculate closing time (default 7 days)
      const closingDate = new Date();
      closingDate.setDate(closingDate.getDate() + 7);

      // Check seller verification status for listing approval flow
      const { data: sellerData } = await supabase
        .from('users')
        .select('seller_verified')
        .eq('userid', user.id)
        .single();

      const isVerifiedSeller = sellerData?.seller_verified ?? false;
      const isSampleReview = isVerifiedSeller && Math.random() < 0.10;
      const listingVerified = isVerifiedSeller;

      const { error: insertError } = await supabase
        .from('listings')
        .insert({
          userid: user.id,
          Make: sanitizedMake.sanitized,
          Model: sanitizedModel.sanitized,
          Year: sanitizedYear,
          StartingPrice: 5000,
          CurrentPrice: 5000,
          ReservePrice: reserveNum,
          closes_at: closingDate.toISOString(),
          mileage: sanitizedMileage,
          transmission: sanitizedTransmission,
          engine: sanitizedEngine,
          location: formData.location || null,
          verified: listingVerified,
          sample_review: isSampleReview,
          ...imageUrls
        });

      if (insertError) throw new Error(`Database Insert Failed: ${insertError.message}`);

      // Redirect to dashboard with a message about review status
      navigate('/dashboard', {
        state: { listingStatus: listingVerified ? 'live' : 'pending' }
      });
      
    } catch (err) {
      console.error(err);
      setErrorMsg(err.message);
    } finally {
      setLoading(false);
    }
  }, [formData, imageFiles, imageErrors, uploadImage, navigate]);
  // ⬆️⬆️⬆️ REPLACE handleSubmit WITH SECURE VERSION ⬆️⬆️⬆️

  const imageLabels = [
    'Main Image *',
    'Exterior Angle 2',
    'Exterior Angle 3',
    'Interior',
    'Engine Bay',
    'Dashboard',
    'Detail Shot',
    'Additional'
  ];

  return (
    <div className={styles.pageWrapper}>
      <UniversalHeader />
      <div className={styles.pageContainer}>
      <div className={styles.formCard}>
        
        <div className={styles.headerRow}>
          <div>
            <h1 className={styles.title}>List New Vehicle</h1>
            <p className={styles.subtitle}>Fill in the details below to publish your vehicle to the auction floor.</p>
          </div>
          <button className={styles.backBtn} onClick={() => navigate('/dashboard')} type="button">
            <FaArrowLeft /> Back to Dashboard
          </button>
        </div>

        {errorMsg && <div className={styles.errorBox}>{errorMsg}</div>}

        <form className={styles.form} onSubmit={handleSubmit}>
          
          {/* Section: Vehicle Info */}
          <div className={styles.sectionLabel}>Vehicle Information</div>
          
          <div className={styles.row}>
            <div className={styles.inputGroup}>
              <label className={styles.label}>Make</label>
              <input 
                type="text" 
                name="Make" 
                placeholder="e.g. Porsche" 
                className={styles.input}
                value={formData.Make}
                onChange={handleInputChange}
                required 
              />
            </div>
            <div className={styles.inputGroup}>
              <label className={styles.label}>Model</label>
              <input 
                type="text" 
                name="Model" 
                placeholder="e.g. 911 GT3 RS" 
                className={styles.input}
                value={formData.Model}
                onChange={handleInputChange}
                required 
              />
            </div>
          </div>

          <div className={styles.row}>
            <div className={styles.inputGroup}>
              <label className={styles.label}>Year</label>
              <input 
                type="text" 
                name="Year" 
                placeholder="e.g. 2023" 
                className={styles.input}
                value={formData.Year}
                onChange={handleInputChange}
                required 
              />
            </div>
            <div className={styles.inputGroup}>
              <label className={styles.label}>Reserve Price (ZAR)</label>
              <input 
                type="number" 
                name="ReservePrice" 
                placeholder="e.g. 2150000" 
                className={styles.input}
                value={formData.ReservePrice}
                onChange={handleInputChange}
                required 
                min="5000"
                step="0.01"
              />
              <span style={{fontSize: '12px', color: '#9CA3AF', marginTop: '4px'}}>All listings open at R5,000. Your reserve is hidden.</span>
            </div>
          </div>

          {/* Section: Specs */}
          <div className={styles.sectionLabel}>Specifications</div>

          <div className={styles.row}>
            <div className={styles.inputGroup}>
              <label className={styles.label}>Mileage</label>
              <input 
                type="text" 
                name="mileage" 
                placeholder="e.g. 12,400 km" 
                className={styles.input}
                value={formData.mileage}
                onChange={handleInputChange}
              />
            </div>
            <div className={styles.inputGroup}>
              <label className={styles.label}>Transmission</label>
              <input 
                type="text" 
                name="transmission" 
                placeholder="e.g. 7-Spd PDK" 
                className={styles.input}
                value={formData.transmission}
                onChange={handleInputChange}
              />
            </div>
          </div>

          <div className={styles.row}>
            <div className={styles.inputGroup}>
              <label className={styles.label}>Engine</label>
              <input 
                type="text" 
                name="engine" 
                placeholder="e.g. 4.0L Flat-6" 
                className={styles.input}
                value={formData.engine}
                onChange={handleInputChange}
              />
            </div>
            <div className={styles.inputGroup}>
              <label className={styles.label}>Location</label>
              <select 
                name="location" 
                className={styles.input}
                value={formData.location}
                onChange={handleInputChange}
              >
                <option value="">Select Province</option>
                <option value="Eastern Cape">Eastern Cape</option>
                <option value="Free State">Free State</option>
                <option value="Gauteng">Gauteng</option>
                <option value="KwaZulu-Natal">KwaZulu-Natal</option>
                <option value="Limpopo">Limpopo</option>
                <option value="Mpumalanga">Mpumalanga</option>
                <option value="North West">North West</option>
                <option value="Northern Cape">Northern Cape</option>
                <option value="Western Cape">Western Cape</option>
              </select>
            </div>
          </div>

          {/* Section: Images */}
          <div className={styles.sectionLabel}>Vehicle Gallery</div>
          <p className={styles.sectionHint}>Upload up to 8 images. The first image is the main listing photo.</p>

          <div className={styles.imageGrid}>
            {imageLabels.map((label, index) => (
              <div 
                key={index} 
                className={`${styles.imageSlot} ${index === 0 ? styles.primarySlot : ''} ${imageErrors[index] ? styles.errorSlot : ''}`}
              >
                {previewUrls[index] ? (
                  <div className={styles.previewWrap}>
                    <img src={previewUrls[index]} alt={label} className={styles.previewImage} />
                    <button type="button" className={styles.removeBtn} onClick={() => removeImage(index)}>
                      <FaTimes />
                    </button>
                    <span className={styles.slotLabel}>{label}</span>
                  </div>
                ) : (
                  <label className={styles.fileLabel}>
                    <FaCloudUploadAlt className={styles.uploadIcon} />
                    <span className={styles.slotLabelEmpty}>{label}</span>
                    {/* ⬇️⬇️⬇️ UPDATED INPUT WITH SECURITY ATTRIBUTES ⬇️⬇️⬇️ */}
                    <input 
                      type="file" 
                      accept="image/jpeg,image/png,image/webp"
                      className={styles.fileInput} 
                      onChange={(e) => handleFileChange(index, e)}
                    />
                    {/* ⬆️⬆️⬆️ UPDATED INPUT WITH SECURITY ATTRIBUTES ⬆️⬆️⬆️ */}
                  </label>
                )}
                {/* ⬇️⬇️⬇️ ERROR DISPLAY FOR THIS SLOT ⬇️⬇️⬇️ */}
                {imageErrors[index] && (
                  <div className={styles.imageError} role="alert">
                    {imageErrors[index]}
                  </div>
                )}
                {/* ⬆️⬆️⬆️ ERROR DISPLAY FOR THIS SLOT ⬆️⬆️⬆️ */}
              </div>
            ))}
          </div>

          <button type="submit" className={styles.submitBtn} disabled={loading}>
            {loading ? <><FaSpinner className="fa-spin" /> Uploading & Publishing...</> : 'Publish Listing'}
          </button>
        </form>

      </div>
      </div>
    </div>
  );
};

export default AddListing;