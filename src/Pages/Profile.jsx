import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../Modules/SupabaseClient';
import DashboardLayout from '../Modules/DashboardLayout';
import UserAvatar from '../Modules/UserAvatar';
import styles from './Profile.module.css';
import { FaCamera, FaTrashAlt, FaLock, FaCheckCircle, FaUserCircle, FaSpinner, FaSun, FaMoon, FaCog } from 'react-icons/fa';

const Profile = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  
  // Profile State
  const [profile, setProfile] = useState({
    firstname: '',
    lastname: '',
    email: '',
    avatar_url: ''
  });
  
  // Password State
  const [passwords, setPasswords] = useState({
    newPassword: '',
    confirmPassword: ''
  });
  
  // Deletion State
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [confirmDeletePassword, setConfirmDeletePassword] = useState('');
  
  // Theme state
  const [theme, setTheme] = useState(document.documentElement.getAttribute('data-theme') || 'dark');

  const toggleTheme = (newTheme) => {
    setTheme(newTheme);
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
  };
  
  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) {
          navigate('/signup');
          return;
        }
        setUser(user);
        
        try {
          // Attempt full selection
          const { data, error } = await supabase
            .from('users')
            .select('firstname, lastname, avatar_url, avatar_bg')
            .eq('userid', user.id)
            .maybeSingle();

          if (error) throw error;

          if (data) {
             setProfile({
               firstname: data.firstname || '',
               lastname: data.lastname || '',
               email: user.email || '',
               avatar_url: data.avatar_url || user.user_metadata?.avatar_url || '',
               avatar_bg: data.avatar_bg || user.user_metadata?.avatar_bg || '#6366F1'
             });
          } else {
             setProfile({
               firstname: user.user_metadata?.firstname || '',
               lastname: user.user_metadata?.lastname || '',
               email: user.email || '',
               avatar_url: user.user_metadata?.avatar_url || '',
               avatar_bg: user.user_metadata?.avatar_bg || '#6366F1'
             });
          }
        } catch (err) {
          // Fallback if columns missing
          const { data: basicData } = await supabase
            .from('users')
            .select('firstname, lastname')
            .eq('userid', user.id)
            .maybeSingle();
          
          setProfile({
            firstname: basicData?.firstname || user.user_metadata?.firstname || '',
            lastname: basicData?.lastname || user.user_metadata?.lastname || '',
            email: user.email || '',
            avatar_url: user.user_metadata?.avatar_url || '',
            avatar_bg: user.user_metadata?.avatar_bg || '#6366F1'
          });
        }
      } catch (err) {
        console.error("Error loading profile:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchProfile();
  }, [navigate]);

  const handleProfileChange = (e) => {
    const { name, value } = e.target;
    setProfile(prev => ({ ...prev, [name]: value }));
  };

  const updatePersonalInfo = async (e) => {
    e.preventDefault();
    setSaving(true);
    setMessage('');
    try {
      // 1. Update Auth Email if changed
      if (profile.email !== user.email) {
        const { error: emailError } = await supabase.auth.updateUser({ email: profile.email });
        if (emailError) throw emailError;
        setMessage('Check your new email for a confirmation link.');
      }

      // 2. Update Metadata
      const { error: metaError } = await supabase.auth.updateUser({
        data: {
          firstname: profile.firstname,
          lastname: profile.lastname
        }
      });
      if (metaError) throw metaError;

      // 3. Update Users table
      const { error: dbError } = await supabase
        .from('users')
        .upsert({
          userid: user.id,
          firstname: profile.firstname,
          lastname: profile.lastname,
          updated_at: new Date()
        }, { onConflict: 'userid' });
      
      if (dbError) throw dbError;

      setMessage('Profile updated successfully!');
    } catch (err) {
      console.error(err);
      alert(err.message);
    } finally {
      setSaving(false);
    }
  };

  const updatePassword = async (e) => {
    e.preventDefault();
    if (passwords.newPassword !== passwords.confirmPassword) {
      alert("Passwords do not match.");
      return;
    }
    
    setSaving(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: passwords.newPassword });
      if (error) throw error;
      setPasswords({ newPassword: '', confirmPassword: '' });
      setMessage('Password updated successfully!');
    } catch (err) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleAvatarUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setSaving(true);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${user.id}/avatar_${Date.now()}.${fileExt}`;
      
      const { error: uploadError } = await supabase.storage
        .from('Images')
        .upload(fileName, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { data: signedUrlData } = await supabase.storage
        .from('Images')
        .createSignedUrl(fileName, 60 * 60 * 24 * 365 * 10);

      const publicUrl = signedUrlData.signedUrl;

      // Update local and remote identity
      setProfile(prev => ({ ...prev, avatar_url: publicUrl }));
      
      await supabase.auth.updateUser({ data: { avatar_url: publicUrl } });
      await supabase.from('users').upsert({ userid: user.id, avatar_url: publicUrl });

      setMessage('Avatar updated successfully!');
    } catch (err) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (!confirmDeletePassword) {
      alert("Please enter your password to confirm.");
      return;
    }
    
    setSaving(true);
    try {
      // Re-authentication usually required or custom RPC. 
      // Simplified: delete data and sign out.
      
      const { error: delError } = await supabase.from('users').delete().eq('userid', user.id);
      if (delError) throw delError;

      // Note: Full auth deletion often requires administrative privileges or specialized RPC.
      await supabase.auth.signOut();
      navigate('/');
    } catch (err) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  };

  const updateAvatarBg = async (color) => {
    setSaving(true);
    try {
      setProfile(prev => ({ ...prev, avatar_bg: color, avatar_url: '' }));
      
      await supabase.auth.updateUser({ data: { avatar_bg: color, avatar_url: '' } });
      await supabase.from('users').upsert({ 
        userid: user.id, 
        avatar_bg: color, 
        avatar_url: '' // Clearing URL when picking a shade
      });

      setMessage('Theme avatar updated!');
    } catch (err) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <DashboardLayout user={user}><div className={styles.loadingArea}>Loading Studio...</div></DashboardLayout>;

  return (
    <DashboardLayout user={user}>
      <div className={styles.profileContainer}>
        <div className={styles.header}>
          <h1 className={styles.title}>Account Studio</h1>
          <p className={styles.subtitle}>Manage your global identity and security settings.</p>
        </div>

        {message && (
          <div className={styles.toast}>
            <FaCheckCircle /> {message}
          </div>
        )}

        <div className={styles.contentGrid}>
          {/* Identity Card */}
          <div className={styles.card}>
            <h3 className={styles.cardTitle}>Identity</h3>
            <div className={styles.avatarSection}>
              <UserAvatar 
                name={profile.firstname} 
                src={profile.avatar_url} 
                bgColor={profile.avatar_bg}
                size={120} 
                fontSize={40} 
              />
              <div className={styles.avatarActions}>
                <label className={styles.uploadBtn}>
                  <FaCamera /> Update Picture
                  <input type="file" hidden onChange={handleAvatarUpload} accept="image/*" />
                </label>
                <p className={styles.helperText}>JPG, PNG or GIF. Max 5MB.</p>
              </div>
            </div>
            
            <div className={styles.standardAvatars}>
              <p className={styles.helperText}>Or choose a standard shade:</p>
              <div className={styles.colorGrid}>
                  {['#6366F1', '#EF4444', '#10B981', '#F59E0B', '#8B5CF6', '#EC4899'].map(color => (
                    <div 
                      key={color} 
                      className={`${styles.colorPill} ${profile.avatar_bg === color ? styles.activePill : ''}`} 
                      style={{backgroundColor: color}}
                      onClick={() => updateAvatarBg(color)}
                    ></div>
                  ))}
              </div>
            </div>
          </div>

          {/* Personal Info Card */}
          <div className={styles.card}>
            <h3 className={styles.cardTitle}>Personal Information</h3>
            <form onSubmit={updatePersonalInfo}>
              <div className={styles.formRow}>
                <div className={styles.formGroup}>
                  <label>First Name</label>
                  <input 
                    type="text" 
                    name="firstname" 
                    value={profile.firstname} 
                    onChange={handleProfileChange} 
                    required 
                  />
                </div>
                <div className={styles.formGroup}>
                  <label>Last Name</label>
                  <input 
                    type="text" 
                    name="lastname" 
                    value={profile.lastname} 
                    onChange={handleProfileChange} 
                    required 
                  />
                </div>
              </div>
              <div className={styles.formGroup}>
                <label>Email Address</label>
                <input 
                  type="email" 
                  name="email" 
                  value={profile.email} 
                  onChange={handleProfileChange} 
                  required 
                />
              </div>
              <button type="submit" className={styles.saveBtn} disabled={saving}>
                {saving ? <FaSpinner className={styles.spin} /> : 'Save Changes'}
              </button>
            </form>
          </div>

          {/* Security Card */}
          <div className={styles.card}>
            <h3 className={styles.cardTitle}>Security</h3>
            <form onSubmit={updatePassword}>
              <div className={styles.formGroup}>
                <label>New Password</label>
                <div className={styles.passwordWrap}>
                  <FaLock className={styles.inputIcon} />
                  <input 
                    type="password" 
                    placeholder="Enter new password"
                    value={passwords.newPassword}
                    onChange={(e) => setPasswords(prev => ({ ...prev, newPassword: e.target.value }))}
                    required 
                  />
                </div>
              </div>
              <div className={styles.formGroup}>
                <label>Confirm Password</label>
                <div className={styles.passwordWrap}>
                  <FaLock className={styles.inputIcon} />
                  <input 
                    type="password" 
                    placeholder="Repeat password"
                    value={passwords.confirmPassword}
                    onChange={(e) => setPasswords(prev => ({ ...prev, confirmPassword: e.target.value }))}
                    required 
                  />
                </div>
              </div>
              <button type="submit" className={styles.saveBtn} disabled={saving}>
                Update Password
              </button>
            </form>
          </div>

          {/* Preferences Card */}
          <div className={styles.card}>
            <div className={styles.cardHeaderWithIcon}>
              <FaCog className={styles.headerIconSmall} />
              <h3 className={styles.cardTitle}>Global Preferences</h3>
            </div>
            <p className={styles.helperText}>Customize your viewing experience across the platform.</p>
            
            <div className={styles.themeToggleArea}>
              <label className={styles.inputLabel}>Interface Theme</label>
              <div className={styles.themeButtons}>
                <button 
                  className={`${styles.themeBtn} ${theme === 'dark' ? styles.activeTheme : ''}`}
                  onClick={() => toggleTheme('dark')}
                >
                  <FaMoon /> Dark Edition
                </button>
                <button 
                  className={`${styles.themeBtn} ${theme === 'light' ? styles.activeTheme : ''}`}
                  onClick={() => toggleTheme('light')}
                >
                  <FaSun /> Light Edition
                </button>
              </div>
            </div>
          </div>

          {/* Danger Zone */}
          <div className={`${styles.card} ${styles.dangerCard}`}>
            <h3 className={styles.cardTitle}>Danger Zone</h3>
            <p className={styles.helperText}>Permanently delete your account and all associated auction data.</p>
            <button className={styles.deleteBtn} onClick={() => setShowDeleteModal(true)}>
              <FaTrashAlt /> Delete My Account
            </button>
          </div>
        </div>
      </div>

      {/* Delete Modal */}
      {showDeleteModal && (
        <div className={styles.modalOverlay}>
          <div className={styles.modalContent}>
            <h2 className={styles.modalTitle}>Delete your account?</h2>
            <p className={styles.modalSub}>
              This action is irreversible. All your listings, bid history, and notifications will be scrubbed from our systems.
            </p>
            <div className={styles.passwordConfirmArea}>
              <label>Re-enter password to confirm deletion</label>
              <input 
                type="password" 
                placeholder="Your password" 
                value={confirmDeletePassword}
                onChange={(e) => setConfirmDeletePassword(e.target.value)}
              />
            </div>
            <div className={styles.modalActions}>
              <button className={styles.modalCancel} onClick={() => setShowDeleteModal(false)}>Cancel</button>
              <button className={styles.modalConfirm} onClick={handleDeleteAccount} disabled={saving}>
                {saving ? 'Processing...' : 'Permanently Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
};

export default Profile;
