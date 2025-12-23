import React, { useEffect, useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import Image from '@tiptap/extension-image';
import CodeBlock from '@tiptap/extension-code-block';
import * as Y from 'yjs';
import { useSocket, useUser, useNodes } from '../App';
import './ArticleModal.css';

function ArticleModal({ node, onClose }) {
  const socket = useSocket();
  const { user, users } = useUser();
  const { updateNode } = useNodes();
  const [title, setTitle] = useState(node.title || '');
  const [tags, setTags] = useState(node.tags || []);
  const [tagInput, setTagInput] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState(null);
  const [remoteCursors, setRemoteCursors] = useState([]);
  const [usersInNode, setUsersInNode] = useState([]);
  const ydocRef = useRef(null);
  const saveTimeoutRef = useRef(null);
  const editorContainerRef = useRef(null);

  // Initialize Y.Doc
  useEffect(() => {
    ydocRef.current = new Y.Doc();
    return () => {
      ydocRef.current?.destroy();
    };
  }, []);

  // Initialize editor
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [1, 2, 3]
        }
      }),
      Placeholder.configure({
        placeholder: 'Начните писать...'
      }),
      Image.configure({
        inline: true,
        allowBase64: true
      }),
      CodeBlock.configure({
        HTMLAttributes: {
          class: 'code-block'
        }
      })
    ],
    content: '',
    onUpdate: ({ editor }) => {
      debouncedSave(editor.getJSON());
    }
  });

  // Load content and join socket room
  useEffect(() => {
    if (!socket || !node.id) return;

    socket.emit('node:join', node.id);

    socket.on('node:sync', ({ nodeId, state }) => {
      if (nodeId === node.id && ydocRef.current) {
        try {
          const update = Uint8Array.from(atob(state), c => c.charCodeAt(0));
          Y.applyUpdate(ydocRef.current, update);
        } catch (e) {
          console.error('Error applying sync:', e);
        }
      }
    });

    socket.on('node:update', ({ nodeId, update }) => {
      if (nodeId === node.id && ydocRef.current) {
        try {
          const updateBuffer = Uint8Array.from(atob(update), c => c.charCodeAt(0));
          Y.applyUpdate(ydocRef.current, updateBuffer);
        } catch (e) {
          console.error('Error applying update:', e);
        }
      }
    });

    socket.on('cursor:update', ({ userId, user: remoteUser, cursor }) => {
      setRemoteCursors(prev => {
        const filtered = prev.filter(c => c.userId !== userId);
        if (cursor) {
          return [...filtered, { userId, user: remoteUser, cursor }];
        }
        return filtered;
      });
    });

    socket.on('user:joined', (joinedUser) => {
      setUsersInNode(prev => {
        if (!prev.find(u => u.id === joinedUser.id)) {
          return [...prev, joinedUser];
        }
        return prev;
      });
    });

    socket.on('user:left', (leftUser) => {
      setUsersInNode(prev => prev.filter(u => u.id !== leftUser.id));
      setRemoteCursors(prev => prev.filter(c => c.userId !== leftUser.id));
    });

    return () => {
      socket.emit('node:leave', node.id);
      socket.off('node:sync');
      socket.off('node:update');
      socket.off('cursor:update');
      socket.off('user:joined');
      socket.off('user:left');
    };
  }, [socket, node.id]);

  // Load initial content into editor
  useEffect(() => {
    if (editor && node.content) {
      try {
        const content = typeof node.content === 'string' 
          ? JSON.parse(node.content) 
          : node.content;
        
        if (content.type === 'doc') {
          editor.commands.setContent(content);
        }
      } catch (e) {
        console.error('Error loading content:', e);
      }
    }
  }, [editor, node.id]);

  // Debounced save
  const debouncedSave = useCallback((content) => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = setTimeout(async () => {
      setIsSaving(true);
      try {
        await updateNode(node.id, { content });
        setLastSaved(new Date());
      } catch (e) {
        console.error('Save error:', e);
      } finally {
        setIsSaving(false);
      }
    }, 2000);
  }, [node.id, updateNode]);

  // Save title
  const handleTitleChange = useCallback((e) => {
    const newTitle = e.target.value;
    setTitle(newTitle);
    
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    
    saveTimeoutRef.current = setTimeout(async () => {
      await updateNode(node.id, { title: newTitle });
      setLastSaved(new Date());
    }, 1000);
  }, [node.id, updateNode]);

  // Handle tags
  const handleAddTag = useCallback((e) => {
    if (e.key === 'Enter' && tagInput.trim()) {
      const newTag = tagInput.trim().toLowerCase();
      if (!tags.includes(newTag)) {
        const newTags = [...tags, newTag];
        setTags(newTags);
        updateNode(node.id, { tags: newTags });
      }
      setTagInput('');
    }
  }, [tagInput, tags, node.id, updateNode]);

  const handleRemoveTag = useCallback((tagToRemove) => {
    const newTags = tags.filter(t => t !== tagToRemove);
    setTags(newTags);
    updateNode(node.id, { tags: newTags });
  }, [tags, node.id, updateNode]);

  // Handle file upload
  const handleDrop = useCallback(async (e) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer?.files || []);
    
    for (const file of files) {
      if (file.type.startsWith('image/')) {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('nodeId', node.id);

        try {
          const response = await fetch('/api/upload', {
            method: 'POST',
            body: formData
          });
          const data = await response.json();
          
          if (data.url && editor) {
            editor.chain().focus().setImage({ src: data.url }).run();
          }
        } catch (e) {
          console.error('Upload error:', e);
        }
      }
    }
  }, [editor, node.id]);

  const handleDragOver = (e) => {
    e.preventDefault();
  };

  // Toolbar actions
  const toggleBold = () => editor?.chain().focus().toggleBold().run();
  const toggleItalic = () => editor?.chain().focus().toggleItalic().run();
  const toggleCode = () => editor?.chain().focus().toggleCode().run();
  const toggleCodeBlock = () => editor?.chain().focus().toggleCodeBlock().run();
  const setHeading = (level) => editor?.chain().focus().toggleHeading({ level }).run();

  const formatDate = (date) => {
    if (!date) return '';
    return new Date(date).toLocaleString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <AnimatePresence>
      <motion.div 
        className="modal-overlay"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      >
        <motion.div 
          className="article-modal"
          initial={{ opacity: 0, y: 50, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 50, scale: 0.95 }}
          transition={{ duration: 0.25, type: 'spring', damping: 25 }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <header className="modal-header">
            <input
              type="text"
              className="modal-title-input"
              value={title}
              onChange={handleTitleChange}
              placeholder="Заголовок статьи"
            />
            <button className="modal-close-btn" onClick={onClose}>
              ✕
            </button>
          </header>

          {/* Meta info */}
          <div className="modal-meta">
            <span className="meta-item">
              <span className="meta-label">Создано:</span>
              {formatDate(node.created_at)}
            </span>
            <span className="meta-item">
              <span className="meta-label">Обновлено:</span>
              {formatDate(node.updated_at)}
            </span>
            {usersInNode.length > 0 && (
              <span className="meta-item editors">
                <span className="meta-label">Редактируют:</span>
                {usersInNode.map(u => (
                  <span 
                    key={u.id} 
                    className="editor-badge"
                    style={{ backgroundColor: u.color }}
                  >
                    {u.name}
                  </span>
                ))}
              </span>
            )}
            {isSaving && <span className="saving-indicator">Сохранение...</span>}
            {!isSaving && lastSaved && (
              <span className="saved-indicator">✓ Сохранено</span>
            )}
          </div>

          {/* Tags */}
          <div className="modal-tags">
            {tags.map((tag) => (
              <span key={tag} className="tag-chip">
                {tag}
                <button 
                  className="tag-remove"
                  onClick={() => handleRemoveTag(tag)}
                >
                  ×
                </button>
              </span>
            ))}
            <input
              type="text"
              className="tag-input"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={handleAddTag}
              placeholder="Добавить тег..."
            />
          </div>

          {/* Toolbar */}
          <div className="editor-toolbar">
            <button 
              className={`toolbar-btn ${editor?.isActive('heading', { level: 1 }) ? 'active' : ''}`}
              onClick={() => setHeading(1)}
              title="Заголовок 1"
            >
              H1
            </button>
            <button 
              className={`toolbar-btn ${editor?.isActive('heading', { level: 2 }) ? 'active' : ''}`}
              onClick={() => setHeading(2)}
              title="Заголовок 2"
            >
              H2
            </button>
            <div className="toolbar-divider" />
            <button 
              className={`toolbar-btn ${editor?.isActive('bold') ? 'active' : ''}`}
              onClick={toggleBold}
              title="Жирный (Ctrl+B)"
            >
              B
            </button>
            <button 
              className={`toolbar-btn italic ${editor?.isActive('italic') ? 'active' : ''}`}
              onClick={toggleItalic}
              title="Курсив (Ctrl+I)"
            >
              I
            </button>
            <button 
              className={`toolbar-btn mono ${editor?.isActive('code') ? 'active' : ''}`}
              onClick={toggleCode}
              title="Код"
            >
              {'</>'}
            </button>
            <button 
              className={`toolbar-btn ${editor?.isActive('codeBlock') ? 'active' : ''}`}
              onClick={toggleCodeBlock}
              title="Блок кода"
            >
              {'{ }'}
            </button>
          </div>

          {/* Editor */}
          <div 
            ref={editorContainerRef}
            className="editor-container"
            onDrop={handleDrop}
            onDragOver={handleDragOver}
          >
            <EditorContent editor={editor} className="tiptap-editor" />
            
            {/* Remote cursors */}
            {remoteCursors.map(({ userId, user: remoteUser, cursor }) => (
              <div
                key={userId}
                className="remote-cursor"
                style={{
                  left: cursor.x,
                  top: cursor.y,
                  borderColor: remoteUser.color
                }}
              >
                <span 
                  className="cursor-label"
                  style={{ backgroundColor: remoteUser.color }}
                >
                  {remoteUser.name}
                </span>
              </div>
            ))}
          </div>

          {/* Footer */}
          <footer className="modal-footer">
            <span className="footer-hint">
              Перетащите изображение для загрузки • Изменения сохраняются автоматически
            </span>
          </footer>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

export default ArticleModal;
