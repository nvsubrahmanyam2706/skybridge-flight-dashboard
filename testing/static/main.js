// SKYBRIDGE — Executive Flight Intelligence Frontend (Final Cockpit Logic)

let map, markerLayer;
let editTripId = null;
let activeMarker = null;

function initMap() {
  map = L.map("flights-map").setView([20, 0], 2);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 18
  }).addTo(map);

  markerLayer = L.layerGroup().addTo(map);
}

/* ============================================================
   PLANE ICON
   ============================================================ */

function planeIcon() {
  return L.divIcon({
    className: "plane-marker",
    html: `
      <svg width="42" height="42" viewBox="0 0 24 24" fill="#3ba9ff">
        <path d="M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3-1 3 1v-1.5L13 19v-5.5l8 2.5z"/>
      </svg>
    `,
    iconSize: [42, 42],
    iconAnchor: [21, 21],
    popupAnchor: [0, -22]
  });
}

/* ============================================================
   MODAL
   ============================================================ */

const modal = document.getElementById("trip-modal");
const addBtn = document.getElementById("add-trip-btn");
const cancelBtn = document.getElementById("cancel-btn");
const saveBtn = document.getElementById("save-btn");
/* ============================================================
   DATABASE MODAL ELEMENTS
============================================================ */

const databaseBtn = document.getElementById("database-btn");
const databaseModal = document.getElementById("database-modal");
const closeDbBtn = document.getElementById("close-db-btn");
const exportCsvBtn = document.getElementById("export-csv-btn");


addBtn.onclick = () => {
  modal.classList.remove("hidden");
    // 🔥 HARD RESET (fixes old values issue)
  document.querySelector("#trip-modal form")?.reset();
  
};

cancelBtn.onclick = () => modal.classList.add("hidden");

/* ============================================================
   RESET FORM
   ============================================================ */

function resetModalForm() {
  coordinator_name.value = "";
  employee_code.value = "";
  leader_name.value = "";
  travel_date.value = "";
  airline_iata.value = "";
  flight_number.value = "";
  from_airport.value = "";
  from_terminal.value = "";
  dep_time.value = "";
  to_airport.value = "";
  to_terminal.value = "";
  arr_time.value = "";
}

/* ============================================================
   SAVE TRIP
   ============================================================ */
/* ============================================================
   SAVE TRIP
   ============================================================ */

saveBtn.onclick = async () => {

  // ✅ frontend validation
  const flightNo = flight_number.value.trim().toUpperCase();

  if (!/^[A-Z0-9]{1,3}[0-9]{1,4}$/.test(flightNo)) {
    alert("Enter valid flight number (example: 3U3815, AA8, EK202)");
    return;
  }

  const payload = {
    coordinator_name: coordinator_name.value,
    employee_code: employee_code.value,
    leader_name: leader_name.value,
    travel_date: travel_date.value,
    flight_number: flightNo,
    from_airport: from_airport.value,
    from_terminal: from_terminal.value,
    dep_time: dep_time.value,
    to_airport: to_airport.value,
    to_terminal: to_terminal.value,
    arr_time: arr_time.value
  };

  // 🔁 SWITCH BETWEEN ADD & EDIT
  let url = "/api/add-trip";

  if (editTripId) {
    url = `/api/update-trip/${editTripId}`;
  }

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    const err = await res.json();
    alert(err.error || "Failed");
    return;
  }

  alert(editTripId ? "Trip Updated" : "Trip Saved");

  modal.classList.add("hidden");

  // 🧹 Reset edit mode after update
  editTripId = null;

  loadTrips();
};

/* ============================================================
   LOAD TRIPS (UI CARDS)
   ============================================================ */
/* ============================================================
   LOAD TRIPS (UI CARDS)
   ============================================================ */
async function loadTrips() {
  const res = await fetch("/api/trips-all");
  const trips = await res.json();

  const cards = document.getElementById("cards");
  cards.innerHTML = "";

  trips.forEach(t => {
    // ❌ hide ended trips from cards only
    if (t.status === "ENDED") return;

    const card = document.createElement("div");
    card.className = "flight-card";
    card.id = `card-${t.id}`;

    card.innerHTML = `
      <div class="card-row">
        <div>
          <div class="flight-name">${t.callsign}</div>
          <div class="leader-name">Leader: ${t.leader_name}</div>
        </div>

        <div class="status-slot" id="status-${t.callsign}">
          ${
            t.status
              ? `<div class="status-pill ${t.status.toLowerCase()}">
                   ${t.status}
                 </div>`
              : ""
          }
        </div>

        <!-- NEW 3 DOT MENU -->
        <div class="menu-wrapper" onclick="event.stopPropagation()">
          <button class="menu-btn"
            onclick="toggleMenu(${t.id})">
            ⋮
          </button>

          <div class="menu-dropdown hidden" id="menu-${t.id}">
            <div onclick="editTrip(${t.id})">Edit Trip</div>
            <div onclick="endTrip(${t.id})">End Trip</div>
          </div>
        </div>
      </div>

      <!-- ROUTE -->
      <div class="route-row">
        <span class="airport-code">${t.from_airport}</span>
        <span class="route-arrow">→</span>
        <span class="airport-code">${t.to_airport}</span>
      </div>

      <!-- TIME -->
      <div class="time-row">
        <span class="time-label">Time</span>
        <span class="time-value">${t.dep_time} → ${t.arr_time}</span>
      </div>

      <!-- TERMINAL -->
      <div class="terminal-row">
        Gate / Terminal:
        <span>${t.from_terminal || "-"} → ${t.to_terminal || "-"}</span>
      </div>
    `;

    // 🎯 Clicking card focuses flight
    card.onclick = () => focusFlight(t.callsign, t.leader_name, t.id);

    cards.appendChild(card);
  });

  updateSummaryCounters();
}


/* ============================================================
   UPDATE SUMMARY COUNTERS
   ============================================================ */

function updateSummaryCounters() {
  const cards = document.querySelectorAll(".flight-card");

  let total = cards.length;
  let active = 0;
  let scheduled = 0;
  let landed = 0;
  let unknown = 0;

  cards.forEach(card => {
    const pill = card.querySelector(".status-pill");

    if (!pill) {
      unknown++;
      return;
    }

    const status = pill.textContent.trim().toLowerCase();

    if (status === "active") active++;
    else if (status === "scheduled") scheduled++;
    else if (status === "landed") landed++;
    else unknown++;
  });

  document.getElementById("sum-total").textContent = total;
  document.getElementById("sum-active").textContent = active;
  document.getElementById("sum-scheduled").textContent = scheduled;
  document.getElementById("sum-landed").textContent = landed;
  document.getElementById("sum-unknown").textContent = unknown;
}

/* ============================================================
   DELETE TRIP
   ============================================================ */

async function deleteTrip(id) {
  if (!confirm("Delete this trip?")) return;

  await fetch(`/api/delete-trip/${id}`, { method: "DELETE" });

  // Remove marker if exists
  if (activeMarker) {
    markerLayer.clearLayers();
    activeMarker = null;
  }

  loadTrips();
  setTimeout(updateSummaryCounters, 200);
}

/* ============================================================
   END TRIP (GLOBAL – REQUIRED)
============================================================ */

async function endTrip(id) {
  if (!confirm("End this trip?")) return;

  await fetch(`/api/end-trip/${id}`, {
    method: "POST"
  });

  if (activeMarker) {
    markerLayer.clearLayers();
    activeMarker = null;
  }

  loadTrips();
}

/* ============================================================
   FOCUS FLIGHT
   ============================================================ */

async function focusFlight(callsign, leader, id) {
  const res = await fetch(`/api/flight/${callsign}`);
  const data = await res.json();

  // Remove old marker always
  markerLayer.clearLayers();
  activeMarker = null;

  if (!data.flight) {
    alert("No flight data available.");
    return;
  }

  const live = data.flight.live;

  // ✅ STATUS DERIVATION LOGIC (IMPORTANT FIX)
  let status = data.flight.status || "unknown";

  // If live coordinates exist → flight is ACTIVE
  if (live && (!status || status === "unknown")) {
    status = "active";
  }

  // If still no live → stop here (but status may be scheduled/unknown)
  if (!live) {
    alert("No live position for this flight yet.");
  } else {
    const lat = live.latitude;
    const lon = live.longitude;

    const marker = L.marker([lat, lon], { icon: planeIcon() }).addTo(markerLayer);
    activeMarker = marker;

    marker.bindPopup(`
      <b>${callsign}</b><br/>
      Leader: ${leader}<br/>
      Status: ${status.toUpperCase()}
    `).openPopup();

    map.setView([lat, lon], 6);
  }
  // ✅ update badge on card ONLY after API call
  const statusSlot = document.getElementById(`status-${callsign}`);
  if (statusSlot) {
    const statusClass = status.toLowerCase();   // ⭐ THIS IS THE FIX

    statusSlot.innerHTML = `
      <div class="status-pill ${statusClass}">
        ${status.toUpperCase()}
      </div>
    `;
  }
  updateSummaryCounters();

}


/* ============================================================
   INIT
   ============================================================ */

window.onload = () => {
  initMap();
  loadTrips();
};

/* ============================================================
   DATABASE OPEN / CLOSE
============================================================ */

if (databaseBtn) {
  databaseBtn.addEventListener("click", () => {
    databaseModal.classList.remove("hidden");
    loadDatabaseTable();
  });
}

if (closeDbBtn) {
  closeDbBtn.addEventListener("click", () => {
    databaseModal.classList.add("hidden");
  });
}
/* ============================================================
   LOAD DATABASE TABLE
============================================================ */

async function loadDatabaseTable() {
  const tbody = document.getElementById("db-table-body");
  tbody.innerHTML = "";

  const res = await fetch("/api/trips-all");
  const trips = await res.json();

  trips.forEach(t => {
    const row = document.createElement("tr");

    row.innerHTML = `
      <td>${t.id}</td>
      <td>${t.coordinator_name || "-"}</td>
      <td>${t.employee_code || "-"}</td>
      <td>${t.leader_name}</td>
      <td>${t.travel_date}</td>
      <td>${t.flight_number}</td>
      <td>${t.from_airport}</td>
      <td>${t.from_terminal || "-"}</td>
      <td>${t.to_airport}</td>
      <td>${t.to_terminal || "-"}</td>
      <td>${t.dep_time}</td>
      <td>${t.arr_time}</td>
      <td>${t.status}</td>
    `;

    tbody.appendChild(row);
  });
}

/* ============================================================
   EXPORT CSV
============================================================ */

if (exportCsvBtn) {
  exportCsvBtn.addEventListener("click", async () => {
    const res = await fetch("/api/trips-all");
    const trips = await res.json();

    let csv =
      "Trip ID,Coordinator,Emp Code,Leader,Date,Flight No,From,From Terminal,To,To Terminal,Dep Time,Arr Time,Status\n";

    trips.forEach(t => {
      csv += `"${t.id || ""}","${t.coordinator_name || ""}","${t.employee_code || ""}","${t.leader_name || ""}","${t.travel_date || ""}","${t.flight_number || ""}","${t.from_airport || ""}","${t.from_terminal || ""}","${t.to_airport || ""}","${t.to_terminal || ""}","${t.dep_time || ""}","${t.arr_time || ""}","${t.status || ""}"\n`;
    });

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");

    link.href = URL.createObjectURL(blob);
    link.download = "trip_database.csv";
    link.click();
  });
}

function toggleMenu(id) {

  document.querySelectorAll(".menu-dropdown")
    .forEach(m => m.classList.add("hidden"));

  document.getElementById(`menu-${id}`)
    .classList.toggle("hidden");
}


async function editTrip(id) {

  const res = await fetch("/api/trips-all");
  const trips = await res.json();

  const trip = trips.find(t => t.id === id);
  if (!trip) return;

  editTripId = id;

  coordinator_name.value = trip.coordinator_name;
  employee_code.value = trip.employee_code;
  leader_name.value = trip.leader_name;
  travel_date.value = trip.travel_date;
  flight_number.value = trip.flight_number;
  from_airport.value = trip.from_airport;
  from_terminal.value = trip.from_terminal;
  dep_time.value = trip.dep_time;
  to_airport.value = trip.to_airport;
  to_terminal.value = trip.to_terminal;
  arr_time.value = trip.arr_time;

  modal.classList.remove("hidden");
}
