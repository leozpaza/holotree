import React, { useState } from 'react';
import { useUser, useSocket } from '../App';

function UserPresence() {
  const { user, users } = useUser();
  const socket = useSocket();
  const [isEditing, setIsEditing] = useState(false);
  const [tempName, setTempName] = useState('');

  const handleNameSubmit = (e) => {
    e.preventDefault();
    if (tempName.trim() && socket) {
      socket.emit('user:setName', tempName.trim());
      setIsEditing(false);
    }
  };

  const handleNameClick = () => {
    setTempName(user?.name || '');
    setIsEditing(true);
  };

  const getInitials = (name) => {
    return name?.split('-').map(p => p[0]).join('').toUpperCase().substring(0, 2) || '??';
  };

  const displayedUsers = users.slice(0, 5);
  const remainingCount = users.length - 5;

  return (
    <div className="user-presence">
      <div className="users-avatars">
        {displayedUsers.map((u) => (
          <div
            key={u.id}
            className={`user-avatar ${u.id === user?.id ? 'current' : ''}`}
            style={{ backgroundColor: u.color }}
            title={u.name}
          >
            {getInitials(u.name)}
          </div>
        ))}
        {remainingCount > 0 && (
          <div 
            className="user-avatar"
            style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }}
          >
            +{remainingCount}
          </div>
        )}
      </div>

      {isEditing ? (
        <form onSubmit={handleNameSubmit} style={{ display: 'flex', gap: '8px' }}>
          <input
            type="text"
            className="user-name-input"
            value={tempName}
            onChange={(e) => setTempName(e.target.value)}
            placeholder="Ваше имя"
            autoFocus
            onBlur={() => setIsEditing(false)}
          />
        </form>
      ) : (
        <div 
          className="users-count" 
          onClick={handleNameClick}
          style={{ cursor: 'pointer' }}
          title="Нажмите, чтобы изменить имя"
        >
          {user?.name || 'Гость'}
        </div>
      )}
    </div>
  );
}

export default UserPresence;
