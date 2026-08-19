# CSV Aggregation on Kubernetes (GKE)

A small two-container microservices project built to practice container orchestration on Google Kubernetes Engine (GKE). One service accepts a CSV file and calculation requests; a second service does the actual data processing. The two communicate over Kubernetes' internal network and share a persistent disk for file storage.


## What it does

1. Upload a CSV file to the gateway service — it gets written to a shared persistent disk.
2. Request a total for a given `product` column value — the gateway forwards the request internally to the worker service.
3. The worker streams the CSV from the shared disk, filters rows matching the requested product, sums the `amount` column, and returns the total.

## Architecture

```
                    ┌─────────────────────┐
  Client (Postman)  │   GKE Cluster       │
       │            │                     │
       ▼            │ ┌────────────────┐  │
   LoadBalancer ─────▶│  app1 (gateway)│  │
   (public IP)      │ │  port 6000     │  │
                    │ └──────┬────────┘   │
                    │        │ internal   │
                    │        │ service DNS│
                    │        ▼            │
                    │  ┌────────────────┐ │
                    │  │  app2 (worker) │ │
                    │  │  port 6001     │ │
                    │  │  ClusterIP     │ │
                    │  └───────┬────────┘ │
                    │          │          │
                    │          ▼          │
                    │   Shared PV/PVC     │
                    │(GCE persistent disk)│
                    └─────────────────────┘
```

- **`app1` (gateway)** — publicly exposed via a `LoadBalancer` service. Handles incoming requests and writes/reads files on the shared disk. Forwards calculation requests to `app2` over Kubernetes' internal DNS (`container2-service`).
- **`app2` (worker)** — exposed only via `ClusterIP`, so it's reachable solely from inside the cluster. Does the actual CSV parsing and aggregation.
- **Shared storage** — both pods mount the same PersistentVolumeClaim (`shifa-pvc`) at `/shifa_PV_dir`, so a file written by the gateway is immediately readable by the worker without being sent over the network a second time.

## Tech stack

- Node.js / Express
- Docker
- Kubernetes (GKE)
- Google Cloud Build (CI image build/push)
- `csv-parser` for streaming CSV reads
- `axios` for internal service-to-service calls

## API

### `POST /store-file` (gateway, port 6000)

Writes a file to shared storage.

```json
{
  "file": "sales.csv",
  "data": "product,amount\nwidget,10\nwidget,20\ngadget,5"
}
```

Response:
```json
{ "file": "sales.csv", "message": "Success." }
```

### `POST /calculate` (gateway, port 6000)

Requests a total for a product. Internally forwarded to the worker service.

```json
{
  "file": "sales.csv",
  "product": "widget"
}
```

Response:
```json
{ "file": "sales.csv", "sum": 30 }
```

## Project structure

```
k8s/
├── app1/                         # Gateway service
│   ├── index1.js
│   ├── package.json
│   ├── Dockerfile
│   ├── cloudbuild.yaml
│   └── container1-deployment.yaml
└── app2/                         # Worker service
    ├── index2.js
    ├── package.json
    ├── Dockerfile
    ├── cloudbuild.yaml
    └── container2-deployment.yaml
```

## Running locally

Each service can be run independently for local testing:

```bash
cd app1 && npm install && npm start   # gateway on :6000
cd app2 && npm install && npm start   # worker on :6001
```

Note: `app1` calls the worker at `http://container2-service:6001`, which only resolves inside a Kubernetes cluster. For local testing outside Kubernetes, that URL would need to point to `localhost:6001` instead.

## Deploying to GKE

Each service has its own `cloudbuild.yaml` that builds and pushes its image via Google Cloud Build. Deployment manifests (`container1-deployment.yaml`, `container2-deployment.yaml`) define the Deployment and Service for each container, including the shared PVC mount.

```bash
kubectl apply -f app1/container1-deployment.yaml
kubectl apply -f app2/container2-deployment.yaml
```

## Design notes

- The gateway is the only publicly reachable service; the worker is internal-only, since nothing outside the cluster ever calls it directly.
- Files are shared via a mounted PVC rather than passed over the network a second time between services.
- Service-to-service communication uses Kubernetes' internal DNS (`container2-service`) rather than a hardcoded pod IP, so it keeps working across pod restarts.

## Possible next steps

- Multiple replicas for the worker service, so a single pod failure doesn't drop an in-flight request.
- Retry logic on the gateway's call to the worker for transient failures.
- Accept actual file uploads (multipart form data) on `/store-file` instead of raw text in a JSON body.
- A minimal frontend for uploading files and requesting totals, instead of testing via Postman/curl.