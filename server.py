#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""ZiAeroMed — Aerospace Medical & Distributed Healthcare System (MVP).
Backend FastAPI + SQLite. Endpoints (versión /api/v1):
  auth, patients, medical-records, vitals, telemetry, devices, alerts,
  calculators, appointments, telemedicine, missions, zio, operations, audit.
DEMO: todos los datos clínicos son DEMOSTRATIVOS. No es un dispositivo médico.
"""
import os, json, time, math, uuid, sqlite3, random
from pathlib import Path
from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel
from typing import Optional, List, Dict, Any

BASE = Path(os.environ.get("AEROMED_BASE", Path(__file__).resolve().parent))
DB = BASE / "data" / "aeromed.db"
STATIC = BASE / "static"

app = FastAPI(title="ZiAeroMed — Aerospace Medical & Distributed Healthcare System", version="0.1.0")

def conn():
    c = sqlite3.connect(DB)
    c.row_factory = sqlite3.Row
    return c

def q(sql, args=(), one=False):
    with conn() as c:
        rows = [dict(r) for r in c.execute(sql, args).fetchall()]
    return rows[0] if (one and rows) else rows

def x(sql, args=()):
    with conn() as c:
        cur = c.execute(sql, args)
        c.commit()
        return cur.lastrowid

def init_db():
    c = conn()
    c.executescript("""
    CREATE TABLE IF NOT EXISTS patients(
      id TEXT PRIMARY KEY, name TEXT, age INTEGER, sex TEXT, hgt REAL, wgt REAL,
      location TEXT DEFAULT 'ZiAeroMed Hospital', status TEXT DEFAULT 'DEMO',
      created INTEGER DEFAULT 0);
    CREATE TABLE IF NOT EXISTS vitals(
      id INTEGER PRIMARY KEY AUTOINCREMENT, patient_id TEXT, hr REAL, spo2 REAL,
      bp_sys REAL, bp_dia REAL, temp REAL, resp REAL, glucose REAL,
      ts INTEGER, device TEXT DEFAULT 'DEMO sensor', quality REAL DEFAULT 0.9);
    CREATE TABLE IF NOT EXISTS alerts(
      id INTEGER PRIMARY KEY AUTOINCREMENT, patient_id TEXT, level TEXT,
      code TEXT, msg TEXT, ts INTEGER, reviewed INTEGER DEFAULT 0);
    CREATE TABLE IF NOT EXISTS devices(
      id TEXT PRIMARY KEY, patient_id TEXT, kind TEXT, status TEXT, last_ts INTEGER);
    CREATE TABLE IF NOT EXISTS missions(
      id TEXT PRIMARY KEY, name TEXT, vehicle TEXT, destination TEXT,
      crew INTEGER, status TEXT, phase TEXT, medical TEXT, updated INTEGER);
    CREATE TABLE IF NOT EXISTS audit(
      id INTEGER PRIMARY KEY AUTOINCREMENT, actor TEXT, action TEXT,
      target TEXT, ts INTEGER);
    """)
    c.commit()
    n = q("SELECT COUNT(*) AS c FROM patients")[0]["c"]
    if n == 0:
        _seed(c)
        c.commit()
    c.close()

def _seed(c):
    now = int(time.time())
    demo = [
      ("P-001","A. RIVERA",32,1,1.72,68,"ZiAeroMed Hospital · UCI"),
      ("P-002","L. OKAFOR",45,0,1.60,74,"ZiHomeCare · Domicilio"),
      ("P-003","M. CHO",28,1,1.68,71,"Ambulance · EN RUTA"),
      ("P-004","S. VOLKOV",51,1,1.78,82,"Estación Orbital · DEMO"),
      ("P-005","Y. HADDAD",63,0,1.55,69,"Hábitat Lunar Alpha · DEMO"),
    ]
    for pid, name, age, sex, hgt, wgt, loc in demo:
        c.execute("INSERT INTO patients VALUES(?,?,?,?,?,?,?,?,?)",
                  (pid, name, age, sex, hgt, wgt, loc, "DEMO", now))
        c.execute("INSERT INTO vitals(patient_id,hr,spo2,bp_sys,bp_dia,temp,resp,glucose,ts,device,quality) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
                  (pid, 72+random.randint(-10,10), round(97+random.random()*2,0),
                   118+random.randint(-12,12), 76+random.randint(-8,8),
                   36.5+round(random.random(),1), 14+random.randint(0,4),
                   95+random.randint(0,20), now, "DEMO multiparam", 0.9))
        c.execute("INSERT INTO devices VALUES(?,?,?,?,?)", (f"D-{pid[2:]}", pid, "DEMO monitor multiparamétrico", "online", now))
    c.execute("INSERT INTO missions VALUES(?,?,?,?,?,?,?,?,?)",
              ("M-01","CLES-128 Payload Crew Health","ATLAS IX · lunar transit","Lunar Gateway",3,"active","SIC-2 · dormancia rotativa","Todos los tripulantes estables. Telemetría continua vía ZiTelemetry.",now))
    c.execute("INSERT INTO missions VALUES(?,?,?,?,?,?,?,?,?)",
              ("M-02","Orbital increment DEMO","ZOM-4 · LEO","LEO 420 km",2,"active","Fase de aproximación","SpO₂ nominal; monitoreo de fluidos.",now))
    c.execute("INSERT INTO missions VALUES(?,?,?,?,?,?,?,?,?)",
              ("M-03","Médica terrestre en ruta","ZiMobileCare · Ambulancia","CDMX → ZiAeroMed",0,"active","Traslado primario","P-003 con telemonitoreo en ruta.",now))

init_db()

# ---------------- ZiO analysis (rule-based triage) ----------------
RANGES = {
  "hr":    [60, 100],        # bpm
  "spo2":  [94, 100],        # %
  "bp_sys":[90, 120], "bp_dia":[60, 80],
  "temp":  [36.0, 37.5],     # C
  "resp":  [12, 20],         # rpm
  "glucose":[70, 140],       # mg/dL
}
LEVELS = ["NORMAL", "OBSERVACION", "ALERTA", "CRITICO"]

def triage(v):
    """Reglas simples DEMO. Nunca diagnóstico clínico real."""
    findings = []
    lvl = 0
    def add(k, val, lo, hi):
        nonlocal lvl
        if val is None: return
        if val < lo*0.85 or val > hi*1.15: lvl = max(lvl, 3)
        elif val < lo*0.92 or val > hi*1.08: lvl = max(lvl, 2)
        elif val < lo or val > hi: lvl = max(lvl, 1)
        f = "ANOMALY DETECTED" if (val < lo*0.92 or val > hi*1.08) else None
        if val < lo or val > hi:
            findings.append(f"{k} {val} fuera de rango [{lo}-{hi}]" + (" · " + f if f else ""))
    add("HR", v.get("hr"), *RANGES["hr"]); add("SpO2", v.get("spo2"), *RANGES["spo2"])
    add("PAS", v.get("bp_sys"), *RANGES["bp_sys"]); add("PAD", v.get("bp_dia"), *RANGES["bp_dia"])
    add("Temp", v.get("temp"), *RANGES["temp"]); add("Resp", v.get("resp"), *RANGES["resp"])
    add("Glucosa", v.get("glucose"), *RANGES["glucose"])
    return {"level": LEVELS[lvl], "findings": findings}

class VitalsIn(BaseModel):
    patient_id: str
    hr: Optional[float]=None; spo2: Optional[float]=None
    bp_sys: Optional[float]=None; bp_dia: Optional[float]=None
    temp: Optional[float]=None; resp: Optional[float]=None
    glucose: Optional[float]=None
    device: Optional[str]="DEMO sensor"; quality: Optional[float]=0.9

class ZioIn(BaseModel):
    patient_id: str
    mode: Optional[str]="level1"

# ---------------- API /api/v1 ----------------
@app.get("/api/v1/health")
def health():
    return {"ok": True, "system": "ZiAeroMed MVP", "status": "DEMO — no es dispositivo médico",
            "patients": q("SELECT COUNT(*) AS c FROM patients")[0]["c"]}

@app.get("/api/v1/patients")
def patients():
    return q("SELECT * FROM patients ORDER BY id")

@app.get("/api/v1/patients/{pid}")
def patient(pid: str):
    p = q("SELECT * FROM patients WHERE id=?", (pid,), one=True)
    if not p: raise HTTPException(404, "paciente no encontrado")
    p["vitals"] = q("SELECT * FROM vitals WHERE patient_id=? ORDER BY ts DESC LIMIT 40", (pid,))
    p["alerts"] = q("SELECT * FROM alerts WHERE patient_id=? ORDER BY ts DESC LIMIT 20", (pid,))
    return p

@app.get("/api/v1/medical-records")
def records(patient_id: str):
    p = q("SELECT * FROM patients WHERE id=?", (patient_id,), one=True)
    if not p: raise HTTPException(404, "paciente no encontrado")
    latest = q("SELECT * FROM vitals WHERE patient_id=? ORDER BY ts DESC LIMIT 1", (patient_id,), one=True)
    return {"patient": p, "latest_vitals": latest, "timeline": [
        {"t": "ZIHEALTH", "items": ["Historia clínica","Signos vitales","Medicamentos","Laboratorios","Imagenología","ECG","Actividad","Sueño","Telemetría","Misiones","Evaluaciones ZiO"]},
        {"t": "STATUS", "level": triage(latest or {})["level"], "analysis": triage(latest or {})["findings"] if latest else []},
    ]}

@app.get("/api/v1/vitals")
def vitals(patient_id: str):
    return q("SELECT * FROM vitals WHERE patient_id=? ORDER BY ts DESC LIMIT 50", (patient_id,))

@app.post("/api/v1/telemetry")
def telemetry(v: VitalsIn):
    """Ingesta de telemetría desde sensores/Gateway. Normaliza y analiza."""
    p = q("SELECT * FROM patients WHERE id=?", (v.patient_id,), one=True)
    if not p: raise HTTPException(404, "paciente no encontrado")
    ts = int(time.time())
    x("INSERT INTO vitals(patient_id,hr,spo2,bp_sys,bp_dia,temp,resp,glucose,ts,device,quality) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
      (v.patient_id, v.hr, v.spo2, v.bp_sys, v.bp_dia, v.temp, v.resp, v.glucose, ts, v.device, v.quality))
    t = triage({"hr":v.hr,"spo2":v.spo2,"bp_sys":v.bp_sys,"bp_dia":v.bp_dia,"temp":v.temp,"resp":v.resp,"glucose":v.glucose})
    if t["level"] in ("ALERTA","CRITICO"):
        x("INSERT INTO alerts(patient_id,level,code,msg,ts) VALUES(?,?,?,?,?)",
          (v.patient_id, t["level"], "TELEMETRY", " · ".join(t["findings"])[:400], ts))
    return {"normalized": True, "ts": ts, "zio": t, "NOTE": "DEMO: requiere validación clínica humana para eventos de alto riesgo."}

@app.get("/api/v1/alerts")
def alerts(unreviewed: str = "false"):
    sql = "SELECT a.*, p.name FROM alerts a LEFT JOIN patients p ON p.id=a.patient_id ORDER BY a.ts DESC LIMIT 50"
    if unreviewed == "true": sql = sql.replace("ORDER BY", "WHERE a.reviewed=0 ORDER BY")
    return q(sql)

@app.get("/api/v1/devices")
def devices():
    return q("SELECT d.*, p.name FROM devices d LEFT JOIN patients p ON p.id=d.patient_id")

@app.get("/api/v1/operations")
def operations():
    alerts_n = q("SELECT COUNT(*) AS c FROM alerts WHERE reviewed=0")[0]["c"]
    return {
      "active_patients": q("SELECT COUNT(*) AS c FROM patients")[0]["c"],
      "active_missions": q("SELECT COUNT(*) AS c FROM missions WHERE status='active'")[0]["c"],
      "medical_alerts": alerts_n,
      "critical_events": q("SELECT COUNT(*) AS c FROM alerts WHERE level='CRITICO'")[0]["c"],
      "telemetry_status": q("SELECT COUNT(*) AS c FROM vitals WHERE ts > ?", (int(time.time())-3600,))[0]["c"],
      "device_status": {"online": q("SELECT COUNT(*) AS c FROM devices WHERE status='online'")[0]["c"],
                        "total": q("SELECT COUNT(*) AS c FROM devices")[0]["c"]},
      "communication_status": {"nominal": True, "edge_backlog": 0},
      "medical_staff": {"physicians": 24, "nurses": 48, "mission_doctors": 6},
    }

@app.get("/api/v1/missions")
def missions():
    return q("SELECT * FROM missions ORDER BY updated DESC")

@app.get("/api/v1/calculators")
def calculators_index():
    return [{"id": k, "name": m["name"], "category": m["cat"], "purpose": m["purpose"]}
            for k, m in CALCS.items()]

@app.post("/api/v1/calculators/{cid}")
def calculator(cid: str, params: Dict[str, Any]):
    if cid not in CALCS: raise HTTPException(404, "calculadora no encontrada")
    m = CALCS[cid]; fn = m["fn"]
    try:
        res = fn(params)
    except (TypeError, ValueError, ZeroDivisionError) as e:
        raise HTTPException(400, f"variables inválidas o insuficientes: {e}")
    return {"calculator": m["name"], "category": m["cat"], "purpose": m["purpose"],
            "result": res, "variables": m["variables"], "units": m["units"],
            "formula": m["formula"], "range": m["range"], "limitations": m["limitations"],
            "version": m["version"], "source": m["source"], "warnings": m["warnings"],
            "DISCLAIMER": "Cálculo de referencia. No es diagnóstico médico."}

# ---------------- Calculadoras ----------------
def _n(p, k, d=None):
    v = p.get(k, d)
    if v in (None, ""): raise ValueError(f"falta variable '{k}'")
    return float(v)

def hr_max(p):  # Tanaka
    a = _n(p, "age")
    return {"hr_max": round(208 - 0.7 * a, 1)}

def hr_zones(p):
    a = _n(p, "age")
    r = p.get("rest_hr", 60)
    hrmax = 208 - 0.7 * a
    return {"hr_max": round(hrmax,1), "zones": {
        "Z1 50-60%": [round(hrmax*0.5,1), round(hrmax*0.6,1)],
        "Z2 60-70%": [round(hrmax*0.6,1), round(hrmax*0.7,1)],
        "Z3 70-80%": [round(hrmax*0.7,1), round(hrmax*0.8,1)],
        "Z4 80-90%": [round(hrmax*0.8,1), round(hrmax*0.9,1)],
        "Z5 90-100%":[round(hrmax*0.9,1), round(hrmax,1)]}}

def map_(p):  # Presión arterial media
    s = _n(p, "sys"); d = _n(p, "dia")
    return {"map_mmHg": round((2*d + s)/3, 1)}

def pulse_pressure(p):
    s = _n(p, "sys"); d = _n(p, "dia")
    return {"pulse_pressure_mmHg": round(s - d, 1)}

def bmi(p):
    w = _n(p, "weight"); h = _n(p, "height")
    return {"bmi": round(w/(h*h), 1), "category_clinical": "DEMO referencia; interpretación médica requerida"}

def bmr(p):
    w = _n(p, "weight"); h = _n(p, "height"); a = _n(p, "age"); sex = str(p.get("sex","M")).upper()
    b = (10*w + 6.25*h*100 - 5*a) + (5 if sex=="M" else -161)
    return {"bmr_kcal_day": round(b, 0)}

def water_balance(p):
    intake = _n(p, "intake", 0); loss = _n(p, "loss", 0)
    return {"balance_l": round(intake - loss, 2),
            "interpretation": "DEMO: número positivo = superávit, negativo = déficit."}

def pf_ratio(p):
    spo2 = _n(p, "spo2"); fio2 = _n(p, "fio2", 0.21)
    sf = spo2/fio2 if fio2 else None
    return {"sf_ratio": round(sf, 1) if sf else None,
            "note": "Índice SpO2/FiO2 (SF) de referencia; no sustituye P/F arterial."}

def sleep_debt(p):
    need = _n(p, "need", 7.5); got = _n(p, "got")
    return {"debt_h": round(max(0, need - got), 1)}

def g_force(p):
    g = _n(p, "g"); dur = _n(p, "duration_s")
    risk = "BAJO" if g < 3 else ("MODERADO" if g < 5 else "ALTO")
    return {"g": g, "duration_s": dur, "exposure_risk_DEMO": risk,
            "note": "DEMO: el riesgo real depende de vectores, abdomen-aorta, entrenamiento y protección G."}

def hypoxia(p):
    alt = _n(p, "altitude_m")
    patm = 101325 * (1 - 2.25577e-5*alt)**5.25588
    tuc = 30 if alt <= 7500 else (10 if alt <= 9000 else (3 if alt <= 11000 else 1))
    return {"altitude_m": alt, "patm_Pa": round(patm,0),
            "time_of_useful_consciousness_est_s": tuc,
            "warning": "DEMO: el TUC real depende de la tasa de ascenso y la velocidad de la hipoxia."}

CALCS = {
  "hr_max": {"name":"Frecuencia Cardíaca Máxima (Tanaka)","cat":"Cardiovascular","purpose":"Estimar FC máxima por edad.",
    "fn": hr_max, "formula":"FCmax = 208 − 0.7 × edad",
    "variables":["age (años)"],"units":["bpm"],"range":["18–70 años"],
    "limitations":["Estimación poblacional; no individualizada."],"version":"1.0 (2026-09-14)","source":"Tanaka et al., Circulation (2001)",
    "warnings":["No usar para prescribir intensidad sin valoración médica."]},
  "hr_zones": {"name":"Zonas de FC","cat":"Cardiovascular","purpose":"Calcular zonas de entrenamiento por FC.",
    "fn": hr_zones, "formula":"Zonas Z1–Z5 en % de FCmax",
    "variables":["age (años)"],"units":["bpm"],"range":["Adultos"],"limitations":["DEMO."],
    "version":"1.0 (2026-09-14)","source":"Guías de fisiología del ejercicio",
    "warnings":["Requiere supervisión en poblaciones de riesgo."]},
  "mean_arterial_pressure": {"name":"Presión Arterial Media","cat":"Cardiovascular","purpose":"Estimar PAM.",
    "fn": map_, "formula":"PAM = (2×PAD + PAS) / 3", "variables":["sys (mmHg)","dia (mmHg)"],"units":["mmHg"],
    "range":["Adultos"],"limitations":["Cálculo de referencia."],"version":"1.0 (2026-09-14)",
    "source":"Fisiología cardiovascular estándar","warnings":["No sustituye medición invasiva."]},
  "pulse_pressure": {"name":"Presión de Pulso","cat":"Cardiovascular","purpose":"PP = PAS − PAD.",
    "fn": pulse_pressure, "formula":"PP = PAS − PAD", "variables":["sys (mmHg)","dia (mmHg)"],"units":["mmHg"],
    "range":["Adultos"],"limitations":["DEMO."],"version":"1.0 (2026-09-14)",
    "source":"Fisiología cardiovascular estándar","warnings":[]},
  "bmi": {"name":"IMC","cat":"Metabólico","purpose":"Índice de masa corporal.",
    "fn": bmi, "formula":"IMC = peso / estatura²", "variables":["weight (kg)","height (m)"],"units":["kg/m²"],
    "range":["Adultos; no aplica en algunas poblaciones"],"limitations":["No diferencia masa muscular/ósea."],
    "version":"1.0 (2026-09-14)","source":"OMS","warnings":["El IMC no es diagnóstico de salud."]},
  "bmr": {"name":"Gasto Energético Basal (Mifflin-St Jeor)","cat":"Metabólico","purpose":"Estimar GER.",
    "fn": bmr, "formula":"GER = 10×peso + 6.25×talla − 5×edad + C", "variables":["weight (kg)","height (m)","age (años)","sex (M/F)"],
    "units":["kcal/día"],"range":["Adultos 19–78 años"],"limitations":["Estimación."],"version":"1.0 (2026-09-14)",
    "source":"Mifflin et al., AJCN (1990)","warnings":["No es una recomendación nutricional individual."]},
  "water_balance": {"name":"Balance Hídrico","cat":"Hidratación","purpose":"Balance ingesta − pérdida.",
    "fn": water_balance, "formula":"Balance = ingesta − pérdida", "variables":["intake (L)","loss (L)"],"units":["L"],
    "range":["Adultos"],"limitations":["No incluye ganancia metabólica."],"version":"1.0 (2026-09-14)",
    "source":"Fisiología de la hidratación","warnings":[]},
  "sf_ratio": {"name":"Índice SpO₂/FiO₂","cat":"Respiratorio","purpose":"Índice SF de referencia.",
    "fn": pf_ratio, "formula":"SF = SpO₂ / FiO₂", "variables":["spo2 (%)","fio2 (fracción)"],"units":["adimensional"],
    "range":["Adultos"],"limitations":["No sustituye P/F arterial."],"version":"1.0 (2026-09-14)",
    "source":"Rice et al. (2007)","warnings":["Interpretar siempre con contexto clínico."]},
  "sleep_debt": {"name":"Deuda de Sueño","cat":"Sueño","purpose":"Déficit de horas de sueño.",
    "fn": sleep_debt, "formula":"Deuda = max(0, necesidad − obtenido)", "variables":["need (h)","got (h)"],"units":["h"],
    "range":["Adultos"],"limitations":["Autoreporte."],"version":"1.0 (2026-09-14)",
    "source":"Medicina del sueño","warnings":[]},
  "g_force": {"name":"Exposición G (aeroespacial)","cat":"Aeroespacial","purpose":"Clasificación demostrativa de exposición a aceleración.",
    "fn": g_force, "formula":"Umbrales DEMO", "variables":["g (G)","duration_s (s)"],"units":["G, s"],
    "range":["DEMO"],"limitations":["Factores reales: vector, protección G, entrenamiento."],"version":"1.0 (2026-09-14)",
    "source":"Fisiología aeroespacial (referencial)","warnings":["Solo personal de medicina de vuelo autoriza vuelo."]},
  "hypoxia": {"name":"Tiempo de Consciencia Útil (DEMO)","cat":"Aeroespacial","purpose":"Estimación demostrativa de TUC por altitud.",
    "fn": hypoxia, "formula":"TUC estimado por altitud (DEMO)", "variables":["altitude_m (m)"],"units":["m, Pa, s"],
    "range":["DEMO"],"limitations":["Estimación gruesa e individualizada."],"version":"1.0 (2026-09-14)",
    "source":"Medicina aeroespacial (referencial)","warnings":["La hipoxia es una emergencia; actuar con oxígeno y descenso."]},
}

# ---------------- ZiO insights ----------------
@app.post("/api/v1/zio/analyze")
def zio_analyze(b: ZioIn):
    latest = q("SELECT * FROM vitals WHERE patient_id=? ORDER BY ts DESC LIMIT 1", (b.patient_id,), one=True)
    if not latest: raise HTTPException(404, "sin telemetría")
    t = triage(latest)
    mode = b.mode or "level1"
    out = {"patient_id": b.patient_id, "mode": mode, "analysis_level": mode.upper()}
    if mode == "level3":
        out["pipeline"] = ["DETECTION","VALIDATION","ALERT","HUMAN CLINICAL REVIEW","PROTOCOL","ACTION"]
        out["human_review_required"] = True
    if t["level"] == "CRITICO":
        out["status"] = "ANOMALY DETECTED"; out["level"] = t["level"]
    elif t["findings"]:
        out["status"] = "ANOMALY DETECTED"; out["level"] = t["level"]
    else:
        out["status"] = "No significant anomaly detected."; out["level"] = t["level"]
    out["findings"] = t["findings"]
    out["recommendation"] = "Coordinar validación clínica humana" if t["level"] in ("ALERTA","CRITICO") else "Continuar monitorización."
    return out

@app.post("/api/v1/auth/login")
def auth_login(b: Dict[str, Any]):
    return {"ok": True, "token": uuid.uuid4().hex, "roles": ["demo_clinician"], "DEMO": True, "SSO": "ZiCore SSO (conceptual)"}

@app.get("/api/v1/audit")
def audit():
    return q("SELECT * FROM audit ORDER BY ts DESC LIMIT 50")

@app.get("/api/v1/zihealth")
def zihealth():
    return {"modules": ["Expediente clínico","Historial","Alergias","Medicamentos","Signos vitales",
                        "Laboratorio","Imagenología","ECG","Sueño","Actividad","Telemetría","Misiones",
                        "Estado fisiológico","Estado psicológico","Exposición ambiental","Historial espacial"]}

@app.get("/api/v1/zi-telemetry")
def zi_telemetry():
    return {"pipeline": ["SENSORES","GATEWAY","ZiTelemetry","NORMALIZACIÓN","ANÁLISIS","ZiO","ALERTA/DASHBOARD"],
            "standards": ["HL7","FHIR","DICOM","IEEE 11073","OAuth2/OIDC","REST","WebSocket/MQTT"]}

# ---------------- static SPA ----------------
@app.get("/ziaeromed/{rest:path}")
def spa(rest: str):
    p = STATIC / rest
    if rest and p.is_file():
        return FileResponse(p)
    return FileResponse(STATIC / "index.html")

@app.get("/")
def root():
    return FileResponse(STATIC / "index.html")

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("AEROMED_PORT", "4011"))
    uvicorn.run(app, host="0.0.0.0", port=port, log_level="info")