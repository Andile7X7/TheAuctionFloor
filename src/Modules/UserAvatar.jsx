import React from 'react';

const UserAvatar = ({ name, src, size = 32, fontSize = 14, className = '', style: customStyle = {}, bgColor }) => {
  const initial = (name || '').charAt(0).toUpperCase() || '?';
  
  const baseStyle = {
    width: `${size}px`,
    height: `${size}px`,
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    backgroundColor: bgColor || '#6366F1', // Standardized Brand Indigo or custom selection
    color: '#fff',
    fontWeight: 700,
    fontSize: `${fontSize}px`,
    overflow: 'hidden',
    userSelect: 'none',
    ...customStyle
  };

  if (src) {
    return (
      <div style={baseStyle} className={className}>
        <img 
          src={src} 
          alt={name || "User"} 
          style={{ width: '100%', height: '100%', objectFit: 'cover' }} 
        />
      </div>
    );
  }

  return (
    <div style={baseStyle} className={className}>
      {initial}
    </div>
  );
};

export default UserAvatar;
