import urllib.request
import json
import sys

url = "http://localhost:8000/api/transcribe"
data = {
    "notes": [
        {"midi": 60, "time": 0.0, "duration": 0.5},
        {"midi": 64, "time": 0.5, "duration": 0.5},
        {"midi": 67, "time": 1.0, "duration": 1.0}
    ],
    "bpm": 120
}

req = urllib.request.Request(
    url, 
    data=json.dumps(data).encode('utf-8'),
    headers={'Content-Type': 'application/json'}
)

try:
    with urllib.request.urlopen(req) as response:
        res = json.loads(response.read().decode('utf-8'))
        if res.get("status") == "success":
            xml_content = res.get("xml")
            print("Successfully called API!")
            print("XML length:", len(xml_content))
            with open("test_out.xml", "w", encoding="utf-8") as f:
                f.write(xml_content)
            print("Saved response to test_out.xml")
            sys.exit(0)
        else:
            print("API returned error status:", res)
            sys.exit(1)
except Exception as e:
    print("Failed to call API:", e)
    sys.exit(1)
