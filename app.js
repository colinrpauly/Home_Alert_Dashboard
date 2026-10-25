
"use strict";

const $ = id => document.getElementById(id);

const statusTopic = "home/security/status";
const commandTopic = "home/security/command";

let client = null;
let lastStatus = 0;
let currentStatus = null;

const modeNames = ["Off", "Monitor", "Armed"];
const savedLoginKey = "homeAlertSavedLogin";

function getSavedLogin() {
  try {
    return JSON.parse(localStorage.getItem(savedLoginKey) || "null");
  } catch {
    return null;
  }
}

function saveLogin(host, username, password) {
  localStorage.setItem(savedLoginKey, JSON.stringify({
    host, username, password
  }));
}

function forgetLogin() {
  localStorage.removeItem(savedLoginKey);
}

function connected() {
  return !!client?.connected;
}

function refresh() {

  const fresh =
    connected() &&
    currentStatus &&
    Date.now() - lastStatus < 45000;

  $("connection").textContent = connected()
    ? (fresh ? "● Connected" : "● Waiting for fresh status")
    : "● Disconnected";

  $("updated").textContent = lastStatus
    ? `Last update: ${new Date(lastStatus).toLocaleTimeString()}`
    : "Waiting for status";

  const s = fresh ? currentStatus : null;
  const mode = s?.mode;

  // System mode
  $("mode").textContent =
    Number.isInteger(mode) && mode >= 0 && mode <= 2
      ? modeNames[mode]
      : "Status unavailable";

  $("modeDetail").textContent =
    mode === 0 ? "Local motion alarm is off." :
    mode === 1 ? "Motion monitoring with a brief chirp." :
    mode === 2 ? "Alarm sounds when motion is detected." :
    "Waiting for a recent status message.";

  $("hero").classList.toggle("armed", mode === 2);

  $("heroicon").textContent =
    mode === 2 ? "⬡" :
    mode === 1 ? "◎" : "◇";

  // Physical switch and remote controls
  document.querySelectorAll("[data-mode]").forEach(b => {
    const n = Number(b.dataset.mode);

    b.disabled = !fresh || s.switchPosition !== 1;
    b.classList.toggle("selected", mode === n);
  });

  $("override").textContent =
    !fresh
      ? "Controls locked until a fresh status is received."
      : s.switchPosition === 1
        ? "Physical selector: REMOTE · App controls enabled"
        : s.switchPosition === 0
          ? "Physical selector: OFF · App controls locked"
          : "Physical selector: ARMED · App controls locked";

  // Downstairs sensor
  $("sensor").textContent =
    !fresh ? "Unknown" :
    s.sensorOnline ? "Online" : "Offline";

  $("sensor").className =
    "pill " +
    (!fresh ? "" : s.sensorOnline ? "good" : "bad");

  $("heartbeat").textContent =
    !fresh ? "Unknown" :
    s.sensorOnline ? "Receiving" : "Not receiving";

  // Alarm
  $("alarm").textContent =
    !fresh ? "Unknown" :
    s.alarmActive ? "ACTIVE" : "Inactive";

  $("alarm").className =
    "pill " +
    (!fresh ? "" : s.alarmActive ? "bad" : "good");

  $("silence").disabled =
    !fresh ||
    s.switchPosition !== 1 ||
    !s.alarmActive;

  $("lastMotion").textContent =
    !fresh
      ? "Unavailable"
      : (typeof s.lastMotion === "string"
          ? s.lastMotion
          : "Unavailable");

  // MASTER BATTERY MONITORING

  const power = $("powerSource");

  power.textContent =
    !fresh ? "Unknown" :
    typeof s.wallPowerPresent !== "boolean"
      ? "Unavailable"
      : s.wallPowerPresent
        ? "Wall power"
        : "Battery backup";

  power.className =
    "pill " +
    (!fresh || typeof s.wallPowerPresent !== "boolean"
      ? ""
      : s.wallPowerPresent ? "good" : "warn");

  const valid =
    fresh &&
    s.batteryValid === true &&
    typeof s.batteryPercent === "number" &&
    Number.isFinite(s.batteryPercent) &&
    typeof s.batteryVoltage === "number" &&
    Number.isFinite(s.batteryVoltage);

  const pct = valid
    ? Math.max(0, Math.min(100, s.batteryPercent))
    : 0;

  $("batteryPercent").textContent =
    valid ? `${pct.toFixed(1)}%` : "Unavailable";

  $("batteryVoltage").textContent =
    valid ? `${s.batteryVoltage.toFixed(2)} V` : "Unavailable";

  $("batteryFill").style.width =
    valid ? `${pct}%` : "0%";

  $("batteryFill").classList.toggle(
    "low", valid && pct <= 20
  );

  $("batteryTrack").setAttribute(
    "aria-valuenow",
    valid ? String(Math.round(pct)) : "0"
  );

  // DOWNSTAIRS PIR BATTERY MONITORING

  const downstairsPower = $("downstairsPowerSource");

  const downstairsValid =
    fresh &&
    typeof s.downstairsBatteryPercent === "number" &&
    Number.isFinite(s.downstairsBatteryPercent) &&
    typeof s.downstairsBatteryVoltage === "number" &&
    Number.isFinite(s.downstairsBatteryVoltage) &&
    s.downstairsBatteryVoltage > 2.0 &&
    s.downstairsBatteryVoltage < 4.5 &&
    s.downstairsBatteryPercent >= 0 &&
    s.downstairsBatteryPercent <= 100;

  const downstairsPct = downstairsValid
    ? s.downstairsBatteryPercent
    : 0;

  // Downstairs power source
  downstairsPower.textContent =
    !downstairsValid ? "Unknown" :
    s.downstairsWallPower === true ? "Wall power" :
    s.downstairsWallPower === false ? "Battery backup" :
    "Unknown";

  downstairsPower.className =
    "pill " +
    (!downstairsValid ? "" :
      s.downstairsWallPower === true ? "good" :
      s.downstairsWallPower === false ? "warn" : "");

  // Downstairs battery percentage
  $("downstairsBatteryPercent").textContent =
    downstairsValid
      ? `${downstairsPct.toFixed(1)}%`
      : "Unavailable";

  // Downstairs battery voltage
  $("downstairsBatteryVoltage").textContent =
    downstairsValid
      ? `${s.downstairsBatteryVoltage.toFixed(2)} V`
      : "Unavailable";

  // Downstairs battery bar
  $("downstairsBatteryFill").style.width =
    downstairsValid ? `${downstairsPct}%` : "0%";

  $("downstairsBatteryFill").classList.toggle(
    "low",
    downstairsValid && downstairsPct <= 20
  );

  $("downstairsBatteryTrack").setAttribute(
    "aria-valuenow",
    downstairsValid
      ? String(Math.round(downstairsPct))
      : "0"
  );
}

// LOGIN AND MQTT CONNECTION

function showLogin() {
  $("dialog").classList.remove("hidden");
  $("loginError").textContent = "";
}

function closeLogin() {
  $("dialog").classList.add("hidden");
}

$("settings").onclick = () => {
  if (client) {
    client.end(true);
    client = null;
    currentStatus = null;
    lastStatus = 0;
    $("settings").textContent = "Connect";
    refresh();
  } else {
    showLogin();
  }
};

$("cancel").onclick = closeLogin;

$("forget").onclick = () => {

  // Delete saved login credentials
  forgetLogin();

  // Disconnect from MQTT
  if (client) {
    client.end(true);
    client = null;
  }

  // Clear login fields
  $("host").value = "";
  $("user").value = "";
  $("password").value = "";

  // Reset connection status
  currentStatus = null;
  lastStatus = 0;

  $("settings").textContent = "Connect";
  $("connect").disabled = false;

  // Close login window and update dashboard
  closeLogin();
  refresh();
};

$("login").onsubmit = e => {

  e.preventDefault();

  if (typeof mqtt === "undefined") {
    $("loginError").textContent =
      "MQTT library could not load. Check your connection.";
    return;
  }

  const host = $("host").value.trim();
  const username = $("user").value.trim();
  const password = $("password").value;

  if (!/^[a-z0-9.-]+$/i.test(host)) {
    $("loginError").textContent = "Invalid hostname";
    return;
  }

  $("connect").disabled = true;
  $("loginError").textContent = "Connecting…";

  const c = mqtt.connect(`wss://${host}:8084/mqtt`, {
    username,
    password,
    clientId:
      "home-alert-phone-" +
      Math.random().toString(16).slice(2),
    clean: true,
    reconnectPeriod: 5000,
    connectTimeout: 12000,
    protocolVersion: 4
  });

  client = c;

  $("password").value = "";

  c.on("connect", () => {

    saveLogin(host, username, password);

    c.subscribe(statusTopic, { qos: 0 }, err => {
      if (err) {
        $("loginError").textContent =
          "Could not subscribe to status.";
      }
    });

    closeLogin();

    $("settings").textContent = "Disconnect";
    $("connect").disabled = false;

    refresh();
  });

  c.on("message", (topic, payload) => {

    if (topic !== statusTopic) return;

    try {

      const s = JSON.parse(payload.toString());

      if (
        ![0, 1, 2].includes(s.mode) ||
        ![0, 1, 2].includes(s.switchPosition) ||
        typeof s.sensorOnline !== "boolean" ||
        typeof s.alarmActive !== "boolean"
      ) {
        return;
      }

      currentStatus = s;
      lastStatus = Date.now();

      refresh();

    } catch {}
  });

  c.on("error", () => {
    $("loginError").textContent =
      "Connection failed. Check credentials, ACL, and WSS endpoint.";

    $("connect").disabled = false;
    refresh();
  });

  c.on("close", refresh);
};

// MODE BUTTONS

document.querySelectorAll("[data-mode]").forEach(b => {

  b.onclick = () => {

    if (
      !connected() ||
      !currentStatus ||
      Date.now() - lastStatus >= 45000 ||
      currentStatus.switchPosition !== 1
    ) {
      return;
    }

    const mode = b.dataset.mode;

    client.publish(
      commandTopic,
      mode,
      { qos: 0, retain: false },
      err => {
        if (err) alert("Command could not be sent.");
      }
    );
  };
});

// SILENCE ALARM

$("silence").onclick = () => {

  if (
    !connected() ||
    !currentStatus ||
    Date.now() - lastStatus >= 45000 ||
    currentStatus.switchPosition !== 1 ||
    !currentStatus.alarmActive
  ) {
    return;
  }

  client.publish(
    commandTopic,
    "S",
    { qos: 0, retain: false },
    err => {
      if (err) alert("Silence command could not be sent.");
    }
  );
};

// AUTOMATIC LOGIN

function autoLogin() {

  const saved = getSavedLogin();

  if (
    !saved ||
    !saved.host ||
    !saved.username ||
    !saved.password
  ) {
    return;
  }

  if (typeof mqtt === "undefined") {
    console.log(
      "MQTT library unavailable for automatic login"
    );
    return;
  }

  $("host").value = saved.host;
  $("user").value = saved.username;
  $("password").value = saved.password;

  $("login").requestSubmit();
}

setInterval(refresh, 3000);

refresh();
autoLogin();
