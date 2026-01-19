// main.js - frontend for hybrid tracker

let map, markerLayer, polylineLayer;
let markers = {};
let polylines = {};
let cardMap = {}; // callsign → DOM element
const DEFAULT_CALLSIGNS = ""; // removed default list

function initMap() {
  map = L.map("flights-map").setView([20, 0], 2);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 18 }).addTo(map);
  markerLayer = L.layerGroup().addTo(map);
  polylineLayer = L.layerGroup().addTo(map);
}


function planeIconSVG(color="#0b61ff") {
  const svg = `
  <svg width="48" height="48" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <path d="M21 16L13 12V7l2-2-2 1-3 1-3-1 2 2v5L3 16l3 1 1 3 3-2v3l2 1 2-1v-3l3 2 1-3 3-1z" fill="${color}"/>
  </svg>`;
  return L.divIcon({ html: svg, className: "plane-icon", iconSize: [48,48], iconAnchor: [24,24] });
}

function rotateSVG(element, angle) {
  if (!element) return;
  element.style.transform = `rotate(${angle}deg)`;
  element.style.transformOrigin = "24px 24px";
}

function buildCard(f) {
  const div = document.createElement("div");
  div.className = "flight-card";

  const status = f.status || "unknown";
  div.classList.add(`${status}-card`);

  div.dataset.callsign = f.callsign;


  const iata = f.iata || "";
  const dep = f.aviation && f.aviation.departure ? (f.aviation.departure.airport || "Unknown") : "Unknown";
  const arr = f.aviation && f.aviation.arrival ? (f.aviation.arrival.airport || "Unknown") : "Unknown";
  const eta =
  f.aviation?.arrival?.estimated
    ? new Date(f.aviation.arrival.estimated).toLocaleString([], {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit"
      })
    : "Unknown";


  div.innerHTML = `
     <div class="status-ring ${status}-ring"></div>
     
     <div class="card-row">
    <div>
      <div class="flight-name">${f.callsign}</div>
      <div class="flight-code">${iata}</div>
      ${f.leader ? `<div class="leader-name">Leader: ${f.leader}</div>` : ""}
    </div>
    <div class="status-pill ${status}">${status}</div>
  </div>

  <div class="card-row">
    <div>
      <div class="airport-code">${(f.aviation?.departure?.iata || "UNK")}</div>
      <div class="airport-city">${dep}</div>
    </div>

    <div class="center-arrow">
      <div>—— ✈ ——</div>
      <div class="eta-text">ETA: ${eta}</div>
    </div>

    <div>
      <div class="airport-code">${(f.aviation?.arrival?.iata || "UNK")}</div>
      <div class="airport-city">${arr}</div>
    </div>
  </div>

  <div class="gate-info">
    Gate / Terminal: <b>${f.aviation?.departure?.terminal || "N/A"}</b>
  </div>
`;

  div.addEventListener("click", () => focusOnFlight(f.callsign));
  return div;
}

async function loadFlights(callsigns, fromButton=false) {
  document.getElementById("loader").classList.remove("hidden");

  if (fromButton) {
      window.manualLoad = true;   // user clicked button → full refresh allowed
      document.getElementById("cards").innerHTML = "";
  }
  if (!callsigns || callsigns.trim() === "") {
    return; // nothing to load if input is empty
  }

  try {
    // Extract just callsigns (remove "-leader" part)
    let cleaned = callsigns
      .split(",")
      .map(x => x.split("-")[0].trim())
      .join(",");

    const url = `/api/flights?callsigns=${encodeURIComponent(cleaned)}`;

    const res = await fetch(url);
    const data = await res.json();
    renderFlights(data.flights || []);
    document.getElementById("loader").classList.add("hidden");

  } catch (err) {
    console.error("Failed to load flights:", err);
  }
}

function updateCard(card, f) {
  // reset status glow
  card.classList.remove("live-card", "landed-card", "unknown-card", "scheduled-card");
// apply new status glow
  const status = f.status || "unknown";
  card.classList.add(`${status}-card`);
  card.querySelector(".flight-name").textContent = f.callsign || "";
  card.querySelector(".flight-code").textContent = f.iata || "";
  card.querySelector(".status-pill").textContent = f.status || "unknown";

  // Departure IATA + city
  card.querySelectorAll(".airport-code")[0].textContent =
      f.aviation?.departure?.iata || "UNK";
  card.querySelectorAll(".airport-city")[0].textContent =
      f.aviation?.departure?.airport || "Unknown";

  // Arrival IATA + city
  card.querySelectorAll(".airport-code")[1].textContent =
      f.aviation?.arrival?.iata || "UNK";
  card.querySelectorAll(".airport-city")[1].textContent =
      f.aviation?.arrival?.airport || "Unknown";

  // ETA
 const eta =
  f.aviation?.arrival?.estimated
    ? new Date(f.aviation.arrival.estimated).toLocaleString([], {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit"
      })
    : "Unknown";

  card.querySelector(".eta-text").textContent = `ETA: ${eta}`;
}

function updateSummaryCounters(flights) {
  let total = flights.length;
  let live = flights.filter(f => f.status === "live").length;
  let landed = flights.filter(f => f.status === "landed").length;
  let scheduled = flights.filter(f => f.status === "scheduled").length;
  let unknown = flights.filter(f => f.status === "unknown").length;

  document.getElementById("sum-total").textContent = total;
  document.getElementById("sum-live").textContent = live;
  document.getElementById("sum-landed").textContent = landed;
  document.getElementById("sum-scheduled").textContent = scheduled;
  document.getElementById("sum-unknown").textContent = unknown;
}

function renderFlights(flights) {
// Read raw input again to extract leader names
const raw = document.getElementById("callsign-input").value;

// Build a map callsign → leader name
let leaderMap = {};
raw.split(",").forEach(x => {
    let parts = x.trim().split("-");
    if (parts.length === 2) {
        leaderMap[parts[0].trim().toUpperCase()] = parts[1].trim();
    }
});

// Attach leader to each flight
flights.forEach(f => {
    f.leader = leaderMap[f.callsign] || "";
});

const cards = document.getElementById("cards");

// Do NOT clear cards on polling — only clear on manual load
if (!window.manualLoad) {
    // update mode → do not remove cards
} else {
    cards.innerHTML = "";
    cardMap = {}; 
    window.manualLoad = false;
}

 // markerLayer.clearLayers();
  //polylineLayer.clearLayers();
  //markers = {};
  //polylines = {};

  const coords = [];

  flights.forEach(f => {
    let existingCard = cardMap[f.callsign];
    if (!existingCard) {
      const card = buildCard(f);
      cardMap[f.callsign] = card;
      cards.appendChild(card);
    } else {
      updateCard(existingCard, f);
    }




  });
  updateSummaryCounters(flights);
}

function focusOnFlight(callsign) {
  // 🔹 Fetch latest data ONLY when clicked
  fetch(`/api/flights?callsigns=${encodeURIComponent(callsign)}`)
    .then(r => r.json())
    .then(data => {
      const f = data.flights && data.flights[0];
      if (!f) return;

      if (!f.opensky || f.opensky.lat == null || f.opensky.lon == null) {
        alert(`No live position for ${callsign}`);
        return;
      }

      // 🔹 Clear previous markers (single-flight focus)
      markerLayer.clearLayers();
      markers = {};

      const lat = f.opensky.lat;
      const lon = f.opensky.lon;

      const icon = planeIconSVG("#0b61ff");
      const m = L.marker([lat, lon], { icon }).addTo(markerLayer);
      markers[callsign] = m;
      // 🔹 Marker popup: callsign + leader
    const leaderText =
      cardMap[callsign]?.querySelector(".leader-name")?.textContent || "Leader: N/A";

    m.bindPopup(
      `<b>${callsign}</b><br>${leaderText}`,
      {
        closeButton: false,   // ❌ remove cross
        autoClose: true,      // closes when clicking elsewhere
        closeOnClick: true    // clicking map closes popup
      }
  
    );


      // 🔹 Rotate plane if heading exists
      setTimeout(() => {
        const el = m.getElement();
        if (!el) return;
        const svg = el.querySelector("svg");
        if (svg && f.opensky.heading != null) {
          rotateSVG(svg, f.opensky.heading);
        }
      }, 80);

      map.setView([lat, lon], 6);
    })
    .catch(e => console.error(e));
}


function isTabActive() {
  return document.visibilityState === "visible";
}


function startPolling() {
  setInterval(() => {
    if (!isTabActive()) return; // 🚫 skip if tab not visible

    const cs = document.getElementById("callsign-input").value;
    if (cs && cs.trim() !== "") {
      loadFlights(cs, false);
    }
  }, 30000);
}


window.addEventListener("DOMContentLoaded", () => {
  initMap();

  // remove auto-fill
  document.getElementById("callsign-input").value = "";

  // load only when user clicks the button
  document.getElementById("load-btn").addEventListener("click", () => {
    const cs = document.getElementById("callsign-input").value;
    loadFlights(cs,true);
  });

  // start polling (only acts when input is not empty)
  startPolling();
});
