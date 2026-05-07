# otel_collector

Single Cloud Run service running the OpenTelemetry Collector. Every atomic service / handler / sink exports spans + metrics here.

## Architecture

```
[atomic-service-1] ─┐
[atomic-service-2] ─┤
[handler]          ─┼──► [otel-collector] ──► Cloud Trace
[sink-1]           ─┤                         Cloud Monitoring
[sink-2]           ─┘                         Cloud Logging
```

Without this module, the OTel exporter env var on every service points at nothing and traces drop.

## Usage

```hcl
module "otel_dev" {
  source = "../../infra/modules/otel_collector"

  project        = var.project
  region         = var.region
  environment    = "dev"
  vpc_connector  = data.terraform_remote_state.shared.outputs.vpc_connector_id
}

# Pass the resulting endpoint to each atomic service:
module "dscr_calculator" {
  source                  = "../../infra/modules/atomic_service"
  ...
  otel_collector_endpoint = module.otel_dev.endpoint
}
```

## Conventions

- **Internal ingress only.** No external traffic.
- **Min 1 instance.** Cold starts drop the first burst of traces; we keep one warm.
- **100% trace sampling by default.** Bank policy for audit-bearing flows. Override only for high-volume realtime UCs (`var.trace_sampling_ratio = 0.1` etc.).
- **Caller IAM scoped to project SAs.** Production should scope further to specific atomic-service SAs (one binding per service); the project-wide `domain:` binding is the simple dev default.

## Production hardening

- Pin `image_uri` to a specific tag (not `:latest`).
- Configure custom processors via a config-file ConfigMap mounted into the container.
- Use Workload Identity Federation if calling from outside the project.
- Multi-region active-active for prod (deploy two collectors, GLB in front).
