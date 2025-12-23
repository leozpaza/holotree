import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import initSqlJs from 'sql.js';
import * as Y from 'yjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ============ CONFIGURATION ============
const config = {
  port: process.env.PORT || 3001,
  dataDir: process.env.DB_PATH ? path.dirname(process.env.DB_PATH) : path.join(__dirname, 'data'),
  dbPath: process.env.DB_PATH || path.join(__dirname, 'data', 'holotree.db'),
  backupDir: process.env.BACKUP_DIR || path.join(__dirname, 'backups'),
  uploadsDir: process.env.UPLOADS_DIR || path.join(__dirname, 'uploads'),
  backupInterval: parseInt(process.env.BACKUP_INTERVAL) || 300000, // 5 минут по умолчанию
  backupKeepCount: parseInt(process.env.BACKUP_KEEP_COUNT) || 50, // Хранить 50 последних бэкапов
  autoSaveInterval: 10000 // 10 секунд для автосохранения основной БД
};

// Создаём необходимые директории
[config.dataDir, config.backupDir, config.uploadsDir].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    console.log(`📁 Created directory: ${dir}`);
  }
});

// ============ EXPRESS SETUP ============
const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE']
  }
});

app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Static files for uploads
const uploadsDir = config.uploadsDir;
const imagesDir = path.join(uploadsDir, 'images');
const filesDir = path.join(uploadsDir, 'files');
const thumbsDir = path.join(uploadsDir, 'thumbs');

[imagesDir, filesDir, thumbsDir].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

app.use('/uploads', express.static(uploadsDir));

// Serve frontend static files
const publicDir = path.join(__dirname, 'public');
app.use(express.static(publicDir));

// ============ DATABASE SETUP ============
let db;
const dbPath = config.dbPath;

async function initDatabase() {
  const SQL = await initSqlJs();
  
  // Load existing database or create new one
  if (fs.existsSync(dbPath)) {
    const fileBuffer = fs.readFileSync(dbPath);
    db = new SQL.Database(fileBuffer);
  } else {
    db = new SQL.Database();
  }

  // Create tables
  db.run(`
    CREATE TABLE IF NOT EXISTS nodes (
      id TEXT PRIMARY KEY,
      parent_id TEXT,
      title TEXT NOT NULL DEFAULT 'Новый узел',
      content TEXT,
      position_x REAL DEFAULT 0,
      position_y REAL DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      author_id TEXT,
      last_editor_id TEXT
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS tags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS node_tags (
      node_id TEXT,
      tag_id INTEGER,
      PRIMARY KEY (node_id, tag_id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS assets (
      id TEXT PRIMARY KEY,
      file_path TEXT NOT NULL,
      thumb_path TEXT,
      original_name TEXT,
      mime_type TEXT,
      size INTEGER,
      node_id TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  // Check if root node exists, create if not
  const rootNode = db.exec('SELECT id FROM nodes WHERE parent_id IS NULL');
  if (rootNode.length === 0 || rootNode[0].values.length === 0) {
    const rootId = uuidv4();
    db.run(`
      INSERT INTO nodes (id, parent_id, title, content, position_x, position_y, author_id)
      VALUES (?, NULL, ?, ?, 0, 0, 'system')
    `, [rootId, 'База знаний', JSON.stringify({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Добро пожаловать в HoloTree!' }] }] })]);
    console.log('Root node created:', rootId);
    saveDatabase();
  }
  
  console.log('✅ Database initialized');
  console.log(`📂 Database path: ${dbPath}`);
  console.log(`💾 Backup directory: ${config.backupDir}`);
}

// ============ BACKUP SYSTEM ============
function saveDatabase() {
  try {
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(dbPath, buffer);
    console.log(`💾 Database saved: ${new Date().toISOString()}`);
    return true;
  } catch (error) {
    console.error('❌ Error saving database:', error);
    return false;
  }
}

function createBackup() {
  try {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    const backupPath = path.join(config.backupDir, `holotree-${timestamp}.db`);
    
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(backupPath, buffer);
    
    console.log(`🔄 Backup created: ${backupPath}`);
    
    // Ротация старых бэкапов
    rotateBackups();
    return backupPath;
  } catch (error) {
    console.error('❌ Error creating backup:', error);
    return null;
  }
}

function rotateBackups() {
  try {
    const files = fs.readdirSync(config.backupDir)
      .filter(f => f.startsWith('holotree-') && f.endsWith('.db'))
      .map(f => ({
        name: f,
        path: path.join(config.backupDir, f),
        time: fs.statSync(path.join(config.backupDir, f)).mtime.getTime()
      }))
      .sort((a, b) => b.time - a.time);
    
    // Удаляем старые бэкапы, оставляя только N последних
    if (files.length > config.backupKeepCount) {
      const toDelete = files.slice(config.backupKeepCount);
      toDelete.forEach(file => {
        fs.unlinkSync(file.path);
        console.log(`🗑️  Deleted old backup: ${file.name}`);
      });
    }
  } catch (error) {
    console.error('❌ Error rotating backups:', error);
  }
}

function restoreFromBackup(backupPath) {
  try {
    if (!fs.existsSync(backupPath)) {
      console.error('❌ Backup file not found:', backupPath);
      return false;
    }
    
    fs.copyFileSync(backupPath, dbPath);
    console.log(`♻️  Restored from backup: ${backupPath}`);
    return true;
  } catch (error) {
    console.error('❌ Error restoring backup:', error);
    return false;
  }
}

function listBackups() {
  try {
    const files = fs.readdirSync(config.backupDir)
      .filter(f => f.startsWith('holotree-') && f.endsWith('.db'))
      .map(f => {
        const stat = fs.statSync(path.join(config.backupDir, f));
        return {
          name: f,
          path: path.join(config.backupDir, f),
          size: stat.size,
          created: stat.mtime
        };
      })
      .sort((a, b) => b.created - a.created);
    
    return files;
  } catch (error) {
    console.error('❌ Error listing backups:', error);
    return [];
  }
}

// Автосохранение основной БД каждые 10 секунд
const autoSaveInterval = setInterval(() => {
  if (db) saveDatabase();
}, config.autoSaveInterval);

// Автоматическое создание бэкапов каждые N минут
const backupInterval = setInterval(() => {
  if (db) createBackup();
}, config.backupInterval);

console.log(`⏰ Auto-save: every ${config.autoSaveInterval / 1000}s`);
console.log(`⏰ Auto-backup: every ${config.backupInterval / 60000} minutes`);

// Helper function to convert sql.js results to objects
function queryToObjects(result) {
  if (!result || result.length === 0) return [];
  const columns = result[0].columns;
  return result[0].values.map(row => {
    const obj = {};
    columns.forEach((col, i) => {
      obj[col] = row[i];
    });
    return obj;
  });
}

function queryOne(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  if (stmt.step()) {
    const columns = stmt.getColumnNames();
    const values = stmt.get();
    stmt.free();
    const obj = {};
    columns.forEach((col, i) => {
      obj[col] = values[i];
    });
    return obj;
  }
  stmt.free();
  return null;
}

function queryAll(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const results = [];
  while (stmt.step()) {
    const columns = stmt.getColumnNames();
    const values = stmt.get();
    const obj = {};
    columns.forEach((col, i) => {
      obj[col] = values[i];
    });
    results.push(obj);
  }
  stmt.free();
  return results;
}

// ============ YJS DOCUMENTS ============
const yDocs = new Map();

function getYDoc(nodeId) {
  if (!yDocs.has(nodeId)) {
    const ydoc = new Y.Doc();
    
    // Load existing content
    const node = queryOne('SELECT content FROM nodes WHERE id = ?', [nodeId]);
    if (node && node.content) {
      try {
        const parsed = JSON.parse(node.content);
        if (parsed.yUpdate) {
          const update = Buffer.from(parsed.yUpdate, 'base64');
          Y.applyUpdate(ydoc, update);
        }
      } catch (e) {
        console.error('Error loading Y.Doc:', e);
      }
    }
    
    yDocs.set(nodeId, ydoc);
  }
  return yDocs.get(nodeId);
}

// ============ FILE UPLOAD ============
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const isImage = file.mimetype.startsWith('image/');
    cb(null, isImage ? imagesDir : filesDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const filename = `${uuidv4()}${ext}`;
    cb(null, filename);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB
});

app.post('/api/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const assetId = uuidv4();
    const isImage = req.file.mimetype.startsWith('image/');
    let thumbPath = null;

    const relativePath = isImage
      ? path.join('images', req.file.filename)
      : path.join('files', req.file.filename);

    db.run(`
      INSERT INTO assets (id, file_path, thumb_path, original_name, mime_type, size, node_id)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [
      assetId,
      relativePath,
      thumbPath,
      req.file.originalname,
      req.file.mimetype,
      req.file.size,
      req.body.nodeId || null
    ]);
    saveDatabase();

    res.json({
      id: assetId,
      url: `/uploads/${relativePath}`,
      thumbUrl: thumbPath ? `/uploads/${thumbPath}` : null,
      originalName: req.file.originalname,
      mimeType: req.file.mimetype,
      size: req.file.size
    });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============ REST API ============

// Get all nodes
app.get('/api/nodes', (req, res) => {
  try {
    const nodes = queryAll(`
      SELECT n.*, GROUP_CONCAT(t.name) as tags
      FROM nodes n
      LEFT JOIN node_tags nt ON n.id = nt.node_id
      LEFT JOIN tags t ON nt.tag_id = t.id
      GROUP BY n.id
    `);

    const nodesWithTags = nodes.map(node => ({
      ...node,
      tags: node.tags ? node.tags.split(',') : []
    }));

    res.json(nodesWithTags);
  } catch (error) {
    console.error('Error fetching nodes:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get single node
app.get('/api/nodes/:id', (req, res) => {
  try {
    const nodes = queryAll(`
      SELECT n.*, GROUP_CONCAT(t.name) as tags
      FROM nodes n
      LEFT JOIN node_tags nt ON n.id = nt.node_id
      LEFT JOIN tags t ON nt.tag_id = t.id
      WHERE n.id = ?
      GROUP BY n.id
    `, [req.params.id]);

    if (nodes.length === 0) {
      return res.status(404).json({ error: 'Node not found' });
    }

    const node = nodes[0];
    node.tags = node.tags ? node.tags.split(',') : [];
    res.json(node);
  } catch (error) {
    console.error('Error fetching node:', error);
    res.status(500).json({ error: error.message });
  }
});

// Create node
app.post('/api/nodes', (req, res) => {
  try {
    const { parentId, title, positionX, positionY, authorId } = req.body;
    const id = uuidv4();

    db.run(`
      INSERT INTO nodes (id, parent_id, title, position_x, position_y, author_id, content)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [id, parentId, title || 'Новый узел', positionX || 0, positionY || 0, authorId || 'anonymous', JSON.stringify({ type: 'doc', content: [] })]);
    
    saveDatabase();

    const node = queryOne('SELECT * FROM nodes WHERE id = ?', [id]);
    
    // Broadcast to all clients
    io.emit('node:created', node);
    
    res.status(201).json(node);
  } catch (error) {
    console.error('Error creating node:', error);
    res.status(500).json({ error: error.message });
  }
});

// Update node
app.put('/api/nodes/:id', (req, res) => {
  try {
    const { title, content, positionX, positionY, lastEditorId, tags } = req.body;
    
    if (title !== undefined) {
      db.run('UPDATE nodes SET title = ? WHERE id = ?', [title, req.params.id]);
    }
    if (content !== undefined) {
      const contentStr = typeof content === 'string' ? content : JSON.stringify(content);
      db.run('UPDATE nodes SET content = ? WHERE id = ?', [contentStr, req.params.id]);
    }
    if (positionX !== undefined) {
      db.run('UPDATE nodes SET position_x = ? WHERE id = ?', [positionX, req.params.id]);
    }
    if (positionY !== undefined) {
      db.run('UPDATE nodes SET position_y = ? WHERE id = ?', [positionY, req.params.id]);
    }
    if (lastEditorId !== undefined) {
      db.run('UPDATE nodes SET last_editor_id = ? WHERE id = ?', [lastEditorId, req.params.id]);
    }
    
    db.run("UPDATE nodes SET updated_at = datetime('now') WHERE id = ?", [req.params.id]);

    // Update tags
    if (tags !== undefined) {
      db.run('DELETE FROM node_tags WHERE node_id = ?', [req.params.id]);
      
      for (const tagName of tags) {
        let existingTag = queryOne('SELECT id FROM tags WHERE name = ?', [tagName]);
        let tagId;
        if (existingTag) {
          tagId = existingTag.id;
        } else {
          db.run('INSERT INTO tags (name) VALUES (?)', [tagName]);
          const newTag = queryOne('SELECT id FROM tags WHERE name = ?', [tagName]);
          tagId = newTag.id;
        }
        db.run('INSERT OR IGNORE INTO node_tags (node_id, tag_id) VALUES (?, ?)', [req.params.id, tagId]);
      }
    }

    saveDatabase();

    const nodes = queryAll(`
      SELECT n.*, GROUP_CONCAT(t.name) as tags
      FROM nodes n
      LEFT JOIN node_tags nt ON n.id = nt.node_id
      LEFT JOIN tags t ON nt.tag_id = t.id
      WHERE n.id = ?
      GROUP BY n.id
    `, [req.params.id]);

    const node = nodes[0];
    node.tags = node.tags ? node.tags.split(',') : [];
    
    // Broadcast update
    io.emit('node:updated', node);
    
    res.json(node);
  } catch (error) {
    console.error('Error updating node:', error);
    res.status(500).json({ error: error.message });
  }
});

// Delete node
app.delete('/api/nodes/:id', (req, res) => {
  try {
    const node = queryOne('SELECT parent_id FROM nodes WHERE id = ?', [req.params.id]);
    if (node && node.parent_id === null) {
      return res.status(400).json({ error: 'Cannot delete root node' });
    }

    // Delete children recursively
    const deleteRecursive = (nodeId) => {
      const children = queryAll('SELECT id FROM nodes WHERE parent_id = ?', [nodeId]);
      for (const child of children) {
        deleteRecursive(child.id);
      }
      db.run('DELETE FROM node_tags WHERE node_id = ?', [nodeId]);
      db.run('DELETE FROM nodes WHERE id = ?', [nodeId]);
    };

    deleteRecursive(req.params.id);
    saveDatabase();
    
    // Broadcast deletion
    io.emit('node:deleted', { id: req.params.id });
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting node:', error);
    res.status(500).json({ error: error.message });
  }
});

// Search nodes
app.get('/api/search', (req, res) => {
  try {
    const { q } = req.query;
    if (!q) {
      return res.json([]);
    }

    const searchTerm = `%${q}%`;
    const nodes = queryAll(`
      SELECT DISTINCT n.id, n.title, n.parent_id
      FROM nodes n
      LEFT JOIN node_tags nt ON n.id = nt.node_id
      LEFT JOIN tags t ON nt.tag_id = t.id
      WHERE n.title LIKE ? OR n.content LIKE ? OR t.name LIKE ?
      LIMIT 20
    `, [searchTerm, searchTerm, searchTerm]);

    res.json(nodes);
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get all tags
app.get('/api/tags', (req, res) => {
  try {
    const tags = queryAll('SELECT * FROM tags ORDER BY name');
    res.json(tags);
  } catch (error) {
    console.error('Error fetching tags:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============ SOCKET.IO ============
const activeUsers = new Map();
const userColors = ['#00ffff', '#ff00ff', '#ffff00', '#00ff00', '#ff6b6b', '#4ecdc4', '#45b7d1', '#96ceb4', '#ffeaa7', '#dfe6e9'];

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);
  
  // Assign random color and name
  const userColor = userColors[Math.floor(Math.random() * userColors.length)];
  const userName = `User-${socket.id.substring(0, 4)}`;
  
  const user = {
    id: socket.id,
    name: userName,
    color: userColor,
    currentNode: null,
    cursor: null
  };
  
  activeUsers.set(socket.id, user);
  
  // Send user info
  socket.emit('user:init', user);
  
  // Broadcast user joined
  io.emit('users:update', Array.from(activeUsers.values()));

  // User sets their name
  socket.on('user:setName', (name) => {
    const user = activeUsers.get(socket.id);
    if (user) {
      user.name = name;
      activeUsers.set(socket.id, user);
      io.emit('users:update', Array.from(activeUsers.values()));
    }
  });

  // User opens a node for editing
  socket.on('node:join', (nodeId) => {
    const user = activeUsers.get(socket.id);
    if (user) {
      // Leave previous node
      if (user.currentNode) {
        socket.leave(`node:${user.currentNode}`);
      }
      
      // Join new node room
      user.currentNode = nodeId;
      socket.join(`node:${nodeId}`);
      activeUsers.set(socket.id, user);
      
      // Send Y.Doc state
      const ydoc = getYDoc(nodeId);
      const state = Y.encodeStateAsUpdate(ydoc);
      socket.emit('node:sync', { nodeId, state: Buffer.from(state).toString('base64') });
      
      // Notify others in the room
      socket.to(`node:${nodeId}`).emit('user:joined', user);
    }
  });

  // User leaves a node
  socket.on('node:leave', (nodeId) => {
    const user = activeUsers.get(socket.id);
    if (user) {
      socket.leave(`node:${nodeId}`);
      user.currentNode = null;
      activeUsers.set(socket.id, user);
      socket.to(`node:${nodeId}`).emit('user:left', user);
    }
  });

  // Yjs sync
  socket.on('node:update', ({ nodeId, update }) => {
    try {
      const ydoc = getYDoc(nodeId);
      const updateBuffer = Buffer.from(update, 'base64');
      Y.applyUpdate(ydoc, updateBuffer);
      
      // Broadcast to others in the room
      socket.to(`node:${nodeId}`).emit('node:update', { nodeId, update });
      
      // Debounced save to DB
      debouncedSave(nodeId, ydoc);
    } catch (e) {
      console.error('Error applying update:', e);
    }
  });

  // Cursor updates
  socket.on('cursor:update', ({ nodeId, cursor }) => {
    const user = activeUsers.get(socket.id);
    if (user) {
      user.cursor = cursor;
      socket.to(`node:${nodeId}`).emit('cursor:update', { userId: socket.id, user, cursor });
    }
  });

  socket.on('disconnect', () => {
    const user = activeUsers.get(socket.id);
    if (user && user.currentNode) {
      socket.to(`node:${user.currentNode}`).emit('user:left', user);
    }
    activeUsers.delete(socket.id);
    io.emit('users:update', Array.from(activeUsers.values()));
    console.log('User disconnected:', socket.id);
  });
});

// Debounced save
const saveTimers = new Map();
function debouncedSave(nodeId, ydoc) {
  if (saveTimers.has(nodeId)) {
    clearTimeout(saveTimers.get(nodeId));
  }
  
  saveTimers.set(nodeId, setTimeout(() => {
    try {
      const state = Y.encodeStateAsUpdate(ydoc);
      const content = JSON.stringify({ yUpdate: Buffer.from(state).toString('base64') });
      db.run('UPDATE nodes SET content = ?, updated_at = datetime("now") WHERE id = ?', [content, nodeId]);
      saveDatabase();
      console.log('Saved node:', nodeId);
    } catch (e) {
      console.error('Error saving node:', e);
    }
    saveTimers.delete(nodeId);
  }, 3000));
}

// SPA fallback - serve index.html for all non-API routes
app.get('*', (req, res) => {
  if (!req.path.startsWith('/api') && !req.path.startsWith('/uploads') && !req.path.startsWith('/socket.io')) {
    res.sendFile(path.join(publicDir, 'index.html'));
  }
});

// ============ BACKUP API ENDPOINTS ============
app.get('/api/backups', (req, res) => {
  const backups = listBackups();
  res.json({ backups, config: { keepCount: config.backupKeepCount, interval: config.backupInterval } });
});

app.post('/api/backup/create', (req, res) => {
  const backupPath = createBackup();
  if (backupPath) {
    res.json({ success: true, path: backupPath });
  } else {
    res.status(500).json({ success: false, error: 'Failed to create backup' });
  }
});

app.post('/api/backup/restore', (req, res) => {
  const { backupPath } = req.body;
  if (restoreFromBackup(backupPath)) {
    res.json({ success: true, message: 'Database restored. Please restart the server.' });
  } else {
    res.status(500).json({ success: false, error: 'Failed to restore backup' });
  }
});

// ============ START SERVER ============
const PORT = config.port;

initDatabase().then(() => {
  server.listen(PORT, () => {
    console.log('\n🌳 ═══════════════════════════════════════════════════');
    console.log('   HoloTree Knowledge Base Server');
    console.log('   ═══════════════════════════════════════════════════');
    console.log(`   🚀 Server running on port ${PORT}`);
    console.log(`   📂 Database: ${dbPath}`);
    console.log(`   💾 Backups: ${config.backupDir}`);
    console.log(`   ⏰ Auto-save: every ${config.autoSaveInterval / 1000}s`);
    console.log(`   🔄 Auto-backup: every ${config.backupInterval / 60000}min`);
    console.log('   ═══════════════════════════════════════════════════\n');
    
    // Создаём первый бэкап при запуске
    createBackup();
  });
}).catch(err => {
  console.error('❌ Failed to initialize database:', err);
  process.exit(1);
});

// ============ GRACEFUL SHUTDOWN ============
let isShuttingDown = false;

async function gracefulShutdown(signal) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  
  console.log(`\n⚠️  Received ${signal}, starting graceful shutdown...`);
  
  // Останавливаем интервалы
  clearInterval(autoSaveInterval);
  clearInterval(backupInterval);
  
  // Закрываем сервер для новых соединений
  server.close(() => {
    console.log('🔌 HTTP server closed');
  });
  
  // Уведомляем всех подключенных клиентов
  io.emit('server:shutdown', { message: 'Server is shutting down' });
  
  // Даём время клиентам отключиться
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  // Закрываем Socket.IO
  io.close(() => {
    console.log('🔌 Socket.IO closed');
  });
  
  try {
    // Финальное сохранение БД
    console.log('💾 Saving database...');
    if (db) {
      saveDatabase();
      console.log('✅ Database saved');
      
      // Создаём финальный бэкап
      console.log('🔄 Creating final backup...');
      createBackup();
      console.log('✅ Final backup created');
    }
  } catch (error) {
    console.error('❌ Error during shutdown:', error);
  }
  
  console.log('👋 Shutdown complete. Goodbye!\n');
  process.exit(0);
}

// Обработка различных сигналов завершения
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Обработка необработанных ошибок
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  gracefulShutdown('uncaughtException');
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  gracefulShutdown('unhandledRejection');
});
