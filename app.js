
"use strict";

const $ = id => document.getElementById(id);

const statusTopic = "home/security/status";
const commandTopic = "home/security/command";
const savedLoginKey = "homeAlertSavedLogin";

const modeNames = ["Off", "Monitor", "Armed"];

let client = null;
let currentStatus = null;
let lastStatus = 0;

function connected() {
  return client !== null && client.connected === true;
}

function getSavedLogin() {
  try {
    const saved = localStorage.getItem(savedLoginKey);
    return saved ? JSON.parse(saved) : null;
  } catch (error) {
    return null;
  }
}

function saveLogin(details) {
  localStorage.setItem(savedLoginKey, JSON.stringify(details));
}

function forgetLogin() {
  localStorage.removeItem(savedLoginKey);
}

function showDialog() {
  const saved = getSavedLogin();

  if (saved) {
    $("host").value = saved.host || "";
    $("user").value = saved.username || "";
    $("password").value = saved.password || "";
  }

  $("loginError").textContent = "";
  $("dialog").classList.remove("hidden");
}

function hideDialog() {
  $("dialog").classList.add("hidden");
}

function sendCommand(command) {
  if (!connected()) return;

  client.publish(commandTopic, command, {
    qos: 1,
    retain: false
  });
}

function refresh() {
  const fresh = Boolean(
    connected() &&
    currentStatus &&
    Date.now() - lastStatus < 45000
  );

  const s = fresh ? currentStatus : null;

  $("connection").textContent =
    !connected() ? "Disconnected" :
    fresh ? "Connected" : "Waiting for status";

  $("settings").textContent = connected() ? "Settings" : "Connect";

  // System mode
  const mode = fresh && Number.isInteger(s.mode)
    ? s.mode
    : -1;

  const modeValid = mode >= 0 && mode <= 2;

  $("mode").textContent = modeValid
    ? modeNames[mode]
    : "Not connected";

  $("hero").classList.toggle("armed", modeValid && mode === 2);

  $("heroicon").textContent =
    !modeValid ? "◇" :
    mode === 2 ? "◆" :
    mode === 1 ? "◈" : "◇";

  $("modeDetail").textContent =
    !fresh ? "Connect to view your home system." :
    mode === 2 ? "Motion detection is armed." :
    mode === 1 ? "Motion monitoring is active." :
    "Motion alerts are off.";

  // Physical switch controls whether remote commands are allowed
  const remoteAllowed = fresh && s.switchPosition === 1;

  document.querySelectorAll("[data-mode]").forEach(button => {
    const buttonMode = Number(button.dataset.mode);

    button.classList.toggle(
      "selected",
      modeValid && buttonMode === mode
    );

    button.disabled = !remoteAllowed;
  });

  $("override").textContent =
    !fresh ? "Remote commands are disabled until connected." :
    !remoteAllowed ? "Physical switch controls the system. Remote commands are disabled." :
    "Remote control is enabled.";

  // Downstairs sensor
  const sensorOnline = fresh && s.sensorOnline === true;

  $("sensor").textContent =
    !fresh ? "Unknown" :
    sensorOnline ? "Online" : "Offline";

  $("sensor").className =
    "pill " + (!fresh ? "" : sensorOnline ? "good" : "bad");

  $("heartbeat").textContent =
    !fresh ? "Unknown" :
    sensorOnline ? "Receiving heartbeats" : "No recent heartbeat";

  $("lastMotion").textContent =
    fresh && s.lastMotion
      ? String(s.lastMotion)
      : "Unavailable";

  // Alarm status
  const alarmActive = fresh && s.alarmActive === true;

  $("alarm").textContent =
    !fresh ? "Unknown" :
    alarmActive ? "Active" : "Silent";

  $("alarm").className =
    "pill " + (!fresh ? "" : alarmActive ? "bad" : "good");

  $("silence").disabled = !alarmActive;

  // Master power source
  const power = $("powerSource");

  power.textContent =
    !fresh ? "Unknown" :
    typeof s.wallPowerPresent !== "boolean" ? "Unavailable" :
    s.wallPowerPresent ? "Wall power" : "Battery backup";

  power.className =
    "pill " +
    (!fresh || typeof s.wallPowerPresent !== "boolean"
      ? ""
      : s.wallPowerPresent ? "good" : "warn");

  // Master battery
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

  // Downstairs PIR battery monitoring
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

  $("downstairsBatteryPercent").textContent =
    downstairsValid
      ? `${downstairsPct.toFixed(1)}%`
      : "Unavailable";

  $("downstairsBatteryVoltage").textContent =
    downstairsValid
      ? `${s.downstairsBatteryVoltage.toFixed(2)} V`
      : "Unavailable";

  $("downstairsBatteryFill").style.width =
    downstairsValid ? `${downstairsPct}%` : "0%";

  $("downstairsBatteryFill").classList.toggle(
    "low",
    downstairsValid && downstairsPct <= 20
  );

  $("downstairsBatteryTrack").setAttribute(
    "aria-valuenow",
    downstairsValid ? String(Math.round(downstairsPct)) : "0"
  );

  // Last status update
  $("updated").textContent =
    !lastStatus ? "Waiting for status" :
    fresh ? "Updated " + new Date(lastStatus).toLocaleTimeString() :
    "Status unavailable";
}

function connectMQTT(host, username, password) {
  if (client) {
    client.removeAllListeners();
    client.end(true);
    client = null;
  }

  currentStatus = null;
  lastStatus = 0;

  let address = host.trim();

  if (!address.startsWith("wss://")) {
    address = "wss://" + address;
  }

  if (!address.includes("/", 6)) {
    address += ":8084/mqtt";
  }

  try {
    client = mqtt.connect(address, {
      username: username,
      password: password,
      clientId: "home-alert-" + Math.random().toString(16).slice(2),
      clean: true,
      reconnectPeriod: 3000,
      connectTimeout: 10000
    });
  } catch (error) {
    $("loginError").textContent = "Unable to start MQTT connection.";
    showDialog();
    return;
  }

  const c = client;

  c.on("connect", () => {
    c.subscribe(statusTopic, { qos: 1 }, error => {
      if (error) {
        console.error("MQTT subscription failed:", error);
      }
    });

    hideDialog();
    refresh();
  });

  c.on("message", (topic, payload) => {
    if (topic !== statusTopic) return;

    try {
      const s = JSON.parse(payload.toString());

      if (
        typeof s.mode !== "number" ||
        typeof s.switchPosition !== "number" ||
        typeof s.sensorOnline !== "boolean" ||
        typeof s.alarmActive !== "boolean"
      ) {
        return;
      }

      currentStatus = s;
      lastStatus = Date.now();
      refresh();

    } catch (error) {
      console.error("Invalid status message:", error);
    }
  });

  c.on("reconnect", refresh);
  c.on("offline", refresh);
  c.on("close", refresh);

  c.on("error", error => {
    console.error("MQTT connection error:", error);
    refresh();
  });

  refresh();
}

// Mode buttons
document.querySelectorAll("[data-mode]").forEach(button => {
  button.addEventListener("click", () => {
    if (
      !connected() ||
      !currentStatus ||
      Date.now() - lastStatus >= 45000 ||
      currentStatus.switchPosition !== 1
    ) {
      return;
    }

    sendCommand(button.dataset.mode);
  });
});

// Silence alarm
$("silence").addEventListener("click", () => {
  if (
    connected() &&
    currentStatus &&
    Date.now() - lastStatus < 45000 &&
    currentStatus.alarmActive === true
  ) {
    sendCommand("silence");
  }
});

// Open connection settings
$("settings").addEventListener("click", showDialog);

// Cancel connection dialog
$("cancel").addEventListener("click", hideDialog);

// Forget saved credentials
$("forget").addEventListener("click", () => {
  forgetLogin();

  if (client) {
    client.removeAllListeners();
    client.end(true);
    client = null;
  }

  currentStatus = null;
  lastStatus = 0;

  $("host").value = "";
  $("user").value = "";
  $("password").value = "";
  $("loginError").textContent = "";

  refresh();
});

// Login form
$("login").addEventListener("submit", event => {
  event.preventDefault();

  const host = $("host").value.trim();
  const username = $("user").value.trim();
  const password = $("password").value;

  if (!host || !username || !password) {
    $("loginError").textContent = "Please complete all fields.";
    return;
  }

  saveLogin({ host, username, password });
  connectMQTT(host, username, password);
});

// Reconnect using saved login
function autoLogin() {
  const saved = getSavedLogin();

  if (
    saved &&
    saved.host &&
    saved.username &&
    saved.password
  ) {
    connectMQTT(saved.host, saved.username, saved.password);
  } else {
    showDialog();
  }
}

setInterval(refresh, 3000);
refresh();
autoLogin();
