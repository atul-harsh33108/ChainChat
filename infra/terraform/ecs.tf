locals {
  services = {
    gateway = {
      port        = 8000
      cpu         = 256
      memory      = 512
      desired     = 2
      target      = true
      environment = []
    }
    auth-service = {
      port        = 8000
      cpu         = 256
      memory      = 512
      desired     = 1
      target      = false
      environment = [
        { name = "DATABASE_URL", value = "postgresql+asyncpg://${var.db_username}:${var.db_password}@${aws_db_instance.postgres.endpoint}/chainchat?options=-c%20search_path=auth" },
        { name = "REDIS_URL", value = "redis://${aws_elasticache_cluster.redis.cache_nodes[0].address}:6379/0" },
        { name = "CLERK_SECRET_KEY", value = var.clerk_secret_key },
      ]
    }
    workflow-service = {
      port        = 8000
      cpu         = 256
      memory      = 512
      desired     = 1
      target      = false
      environment = [
        { name = "DATABASE_URL", value = "postgresql+asyncpg://${var.db_username}:${var.db_password}@${aws_db_instance.postgres.endpoint}/chainchat?options=-c%20search_path=workflow" },
        { name = "REDIS_URL", value = "redis://${aws_elasticache_cluster.redis.cache_nodes[0].address}:6379/0" },
      ]
    }
    execution-service = {
      port        = 8000
      cpu         = 512
      memory      = 1024
      desired     = 1
      target      = false
      environment = [
        { name = "DATABASE_URL", value = "postgresql+asyncpg://${var.db_username}:${var.db_password}@${aws_db_instance.postgres.endpoint}/chainchat?options=-c%20search_path=execution" },
        { name = "REDIS_URL", value = "redis://${aws_elasticache_cluster.redis.cache_nodes[0].address}:6379/0" },
        { name = "OPENAI_API_KEY", value = var.openai_api_key },
        { name = "ANTHROPIC_API_KEY", value = var.anthropic_api_key },
      ]
    }
    billing-service = {
      port        = 8000
      cpu         = 256
      memory      = 512
      desired     = 1
      target      = false
      environment = [
        { name = "DATABASE_URL", value = "postgresql+asyncpg://${var.db_username}:${var.db_password}@${aws_db_instance.postgres.endpoint}/chainchat?options=-c%20search_path=billing" },
        { name = "REDIS_URL", value = "redis://${aws_elasticache_cluster.redis.cache_nodes[0].address}:6379/0" },
        { name = "STRIPE_SECRET_KEY", value = var.stripe_secret_key },
      ]
    }
    notification-service = {
      port        = 8000
      cpu         = 256
      memory      = 512
      desired     = 1
      target      = false
      environment = [
        { name = "DATABASE_URL", value = "postgresql+asyncpg://${var.db_username}:${var.db_password}@${aws_db_instance.postgres.endpoint}/chainchat?options=-c%20search_path=notification" },
        { name = "REDIS_URL", value = "redis://${aws_elasticache_cluster.redis.cache_nodes[0].address}:6379/0" },
      ]
    }
  }
}

resource "aws_ecs_task_definition" "service" {
  for_each = local.services

  family                   = "${var.app_name}-${each.key}"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = each.value.cpu
  memory                   = each.value.memory
  execution_role_arn       = aws_iam_role.ecs_execution.arn
  task_role_arn            = aws_iam_role.ecs_task.arn

  container_definitions = jsonencode([
    {
      name  = each.key
      image = "${aws_ecr_repository.service[each.key].repository_url}:latest"
      portMappings = [
        {
          containerPort = each.value.port
          protocol      = "tcp"
        }
      ]
      environment = concat(
        each.value.environment,
        [
          { name = "AUTH_SERVICE_URL", value = "http://auth-service.${var.app_name}.local:8000" },
          { name = "WORKFLOW_SERVICE_URL", value = "http://workflow-service.${var.app_name}.local:8000" },
          { name = "EXECUTION_SERVICE_URL", value = "http://execution-service.${var.app_name}.local:8000" },
          { name = "BILLING_SERVICE_URL", value = "http://billing-service.${var.app_name}.local:8000" },
          { name = "NOTIFICATION_SERVICE_URL", value = "http://notification-service.${var.app_name}.local:8000" },
        ]
      )
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          awslogs-group         = aws_cloudwatch_log_group.service[each.key].name
          awslogs-region        = var.aws_region
          awslogs-stream-prefix = each.key
        }
      }
    }
  ])

  tags = local.tags
}

resource "aws_ecs_service" "service" {
  for_each = local.services

  name            = each.key
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.service[each.key].arn
  desired_count   = each.value.desired
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = aws_subnet.private[*].id
    security_groups  = [aws_security_group.ecs.id]
    assign_public_ip = false
  }

  dynamic "load_balancer" {
    for_each = each.value.target ? [1] : []
    content {
      target_group_arn = aws_lb_target_group.gateway.arn
      container_name   = each.key
      container_port   = each.value.port
    }
  }

  service_registries {
    registry_arn = aws_service_discovery_service.service[each.key].arn
  }

  depends_on = [aws_lb_listener.http]

  tags = local.tags
}

resource "aws_ecr_repository" "service" {
  for_each = local.services
  name     = "${var.app_name}/${each.key}"
  tags     = local.tags
}

resource "aws_cloudwatch_log_group" "service" {
  for_each          = local.services
  name              = "/ecs/${var.app_name}/${each.key}"
  retention_in_days = 7
  tags              = local.tags
}

# Service discovery for internal service-to-service communication
resource "aws_service_discovery_private_dns_namespace" "main" {
  name        = "${var.app_name}.local"
  description = "ChainChat internal service discovery"
  vpc         = aws_vpc.main.id
  tags        = local.tags
}

resource "aws_service_discovery_service" "service" {
  for_each = local.services
  name     = each.key
  dns_config {
    namespace_id = aws_service_discovery_private_dns_namespace.main.id
    dns_records {
      ttl  = 10
      type = "A"
    }
    routing_policy = "MULTIVALUE"
  }
  health_check_custom_config {
    failure_threshold = 1
  }
  tags = local.tags
}
