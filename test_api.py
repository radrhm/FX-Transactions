import urllib.request
import json

try:
    with urllib.request.urlopen('http://localhost:8000/api/mismatches') as response:
        if response.status == 200:
            data = json.loads(response.read().decode())
            print(f"API Returned {len(data)} items:")
            print(json.dumps(data, indent=2))
        else:
            print(f"Error: Status {response.status}")
except Exception as e:
    print(f"Request Failed: {e}")
