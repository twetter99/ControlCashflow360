"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.functions = exports.db = void 0;
exports.formatCurrency = formatCurrency;
const admin = require("firebase-admin");
const functions = require("firebase-functions");
exports.functions = functions;
admin.initializeApp();
exports.db = admin.firestore();
// Funciones de utilidad
function formatCurrency(amount) {
    return new Intl.NumberFormat('es-ES', {
        style: 'currency',
        currency: 'EUR',
    }).format(amount);
}
//# sourceMappingURL=config.js.map