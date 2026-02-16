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
import requests
import urllib3
import psycopg2
from urllib.parse import urlparse
from flask import Flask, render_template, request, jsonify
from dotenv import load_dotenv

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

# -------------------------------------------------
# ENV
# -------------------------------------------------
load_dotenv()
AVIATION_KEY = os.getenv("AVIATIONSTACK_API_KEY", "").strip()

#For production, set DATABASE_URL to a PostgreSQL connection string
DATABASE_URL = os.getenv("DATABASE_URL")

def get_connection():
    if DATABASE_URL:
        # Production → PostgreSQL
        url = urlparse(DATABASE_URL)
        return psycopg2.connect(
            host=url.hostname,
            database=url.path[1:],
            user=url.username,
            password=url.password,
            port=url.port
        )
    else:
        # Local → SQLite
        return sqlite3.connect(DB_FILE)


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
    conn = get_connection()

    c = conn.cursor()

    c.execute("""
    CREATE TABLE IF NOT EXISTS trips (
        id SERIAL PRIMARY KEY,
        coordinator_name TEXT,
        employee_code TEXT,
        leader_name TEXT,
        travel_date TEXT,
        flight_number TEXT,
        callsign TEXT,
        from_airport TEXT,
        from_terminal TEXT,
        dep_time TEXT,
        to_airport TEXT,
        to_terminal TEXT,
        arr_time TEXT,
        status TEXT DEFAULT 'UNKNOWN'
    )
    """)

    conn.commit()
    conn.close()

init_db()

# -------------------------------------------------
# HELPERS
# -------------------------------------------------

def fetch_flight_data(callsign):
    if not AVIATION_KEY:
        return None

    params = {
        "access_key": AVIATION_KEY,
        "flight_iata": callsign,
        "limit": 1
    }

    try:
        r = requests.get(
            AVIATIONSTACK_ENDPOINT,
            params=params,
            timeout=12,
            verify=False
        )
        r.raise_for_status()
        data = r.json().get("data", [])
        if data:
            return data[0]
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
    callsign = data["flight_number"].strip().upper()

    import re
    if not re.match(r"^[A-Z0-9]{1,3}[0-9]{1,4}$", callsign):
        return jsonify({"error": "Invalid flight number"}), 400

    
    conn = get_connection()
    c = conn.cursor()

    c.execute("""
        INSERT INTO trips (
            coordinator_name, employee_code,
            leader_name, travel_date, flight_number, callsign,
            from_airport, from_terminal, dep_time,
            to_airport, to_terminal, arr_time, status
        )
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)

    """, (
        data["coordinator_name"],
        data["employee_code"],
        data["leader_name"],
        data["travel_date"],
        data["flight_number"],
        callsign,
        data["from_airport"],
        data["from_terminal"],
        data["dep_time"],
        data["to_airport"],
        data["to_terminal"],
        data["arr_time"],
        "UNKNOWN"
    ))

    conn.commit()
    conn.close()
    return jsonify({"status": "ok"})

# -------------------- LOAD TRIPS (UI) --------------------
@APP.route("/api/trips")
def get_trips():
    conn = get_connection()

    c = conn.cursor()

    # 🔥 Hide ENDED trips from UI
    c.execute("""
        SELECT * FROM trips
        ORDER BY id DESC
    """)
    rows = c.fetchall()
    conn.close()

    trips = []
    for r in rows:
        trips.append({
            "id": r[0],
            "coordinator_name": r[1],
            "employee_code": r[2],
            "leader_name": r[3],
            "travel_date": r[4],
            "flight_number": r[5],
            "callsign": r[6],
            "from_airport": r[7],
            "from_terminal": r[8],
            "dep_time": r[9],
            "to_airport": r[10],
            "to_terminal": r[11],
            "arr_time": r[12],
            "status": r[13]
        })

    return jsonify(trips)

# -------------------- LOAD ALL TRIPS (DATABASE VIEW) --------------------
@APP.route("/api/trips-all")
def get_all_trips():
    conn = get_connection()

    c = conn.cursor()

    c.execute("SELECT * FROM trips ORDER BY id DESC")
    rows = c.fetchall()
    conn.close()

    trips = []
    for r in rows:
        trips.append({
            "id": r[0],
            "coordinator_name": r[1],
            "employee_code": r[2],
            "leader_name": r[3],
            "travel_date": r[4],
            "flight_number": r[5],
            "callsign": r[6],
            "from_airport": r[7],
            "from_terminal": r[8],
            "dep_time": r[9],
            "to_airport": r[10],
            "to_terminal": r[11],
            "arr_time": r[12],
            "status": r[13]
        })

    return jsonify(trips)


# -------------------- END TRIP (REPLACES DELETE) --------------------
@APP.route("/api/end-trip/<int:trip_id>", methods=["POST"])
def end_trip(trip_id):
    conn = get_connection()

    c = conn.cursor()

    c.execute("""
        UPDATE trips
        SET status = 'ENDED'
        WHERE id = %s
    """, (trip_id,))

    conn.commit()
    conn.close()
    return jsonify({"status": "ended"})

# -------------------- UPDATE TRIP (EDIT) --------------------
@APP.route("/api/update-trip/<int:trip_id>", methods=["POST"])
def update_trip(trip_id):

    data = request.json

    conn = get_connection()
    c = conn.cursor()

    # 🚨 DO NOT TOUCH STATUS COLUMN
    c.execute("""
        UPDATE trips
        SET
            coordinator_name = %s,
            employee_code = %s,
            leader_name = %s,
            travel_date = %s,
            flight_number = %s,
            callsign = %s,
            from_airport = %s,
            from_terminal = %s,
            dep_time = %s,
            to_airport = %s,
            to_terminal = %s,
            arr_time = %s
        WHERE id = %s
    """, (
        data["coordinator_name"],
        data["employee_code"],
        data["leader_name"],
        data["travel_date"],
        data["flight_number"],
        data["flight_number"].strip().upper(),
        data["from_airport"],
        data["from_terminal"],
        data["dep_time"],
        data["to_airport"],
        data["to_terminal"],
        data["arr_time"],
        trip_id
    ))

    conn.commit()
    conn.close()

    return jsonify({"status": "updated"})


# -------------------- LIVE FLIGHT & STATUS SYNC --------------------
@APP.route("/api/flight/<callsign>")
def get_flight(callsign):
    flight_obj = fetch_flight_data(callsign)

    conn = get_connection()

    c = conn.cursor()

    if not flight_obj:
        # No live data → mark LANDED if previously ACTIVE
        c.execute("""
            UPDATE trips
            SET status = 'LANDED'
            WHERE callsign = %s AND status = 'ACTIVE'
        """, (callsign,))
        conn.commit()
        conn.close()
        return jsonify({"flight": None})

    live = flight_obj.get("live")
    flight_status = flight_obj.get("flight_status")

    if live:
        derived_status = "ACTIVE"
    elif flight_status == "landed":
        derived_status = "LANDED"
    else:
        derived_status = "UNKNOWN"

    # 🔁 Sync status to DB (skip ENDED)
    c.execute("""
        UPDATE trips
        SET status = %s
        WHERE callsign = %s AND status != 'ENDED'
    """, (derived_status, callsign))

    conn.commit()
    conn.close()

    return jsonify({
        "flight": {
            "callsign": callsign,
            "status": derived_status,
            "live": live
        }
    })

# -------------------------------------------------
# START
# -------------------------------------------------
if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    APP.run(host="0.0.0.0", port=port, debug=True)
