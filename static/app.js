(() => {
  const API = "/api/v1";
  const main = document.getElementById("main");
  const nav = document.querySelector(".topbar nav");
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Public namespace kept for compatibility with any external integration.
  window.ZAM = window.ZAM || {};

  let routeSeq = 0;
  const stale = (seq) => seq !== routeSeq;

  /* ---------- Inline SVG icons (no emoji) ---------- */
  const SVG = (body) =>
    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" ` +
    `stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${body}</svg>`;

  const ICONS = {
    hr: SVG('<path d="M20.8 5.9a5 5 0 0 0-7.1 0L12 7.6l-1.7-1.7a5 5 0 1 0-7.1 7.1L12 21l8.8-8a5 5 0 0 0 0-7.1Z"/>'),
    spo2: SVG('<path d="M12 3s6 6.4 6 10.5a6 6 0 0 1-12 0C6 9.4 12 3 12 3Z"/><path d="M9.5 13.5a2.5 2.5 0 0 0 2.5 2.5"/>'),
    bp: SVG('<path d="M4 14a8 8 0 0 1 16 0"/><path d="M12 14 16 9"/><circle cx="12" cy="14" r="1.4"/>'),
    temp: SVG('<path d="M14 14.8V5a2 2 0 1 0-4 0v9.8a4 4 0 1 0 4 0Z"/><path d="M12 9v7"/>'),
    resp: SVG('<path d="M3 8h10a2.5 2.5 0 1 0-2.5-2.5"/><path d="M3 12h13a2.5 2.5 0 1 1-2.5 2.5"/><path d="M3 16h8a2 2 0 1 1-2 2"/>'),
  };

  /* ---------- Helpers ---------- */
  function esc(value) {
    return String(value ?? "").replace(/[&<>"']/g, (ch) => (
      { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]
    ));
  }

  async function api(path, body, method = "GET") {
    const opt = { headers: { "Content-Type": "application/json" } };
    if (body) {
      opt.method = "POST";
      opt.body = JSON.stringify(body);
    } else if (method !== "GET") {
      opt.method = method;
    }
    const r = await fetch(API + path, opt);
    if (!r.ok) {
      const detail = await r.json().catch(() => ({}));
      throw new Error(detail.detail || r.statusText || `HTTP ${r.status}`);
    }
    return r.json();
  }

  function setActiveNav(route) {
    const links = [...nav.querySelectorAll("a[data-route]")];
    let best = null;
    for (const a of links) {
      const r = a.dataset.route;
      if (route === r || route.startsWith(r + "/")) {
        if (!best || r.length > best.dataset.route.length) best = a;
      }
    }
    for (const a of links) {
      const on = a === best;
      a.classList.toggle("active", on);
      if (on) a.setAttribute("aria-current", "page");
      else a.removeAttribute("aria-current");
    }
  }

  function page(title, sub, html) {
    main.innerHTML = `<div class="page"><h1>${title}</h1><div class="sub">${sub}</div>${html}</div>`;
    document.title = title.includes("ZiAeroMed") ? title : `${title} · ZiAeroMed`;
    setActiveNav(location.hash.slice(1));
    main.focus({ preventScroll: true });
  }

  function card(title, big, lbl, cls = "") {
    return `<div class="card"><h3>${title}</h3><div class="big ${cls}">${big}</div><div class="lbl">${lbl}</div></div>`;
  }

  function isc(level) {
    return level === "CRITICO" ? "bad"
      : level === "ALERTA" ? "warn"
      : level === "OBSERVACION" ? "info"
      : "ok";
  }

  function levelLabel(level) {
    return {
      NORMAL: "NORMAL",
      OBSERVACION: "OBSERVACIÓN",
      ALERTA: "ALERTA",
      CRITICO: "CRÍTICO",
    }[level] || level;
  }

  function vital(kind, label, id) {
    return `<div class="vital ${kind}">
      <span class="ic">${ICONS[kind]}</span>
      <span class="nm">${label}</span>
      <span class="vl" id="${id}">…</span>
    </div>`;
  }

  function disclaimer(text) {
    return `<div class="disclaimer">${text}</div>`;
  }

  /* ---------- Router ---------- */
  document.addEventListener("click", (e) => {
    const a = e.target.closest('a[href^="#/ziaeromed"], a[data-route]');
    if (!a) return;
    e.preventDefault();
    route(a.dataset.route || a.getAttribute("href").slice(1));
  });

  window.addEventListener("popstate", () => {
    route(location.hash.slice(1) || "/ziaeromed/dashboard");
  });

  async function route(r) {
    if (!r) r = "/ziaeromed/dashboard";
    const seq = ++routeSeq;

    if (location.hash.slice(1) !== r) history.pushState(null, "", "#" + r);
    setActiveNav(r);
    main.setAttribute("aria-busy", "true");
    main.innerHTML = '<div class="loader">SYNC ZiCORE…</div>';
    if (!reduceMotion) window.scrollTo(0, 0);

    try {
      const leaf = r.replace(/\/+$/, "").split("/").pop();
      switch (leaf) {
        case "dashboard": await dashes(seq); break;
        case "health-monitor": await healthMon(seq); break;
        case "patients": await patients(seq); break;
        case "calculators": await calcs(seq); break;
        case "missions": await missions(seq); break;
        case "modules": modules(seq); break;
        case "research": research(seq); break;
        default: await dashes(seq);
      }
    } catch (e) {
      if (stale(seq)) return;
      page("Error de conexión", "No se pudo completar la solicitud",
        `<div class="card error-card">
           <span class="badge bad">ERROR</span>
           <p class="fact" style="margin-top:10px">${esc(e.message)}</p>
           <p class="small muted" style="margin-top:8px">Verifica que el servidor ZiAeroMed esté en ejecución y vuelve a intentarlo.</p>
         </div>`);
    } finally {
      if (!stale(seq)) main.removeAttribute("aria-busy");
    }
  }

  /* ---------- Operations dashboard ---------- */
  async function dashes(seq) {
    const ops = await api("/operations");
    if (stale(seq)) return;

    const alertsCls = ops.medical_alerts > 0 ? "warn" : "ok";
    const commOk = ops.communication_status && ops.communication_status.nominal;
    const staff = ops.medical_staff.physicians + ops.medical_staff.nurses + ops.medical_staff.mission_doctors;

    page("Zi Medical Operations Center", "ZiO MEDICAL OPERATIONS · ESTADO GLOBAL (DEMO)",
      `<div class="grid g4">
        ${card("Active Patients", ops.active_patients, "Todos los nodos del hospital distribuido")}
        ${card("Active Missions", ops.active_missions, "ZiSpaceMed · Misiones activas")}
        ${card("Medical Alerts", ops.medical_alerts, `${ops.critical_events} críticos · sin revisar`, alertsCls)}
        ${card("Remote Units", ops.device_status.online, `de ${ops.device_status.total} dispositivos en línea`, "info")}
      </div>

      <div class="grid g2 stack">
        <div class="card">
          <h3>Telemetría · último 1 h</h3>
          <div class="big">${ops.telemetry_status}</div>
          <div class="lbl">Lecturas normalizadas entregadas a ZiO</div>
          <div class="grid g2" style="margin-top:14px">
            <div>
              <div class="lbl">Comunicaciones</div>
              <span class="badge ${commOk ? "ok" : "warn"}">${commOk ? "NOMINAL" : "DEGRADADO"}</span>
              <div class="lbl" style="margin-top:4px">Edge backlog: ${ops.communication_status.edge_backlog}</div>
            </div>
            <div>
              <div class="lbl">Personal sanitario</div>
              <span class="mono" style="font-size:26px;font-weight:600">${staff}</span>
              <div class="lbl">${ops.medical_staff.mission_doctors} médicos de misión</div>
            </div>
          </div>
        </div>

        <div class="card">
          <h3>Principio fundamental</h3>
          <div class="cmp">“El hospital viaja con el paciente.”</div>
          <p class="fact" style="margin-top:8px">Hospital → Casa → Vehículo → Aeronave → Base remota → Órbita → Luna → Espacio profundo.</p>
          <div style="margin-top:12px">
            <span class="badge info">ZiCORE</span>
            <span class="badge info">ZiO</span>
            <span class="badge info">ZiHealth</span>
            <span class="badge info">ZiTelemetry</span>
          </div>
        </div>
      </div>

      ${disclaimer("DEMO · Datos demostrativos claramente marcados. El sistema no es un dispositivo médico y no emite diagnósticos. Toda recomendación clínica de alto riesgo requiere validación humana.")}`);
  }

  /* ---------- Health monitor ---------- */
  async function healthMon(seq) {
    const plist = await api("/patients");
    if (stale(seq)) return;

    page("ZiO Health Monitor", "PATIENT STATUS · indicadores NORMAL / OBSERVACIÓN / ALERTA / CRÍTICO",
      `<div class="grid g2">${plist.map((p) => `
        <div class="card">
          <h3 class="card-title">${esc(p.name)} <span class="tag">${esc(p.id)}</span></h3>
          <div class="lbl" style="margin-bottom:10px">${esc(p.location)}</div>
          ${vital("hr", "Heart Rate", `v-hr-${p.id}`)}
          ${vital("spo2", "SpO₂", `v-o2-${p.id}`)}
          ${vital("bp", "Blood Pressure", `v-bp-${p.id}`)}
          ${vital("temp", "Temperature", `v-t-${p.id}`)}
          ${vital("resp", "Respiration", `v-r-${p.id}`)}
          <div style="margin-top:12px"><span class="badge" id="v-s-${p.id}">…</span></div>
        </div>`).join("")}
      </div>
      ${disclaimer("DEMO · Valores simulados con marcado DEMO. El estado lo calcula ZiO con reglas; no es diagnóstico clínico.")}`);

    await Promise.all(plist.map(async (p) => {
      try {
        const rec = await api("/medical-records?patient_id=" + encodeURIComponent(p.id));
        if (stale(seq)) return;
        const v = rec.latest_vitals;
        if (!v) return;
        const set = (id, text) => {
          const el = document.getElementById(id);
          if (el) el.textContent = text;
        };
        set(`v-hr-${p.id}`, `${Math.round(v.hr)} BPM`);
        set(`v-o2-${p.id}`, `${v.spo2} %`);
        set(`v-bp-${p.id}`, `${v.bp_sys}/${v.bp_dia} mmHg`);
        set(`v-t-${p.id}`, `${v.temp} °C`);
        set(`v-r-${p.id}`, `${v.resp} RPM`);
        const st = document.getElementById(`v-s-${p.id}`);
        const status = (rec.timeline || []).find((x) => x.t === "STATUS");
        if (st && status) {
          const level = status.level;
          st.textContent = levelLabel(level);
          st.className = "badge " + isc(level);
          st.title = (status.analysis || []).join(" · ") || "Sin anomalías detectadas.";
        }
      } catch (e) {
        if (stale(seq)) return;
        const st = document.getElementById(`v-s-${p.id}`);
        if (st) {
          st.textContent = "SIN DATOS";
          st.className = "badge warn";
        }
      }
    }));
  }

  /* ---------- Patients + telemetry ---------- */
  async function patients(seq) {
    const plist = await api("/patients");
    if (stale(seq)) return;
    const options = plist.map((p) => `<option value="${esc(p.id)}">${esc(p.name)} — ${esc(p.id)}</option>`).join("");

    page("Pacientes · ZiHealth", "Expediente distribuido del ecosistema Zi (DEMO)",
      `<div class="grid g2">
        <div class="card">
          <h3>Registro DEMO</h3>
          <div>${plist.map((p) => `
            <div class="patient-row">
              <div class="pname">${esc(p.name)} <span class="tag">${esc(p.id)}</span></div>
              <div class="lbl">${esc(p.location)} · ${p.age} años · ${p.wgt} kg · ${esc(p.status)}</div>
            </div>`).join("")}
          </div>
        </div>

        <div class="card">
          <h3>Paciente · Telemetría en vivo (simulada)</h3>
          <div class="field">
            <label for="pat-sel">Paciente</label>
            <select id="pat-sel">${options}</select>
          </div>
          <div class="field"><button id="telemetry-btn" type="button">Ingresar telemetría DEMO</button></div>
          <div id="pat-status" class="status-line muted" aria-live="polite">Selecciona un paciente y genera una lectura simulada.</div>
        </div>
      </div>
      ${disclaimer("DEMO · La telemetría es simulada y el análisis es una regla demostrativa. No sustituye valoración clínica.")}`);

    const btn = document.getElementById("telemetry-btn");
    const sel = document.getElementById("pat-sel");
    const out = document.getElementById("pat-status");

    btn.addEventListener("click", async () => {
      btn.disabled = true;
      btn.textContent = "Ingresando…";
      try {
        const pid = sel.value;
        const v = {
          patient_id: pid,
          hr: 60 + Math.floor(Math.random() * 80),
          spo2: 92 + Math.floor(Math.random() * 8),
          bp_sys: 100 + Math.floor(Math.random() * 40),
          bp_dia: 60 + Math.floor(Math.random() * 25),
          temp: 36 + Math.round(Math.random() * 15) / 10,
          resp: 12 + Math.floor(Math.random() * 10),
          glucose: 80 + Math.floor(Math.random() * 60),
          device: "DEMO smartwatch",
        };
        const res = await api("/telemetry", v);
        if (stale(seq)) return;
        out.classList.remove("muted");
        out.innerHTML = `
          <div class="row-between" style="margin-bottom:8px">
            <span><span class="badge ${isc(res.zio.level)}">${levelLabel(res.zio.level)}</span> <span class="tag">${esc(pid)}</span></span>
            <span class="small muted">${new Date(res.ts * 1000).toLocaleTimeString()}</span>
          </div>
          <div class="mono small">HR ${v.hr} · SpO₂ ${v.spo2}% · ${v.bp_sys}/${v.bp_dia} · ${v.temp.toFixed(1)} °C · ${v.resp} RPM · ${v.glucose} mg/dL</div>
          <div class="fact" style="margin-top:8px">${esc(res.zio.findings.join(" · ") || "Sin anomalías detectadas.")}</div>
          <div class="small muted" style="margin-top:6px">ZiO DEMO · requiere validación humana para eventos de alto riesgo</div>`;
      } catch (e) {
        out.innerHTML = `<span class="badge bad">ERROR</span> ${esc(e.message)}`;
      } finally {
        btn.disabled = false;
        btn.textContent = "Ingresar telemetría DEMO";
      }
    });
  }

  /* ---------- Calculators ---------- */
  const FIELDS = {
    age: ["Edad", "años"],
    sys: ["PAS", "mmHg"],
    dia: ["PAD", "mmHg"],
    weight: ["Peso", "kg"],
    height: ["Estatura", "m"],
    sex: ["Sexo", "", "select", ["M", "F"]],
    intake: ["Ingesta", "L"],
    loss: ["Pérdida", "L"],
    spo2: ["SpO₂", "%"],
    fio2: ["FiO₂", "fracción"],
    need: ["Necesidad de sueño", "h"],
    got: ["Sueño obtenido", "h"],
    g: ["Aceleración", "G"],
    duration_s: ["Duración", "s"],
    altitude_m: ["Altitud", "m"],
  };

  const ARGS = {
    hr_max: ["age"],
    hr_zones: ["age"],
    mean_arterial_pressure: ["sys", "dia"],
    pulse_pressure: ["sys", "dia"],
    bmi: ["weight", "height"],
    bmr: ["weight", "height", "age", "sex"],
    water_balance: ["intake", "loss"],
    sf_ratio: ["spo2", "fio2"],
    sleep_debt: ["got"],
    g_force: ["g", "duration_s"],
    hypoxia: ["altitude_m"],
  };

  function fieldHtml(key) {
    const [label, unit, type, opts] = FIELDS[key] || [key, ""];
    const id = `c-${key}`;
    const unitHtml = unit ? ` <span class="unit">(${esc(unit)})</span>` : "";
    const control = type === "select"
      ? `<select id="${id}">${opts.map((o) => `<option value="${esc(o)}">${esc(o)}</option>`).join("")}</select>`
      : `<input id="${id}" type="number" step="any" inputmode="decimal" autocomplete="off">`;
    return `<div class="field"><label for="${id}">${esc(label)}${unitHtml}</label>${control}</div>`;
  }

  function humanKey(key) {
    return key.replace(/_/g, " ");
  }

  function renderResult(r) {
    const value = r.result;
    let rows;
    if (value && typeof value === "object") {
      rows = Object.entries(value).map(([k, v]) => {
        let text;
        if (v && typeof v === "object") {
          text = Array.isArray(v)
            ? v.join(" – ")
            : Object.entries(v).map(([nk, nv]) =>
                `${nk}: ${Array.isArray(nv) ? nv.join("–") : String(nv)}`).join(" · ");
        } else {
          text = String(v);
        }
        return `<div class="row"><span class="k">${esc(humanKey(k))}</span><span class="v">${esc(text)}</span></div>`;
      }).join("");
    } else {
      rows = `<div class="row"><span class="k">Resultado</span><span class="v">${esc(String(value))}</span></div>`;
    }

    const warnings = (r.warnings || []).join(" · ") || "—";
    return `<div class="calc-result">${rows}</div>
      <div class="calc-note">
        <b>Fórmula</b> ${esc(r.formula)}<br>
        <b>Advertencias</b> ${esc(warnings)}<br>
        <b>${esc(r.DISCLAIMER)}</b>
      </div>`;
  }

  async function calcs(seq) {
    const list = await api("/calculators");
    if (stale(seq)) return;

    page("ZiCalculators", "Biblioteca modular de cálculos clínicos y fisiológicos · referencia, no diagnóstico",
      `<div class="grid g3">${list.map((c, i) => `
        <button type="button" class="calc-card" data-calc="${i}">
          <span class="calc-cat">${esc(c.category)}</span>
          <span class="calc-name">${esc(c.name)}</span>
          <span class="lbl">${esc(c.purpose)}</span>
        </button>`).join("")}
      </div>
      <div id="calczone" class="calc-sheet"></div>
      ${disclaimer("DEMO · Resultados de referencia. Ninguna calculadora emite diagnósticos ni sustituye la valoración de un profesional de la salud.")}`);

    main.querySelectorAll(".calc-card").forEach((btn) => {
      btn.addEventListener("click", () => renderCalc(list[Number(btn.dataset.calc)], seq));
    });
  }

  function renderCalc(meta, seq) {
    if (!meta || stale(seq)) return;
    const zone = document.getElementById("calczone");
    if (!zone) return;
    const keys = ARGS[meta.id] || [];

    zone.innerHTML = `<div class="card">
      <div class="row-between">
        <h3 class="card-title">${esc(meta.name)}</h3>
        <span class="badge info">${esc(meta.category)}</span>
      </div>
      <p class="fact">${esc(meta.purpose)}</p>
      <div class="grid g2 stack">${keys.map(fieldHtml).join("")}</div>
      <div class="stack"><button id="calc-run" type="button">Calcular</button></div>
      <div id="calc-out" class="status-line muted" aria-live="polite">Completa los campos y pulsa Calcular.</div>
    </div>`;

    zone.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "nearest" });
    const first = zone.querySelector("input, select");
    if (first) first.focus({ preventScroll: true });

    document.getElementById("calc-run").addEventListener("click", async () => {
      const out = document.getElementById("calc-out");
      const params = {};
      let missing = false;

      for (const k of keys) {
        const el = document.getElementById(`c-${k}`);
        if (!el) continue;
        if (el.value === "") {
          if (k !== "sex") missing = true;
        } else {
          params[k] = el.type === "number" ? parseFloat(el.value) : el.value;
        }
      }

      if (missing) {
        out.classList.remove("muted");
        out.innerHTML = `<span class="badge warn">FALTAN DATOS</span> Completa todos los campos numéricos para calcular.`;
        return;
      }

      const runBtn = document.getElementById("calc-run");
      runBtn.disabled = true;
      runBtn.textContent = "Calculando…";
      try {
        const res = await api("/calculators/" + encodeURIComponent(meta.id), params);
        if (stale(seq)) return;
        out.classList.remove("muted");
        out.innerHTML = renderResult(res);
      } catch (e) {
        if (stale(seq)) return;
        out.classList.remove("muted");
        out.innerHTML = `<span class="badge bad">ERROR</span> ${esc(e.message)}`;
      } finally {
        runBtn.disabled = false;
        runBtn.textContent = "Calcular";
      }
    });
  }

  /* ---------- Missions ---------- */
  async function missions(seq) {
    const list = await api("/missions");
    if (stale(seq)) return;

    page("Misiones · ZiSpaceMed", "La misma infraestructura médica viaja con la tripulación (DEMO)",
      `<div class="grid g2">${list.map((x) => {
        const active = x.status === "active";
        return `<div class="card">
          <div class="row-between">
            <h3 class="card-title">${esc(x.name)} <span class="tag">${esc(x.id)}</span></h3>
            <span class="badge ${active ? "ok" : "warn"}">${esc(x.status.toUpperCase())}</span>
          </div>
          <div class="fact" style="margin-top:4px"><b>${esc(x.vehicle)}</b> · ${esc(x.destination)} · Crew ${x.crew}</div>
          <div class="lbl" style="margin-top:6px">Fase: ${esc(x.phase)}</div>
          <div class="fact" style="margin-top:8px">${esc(x.medical)}</div>
        </div>`;
      }).join("")}

      <div class="card">
        <h3 class="card-title">Edificio hospital</h3>
        <p class="fact">A. Emergency · B. Primary Care · C. Aerospace Medicine · D. Diagnostic Center · E. Intensive Care · F. Rehabilitation · G. Mental &amp; Cognitive · H. Medical Simulation · I. Research · J. Mission Medical Operations</p>
        <p class="fact" style="margin-top:8px">El hospital físico es un nodo de la red distribuida: ZiAeroMed Hospital + ZiHomeCare + ZiMobileCare (Edge) + ZiSpaceMed.</p>
      </div>
      </div>
      ${disclaimer("DEMO · Misiones y estados simulados. La operación médica real requiere protocolos certificados y personal habilitado.")}`);
  }

  /* ---------- Modules ---------- */
  function modules(seq) {
    if (stale(seq)) return;
    page("Módulos del ecosistema", "Cada servicio opera de forma independiente mediante APIs (integración modular con Zi)",
      `<div class="grid g2">
        <div class="card"><h3 class="card-title">ZiHealth</h3><p class="fact">Expediente clínico electrónico, historial, alergias, medicamentos, laboratorio, imagenología, ECG, sueño, actividad, telemetría, misiones, historial espacial.</p></div>
        <div class="card"><h3 class="card-title">ZiTelemetry</h3><p class="fact">SENSORES → GATEWAY → NORMALIZACIÓN → ANÁLISIS → ZiO → ALERTA/DASHBOARD. Interoperable: HL7, FHIR, DICOM, IEEE 11073, OAuth2/OIDC, REST, WebSocket/MQTT.</p></div>
        <div class="card"><h3 class="card-title">ZiTeleMed</h3><p class="fact">Videollamada, chat médico, archivos, estudios, segunda opinión, coordinación de emergencia. Interfaces: Paciente · Médico · Enfermería · Especialista · Centro de Control · Médico de misión.</p></div>
        <div class="card"><h3 class="card-title">ZiHomeCare</h3><p class="fact">Paciente → dispositivos → ZiHome Gateway → ZiHealth → ZiO → centro médico. Monitoreo remoto, crónicos, postoperatorio, rehabilitación.</p></div>
        <div class="card"><h3 class="card-title">ZiMobileCare · Edge</h3><p class="fact">Ambulancias, vehículos, aeronaves. Edge Medical Mode: sin conexión → ZiO Local + protocolos + almacenamiento + sincronización. Con conexión → ZiCORE → ZiHealth.</p></div>
        <div class="card"><h3 class="card-title">Integración Zi</h3><p class="fact">ZiCORE (orquestación) · ZiO (IA clínica) · ZiBIEN (bienestar) · ZiUSER (perfil) · ZiROBOT (robótica) · ZiVR (simulación/rehabilitación) · ZiOS (infraestructura). Sin acoplamiento obligatorio.</p></div>
      </div>
      ${disclaimer("DEMO · Integraciones conceptuales. No se afirma compatibilidad con dispositivos sin interfaz real ni certificación (COFEPRIS/FDA/FAA/NASA/ESA) hasta contar con autorización.")}`);
  }

  /* ---------- Research ---------- */
  function research(seq) {
    if (stale(seq)) return;
    page("Investigación", "División de investigación de medicina aeroespacial y espacial (conceptual)",
      `<div class="grid g2">
        <div class="card">
          <h3 class="card-title">Líneas</h3>
          <p class="fact">Fisiología aeroespacial · medicina espacial · biomedicina · sensores · IA médica · criobiología (ZiCRYOGEN, división independiente) · detección de anomalías.</p>
        </div>
        <div class="card">
          <h3 class="card-title">Fases de madurez</h3>
          <div class="stack">${["CONCEPTO", "PROTOTIPO", "SIMULACIÓN", "PRODUCCIÓN", "DISPOSITIVO MÉDICO CERTIFICADO"].map((s, i) =>
            `<div style="margin:5px 0"><span class="badge ${i < 3 ? "info" : "warn"}">${s}</span></div>`).join("")}
          </div>
        </div>
      </div>

      <div class="card stack">
        <h3 class="card-title">Roadmap</h3>
        <p class="fact"><b>FASE 1</b> · ZiHealth + Telemedicina + Calculadoras.<br>
        <b>FASE 2</b> · ZiTelemetry + HomeCare + Medical Operations Center.<br>
        <b>FASE 3</b> · ZiAeroMed + ZiSpaceMed + Edge Medical Systems.</p>
        <p class="fact" style="margin-top:10px">ZiO: Nivel 1 Información · Nivel 2 Clinical Decision Support · Nivel 3 Critical Event (DETECTION → VALIDATION → ALERT → HUMAN CLINICAL REVIEW → PROTOCOL → ACTION). Si faltan datos: DATA INSUFFICIENT.</p>
      </div>
      ${disclaimer("DEMO · Documento conceptual. No constituye evidencia clínica ni certificación regulatoria.")}`);
  }

  /* ---------- Boot ---------- */
  let initial = location.hash.slice(1);
  if (!initial) {
    const path = location.pathname.replace(/\/+$/, "");
    initial = path.startsWith("/ziaeromed")
      ? (path === "/ziaeromed" ? "/ziaeromed/dashboard" : path)
      : "/ziaeromed/dashboard";
  }
  history.replaceState(null, "", "#" + initial);
  route(initial);
})();
