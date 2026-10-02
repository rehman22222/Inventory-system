const assert = require('node:assert/strict');
const { allocatePayments, withPayments } = require('../libs/salePayments');
const { buildCsv } = require('../libs/csv');
const sale = (amount, method = 'split') => ({ totalAmount: amount, paymentMethod: method });
const receipt = { payments: [{ method: 'cash', amount: 50 }, { method: 'creditcard', amount: 30 }, { method: 'credit', amount: 20 }], changeDue: 10 };
assert.deepEqual(allocatePayments(sale(90), receipt), [{ method: 'cash', amount: 40 }, { method: 'creditcard', amount: 30 }, { method: 'credit', amount: 20 }]);
assert.deepEqual(allocatePayments(sale(45), receipt), [{ method: 'cash', amount: 20 }, { method: 'creditcard', amount: 15 }, { method: 'credit', amount: 10 }]);
assert.deepEqual(allocatePayments(sale(-45), receipt), [{ method: 'cash', amount: -20 }, { method: 'creditcard', amount: -15 }, { method: 'credit', amount: -10 }]);
assert.deepEqual(allocatePayments(sale(5, 'cash')), [{ method: 'cash', amount: 5 }]);
assert.deepEqual(allocatePayments(sale(5)), [{ method: 'split', amount: 5 }]);
for (let units = 1; units < 1000; units++) {
  assert.equal(allocatePayments(sale(units / 100), receipt).reduce((n, p) => n + Math.round(p.amount * 100), 0), units);
}
const Receipt = require('../models/Receiptmodel');
const Sale = require('../models/Salesmodel');
const oldReceiptFind = Receipt.find;
const oldSaleFind = Sale.find;
Receipt.find = () => ({ select: () => ({ lean: async () => [{ receiptNo: 'TEST', payments: [{ method: 'cash', amount: .01 }, { method: 'creditcard', amount: .02 }] }] }) });
const lines = [1, 2, 3].map((id) => ({ _id: String(id), receiptNo: 'TEST', paymentMethod: 'split', totalAmount: .01, source: 'pos' }));
Sale.find = () => ({ select: () => ({ sort: () => ({ lean: async () => lines }) }) });
(async () => {
  try {
    const rows = await withPayments(lines);
    assert.equal(rows.flatMap(r => r.paymentBreakdown).filter(p => p.method === 'cash').reduce((n, p) => n + Math.round(p.amount * 100), 0), 1);
    assert.equal(rows.flatMap(r => r.paymentBreakdown).filter(p => p.method === 'creditcard').reduce((n, p) => n + Math.round(p.amount * 100), 0), 2);
    assert.deepEqual((await withPayments([lines[1]]))[0].paymentBreakdown, rows[1].paymentBreakdown);
    const csv = buildCsv({ headers: ['Payment'], rows: [['Cash: 40 + Card: 30']], summary: [['Cash Total', '40.00'], ['Card Total', '30.00']], includeCsvSummary: true });
    assert.match(csv, /Cash Total,40.00/);
    assert.match(csv, /Card Total,30.00/);
    console.log('PASS: split allocation, change, credit, refunds, cent reconciliation, filtered lines and CSV totals');
  } finally { Receipt.find = oldReceiptFind; Sale.find = oldSaleFind; }
})().catch(error => { console.error(error); process.exitCode = 1; });
