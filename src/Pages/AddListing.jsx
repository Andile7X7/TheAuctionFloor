import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../Modules/SupabaseClient';
import styles from './AddListing.module.css';
import UniversalHeader from '../Modules/UniversalHeader';
import { FaArrowLeft, FaCloudUploadAlt, FaSpinner, FaTimes } from 'react-icons/fa';

const AddListing = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  
  const [formData, setFormData] = useState({
    Make: '',
    Model: '',
    Year: '',
    StartingPrice: '',
    mileage: '',
    transmission: '',
    engine: '',
    location: ''
  });
  
  // Support up to 8 images (ImageURL + image2URL through image8URL)
  const [imageFiles, setImageFiles] = useState([null, null, null, null, null, null, null, null]);
  const [previewUrls, setPreviewUrls] = useState([null, null, null, null, null, null, null, null]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleFileChange = (index, e) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      setImageFiles(prev => {
        const updated = [...prev];
        updated[index] = file;
        return updated;
      });
      setPreviewUrls(prev => {
        const updated = [...prev];
        updated[index] = URL.createObjectURL(file);
        return updated;
      });
    }
  };

  const removeImage = (index) => {
    setImageFiles(prev => {
      const updated = [...prev];
      updated[index] = null;
      return updated;
    });
    setPreviewUrls(prev => {
      const updated = [...prev];
      if (updated[index]) URL.revokeObjectURL(updated[index]);
      updated[index] = null;
      return updated;
    });
  };

  const uploadImage = async (file, userId) => {
    const fileExt = file.name.split('.').pop();
    const fileName = `${userId}/${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
    
    const { error: uploadError } = await supabase.storage
      .from('Images')
      .upload(fileName, file, {
        cacheControl: '3600',
        upsert: false
      });

    if (uploadError) throw new Error(`Image Upload Failed: ${uploadError.message}`);

    const { data: signedUrlData, error: signedUrlError } = await supabase.storage
      .from('Images')
      .createSignedUrl(fileName, 60 * 60 * 24 * 365 * 10);
      
    if (signedUrlError) throw new Error(`URL Generation Failed: ${signedUrlError.message}`);
      
    return signedUrlData.signedUrl;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg("");
    setLoading(true);

    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) throw new Error("You must be logged in to create a listing.");

      if (!imageFiles[0]) throw new Error("Please upload at least the primary vehicle image.");

      // Upload all provided images
      const imageUrls = {};
      for (let i = 0; i < imageFiles.length; i++) {
        if (imageFiles[i]) {
          const url = await uploadImage(imageFiles[i], user.id);
          if (i === 0) {
            imageUrls.ImageURL = url;
          } else {
            imageUrls[`image${i + 1}url`] = url;
          }
        }
      }

      const priceNum = parseFloat(formData.StartingPrice);
      
      const { error: insertError } = await supabase
        .from('listings')
        .insert({
          userid: user.id,
          Make: formData.Make,
          Model: formData.Model,
          Year: formData.Year,
          StartingPrice: priceNum,
          CurrentPrice: priceNum,
          mileage: formData.mileage,
          transmission: formData.transmission,
          engine: formData.engine,
          location: formData.location,
          ...imageUrls
        });

      if (insertError) throw new Error(`Database Insert Failed: ${insertError.message}`);

      navigate('/dashboard');
      
    } catch (err) {
      console.error(err);
      setErrorMsg(err.message);
      setLoading(false);
    }
  };

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
    <div className={styles.pageContainer}>
      <UniversalHeader />
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
              <label className={styles.label}>Starting Price (ZAR)</label>
              <input 
                type="number" 
                name="StartingPrice" 
                placeholder="e.g. 2150000" 
                className={styles.input}
                value={formData.StartingPrice}
                onChange={handleInputChange}
                required 
                min="0"
                step="0.01"
              />
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
              <div key={index} className={`${styles.imageSlot} ${index === 0 ? styles.primarySlot : ''}`}>
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
                    <input 
                      type="file" 
                      accept="image/*" 
                      className={styles.fileInput} 
                      onChange={(e) => handleFileChange(index, e)}
                    />
                  </label>
                )}
              </div>
            ))}
          </div>

          <button type="submit" className={styles.submitBtn} disabled={loading}>
            {loading ? <><FaSpinner className="fa-spin" /> Uploading & Publishing...</> : 'Publish Listing'}
          </button>
        </form>

      </div>
    </div>
  );
};

export default AddListing;
