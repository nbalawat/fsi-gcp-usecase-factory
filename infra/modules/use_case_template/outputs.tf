output "topics" {
  value = {
    enriched        = module.topic_enriched.name
    decided         = module.topic_decided.name
    approval_events = module.topic_approval_events.name
    dlq             = module.topic_dlq.name
  }
}

output "atomic_services" {
  value = { for k, s in module.atomic_services : k => {
    name = s.name
    url  = s.url
    sa   = s.service_account_email
  } }
}

output "handler_url" {
  value = length(module.handler) > 0 ? module.handler[0].url : null
}

output "sinks" {
  value = { for k, s in module.sinks : k => {
    name = s.name
    url  = s.url
    sa   = s.service_account_email
  } }
}

output "workflow_id" {
  value = length(module.workflow) > 0 ? module.workflow[0].workflow_id : null
}
