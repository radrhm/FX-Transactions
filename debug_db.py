import sqlite3
import json

conn = sqlite3.connect('transactions.db')
conn.row_factory = sqlite3.Row
c = conn.cursor()

print("--- ALL TRANSACTIONS ---")
c.execute("SELECT * FROM transactions")
for row in c.fetchall():
    print(dict(row))

print("\n--- MISMATCH QUERY TEST ---")
query = '''
SELECT * FROM transactions t1
WHERE NOT EXISTS (
    SELECT 1 FROM transactions t2
    WHERE t2.date = t1.date
    AND t2.time = t1.time
    AND t2.pair = t1.pair
    AND ABS(t2.rate - t1.rate) < 0.0000001
    AND ABS(t2.amount_base - t1.amount_base) < 0.0000001
    AND t2.bank1 = t1.bank2
    AND t2.bank2 = t1.bank1
    AND t2.direction != t1.direction
)
'''
# Note: Added ABS for floats just in case, though I suspect logic was fine.
# Let's run the ORIGINAL query to see why it failed.
orig_query = '''
SELECT * FROM transactions t1
WHERE NOT EXISTS (
    SELECT 1 FROM transactions t2
    WHERE t2.date = t1.date
    AND t2.time = t1.time
    AND t2.pair = t1.pair
    AND t2.rate = t1.rate
    AND t2.amount_base = t1.amount_base
    AND t2.bank1 = t1.bank2
    AND t2.bank2 = t1.bank1
    AND t2.direction != t1.direction
)
'''
c.execute(orig_query)
rows = c.fetchall()
print(f"Found {len(rows)} mismatches:")
for row in rows:
    print(dict(row))

conn.close()
