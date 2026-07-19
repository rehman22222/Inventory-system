const express = require('express');
const router = express.Router();
const {createStockTransaction,getAllStockTransactions,searchStocks,getStockTransactionsByProduct,getStockTransactionsBySupplier} = require('../controller/stocktransaction');
const { authmiddleware, adminOrManager } = require('../middleware/Authmiddleware');

// These routes had no auth at all: anyone could forge stock movements (which
// feed the audit trail and the reorder sweep) or read the full purchase and
// supplier history. The Stock Transaction page is admin/manager/superadmin,
// which is exactly what adminOrManager allows — so this closes the hole
// without changing who can use the page.
router.post('/createStockTransaction', authmiddleware, adminOrManager, createStockTransaction);
router.get('/getallStockTransaction', authmiddleware, adminOrManager, getAllStockTransactions);
router.get('/product/:productId', authmiddleware, adminOrManager, getStockTransactionsByProduct);
router.get('/supplier/:supplierId', authmiddleware, adminOrManager, getStockTransactionsBySupplier);
router.get('/searchstocks', authmiddleware, adminOrManager, searchStocks);


module.exports = router;
