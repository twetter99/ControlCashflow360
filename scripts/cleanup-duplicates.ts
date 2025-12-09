/**
 * Script para limpiar recurrencias y transacciones duplicadas
 * 
 * Ejecutar con: npx ts-node scripts/cleanup-duplicates.ts
 */

import * as admin from 'firebase-admin';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

// Obtener __dirname en ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Leer el service account key de forma segura
const serviceAccountPath = path.join(__dirname, '..', 'serviceAccountKey.json');
const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));

// Inicializar Firebase Admin
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount as admin.ServiceAccount)
  });
}

const db = admin.firestore();

interface DuplicateItem {
  id: string;
  createdAt: Date;
  name?: string;
}

async function cleanupDuplicates() {
  console.log('=== INICIANDO LIMPIEZA DE DUPLICADOS ===\n');

  // 1. Limpiar recurrencias duplicadas
  console.log('1. Analizando recurrencias...');
  const recurrencesSnap = await db.collection('recurrences').get();
  console.log(`   Total recurrencias: ${recurrencesSnap.size}`);

  const recurrenceGroups: Record<string, DuplicateItem[]> = {};

  recurrencesSnap.docs.forEach(doc => {
    const data = doc.data();
    // Clave: companyId + thirdPartyId + type + frequency + dayOfMonth + baseAmount
    // (identificadores únicos de una recurrencia conceptualmente igual)
    const key = `${data.companyId}|${data.thirdPartyId}|${data.type}|${data.frequency}|${data.dayOfMonth}|${data.baseAmount}`;
    
    if (!recurrenceGroups[key]) {
      recurrenceGroups[key] = [];
    }
    
    recurrenceGroups[key].push({
      id: doc.id,
      createdAt: data.createdAt?.toDate?.() || new Date(0),
      name: data.name,
    });
  });

  const recurrencesToDelete: string[] = [];
  const recurrenceIdsToKeep: string[] = [];

  for (const key of Object.keys(recurrenceGroups)) {
    const items = recurrenceGroups[key];
    if (items.length > 1) {
      // Ordenar por fecha de creación (más antiguo primero)
      items.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
      
      console.log(`\n   Duplicados encontrados para clave ${key.substring(0, 50)}...:`);
      items.forEach((item, idx) => {
        console.log(`     ${idx === 0 ? '✓ MANTENER' : '✗ ELIMINAR'}: ${item.id} - "${item.name}" (${item.createdAt.toISOString()})`);
      });
      
      recurrenceIdsToKeep.push(items[0].id);
      
      for (let i = 1; i < items.length; i++) {
        recurrencesToDelete.push(items[i].id);
      }
    } else {
      recurrenceIdsToKeep.push(items[0].id);
    }
  }

  console.log(`\n   Recurrencias a eliminar: ${recurrencesToDelete.length}`);

  // 2. Limpiar transacciones duplicadas
  console.log('\n2. Analizando transacciones...');
  const transactionsSnap = await db.collection('transactions').get();
  console.log(`   Total transacciones: ${transactionsSnap.size}`);

  const transactionGroups: Record<string, DuplicateItem[]> = {};

  transactionsSnap.docs.forEach(doc => {
    const data = doc.data();
    const dueDate = data.dueDate?.toDate?.() || new Date(data.dueDate);
    const dateKey = `${dueDate.getFullYear()}-${String(dueDate.getMonth() + 1).padStart(2, '0')}-${String(dueDate.getDate()).padStart(2, '0')}`;
    
    // Clave: companyId + thirdPartyId + type + amount + date
    const key = `${data.companyId}|${data.thirdPartyId || ''}|${data.type}|${data.amount}|${dateKey}`;
    
    if (!transactionGroups[key]) {
      transactionGroups[key] = [];
    }
    
    transactionGroups[key].push({
      id: doc.id,
      createdAt: data.createdAt?.toDate?.() || new Date(0),
      name: data.description,
    });
  });

  const transactionsToDelete: string[] = [];
  let duplicateGroupsCount = 0;

  for (const key of Object.keys(transactionGroups)) {
    const items = transactionGroups[key];
    if (items.length > 1) {
      duplicateGroupsCount++;
      items.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
      
      if (duplicateGroupsCount <= 5) {
        console.log(`\n   Duplicados para ${key.substring(0, 60)}...:`);
        items.forEach((item, idx) => {
          console.log(`     ${idx === 0 ? '✓' : '✗'}: ${item.id} - "${item.name}" (${item.createdAt.toISOString()})`);
        });
      }
      
      for (let i = 1; i < items.length; i++) {
        transactionsToDelete.push(items[i].id);
      }
    }
  }

  if (duplicateGroupsCount > 5) {
    console.log(`   ... y ${duplicateGroupsCount - 5} grupos más de duplicados`);
  }

  console.log(`\n   Transacciones a eliminar: ${transactionsToDelete.length}`);

  // 3. Ejecutar eliminación
  console.log('\n3. Ejecutando eliminación...');
  
  // Eliminar recurrencias
  if (recurrencesToDelete.length > 0) {
    const batchSize = 500;
    for (let i = 0; i < recurrencesToDelete.length; i += batchSize) {
      const batch = db.batch();
      const chunk = recurrencesToDelete.slice(i, i + batchSize);
      
      chunk.forEach(id => {
        batch.delete(db.collection('recurrences').doc(id));
      });
      
      await batch.commit();
      console.log(`   Recurrencias eliminadas: ${Math.min(i + batchSize, recurrencesToDelete.length)}/${recurrencesToDelete.length}`);
    }
  }

  // Eliminar transacciones
  if (transactionsToDelete.length > 0) {
    const batchSize = 500;
    for (let i = 0; i < transactionsToDelete.length; i += batchSize) {
      const batch = db.batch();
      const chunk = transactionsToDelete.slice(i, i + batchSize);
      
      chunk.forEach(id => {
        batch.delete(db.collection('transactions').doc(id));
      });
      
      await batch.commit();
      console.log(`   Transacciones eliminadas: ${Math.min(i + batchSize, transactionsToDelete.length)}/${transactionsToDelete.length}`);
    }
  }

  // 4. Actualizar recurrenceId en transacciones huérfanas
  console.log('\n4. Actualizando transacciones con recurrenceId obsoleto...');
  
  // Obtener las transacciones que apuntan a recurrencias eliminadas
  const orphanedTxSnap = await db.collection('transactions')
    .where('recurrenceId', 'in', recurrencesToDelete.slice(0, 10)) // Firestore limit
    .get();
  
  if (orphanedTxSnap.size > 0) {
    console.log(`   Encontradas ${orphanedTxSnap.size} transacciones huérfanas (muestra)`);
    // Por ahora solo reportamos, no modificamos
  }

  console.log('\n=== LIMPIEZA COMPLETADA ===');
  console.log(`   Recurrencias eliminadas: ${recurrencesToDelete.length}`);
  console.log(`   Transacciones eliminadas: ${transactionsToDelete.length}`);
}

cleanupDuplicates()
  .then(() => {
    console.log('\nProceso finalizado.');
    process.exit(0);
  })
  .catch(err => {
    console.error('Error:', err);
    process.exit(1);
  });
