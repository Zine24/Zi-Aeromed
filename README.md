# Zi-Aeromed — ZiAeroMed

Sistema de **medicina aeroespacial y salud distribuida** (MVP): validación y
verificación médica, pacientes y expedientes, signos vitales y telemetría,
dispositivos, alertas, calculadoras clínicas y aeroespaciales, misiones,
telemedicina, asistente ZiO y auditoría.

Backend **FastAPI + SQLite** que también sirve el frontend estático.

> ⚠️ **DEMO:** todos los datos clínicos son demostrativos. No es un dispositivo médico.

| | |
|---|---|
| **Backend** | FastAPI + Uvicorn + SQLite (`server.py`) |
| **Frontend** | `static/index.html`, `static/app.js`, `static/style.css` |
| **Puerto por defecto** | `4011` (`AEROMED_PORT`) |
| **Base de datos** | `data/aeromed.db` (se crea con datos demo al arrancar) |

## Estructura

```
.
├── server.py            # FastAPI app: API /api/v1 + SPA estática
├── static/
│   ├── index.html       # Shell de la aplicación
│   ├── app.js           # Router y vistas
│   └── style.css        # Estilos
├── data/                # SQLite (aeromed.db) — no versionado
├── requirements.txt
└── README.md
```

## Arranque

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# Opcional: directorio base de la app/datos (por defecto, el del repo)
export AEROMED_BASE="$PWD"
export AEROMED_PORT=4011

python server.py
# o: uvicorn server:app --host 0.0.0.0 --port 4011
```

Abre <http://localhost:4011/>. Al primer arranque se crea `data/aeromed.db`
con pacientes, misiones y datos de demostración.

> En producción el servicio vive en `/opt/zicore-aeromed` (o con
> `AEROMED_BASE` apuntando a ese directorio).

## API (`/api/v1`)

| Método | Endpoint | Descripción |
|---|---|---|
| `GET` | `/health` | Estado del servicio |
| `POST` | `/auth/login` | Login demo (token + roles) |
| `GET` | `/patients` | Lista de pacientes |
| `GET` | `/patients/{pid}` | Ficha de paciente |
| `GET` | `/medical-records` | Expedientes médicos |
| `GET` | `/vitals` | Signos vitales |
| `POST` | `/telemetry` | Ingesta de telemetría |
| `GET` | `/zi-telemetry` | Pipeline y estándares de telemetría |
| `GET` | `/devices` | Dispositivos |
| `GET` | `/alerts` | Alertas clínicas |
| `GET` | `/calculators` | Catálogo de calculadoras |
| `POST` | `/calculators/{cid}` | Ejecutar calculadora |
| `GET` | `/missions` | Misiones aeroespaciales |
| `GET` | `/operations` | Estado de operaciones |
| `GET` | `/zihealth` | Estado ZiHealth |
| `POST` | `/zio/analyze` | Análisis con el asistente ZiO |
| `GET` | `/audit` | Registro de auditoría |

### Calculadoras incluidas

Cardiovasculares (FC máxima Tanaka, zonas de FC, presión arterial media, presión
de pulso), metabólicas (IMC, gasto energético basal Mifflin-St Jeor),
hidratación (balance hídrico), respiratorias (índice SpO₂/FiO₂), sueño (deuda de
sueño) y aeroespaciales (exposición G, tiempo de consciencia útil).

## Licencia

Sin archivo de licencia; todos los derechos reservados por el autor salvo que se indique lo contrario.
