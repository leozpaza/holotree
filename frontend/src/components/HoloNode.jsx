import React, { memo, useState } from 'react';
import { Handle, Position } from '@xyflow/react';
import { motion } from 'framer-motion';
import { useNodes } from '../App';
import './HoloNode.css';

const HoloNode = memo(({ data, selected }) => {
  const { createNode, deleteNode } = useNodes();
  const [showActions, setShowActions] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  const handleAddChild = async (e) => {
    e.stopPropagation();
    // Создаём дочерний узел со смещением относительно родителя
    const offset = { x: 50, y: 150 };
    await createNode(data.id, {
      x: (data.position_x || 0) + offset.x,
      y: (data.position_y || 0) + offset.y
    });
  };

  const handleDelete = async (e) => {
    e.stopPropagation();
    if (!data.isRoot && window.confirm('Удалить этот узел и все дочерние?')) {
      await deleteNode(data.id);
    }
  };

  return (
    <motion.div
      className={`holo-node ${data.isRoot ? 'root' : ''} ${selected ? 'selected' : ''} ${data.isHighlighted ? 'highlighted' : ''}`}
      initial={{ opacity: 0, scale: 0.5 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.3, type: 'spring' }}
      onMouseEnter={() => {
        setIsHovered(true);
        setShowActions(true);
      }}
      onMouseLeave={() => {
        setIsHovered(false);
        setShowActions(false);
      }}
    >
      {!data.isRoot && (
        <Handle 
          type="target" 
          position={Position.Top} 
          className="holo-handle"
        />
      )}
      
      <div className="holo-node-content">
        <div className="holo-node-icon">
          {data.isRoot ? '◈' : '○'}
        </div>
        <div className="holo-node-title">
          {data.title || 'Без названия'}
        </div>
        {data.tags && data.tags.length > 0 && (
          <div className="holo-node-tags">
            {data.tags.slice(0, 3).map((tag, i) => (
              <span key={i} className="holo-tag">{tag}</span>
            ))}
          </div>
        )}
      </div>

      {showActions && (
        <motion.div 
          className="holo-node-actions"
          initial={{ opacity: 0, y: -5 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <button 
            className="holo-action-btn add"
            onClick={handleAddChild}
            title="Добавить дочерний узел"
          >
            +
          </button>
          {!data.isRoot && (
            <button 
              className="holo-action-btn delete"
              onClick={handleDelete}
              title="Удалить узел"
            >
              ×
            </button>
          )}
        </motion.div>
      )}

      <Handle 
        type="source" 
        position={Position.Bottom} 
        className="holo-handle"
      />

      {/* Glow effect */}
      <div className={`holo-glow ${isHovered ? 'active' : ''}`} />
    </motion.div>
  );
});

HoloNode.displayName = 'HoloNode';

export default HoloNode;
