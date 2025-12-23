#!/usr/bin/env node

/**
 * HoloTree Backup Management Utilities
 * 
 * Утилиты для управления бэкапами базы данных
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dataDir = path.join(__dirname, 'data');
const backupDir = path.join(__dirname, 'backups');
const dbPath = path.join(dataDir, 'holotree.db');

// Убеждаемся, что директории существуют
[dataDir, backupDir].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

/**
 * Список всех бэкапов
 */
function listBackups() {
  const files = fs.readdirSync(backupDir)
    .filter(f => f.startsWith('holotree-') && f.endsWith('.db'))
    .map(f => {
      const filePath = path.join(backupDir, f);
      const stat = fs.statSync(filePath);
      return {
        name: f,
        path: filePath,
        size: (stat.size / 1024 / 1024).toFixed(2) + ' MB',
        created: stat.mtime.toISOString()
      };
    })
    .sort((a, b) => new Date(b.created) - new Date(a.created));
  
  return files;
}

/**
 * Создать бэкап
 */
function createBackup() {
  if (!fs.existsSync(dbPath)) {
    console.error('❌ Database file not found:', dbPath);
    return null;
  }
  
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
  const backupPath = path.join(backupDir, `holotree-${timestamp}.db`);
  
  fs.copyFileSync(dbPath, backupPath);
  console.log('✅ Backup created:', backupPath);
  
  return backupPath;
}

/**
 * Восстановить из бэкапа
 */
function restoreBackup(backupPath) {
  if (!fs.existsSync(backupPath)) {
    console.error('❌ Backup file not found:', backupPath);
    return false;
  }
  
  // Создаём резервную копию текущей БД перед восстановлением
  if (fs.existsSync(dbPath)) {
    const safetyCopy = path.join(backupDir, `holotree-before-restore-${Date.now()}.db`);
    fs.copyFileSync(dbPath, safetyCopy);
    console.log('📦 Safety copy created:', safetyCopy);
  }
  
  fs.copyFileSync(backupPath, dbPath);
  console.log('✅ Database restored from:', backupPath);
  
  return true;
}

/**
 * Удалить старые бэкапы, оставив N последних
 */
function cleanOldBackups(keepCount = 50) {
  const files = fs.readdirSync(backupDir)
    .filter(f => f.startsWith('holotree-') && f.endsWith('.db'))
    .map(f => ({
      name: f,
      path: path.join(backupDir, f),
      time: fs.statSync(path.join(backupDir, f)).mtime.getTime()
    }))
    .sort((a, b) => b.time - a.time);
  
  if (files.length <= keepCount) {
    console.log(`✅ Only ${files.length} backups found, nothing to clean`);
    return;
  }
  
  const toDelete = files.slice(keepCount);
  toDelete.forEach(file => {
    fs.unlinkSync(file.path);
    console.log(`🗑️  Deleted: ${file.name}`);
  });
  
  console.log(`✅ Cleaned ${toDelete.length} old backups, kept ${keepCount} recent ones`);
}

/**
 * Экспорт базы данных в JSON
 */
async function exportToJson(outputPath) {
  try {
    const initSqlJs = (await import('sql.js')).default;
    const SQL = await initSqlJs();
    
    if (!fs.existsSync(dbPath)) {
      console.error('❌ Database file not found:', dbPath);
      return false;
    }
    
    const fileBuffer = fs.readFileSync(dbPath);
    const db = new SQL.Database(fileBuffer);
    
    const data = {};
    
    // Экспортируем все таблицы
    const tables = db.exec("SELECT name FROM sqlite_master WHERE type='table'");
    
    if (tables.length > 0) {
      tables[0].values.forEach(([tableName]) => {
        const result = db.exec(`SELECT * FROM ${tableName}`);
        if (result.length > 0) {
          const columns = result[0].columns;
          data[tableName] = result[0].values.map(row => {
            const obj = {};
            columns.forEach((col, i) => {
              obj[col] = row[i];
            });
            return obj;
          });
        }
      });
    }
    
    db.close();
    
    const jsonPath = outputPath || path.join(backupDir, `holotree-export-${Date.now()}.json`);
    fs.writeFileSync(jsonPath, JSON.stringify(data, null, 2));
    console.log('✅ Database exported to JSON:', jsonPath);
    
    return jsonPath;
  } catch (error) {
    console.error('❌ Export failed:', error);
    return false;
  }
}

// CLI Interface
const args = process.argv.slice(2);
const command = args[0];

async function main() {
  console.log('\n🌳 HoloTree Backup Manager\n');
  
  switch (command) {
    case 'list':
      const backups = listBackups();
      if (backups.length === 0) {
        console.log('No backups found');
      } else {
        console.log(`Found ${backups.length} backups:\n`);
        backups.forEach((backup, i) => {
          console.log(`${i + 1}. ${backup.name}`);
          console.log(`   Size: ${backup.size}`);
          console.log(`   Created: ${backup.created}\n`);
        });
      }
      break;
    
    case 'create':
      createBackup();
      break;
    
    case 'restore':
      const backupToRestore = args[1];
      if (!backupToRestore) {
        console.error('❌ Please specify backup file path or name');
        console.log('Usage: node backup-utils.js restore <backup-name>');
        process.exit(1);
      }
      
      let fullPath = backupToRestore;
      if (!path.isAbsolute(backupToRestore)) {
        fullPath = path.join(backupDir, backupToRestore);
      }
      
      restoreBackup(fullPath);
      break;
    
    case 'clean':
      const keepCount = parseInt(args[1]) || 50;
      cleanOldBackups(keepCount);
      break;
    
    case 'export':
      const outputPath = args[1];
      await exportToJson(outputPath);
      break;
    
    default:
      console.log('Usage:');
      console.log('  node backup-utils.js list              - List all backups');
      console.log('  node backup-utils.js create            - Create new backup');
      console.log('  node backup-utils.js restore <file>    - Restore from backup');
      console.log('  node backup-utils.js clean [count]     - Clean old backups (keep N recent)');
      console.log('  node backup-utils.js export [output]   - Export database to JSON\n');
  }
}

main().catch(console.error);
