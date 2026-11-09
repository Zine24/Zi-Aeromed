(() => {
  const API = "/api/v1";
  const main = document.getElementById("main");
  const nav = document.querySelector(".topbar nav");

  nav.addEventListener("click", (e) => {
    const a = e.target.closest("a[data-route]");
    if (a) route(a.dataset.route);
  });
  window.addEventListener("hashchange", () => route(location.hash.slice(1) || "/ziaeromed/dashboard"));

  async function api(path, body, method = "GET") {
    const opt = { headers: { "Content-Type": "application/json" } };
    if (body) opt.method = "POST", opt.body = JSON.stringify(body);
    else if (method !== "GET") opt.method = method;
    const r = await fetch(API + path, opt);
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).detail || r.statusText);
    return r.json();
  }

  function page(title, sub, html) {
    main.innerHTML = `<div class="page"><h1>${title}</h1><div class="sub">${sub}</div>${html}</div>`;
    nav.querySelectorAll("a").forEach(a => a.classList.toggle("active", a.dataset.route === location.hash.slice(1)));
    window.scrollTo(0, 0);
  }
  function card(title, big, lbl, cls = "") {
    return `<div class="card"><h3>${title}</h3><div class="big ${cls}">${big}</div><div class="lbl">${lbl}</div></div>`;
  }
  function isc(l) { return l === "CRITICO" ? "bad" : l === "ALERTA" ? "warn" : l === "OBSERVACION" ? "info" : "ok"; }

  async function route(r) {
    location.hash = r;
    main.innerHTML = '<div class="loader">SYNC ZiCORE…</div>';
    try {
      if (r.endsWith("/dashboard") || r === "/ziaeromed") return dashes();
      if (r.endsWith("/health-monitor")) return healthMon();
      if (r.endsWith("/patients")) return patients(r);
      if (r.endsWith("/calculators")) return calcs();
      if (r.endsWith("/missions")) return missions();
      if (r.endsWith("/modules")) return modules();
      if (r.endsWith("/research")) return research();
      return dashes();
    } catch (e) { page("Error", "", `<div class="card"><span class="badge bad">ERR</span> ${e.message}</div>`); }
  }

  async function dashes() {
    const ops = await api("/operations");
    page("Zi Medical Operations Center", "ZiO MEDICAL OPERATIONS · ESTADO GLOBAL (DEMO)",
      `<div class="grid g4">
        ${card("Active Patients", ops.active_patients, "Todos los nodos del hospital distribuido")}
        ${card("Active Missions", ops.active_missions, "ZiSpaceMed · Misiones activas")}
        ${card("Medical Alerts", ops.medical_alerts, `${ops.critical_events} críticos`, "warn")}
        ${card("Remote Units", ops.device_status.online, "Dispositivos en línea", "info")}
      </div>
      <div class="grid g2" style="margin-top:14px">
        <div class="card"><h3>Telemetría · último 1 h</h3><div class="big">${ops.telemetry_status}</div>
          <div class="lbl">Lecturas normalizadas entregadas a ZiO</div>
          <div class="grid g2" style="margin-top:12px">
            <div><div class="lbl">Comunicaciones</div><span class="badge ok">NOMINAL</span><div class="lbl" style="margin-top:4px">Edge backlog: ${ops.communication_status.edge_backlog}</div></div>
            <div><div class="lbl">Personal sanitario</div><span class="mono" style="font-size:26px;font-weight:700">${ops.medical_staff.physicians + ops.medical_staff.nurses + ops.medical_staff.mission_doctors}</span><div class="lbl">${ops.medical_staff.mission_doctors} médicos de misión</div></div>
          </div></div>
        <div class="card"><h3>Principio fundamental</h3>
          <div class="cmp">"El hospital viaja con el paciente."</div>
          <p class="fact" style="margin-top:10px">Hospital → Casa → Vehículo → Aeronave → Base remota → Órbita → Luna → Espacio profundo.</p>
          <div style="margin-top:12px"><span class="badge info">ZiCORE</span> <span class="badge info">ZiO</span> <span class="badge info">ZiHealth</span> <span class="badge info">ZiTelemetry</span></div>
        </div>
      </div>
      <div class="disclaimer">DEMO · Datos demostrativos claramente marcados. El sistema no es un dispositivo médico y no emite diagnósticos. Toda recomendación clínica de alto riesgo requiere validación humana.</div>`);
    main.insertAdjacentHTML = undefined;
    // inject schedule
    const sc = document.createElement("style");
    sc.textContent = ".cmp{font-family:var(--disp);color:var(--cyn);font-size:17px;letter-spacing:1px;margin:8px 0}";
    document.head.appendChild(sc);
  }

  async function healthMon() {
    const plist = await api("/patients");
    page("ZiO Health Monitor", "PATIENT STATUS · indicadores NORMAL / OBSERVACIÓN / ALERTA / CRÍTICO",
      `<div class="grid g2">${plist.map(p => {
        const v = p.id;
        return `<div class="card"><h3>${p.name} · ${p.id}</h3><div class="lbl" style="margin-bottom:10px">${p.location}</div>
          <div class="vital"><span class="ic">❤️</span><span class="nm">Heart Rate</span><span class="vl" id="v-hr-${p.id}">…</span></div>
          <div class="vital"><span class="ic">🫁</span><span class="nm">SpO₂</span><span class="vl" id="v-o2-${p.id}">…</span></div>
          <div class="vital"><span class="ic">🩸</span><span class="nm">BP</span><span class="vl" id="v-bp-${p.id}">…</span></div>
          <div class="vital"><span class="ic">🌡</span><span class="nm">Temp</span><span class="vl" id="v-t-${p.id}">…</span></div>
          <div class="vital"><span class="ic">🫁</span><span class="nm">Resp</span><span class="vl" id="v-r-${p.id}">…</span></div>
          <div style="margin-top:10px"><span class="badge" id="v-s-${p.id}">…</span></div>
        </div>`;
      }).join("")}</div>
      <div class="disclaimer">DEMO · Valores simulados con marcado DEMO. El estado lo calcula ZiO con reglas; no es diagnóstico.</div>`);
    for (const p of plist) {
      try {
        const rec = await api("/medical-records?patient_id=" + p.id);
        const v = rec.latest_vitals;
        if (v) {
          document.getElementById(`v-hr-${p.id}`).textContent = `${Math.round(v.hr)} BPM`;
          document.getElementById(`v-o2-${p.id}`).textContent = `${v.spo2} %`;
          document.getElementById(`v-bp-${p.id}`).textContent = `${v.bp_sys}/${v.bp_dia}`;
          document.getElementById(`v-t-${p.id}`).textContent = `${v.temp} °C`;
          document.getElementById(`v-r-${p.id}`).textContent = `${v.resp} RPM`;
          const st = document.getElementById(`v-s-${p.id}`);
          st.textContent = rec.status[0].level; st.className = "badge " + isc(rec.status[0].level);
        }
      } catch (e) {}
    }
  }

  async function patients(r) {
    const plist = await api("/patients");
    const sel = plist.map(p => `<option value="${p.id}">${p.name} — ${p.id}</option>`).join("");
    page("Pacientes · ZiHealth", "Expediente distribuido del ecosistema Zi (DEMO)",
      `<div class="grid g2">
        <div class="card"><h3>Registro DEMO</h3>${plist.map(p =>
          `<div style="padding:9px 0;border-bottom:1px solid var(--line)"><b>${p.name}</b> <span class="tag">${p.id}</span>
           <div class="lbl">${p.location} · ${p.age} años · ${p.wgt} kg · ${p.status}</div></div>`).join("")}
        </div>
        <div class="card"><h3>Paciente · Telemetría en vivo (simulada)</h3>
          <div class="field"><label>Paciente</label><select id="pat-sel">${sel}</select></div>
          <div class="field"><button onclick="window.ZAM.push()">Ingestar telemetría DEMO</button></div>
          <div id="pat-status" class="fact"></div></div>
      </div>`);
    window.ZAM.push = async () => {
      const pid = document.getElementById("pat-sel").value;
      const v = { patient_id: pid, hr: 60 + Math.floor(Math.random() * 80), spo2: 92 + Math.floor(Math.random() * 8),
                  bp_sys: 100 + Math.floor(Math.random() * 40), bp_dia: 60 + Math.floor(Math.random() * 25),
                  temp: 36 + Math.round(Math.random() * 15) / 10, resp: 12 + Math.floor(Math.random() * 10),
                  glucose: 80 + Math.floor(Math.random() * 60), device: "DEMO smartwatch" };
      const r = await api("/telemetry", v);
      document.getElementById("pat-status").innerHTML =
        `<span class="badge ${isc(r.zio.level)}">${r.zio.level}</span> ${r.zio.findings.join(" · ") || "Sin anomalías."}<br>
         <span class="muted" style="font-size:11px">ZiO DEMO · requiere validación humana para eventos de alto riesgo</span>`;
    };
  }

  async function calcs() {
    const list = await api("/calculators");
    page("ZiCalculators", "Biblioteca modular de cálculos clínicos y fisiológicos · referencia, no diagnóstico",
      `<div class="grid g4">${list.map((c, i) =>
        `<div class="card" style="cursor:pointer" onclick="window.ZAM.openCalc(${i})"><h3>${c.category}</h3>
         <div style="font-size:13px;font-weight:600">${c.name}</div><div class="lbl" style="margin-top:6px">${c.purpose}</div></div>`)
        .join("")}</div>
      <div id="calczone" style="margin-top:16px"></div>`);
    window.ZAM._list = list;
    window.ZAM.openCalc = (i) => renderCalc(list[i]);
  }

  function renderCalc(meta) {
    const zone = document.getElementById("calczone");
    zone.innerHTML = `<div class="card"><h3>${meta.name} · ${meta.category}</h3>
      <p class="fact">${meta.purpose}</p><div class="grid g2" style="margin-top:10px">`;
    // generic args from API not exposed; build by known keys
    const examples = {
      "hr_max":["age"],"hr_zones":["age"],"mean_arterial_pressure":["sys","dia"],"pulse_pressure":["sys","dia"],
      "bmi":["weight","height"],"bmr":["weight","height","age","sex"],"water_balance":["intake","loss"],
      "sf_ratio":["spo2","fio2"],"sleep_debt":["got"],"g_force":["g","duration_s"],"hypoxia":["altitude_m"],
    };
    const keys = examples[meta.id] || [];
    keys.forEach(k => { zone.innerHTML += `<div class="field"><label>${k}</label><input id="c-${k}" type="number" step="any"></div>`; });
    zone.innerHTML += `</div><button onclick="window.ZAM.calcRun('${meta.id}')">Calcular</button><div id="calc-out" class="fact" style="margin-top:12px"></div></div>`;
    window.ZAM.calcRun = async (cid) => {
      const params = {};
      keys.forEach(k => { const el = document.getElementById(`c-${k}`); if (el && el.value) params[k] = parseFloat(el.value); });
      if (!params["sex"]) params["sex"] = "M";
      const r = await api("/calculators/" + cid, params);
      const res = typeof r.result === "object" ? Object.entries(r.result).map(([k, v]) => `<div><span class="tag">${k}</span> ${v}</div>`).join("") : `<div class="big">${r.result}</div>`;
      document.getElementById("calc-out").innerHTML =
        `${res}<div style="margin-top:8px;font-size:11px;color:var(--mut)">${r.formula}<br>${r.warnings.join(" · ") || ""}<br><b>${r.DISCLAIMER}</b></div>`;
    };
  }

  async function missions() {
    const m = await api("/missions");
    page("Misiones · ZiSpaceMed", "La misma infraestructura médica viaja con la tripulación (DEMO)",
      m.map(x => `<div class="card" style="margin-bottom:12px">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <h3 style="margin:0">${x.name} <span class="tag">${x.id}</span></h3><span class="badge ${x.status === "active" ? "ok" : "warn"}">${x.status.toUpperCase()}</span>
        </div>
        <div class="fact" style="margin-top:6px"><b>${x.vehicle}</b> · ${x.destination} · Crew ${x.crew}</div>
        <div class="lbl" style="margin-top:6px">Fase: ${x.phase}</div>
        <div class="fact" style="margin-top:8px">${x.medical}</div>
      </div>`).join("") +
      `<div class="card"><h3>Edificio hospital</h3><p class="fact">A. Emergency · B. Primary Care · C. Aerospace Medicine · D. Diagnostic Center · E. Intensive Care · F. Rehabilitation · G. Mental & Cognitive · H. Medical Simulation · I. Research · J. Mission Medical Operations</p>
      <p class="fact" style="margin-top:8px">El hospital físico es un nodo de la red distribuida: ZiAeroMed Hospital + ZiHomeCare + ZiMobileCare (Edge) + ZiSpaceMed.</p></div>`);
  }

  function modules() {
    page("Módulos del ecosistema", "Cada servicio opera de forma independiente mediante APIs (integración modular con Zi)",
      `<div class="grid g2">
        <div class="card"><h3>ZiHealth</h3><p class="fact">Expediente clínico electrónico, historial, alergias, medicamentos, laboratorio, imagenología, ECG, sueño, actividad, telemetría, misiones, historial espacial.</p></div>
        <div class="card"><h3>ZiTelemetry</h3><p class="fact">SENSORES → GATEWAY → NORMALIZACIÓN → ANÁLISIS → ZiO → ALERTA/DASHBOARD. Interoperable: HL7, FHIR, DICOM, IEEE 11073, OAuth2/OIDC, REST, WebSocket/MQTT.</p></div>
        <div class="card"><h3>ZiTeleMed</h3><p class="fact">Videollamada, chat médico, archivos, estudios, segunda opinión, coordinación de emergencia. Interfaces: Paciente · Médico · Enfermería · Especialista · Centro de Control · Médico de misión.</p></div>
        <div class="card"><h3>ZiHomeCare</h3><p class="fact">Paciente → dispositivos → ZiHome Gateway → ZiHealth → ZiO → centro médico. Monitoreo remoto, crónicos, postoperatorio, rehabilitación.</p></div>
        <div class="card"><h3>ZiMobileCare · Edge</h3><p class="fact">Ambulancias, vehículos, aeronaves. Edge Medical Mode: sin conexión → ZiO Local + protocolos + almacenamiento + sincronización. Con conexión → ZiCORE → ZiHealth.</p></div>
        <div class="card"><h3>Integración Zi</h3><p class="fact">ZiCORE (orquestación) · ZiO (IA clínica) · ZiBIEN (bienestar) · ZiUSER (perfil) · ZiROBOT (robótica) · ZiVR (simulación/rehabilitación) · ZiOS (infraestructura). Sin acoplamiento obligatorio.</p></div>
      </div>
      <div class="disclaimer">DEMO · Integraciones conceptuales. No se afirma compatibilidad con dispositivos sin interfaz real ni certificación (COFEPRIS/FDA/FAA/NASA/ESA) hasta contar con autorización.</div>`);
  }

  async function research() {
    page("Investigación", "División de investigación de medicina aeroespacial y espacial (conceptual)",
      `<div class="grid g2">
        <div class="card"><h3>Líneas</h3><p class="fact">Fisiología aeroespacial · medicina espacial · biomedicina · sensores · IA médica · criobiología (ZiCRYOGEN, división independiente) · detección de anomalías.</p></div>
        <div class="card"><h3>Fases de madurez</h3>${["CONCEPTO","PROTOTIPO","SIMULACIÓN","PRODUCCIÓN","DISPOSITIVO MÉDICO CERTIFICADO"].map((s,i)=>`<div style="margin:5px 0"><span class="badge ${i<3?"info":"warn"}">${s}</span></div>`).join("")}</div>
      </div>
      <div class="card" style="margin-top:14px"><h3>Roadmap</h3>
      <p class="fact"><b>FASE 1</b> · ZiHealth + Telemedicina + Calculadoras.<br>
      <b>FASE 2</b> · ZiTelemetry + HomeCare + Medical Operations Center.<br>
      <b>FASE 3</b> · ZiAeroMed + ZiSpaceMed + Edge Medical Systems.</p>
      <p class="fact" style="margin-top:10px">ZiO: Nivel 1 Información · Nivel 2 Clinical Decision Support · Nivel 3 Critical Event (DETECTION→VALIDATION→ALERT→HUMAN CLINICAL REVIEW→PROTOCOL→ACTION). Si faltan datos: DATA INSUFFICIENT.</p></div>`);
  }

  route(location.hash.slice(1) || "/ziaeromed/dashboard");
})();