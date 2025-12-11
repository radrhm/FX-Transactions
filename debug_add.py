import urllib.request
import json

url = 'http://localhost:8002/api/banks'
data = {'name': 'DebugBankDefault'}
encoded_data = json.dumps(data).encode('utf-8')

req = urllib.request.Request(url, data=encoded_data, method='POST')
req.add_header('Content-Type', 'application/json')

try:
    with urllib.request.urlopen(req) as response:
        print(f"Status: {response.status}")
        print(f"Body: {response.read().decode()}")
except urllib.error.HTTPError as e:
    print(f"HTTP Error: {e.code} {e.reason}")
    print(f"Body: {e.read().decode()}")
except Exception as e:
    print(f"Error: {e}")
