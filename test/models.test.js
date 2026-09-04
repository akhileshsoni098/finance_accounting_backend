const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const { FiscalPeriod, JournalEntry } = require('../src/models');

const id = () => new mongoose.Types.ObjectId();

function journal(lines) {
  return new JournalEntry({
    tenantId: id(),
    entityId: id(),
    entryNumber: 'JE-0001',
    entryDate: new Date('2026-01-15'),
    fiscalPeriodId: id(),
    description: 'Test entry',
    sourceType: 'test',
    correlationId: 'test-correlation',
    currency: 'USD',
    lines
  });
}

test('journal entry rejects unbalanced minor-unit totals', async () => {
  const entry = journal([
    { accountId: id(), debitMinor: 1000, currency: 'USD' },
    { accountId: id(), creditMinor: 999, currency: 'USD' }
  ]);

  await assert.rejects(entry.validate(), /must balance/);
});

test('journal line requires exactly one positive side', async () => {
  const entry = journal([
    { accountId: id(), debitMinor: 1000, creditMinor: 1000, currency: 'USD' },
    { accountId: id(), debitMinor: 1000, creditMinor: 1000, currency: 'USD' }
  ]);

  await assert.rejects(entry.validate(), /exactly one positive/);
});

test('fiscal period rejects an end date before its start date', async () => {
  const period = new FiscalPeriod({
    tenantId: id(),
    entityId: id(),
    name: 'January 2026',
    startDate: new Date('2026-01-31'),
    endDate: new Date('2026-01-01')
  });

  await assert.rejects(period.validate(), /End date must be after start date/);
});
