variable "aws_region" {
  description = "AWS region for deployment"
  type        = string
  default     = "us-east-1"
}

variable "environment" {
  description = "Environment name"
  type        = string
  default     = "staging"
}

variable "app_name" {
  description = "Application name"
  type        = string
  default     = "chainchat"
}

variable "db_username" {
  description = "RDS master username"
  type        = string
  default     = "chainchat"
}

variable "db_password" {
  description = "RDS master password"
  type        = string
  sensitive   = true
}

variable "clerk_jwks_url" {
  description = "Clerk JWKS endpoint"
  type        = string
}

variable "clerk_secret_key" {
  description = "Clerk secret key"
  type        = string
  sensitive   = true
}

variable "stripe_secret_key" {
  description = "Stripe secret key"
  type        = string
  sensitive   = true
}

variable "openai_api_key" {
  description = "OpenAI API key"
  type        = string
  sensitive   = true
}

variable "anthropic_api_key" {
  description = "Anthropic API key"
  type        = string
  sensitive   = true
}
