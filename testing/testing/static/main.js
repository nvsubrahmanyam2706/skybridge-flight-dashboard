// SKYBRIDGE — Executive Flight Intelligence Frontend (Final Cockpit Logic)

let map, markerLayer;
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
      <svg width="42" height="42" viewBox="0 0 24 24" fill="#00ff9c">
        <path d="M21 16L13 12V7l2-2-2 1-3 1-3-1 2 2v5L3 16l3 1 1 3 3-2v3l2 1 2-1v-3l3 2 1-3 3-1z"/>
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

addBtn.onclick = () => {
  modal.classList.remove("hidden");
  resetModalForm();
};

cancelBtn.onclick = () => modal.classList.add("hidden");

/* ============================================================
   RESET FORM
   ============================================================ */

function resetModalForm() {
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

saveBtn.onclick = async () => {
  const payload = {
    leader_name: leader_name.value,
    travel_date: travel_date.value,
    airline_iata: airline_iata.value,
    flight_number: flight_number.value,
    from_airport: from_airport.value,
    from_terminal: from_terminal.value,
    dep_time: dep_time.value,
    to_airport: to_airport.value,
    to_terminal: to_terminal.value,
    arr_time: arr_time.value,
  };

  const res = await fetch("/api/add-trip", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  const data = await res.json();
  if (data.status === "ok") {
    alert("Trip Saved");
    modal.classList.add("hidden");
    loadTrips();
  }
};

/* ============================================================
   LOAD TRIPS
   ============================================================ */
async function loadTrips() {
  const res = await fetch("/api/trips");
  const trips = await res.json();

  const cards = document.getElementById("cards");
  cards.innerHTML = "";

  trips.forEach(t => {
    const card = document.createElement("div");
    card.className = "flight-card";
    card.id = `card-${t.id}`;
    card.innerHTML = `
      <div class="card-row">
        <div>
          <div class="flight-name">${t.callsign}</div>
          <div class="leader-name">Leader: ${t.leader_name}</div>
        </div>

        <div class="status-slot" id="status-${t.callsign}"></div>

        <button class="delete-btn" onclick="deleteTrip(${t.id})">Delete</button>
      </div>

      <div class="route-row">
        ${t.from_airport} → ${t.to_airport}
      </div>

      <div class="time-row">
        ${t.dep_time} → ${t.arr_time}
      </div>
    `;

    card.onclick = () => focusFlight(t.callsign, t.leader_name, t.id);
    cards.appendChild(card);
  });

  // 🔥 THIS WAS MISSING
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
    statusSlot.innerHTML = `
      <div class="status-pill ${status}">
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
