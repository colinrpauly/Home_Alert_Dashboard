"use strict";
const $ = id => document.getElementById(id);
const statusTopic="home/security/status", commandTopic="home/security/command";
let client=null, lastStatus=0, currentStatus=null;
const modeNames=["Off","Monitor","Armed"];
function connected(){return !!client?.connected}
function refresh(){
 const fresh=connected() && currentStatus && Date.now()-lastStatus<45000;
 $("connection").textContent=connected()?(fresh?"● Connected":"● Waiting for fresh status"):"● Disconnected";
 $("updated").textContent=lastStatus?`Last update: ${new Date(lastStatus).toLocaleTimeString()}`:"Waiting for status";
 const s=fresh?currentStatus:null;
 const mode=s?.mode;
 $("mode").textContent=Number.isInteger(mode)&&mode>=0&&mode<=2?modeNames[mode]:"Status unavailable";
 $("modeDetail").textContent=mode===0?"Local motion alarm is off.":mode===1?"Motion monitoring with a brief chirp.":mode===2?"Alarm sounds when motion is detected.":"Waiting for a recent status message.";
 $("hero").classList.toggle("armed",mode===2);
 $("heroicon").textContent=mode===2?"⬡":mode===1?"◎":"◇";
 document.querySelectorAll("[data-mode]").forEach(b=>{const n=Number(b.dataset.mode);b.disabled=!fresh||s.switchPosition!==1;b.classList.toggle("selected",mode===n)});
 $("override").textContent=!fresh?"Controls locked until a fresh status is received.":s.switchPosition===1?"Physical selector: REMOTE · App controls enabled":s.switchPosition===0?"Physical selector: OFF · App controls locked":"Physical selector: ARMED · App controls locked";
 $("sensor").textContent=!fresh?"Unknown":s.sensorOnline?"Online":"Offline";
 $("sensor").className="pill "+(!fresh?"":s.sensorOnline?"good":"bad");
 $("heartbeat").textContent=!fresh?"Unknown":s.sensorOnline?"Receiving":"Not receiving";
 $("alarm").textContent=!fresh?"Unknown":s.alarmActive?"ACTIVE":"Inactive";
 $("alarm").className="pill "+(!fresh?"":s.alarmActive?"bad":"good");
}
function showLogin(){ $("dialog").classList.remove("hidden");$("loginError").textContent="" }
function closeLogin(){ $("dialog").classList.add("hidden") }
$("settings").onclick=()=>{if(client){client.end(true);client=null;currentStatus=null;lastStatus=0;$("settings").textContent="Connect";refresh()}else showLogin()};
$("cancel").onclick=closeLogin;
$("login").onsubmit=e=>{
 e.preventDefault();
 if(typeof mqtt==="undefined"){$("loginError").textContent="MQTT library could not load. Check your connection.";return}
 const host=$("host").value.trim(),username=$("user").value.trim(),password=$("password").value;
 if(!/^[a-z0-9.-]+$/i.test(host)){$("loginError").textContent="Invalid hostname";return}
 $("connect").disabled=true;$("loginError").textContent="Connecting…";
 const c=mqtt.connect(`wss://${host}:8084/mqtt`,{
  username,password,clientId:"home-alert-phone-"+Math.random().toString(16).slice(2),
  clean:true,reconnectPeriod:5000,connectTimeout:12000,protocolVersion:4
 });
 client=c;$("password").value=""; // do not persist credentials to browser storage
 c.on("connect",()=>{c.subscribe(statusTopic,{qos:0},err=>{if(err)$("loginError").textContent="Could not subscribe to status."});closeLogin();$("settings").textContent="Disconnect";$("connect").disabled=false;refresh()});
 c.on("message",(topic,payload)=>{
  if(topic!==statusTopic)return;
  try{const s=JSON.parse(payload.toString());if(![0,1,2].includes(s.mode)||![0,1,2].includes(s.switchPosition)||typeof s.sensorOnline!=="boolean"||typeof s.alarmActive!=="boolean")return;currentStatus=s;lastStatus=Date.now();refresh()}catch{}
 });
 c.on("error",()=>{$("loginError").textContent="Connection failed. Check credentials, ACL, and WSS endpoint.";$("connect").disabled=false;refresh()});
 c.on("close",refresh);
};
document.querySelectorAll("[data-mode]").forEach(b=>b.onclick=()=>{
 if(!connected()||!currentStatus||Date.now()-lastStatus>=45000||currentStatus.switchPosition!==1)return;
 const mode=b.dataset.mode;
 if(mode==="0"&&!confirm("Turn monitoring OFF?"))return;
 if(mode==="2"&&!confirm("Arm the system?"))return;
 client.publish(commandTopic,mode,{qos:0,retain:false},err=>{if(err)alert("Command could not be sent.");});
});
setInterval(refresh,3000);refresh();
