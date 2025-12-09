/**
 * Script para limpiar recurrencias y transacciones duplicadas
 * 
 * Ejecutar con: node scripts/cleanup-duplicates.mjs
 */

import admin from 'firebase-admin';
import fs from 'fs';

// Leer el service account key
const serviceAccount = JSON.parse(fs.readFileSync('./serviceAccountKey.json', 'utf8'));

// Inicializar Firebase Admin
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function cleanupDuplicates() {
  console.log('=== INICIANDO LIMPIEZA DE DUPLICADOS ===\n');

  // 1. Limpiar recurrencias duplicadas
  console.log('1. Analizando recurrencias...');
  const recurrencesSnap = await db.collection('recurrences').get();
  console.log(`   Total recurrencias: ${recurrencesSnap.size}`);

  const recurrenceGroups = {};

  recurrencesSnap.docs.forEach(doc => {
    const data = doc.data();
    // Clave: companyId + thirdPartyId + type + frequency + dayOfMonth + baseAmount
    // NO incluir name para detectar recurrencias conceptualmente iguales
    const key = `${data.companyId}|${data.thirdPartyId || ''}|${data.type}|${data.frequency}|${data.dayOfMonth}|${data.baseAmount}`;
    
    if (!recurrenceGroups[key]) {
      recurrenceGroups[key] = [];
    }
    
    recurrenceGroups[key].push({
      id: doc.id,
      createdAt: data.createdAt?.toDate?.() || new Date(0),
      name: data.name,
    });
  });

  const recurrencesToDelete = [];

  for (const key of Object.keys(recurrenceGroups)) {
    const items = recurrenceGroups[key];
    if (items.length > 1) {
      items.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
      
      console.log(`\n   Duplicados encontrados:`);
      items.forEach((item, idx) => {
        console.log(`     ${idx === 0 ? '✓ MANTENER' : '✗ ELIMINAR'}: ${item.id} - "${item.name}"`);
      });
      
      for (let i = 1; i < items.length; i++) {
        recurrencesToDelete.push(items[i].id);
      }
    }
  }

  console.log(`\n   Recurrencias a eliminar: ${recurrencesToDelete.length}`);

  // 2. Limpiar transacciones duplicadas
  console.log('\n2. Analizando transacciones...');
  const transactionsSnap = await db.collection('transactions').get();
  console.log(`   Total transacciones: ${transactionsSnap.size}`);

  const transactionGroups = {};

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

  const transactionsToDelete = [];
  let duplicateGroupsCount = 0;

  for (const key of Object.keys(transactionGroups)) {
    const items = transactionGroups[key];
    if (items.length > 1) {
      duplicateGroupsCount++;
      items.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
      
      if (duplicateGroupsCount <= 5) {
        console.log(`\n   Duplicados para ${key.substring(0, 60)}...:`);
        items.forEach((item, idx) => {
          console.log(`     ${idx === 0 ? '✓' : '✗'}: "${item.name}"`);
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
