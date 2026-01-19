 
# --- Python 3.14 Fix for Flask (pkgutil.get_loader removed) ---
import pkgutil
import importlib
 
if not hasattr(pkgutil, "get_loader"):
    def get_loader(name):
        try:
            return importlib.util.find_spec(name)
        except Exception:
            return None
    pkgutil.get_loader = get_loader
#
"""
FDX1721
Hybrid Flight Tracker (Auto callsign -> IATA conversion)
 
Put your AviationStack API key in .env:
  AVIATIONSTACK_API_KEY=your_key_here
 
Run:
  python -m venv venv
  # windows
  venv\\Scripts\\activate
  pip install -r requirements.txt
  python app.py
"""
import csv
import os
import time
import requests
import urllib3
from flask import Flask, render_template, request, jsonify
from dotenv import load_dotenv
 
# disable insecure request warnings because we use verify=False for corporate laptop compatibility
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
 
load_dotenv()
AVIATION_KEY = os.getenv("AVIATIONSTACK_API_KEY", "").strip()
 
APP = Flask(__name__, static_folder="static", template_folder="templates")

 
# Default test callsigns (hardcoded - change in UI or here)
 
 
# OpenSky / AviationStack endpoints
OPENSKY_URL = "https://opensky-network.org/api/states/all"
AVIATIONSTACK_ENDPOINT = "http://api.aviationstack.com/v1/flights"  # using http works too; we use verify=False
 
# --- Load airline registry (ICAO → IATA) from file ---
AIRLINE_DB = {}

def load_airline_db():
    global AIRLINE_DB
    try:
        with open("airlines.csv", newline="", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            for row in reader:
                icao = row["icao"].strip().upper()
                iata = row["iata"].strip().upper()
                AIRLINE_DB[icao] = iata
        print(f"Loaded {len(AIRLINE_DB)} airlines into registry")
    except Exception as e:
        print("Failed to load airlines.csv:", e)


load_airline_db()
# In-memory short history: { flight_key: [ {lat, lon, heading, alt, ts}, ... ] }
POSITION_HISTORY = {}
MAX_HISTORY = 30
 
 
# ----------------------------
# Helpers
# ----------------------------
def normalize_callsign(raw: str) -> str:
    """Normalize callsign: strip whitespace, uppercase."""
    if not raw:
        return ""
    return raw.strip().upper()
 
 
def callsign_to_iata(callsign: str) -> str:
    """
    Convert callsign -> likely IATA flight code for AviationStack lookup.
 
    Strategy:
     - If callsign already looks like IATA (2 letters + digits) return as-is.
     - If callsign starts with 3 letters + digits, map the 3-letter ICAO -> IATA via ICAO_TO_IATA.
       e.g. AAL8 -> AA8, DAL2966 -> DL2966, FDX1721 -> FX1721
     - Otherwise, if first 2 letters + digits, assume that is IATA and return.
     - If nothing matches, return the original as a fallback.
    """
    cs = normalize_callsign(callsign)
    if not cs:
        return cs
 
    # Remove non-alphanumeric (spaces)
    cs_clean = "".join(ch for ch in cs if ch.isalnum())
    # If pattern: 2 letters + digits => likely IATA
    if len(cs_clean) >= 3 and cs_clean[:2].isalpha() and cs_clean[2:].isdigit():
        return cs_clean  # already IATA style e.g. AA1280
 
    # If pattern: 3 letters + digits => try mapping 3-letter ICAO to IATA
    if len(cs_clean) >= 4 and cs_clean[:3].isalpha() and any(ch.isdigit() for ch in cs_clean[3:]):
        prefix3 = cs_clean[:3]
        rest = cs_clean[3:]
        iata = AIRLINE_DB.get(prefix3)
        if iata:
            return f"{iata}{rest}"  # e.g. AAL + 8 -> AA8
        # fallback: try first two letters as IATA
        iata2 = prefix3[:2]
        if iata2.isalpha():
            return f"{iata2}{rest}"  # e.g. AAL8 -> AA8 (best-effort)
    # fallback: return cleaned string
    return cs_clean
 
 
def fetch_opensky_states():
    """Fetch OpenSky snapshot. Using verify=False to avoid SSL issues in corporate env."""
    try:
        r = requests.get(OPENSKY_URL, timeout=12, verify=False)
        r.raise_for_status()
        return r.json().get("states", [])
    except Exception as e:
        print("OpenSky error  :", e)
        return []
 
 
def find_opensky_state_by_callsign(states, callsign):
    """
    Try matching normalized callsign against OpenSky states (callsign field index 1).
    OpenSky callsigns often are padded; do robust matching.
    """
    if not callsign:
        return None
    cs_norm = normalize_callsign(callsign)
    for st in states:
        cs = (st[1] or "").strip().upper()
        if not cs:
            continue
        # exact or startswith or vice versa
        if cs == cs_norm or cs.startswith(cs_norm) or cs_norm.startswith(cs):
            return st
    return None
 
 
def record_history(key, lat, lon, heading, alt):
    if not key:
        return
    entry = {"lat": lat, "lon": lon, "heading": heading, "alt": alt, "ts": int(time.time())}
    POSITION_HISTORY.setdefault(key, []).append(entry)
    if len(POSITION_HISTORY[key]) > MAX_HISTORY:
        POSITION_HISTORY[key] = POSITION_HISTORY[key][-MAX_HISTORY:]
 
 
def fetch_aviationstack_for_iata(iata_code: str):
    """
    Query AviationStack for flight details using flight_iata or flight_icao.
    Using verify=False to avoid certificate errors on locked-down laptops.
    Returns (data_obj_or_None, error_tag_or_None)
    """
    if not AVIATION_KEY:
        return None, "no_api_key"
    if not iata_code:
        return None, "no_iata"
 
    params = {"access_key": AVIATION_KEY, "flight_iata": iata_code, "limit": 1}
    try:
        r = requests.get(AVIATIONSTACK_ENDPOINT, params=params, timeout=10, verify=False)
        r.raise_for_status()
        j = r.json()
        data = j.get("data") or []
        if len(data) > 0:
            return data[0], None
        # try flight_icao fallback
        params2 = {"access_key": AVIATION_KEY, "flight_icao": iata_code, "limit": 1}
        r2 = requests.get(AVIATIONSTACK_ENDPOINT, params=params2, timeout=8, verify=False)
        r2.raise_for_status()
        j2 = r2.json()
        data2 = j2.get("data") or []
        if len(data2) > 0:
            return data2[0], None
        return None, "no_data"
    except Exception as e:
        print("AviationStack error:", e)
        return None, "error"
 
 
# ----------------------------
# Routes
# ----------------------------
@APP.route("/")
def index():
    return render_template("index.html")
 
 
@APP.route("/api/flights")
def api_flights():
    """
    Query ?callsigns=AAL8,DAL2966 or use defaults.
    Returns combined data:
      { now, flights: [ { callsign, iata, opensky:{...} , aviation:{...}, status, history:[] } ] }
    """
    q = request.args.get("callsigns", "")
    if not q:
        callsigns = []
    else:
        # split on comma or whitespace
        callsigns = [c.strip() for c in q.replace(" ", ",").split(",") if c.strip()]
 
    states = fetch_opensky_states()
 
    out = []
    for cs in callsigns:
        cs_norm = normalize_callsign(cs)
        iata = callsign_to_iata(cs_norm)
 
        entry = {
            "callsign": cs_norm,
            "iata": iata,
            "opensky": None,
            "aviation": None,
            "status": "unknown",
            "history": [],
        }
 
        # check OpenSky
        st = find_opensky_state_by_callsign(states, cs_norm)
        if st:
            # OpenSky state fields: see OpenSky API
            lon = st[5]
            lat = st[6]
            heading = st[10] if len(st) > 10 else None
            alt = st[13] if len(st) > 13 else (st[7] if len(st) > 7 else None)
            entry["opensky"] = {"lat": lat, "lon": lon, "heading": heading, "alt": alt}
            if alt and alt > 1000:
                entry["status"] = "live"
 
            if lat is not None and lon is not None:
                record_history(cs_norm, lat, lon, heading, alt)
 
        # AviationStack (best-effort) using converted iata
        avi_data, avi_err = fetch_aviationstack_for_iata(iata)
        if avi_data:
            entry["aviation"] = {
                "flight_date": avi_data.get("flight_date"),
                "flight_status": avi_data.get("flight_status"),
                "departure": avi_data.get("departure"),
                "arrival": avi_data.get("arrival"),
                "airline": avi_data.get("airline"),
                "flight": avi_data.get("flight"),
                "aircraft": avi_data.get("aircraft"),
                "live": avi_data.get("live"),
            }
            # If aviationstack says active/in-air etc, set status (but prefer opensky live)
            fs = avi_data.get("flight_status")
            if fs:
                if fs in ["scheduled", "landed"]:
                    entry["status"] = fs
            else:
                entry["aviation_error"] = avi_err
 
        # attach short history
        entry["history"] = POSITION_HISTORY.get(cs_norm, [])
 
        out.append(entry)
 
    return jsonify({"now": int(time.time()), "flights": out})
 
 
if __name__ == "__main__":
    print("Starting Hybrid Flight Tracker (AviationStack + OpenSky)")
    print("Open browser: http://127.0.0.1:5000")
    APP.run(debug=True, port=5000)
 