# --- Python 3.14 Fix for Flask ---
import pkgutil, importlib
if not hasattr(pkgutil, "get_loader"):
    def get_loader(name):
        try:
            return importlib.util.find_spec(name)
        except:
            return None
    pkgutil.get_loader = get_loader
# SKYBRIDGE — Executive Flight Intelligence Backend (Production)

import os
import sqlite3
import time
import requests
import urllib3
from flask import Flask, render_template, request, jsonify
from dotenv import load_dotenv

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

# -------------------------------------------------
# ENV
# -------------------------------------------------
load_dotenv()
AVIATION_KEY = os.getenv("AVIATIONSTACK_API_KEY", "").strip()

# -------------------------------------------------
# APP
# -------------------------------------------------
APP = Flask(__name__, static_folder="static", template_folder="templates")

DB_FILE = "skybridge.db"
AVIATIONSTACK_ENDPOINT = "http://api.aviationstack.com/v1/flights"

# -------------------------------------------------
# DATABASE
# -------------------------------------------------

def init_db():
    conn = sqlite3.connect(DB_FILE)
    c = conn.cursor()

    c.execute("""
    CREATE TABLE IF NOT EXISTS trips (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        leader_name TEXT,
        travel_date TEXT,
        airline_iata TEXT,
        flight_number TEXT,
        callsign TEXT,
        from_airport TEXT,
        from_terminal TEXT,
        dep_time TEXT,
        to_airport TEXT,
        to_terminal TEXT,
        arr_time TEXT
    )
    """)

    conn.commit()
    conn.close()


init_db()

# -------------------------------------------------
# HELPERS
# -------------------------------------------------

def make_callsign(airline_iata, flight_number):
    return f"{airline_iata.upper()}{flight_number.strip()}"


def fetch_flight_data(callsign):
    if not AVIATION_KEY:
        return None

    params = {
        "access_key": AVIATION_KEY,
        "flight_iata": callsign,
        "limit": 1
    }

    try:
        r = requests.get(AVIATIONSTACK_ENDPOINT, params=params, timeout=12, verify=False)
        r.raise_for_status()
        data = r.json().get("data", [])

        if data:
            return data[0]   # return single flight object

    except Exception as e:
        print("AviationStack Error:", e)

    return None



# -------------------------------------------------
# ROUTES
# -------------------------------------------------

@APP.route("/")
def index():
    return render_template("index.html")


# -------------------- ADD TRIP --------------------
@APP.route("/api/add-trip", methods=["POST"])
def add_trip():
    data = request.json

    callsign = make_callsign(data["airline_iata"], data["flight_number"])

    conn = sqlite3.connect(DB_FILE)
    c = conn.cursor()

    c.execute("""
        INSERT INTO trips (
            leader_name, travel_date, airline_iata, flight_number, callsign,
            from_airport, from_terminal, dep_time,
            to_airport, to_terminal, arr_time
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        data["leader_name"],
        data["travel_date"],
        data["airline_iata"],
        data["flight_number"],
        callsign,
        data["from_airport"],
        data["from_terminal"],
        data["dep_time"],
        data["to_airport"],
        data["to_terminal"],
        data["arr_time"]
    ))

    conn.commit()
    conn.close()

    return jsonify({"status": "ok"})


# -------------------- LOAD TRIPS --------------------
@APP.route("/api/trips")
def get_trips():
    conn = sqlite3.connect(DB_FILE)
    c = conn.cursor()

    c.execute("SELECT * FROM trips ORDER BY id DESC")
    rows = c.fetchall()
    conn.close()

    trips = []
    for r in rows:
        trips.append({
            "id": r[0],
            "leader_name": r[1],
            "travel_date": r[2],
            "airline_iata": r[3],
            "flight_number": r[4],
            "callsign": r[5],
            "from_airport": r[6],
            "from_terminal": r[7],
            "dep_time": r[8],
            "to_airport": r[9],
            "to_terminal": r[10],
            "arr_time": r[11],
        })

    return jsonify(trips)


# -------------------- DELETE TRIP --------------------
@APP.route("/api/delete-trip/<int:trip_id>", methods=["DELETE"])
def delete_trip(trip_id):
    conn = sqlite3.connect(DB_FILE)
    c = conn.cursor()
    c.execute("DELETE FROM trips WHERE id=?", (trip_id,))
    conn.commit()
    conn.close()

    return jsonify({"status": "deleted"})


# -------------------- LIVE FLIGHT --------------------
@APP.route("/api/flight/<callsign>")
def get_flight(callsign):
    flight_obj = fetch_flight_data(callsign)

    if not flight_obj:
        return jsonify({"flight": None})

    flight_status = flight_obj.get("flight_status")

    # ✅ Derive status if missing
    if not flight_status and flight_obj.get("live"):
        flight_status = "active"

    return jsonify({
        "flight": {
            "callsign": callsign,
            "status": flight_status or "unknown",
            "live": flight_obj.get("live")
        }
    })


# -------------------------------------------------
# START
# -------------------------------------------------

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    APP.run(host="0.0.0.0", port=port, debug=True)
