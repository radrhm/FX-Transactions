import http.server
import socketserver
import json
import sqlite3
import os
from urllib.parse import urlparse, parse_qs
import sys

PORT = int(os.environ.get('PORT', 8002))
DB_FILE = 'transactions.db'

def init_db():
    conn = sqlite3.connect(DB_FILE)
    c = conn.cursor()
    
    # Check if migration is needed (check for 'deal_type' column)
    c.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='transactions'")
    if c.fetchone():
        c.execute("PRAGMA table_info(transactions)")
        columns = [info[1] for info in c.fetchall()]
        if 'deal_type' not in columns:
            print("Migrating database to new schema...")
            # Backup
            c.execute("ALTER TABLE transactions RENAME TO transactions_old")
            
            # Create New Table
            c.execute('''CREATE TABLE transactions
                         (id INTEGER PRIMARY KEY AUTOINCREMENT,
                          transaction_number TEXT UNIQUE,
                          date TEXT,
                          time TEXT,
                          bank1 TEXT,
                          bank2 TEXT,
                          deal_type TEXT,
                          local_code_role TEXT,
                          direction TEXT,
                          currency1 TEXT,
                          currency2 TEXT,
                          rate REAL,
                          amount_base REAL,
                          amount_counter REAL)''')
            
            # Migrate Data
            c.execute("SELECT * FROM transactions_old")
            rows = c.fetchall()
            for row in rows:
                # Map old columns (assuming order: id, tx_num, date, time, b1, b2, pair, rate, dir, base, counter)
                # row[6] is pair 'EUR/USD'
                try:
                    pair = row[6]
                    if '/' in pair:
                        c1, c2 = pair.split('/')
                    else:
                        c1, c2 = pair[:3], pair[3:]
                except:
                    c1, c2 = '???', '???'

                c.execute('''INSERT INTO transactions 
                             (id, transaction_number, date, time, bank1, bank2, deal_type, local_code_role, direction, currency1, currency2, rate, amount_base, amount_counter)
                             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)''',
                          (row[0], row[1], row[2], row[3], row[4], row[5], 'Spot', 'TAKER', row[8], c1, c2, row[7], row[9], row[10]))
            
            # Cleanup
            c.execute("DROP TABLE transactions_old")
            conn.commit()
            print("Migration complete.")
    
    # Ensure table exists if fresh start
    c.execute('''CREATE TABLE IF NOT EXISTS transactions
                 (id INTEGER PRIMARY KEY AUTOINCREMENT,
                  transaction_number TEXT UNIQUE,
                  date TEXT,
                  time TEXT,
                  bank1 TEXT,
                  bank2 TEXT,
                  deal_type TEXT,
                  local_code_role TEXT,
                  direction TEXT,
                  currency1 TEXT,
                  currency2 TEXT,
                  rate REAL,
                  amount_base REAL,
                  amount_counter REAL)''')
                  
    c.execute('''CREATE TABLE IF NOT EXISTS banks
                 (id INTEGER PRIMARY KEY AUTOINCREMENT,
                  name TEXT UNIQUE)''')
                  
    c.execute('''CREATE TABLE IF NOT EXISTS pairs
                 (id INTEGER PRIMARY KEY AUTOINCREMENT,
                  name TEXT UNIQUE)''')
    
    # Defaults
    c.execute("SELECT count(*) FROM banks")
    if c.fetchone()[0] == 0:
        defaults = [('JP Morgan',), ('Citi',), ('Deutsche Bank',), ('HSBC',), ('Barclays',), ('UBS',)]
        c.executemany("INSERT INTO banks (name) VALUES (?)", defaults)
        
    c.execute("SELECT count(*) FROM pairs")
    if c.fetchone()[0] == 0:
        defaults = [('EUR/USD',), ('GBP/USD',), ('USD/JPY',), ('USD/CHF',), ('AUD/USD',), ('USD/CAD',)]
        c.executemany("INSERT INTO pairs (name) VALUES (?)", defaults)

    conn.commit()
    conn.close()

class MyRequestHandler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        parsed_path = urlparse(self.path)
        path = parsed_path.path.rstrip('/')
        
        if path == '/api/transactions':
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            
            conn = sqlite3.connect(DB_FILE)
            conn.row_factory = sqlite3.Row
            c = conn.cursor()
            
            query = "SELECT * FROM transactions WHERE 1=1"
            params = []
            
            qs = parse_qs(parsed_path.query)
            # Re-implement backend filtering if needed, but keeping it simple for now as client does filtering
            # But let's keep robust base for direct API usage
            if 'direction' in qs and qs['direction'][0].lower() != 'all':
                query += " AND direction = ?"
                params.append(qs['direction'][0])
            
            query += " ORDER BY id DESC"
            
            c.execute(query, params)
            rows = c.fetchall()
            
            # Use a custom dict creation to inject 'pair' back for compatibility if needed, or just send raw
            result = []
            for row in rows:
                d = dict(row)
                d['pair'] = f"{d['currency1']}/{d['currency2']}" # Reconstruct pair for frontend ease
                result.append(d)

            conn.close()
            self.wfile.write(json.dumps(result).encode())

        elif path == '/api/mismatches':
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            
            conn = sqlite3.connect(DB_FILE)
            conn.row_factory = sqlite3.Row
            c = conn.cursor()
            
            # Updated query for new schema
            query = '''
                SELECT * FROM transactions t1
                WHERE NOT EXISTS (
                    SELECT 1 FROM transactions t2
                    WHERE t2.date = t1.date
                    AND t2.time = t1.time
                    AND t2.currency1 = t1.currency1
                    AND t2.currency2 = t1.currency2
                    AND ABS(t2.rate - t1.rate) < 0.000001
                    AND ABS(t2.amount_base - t1.amount_base) < 0.000001
                    AND t2.bank1 = t1.bank2
                    AND t2.bank2 = t1.bank1
                    AND t2.direction != t1.direction
                )
                ORDER BY t1.date DESC, t1.time DESC
            '''
            
            c.execute(query)
            rows = c.fetchall()
            result = []
            for row in rows:
                d = dict(row)
                d['pair'] = f"{d['currency1']}/{d['currency2']}"
                result.append(d)
                
            conn.close()
            self.wfile.write(json.dumps(result).encode())

        elif path in ['/api/banks', '/api/pairs']:
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            
            table = 'banks' if 'banks' in path else 'pairs'
            conn = sqlite3.connect(DB_FILE)
            conn.row_factory = sqlite3.Row
            c = conn.cursor()
            c.execute(f"SELECT * FROM {table} ORDER BY name")
            rows = c.fetchall()
            result = [dict(row) for row in rows]
            conn.close()
            self.wfile.write(json.dumps(result).encode())

        else:
            super().do_GET()

    def do_POST(self):
        path = self.path.rstrip('/')
        
        if path in ['/api/banks', '/api/pairs']:
            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length)
            
            try:
                data = json.loads(post_data)
                table = 'banks' if 'banks' in path else 'pairs'
                conn = sqlite3.connect(DB_FILE)
                c = conn.cursor()
                try:
                    c.execute(f"INSERT INTO {table} (name) VALUES (?)", (data['name'],))
                    conn.commit()
                    response = {'status': 'success', 'id': c.lastrowid}
                    self.send_response(201)
                except sqlite3.IntegrityError:
                    response = {'status': 'error', 'message': 'Already exists'}
                    self.send_response(400)
                except Exception as e:
                    response = {'status': 'error', 'message': str(e)}
                    self.send_response(500)
                finally:
                    conn.close()
            except Exception as e:
                response = {'status': 'error', 'message': f'Bad Request: {str(e)}'}
                self.send_response(400)
                
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps(response).encode())

        elif path == '/api/transactions':
            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length)
            data = json.loads(post_data)
            
            # Split Pair
            pair = data.get('pair', '')
            if '/' in pair:
                c1, c2 = pair.split('/')
            else:
                c1, c2 = pair[:3], pair[3:] if len(pair) > 3 else '???'

            conn = sqlite3.connect(DB_FILE)
            c = conn.cursor()
            try:
                c.execute('''INSERT INTO transactions 
                             (transaction_number, date, time, bank1, bank2, deal_type, local_code_role, direction, currency1, currency2, rate, amount_base, amount_counter)
                             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)''',
                          (data['transaction_number'], data['date'], data['time'], 
                           data['bank1'], data['bank2'], 
                           data.get('deal_type', 'Spot'), data.get('local_code_role', 'TAKER'),
                           data['direction'], c1, c2,
                           data['rate'], data['amount_base'], data['amount_counter']))
                conn.commit()
                response = {'status': 'success'}
                self.send_response(201)
            except sqlite3.IntegrityError:
                response = {'status': 'error', 'message': 'Duplicate transaction number'}
                self.send_response(400)
            except Exception as e:
                response = {'status': 'error', 'message': str(e)}
                self.send_response(500)
            finally:
                conn.close()
                
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps(response).encode())

        elif path == '/api/fix-mismatch':
            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length)
            data = json.loads(post_data)
            original_id = data.get('id')
            
            conn = sqlite3.connect(DB_FILE)
            conn.row_factory = sqlite3.Row
            c = conn.cursor()
            try:
                c.execute("SELECT * FROM transactions WHERE id = ?", (original_id,))
                orig = c.fetchone()
                
                if orig:
                    new_direction = 'Sell' if orig['direction'] == 'Buy' else 'Buy'
                    new_tx_number = f"{orig['transaction_number']}-FIX"
                    import random
                    new_tx_number += f"-{random.randint(100,999)}"

                    c.execute('''INSERT INTO transactions 
                                 (transaction_number, date, time, bank1, bank2, deal_type, local_code_role, direction, currency1, currency2, rate, amount_base, amount_counter)
                                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)''',
                              (new_tx_number, orig['date'], orig['time'], 
                               orig['bank2'], orig['bank1'], 
                               orig['deal_type'], orig['local_code_role'], # Keep original deal details
                               new_direction, orig['currency1'], orig['currency2'],
                               orig['rate'], orig['amount_base'], orig['amount_counter']))
                    conn.commit()
                    response = {'status': 'success', 'new_id': c.lastrowid}
                    self.send_response(200)
                else:
                    response = {'status': 'error', 'message': 'Original transaction not found'}
                    self.send_response(404)
                    
            except Exception as e:
                response = {'status': 'error', 'message': str(e)}
                self.send_response(500)
            finally:
                conn.close()

            self.send_header('Content-type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps(response).encode())
            
        else:
            self.send_error(404, f"Path mismatch in POST: {path}")

    def do_DELETE(self):
        parsed_path = urlparse(self.path)
        path = parsed_path.path.rstrip('/')
        query = parse_qs(parsed_path.query)
        
        if path in ['/api/banks', '/api/pairs']:
            if 'id' not in query:
                self.send_error(400, "Missing ID")
                return

            item_id = query['id'][0]
            table = 'banks' if 'banks' in path else 'pairs'
            
            conn = sqlite3.connect(DB_FILE)
            c = conn.cursor()
            try:
                c.execute(f"DELETE FROM {table} WHERE id = ?", (item_id,))
                conn.commit()
                self.send_response(200)
                self.send_header('Content-type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({'status': 'success'}).encode())
            except Exception as e:
                self.send_error(500, str(e))
            finally:
                conn.close()
        else:
            self.send_error(404)

if __name__ == '__main__':
    try:
        init_db()
        print(f"SERVER VERSION 4 REWRITTEN STARTING at http://0.0.0.0:{PORT}")
        socketserver.TCPServer.allow_reuse_address = True
        with socketserver.TCPServer(("0.0.0.0", PORT), MyRequestHandler) as httpd:
            httpd.serve_forever()
    except Exception as e:
        print(f"Failed to start server: {e}")
