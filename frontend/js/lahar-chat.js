export function toggleLaharChat() {
  const win = document.getElementById('lahar-chat');
  const opening = !win.classList.contains('active');
  win.classList.toggle('active');
  if (opening) resetLaharChat();
}

export function resetLaharChat() {
  const messagesDiv = document.getElementById('lahar-messages');
  messagesDiv.innerHTML = `
    <div class="chatbot-msg assistant">
      <div class="chatbot-msg-avatar">🌋</div>
      <div class="chatbot-msg-content">Hello! I'm <strong>Lahar</strong>, your volcanic expert assistant. I can help you understand volcanic hazards, monitoring data, and safety procedures. What would you like to know?</div>
    </div>`;
  const input = document.getElementById('lahar-input');
  if (input) input.value = '';
}

export function sendLaharMessage() {
  const input = document.getElementById('lahar-input');
  const message = input.value.trim();
  if (!message) return;
  addLaharMessage(message, 'user');
  input.value = '';
  setTimeout(() => addLaharMessage(laharResponse(message), 'assistant'), 480);
}

function laharResponse(msg) {
  const m = msg.toLowerCase();
  if (m.match(/school|priority|critical|classification/))
    return '<strong>School Risk Classification</strong><br>Schools are classified by <em>distance from the volcano crater</em>:<br>• <span style="color:#ff4444">Critical (0-3 km)</span> – Immediate danger zone<br>• <span style="color:#ff8c2a">Priority (3-6 km)</span> – High risk, priority evacuation<br>• <span style="color:#ffc62a">Moderate (6-10 km)</span> – Moderate risk zone<br>• <span style="color:#44cc66">Low (10+ km)</span> – Lower risk area<br><br>Schools closer to the crater are flagged higher priority for evacuation planning.';
  if (m.match(/alert|level/))
    return '<strong>Alert Levels</strong><br>• Level 1 – Low-level unrest<br>• Level 2 – Moderate unrest<br>• Level 3 – Increased volcanic activity<br>• Level 4 – Hazardous eruption imminent<br>• Level 5 – Hazardous eruption ongoing';
  if (m.match(/evacuate|evacuation|safe/))
    return '<strong>Evacuation Tips</strong><br>• Follow official PHIVOLCS advisories.<br>• Move perpendicular to river channels.<br>• Bring a 3-day emergency kit.<br>• Register at designated evacuation centers.';
  if (m.match(/lahar/))
    return '<strong>Lahar Hazard</strong><br>Lahars are volcanic mudflows triggered by heavy rainfall mixing with loose volcanic debris. They travel at high speed down river channels and are extremely destructive. Permanent danger zones around Mayon extend up to 8 km.';
  if (m.match(/so2|sulfur|gas/))
    return '<strong>SO₂ Flux</strong><br>Sulfur dioxide emissions are a key indicator of magma movement. Values above 1,000 t/d suggest elevated activity. Above 2,500 t/d is considered critical and may precede eruptions.';
  if (m.match(/plume|ash/))
    return '<strong>Ash Plume Monitoring</strong><br>Plume height above 1 km indicates significant activity. Ash fall can affect communities downwind and poses aviation hazards. Monitor PHIVOLCS bulletins for ashfall advisories.';
  if (m.match(/rockfall|pdc/))
    return '<strong>Rockfall & PDC Events</strong><br>Rockfalls are loose material dislodged from the crater rim. Pyroclastic Density Currents (PDCs) are fast-moving flows of hot gas and ash — highly dangerous within 6 km of the crater.';
  if (m.match(/mayon/))
    return '<strong>Mayon Volcano</strong><br>Located in Albay Province, Mayon is the most active volcano in the Philippines with 50+ historical eruptions. Elevation: 2,463 m. Known for its near-perfect cone shape.';
  if (m.match(/taal/))
    return '<strong>Taal Volcano</strong><br>Located in Batangas, Taal is a complex volcano within a lake caldera. It last erupted in January 2020. The entire Taal Volcano Island is a Permanent Danger Zone.';
  if (m.match(/kanlaon/))
    return '<strong>Kanlaon Volcano</strong><br>Located in Negros Island, Kanlaon is the highest peak in the Visayas at 2,435 m. It has frequent phreatic explosions and is monitored continuously by PHIVOLCS.';
  if (m.match(/risk|danger|hazard/))
    return '<strong>Volcanic Risk Assessment</strong><br>Risk is assessed using five key parameters:<br>• Volcanic Earthquakes (VEQ)<br>• Rockfall events<br>• Pyroclastic Density Currents (PDC)<br>• SO₂ Flux (tonnes/day)<br>• Ash Plume Height<br><br>Each parameter is compared against established PHIVOLCS thresholds to compute an overall risk score.';
  if (m.match(/hello|hi|hey/))
    return 'Hello! I\'m <strong>Lahar AI</strong>, your volcanic hazard assistant. Ask me about alert levels, evacuation, SO₂, ash plumes, rockfalls, or specific volcanoes like Mayon, Taal, or Kanlaon.';
  return 'I\'m <strong>Lahar AI</strong>. You can ask me about:<br>• Alert levels &amp; their meanings<br>• Evacuation procedures<br>• School risk classification<br>• SO₂, plume, rockfall &amp; PDC data<br>• Mayon, Taal, or Kanlaon volcano<br>• Lahar &amp; volcanic hazard info';
}

function addLaharMessage(html, sender) {
  const div = document.getElementById('lahar-messages');
  const entry = document.createElement('div');
  entry.className = 'chatbot-msg ' + sender;
  entry.innerHTML
    = '<div class="chatbot-msg-avatar">' + (sender === 'user' ? '👤' : '🌋') + '</div>'
    + '<div class="chatbot-msg-content">' + html + '</div>';
  div.appendChild(entry);
  div.scrollTop = div.scrollHeight;
}
