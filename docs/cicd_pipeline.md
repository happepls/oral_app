# CI/CD Pipeline Documentation for Oral AI Application

## Overview

This document describes the complete CI/CD (Continuous Integration/Continuous Deployment) pipeline for the Oral AI application. The pipeline automates the building, testing, and deployment of the application across multiple environments.

## Architecture

The Oral AI application follows a microservices architecture with the following components:
- **Frontend**: React 19.2.0 application
- **API Gateway**: Nginx/Express gateway
- **User Service**: User authentication and management
- **Comms Service**: WebSocket real-time communication
- **AI Omni Service**: Qwen3-Omni AI integration
- **History Analytics Service**: Chat history and analytics
- **Media Processing Service**: Audio transcoding and storage
- **Databases**: PostgreSQL, MongoDB, Redis

## CI/CD Pipeline Components

### 1. GitHub Actions Workflows

The CI/CD pipeline consists of the following GitHub Actions workflows:

#### CI Pipeline (.github/workflows/ci.yml)
- Runs on every push to `main` and `develop` branches
- Runs on every pull request to `main`
- Performs the following steps:
  - Sets up Node.js environment
  - Installs dependencies for all services
  - Runs linting checks
  - Executes unit tests
  - Executes integration tests

#### Docker Build Pipeline (.github/workflows/docker.yml)
- Runs on every push to `main` and `develop` branches
- Runs on every tag creation
- Builds Docker images for all services
- Pushes images to GitHub Container Registry (GHCR)
- Tags images with branch names and semantic versions

#### Staging Deployment (.github/workflows/deploy-staging.yml)
- Runs on every push to `develop` branch
- Deploys to staging environment
- Performs health checks after deployment
- Runs integration tests against staging

#### Production Deployment (.github/workflows/deploy.yml)
- Runs on every tag creation (v*.*.*)
- Deploys to production environment
- Performs health checks after deployment
- Sends notifications to Slack

#### Security Scanning (.github/workflows/security.yml)
- Runs on every push to `main` and `develop` branches
- Runs weekly scheduled scans
- Performs vulnerability scanning using Trivy
- Performs security scanning using Snyk
- Runs CodeQL analysis
- Scans Docker images for vulnerabilities

### 2. Docker Configuration

Docker configurations have been optimized for each service:

- **Client**: Production-ready Dockerfile with build optimization
- **Services**: Optimized Dockerfiles with minimal base images
- **API Gateway**: Nginx configuration for reverse proxy
- **.dockerignore**: Properly configured for each service to exclude unnecessary files

### 3. Deployment Scripts

Deployment scripts are provided for different environments:

- **Production**: `deploy/prod-deploy.sh`
- **Staging**: `deploy/staging-deploy.sh`
- **Development**: `deploy/dev-setup.sh`

Each script includes:
- Prerequisite checking
- Backup mechanisms
- Image pulling
- Service management
- Health checks
- Rollback capabilities

### 4. Environment-Specific Configurations

Different Docker Compose files for each environment:

- **Development**: `docker-compose.dev.yml` - Includes volume mounts for live reloading
- **Staging**: `docker-compose.staging.yml` - Uses tagged images for staging
- **Production**: `docker-compose.prod.yml` - Optimized for production performance

### 5. Monitoring and Alerting

The pipeline includes comprehensive monitoring and alerting:

#### Prometheus Configuration
- Monitors all services
- Collects custom application metrics
- Configured with alert rules

#### Alert Manager
- Configured with email and Slack notifications
- Different alert levels (critical, warning)
- Alert inhibition rules

#### Grafana Dashboards
- Pre-configured dashboards for application metrics
- System resource monitoring
- Service health visualization

## Deployment Process

### Staging Deployment
1. Developer pushes code to `develop` branch
2. CI pipeline runs automatically
3. If successful, Docker images are built and pushed to GHCR
4. Staging deployment workflow triggers
5. Images are deployed to staging environment
6. Health checks and integration tests run
7. Team is notified of successful deployment

### Production Deployment
1. Maintainer creates a semantic version tag (v*.*.*)
2. CI pipeline runs automatically
3. Docker images are built and pushed to GHCR
4. Production deployment workflow triggers
5. Images are deployed to production environment
6. Health checks run
7. Stakeholders are notified of successful deployment

## Security Measures

The CI/CD pipeline implements several security measures:

- **Vulnerability Scanning**: Automated scanning of code and Docker images
- **Secret Management**: Encrypted secrets for deployment credentials
- **Access Control**: Environment-specific permissions
- **Image Signing**: Docker images are signed for integrity
- **Dependency Scanning**: Regular scanning of dependencies for known vulnerabilities

## Best Practices Implemented

- **Infrastructure as Code**: All infrastructure defined in code
- **Immutable Builds**: Docker images are immutable once created
- **Blue-Green Deployment**: Zero-downtime deployments
- **Health Checks**: Comprehensive health checks before and after deployment
- **Rollback Capability**: Easy rollback to previous versions
- **Monitoring**: Full observability of the application and infrastructure
- **Testing**: Multiple layers of testing (unit, integration, end-to-end)

## Environment Variables and Secrets

The pipeline uses the following environment variables and secrets:

### GitHub Secrets Required
- `DEPLOY_HOST`: Production server hostname
- `DEPLOY_USER`: Production server username
- `SSH_PRIVATE_KEY`: Private key for server access
- `STAGING_DEPLOY_HOST`: Staging server hostname
- `STAGING_DEPLOY_USER`: Staging server username
- `STAGING_SSH_PRIVATE_KEY`: Staging server private key
- `SNYK_TOKEN`: Snyk security scanning token
- `SLACK_WEBHOOK_URL`: Slack notification webhook
- `POSTGRES_PASSWORD`: PostgreSQL password
- `MONGO_PASSWORD`: MongoDB password
- `JWT_SECRET`: JWT signing secret

### Environment-Specific Variables
- `NODE_ENV`: Node.js environment (development, staging, production)
- `DATABASE_SSL`: SSL configuration for database connections
- `LOG_LEVEL`: Logging level for services

## Troubleshooting

### Common Issues and Solutions

1. **Pipeline Fails During Docker Build**
   - Check Dockerfile syntax
   - Verify base image availability
   - Ensure sufficient build resources

2. **Deployment Fails Due to Insufficient Permissions**
   - Verify SSH key permissions
   - Check server access credentials
   - Ensure proper environment permissions

3. **Health Checks Fail After Deployment**
   - Verify service dependencies
   - Check environment variable configuration
   - Review service logs for errors

4. **Security Scanning Reports Vulnerabilities**
   - Update dependencies to patched versions
   - Review and address reported vulnerabilities
   - Re-run security scans after fixes

## Maintenance

### Regular Maintenance Tasks

1. **Update Base Images**: Regularly update base Docker images
2. **Review Security Reports**: Monitor security scanning results
3. **Update Dependencies**: Keep dependencies up-to-date
4. **Monitor Resource Usage**: Track resource consumption
5. **Review Logs**: Regularly review application and infrastructure logs

### Pipeline Improvements

Future improvements to consider:
- Implement canary deployments
- Add performance testing
- Integrate with additional monitoring tools
- Implement automated scaling policies
- Add chaos engineering practices

## Conclusion

This CI/CD pipeline provides a robust, secure, and scalable solution for deploying the Oral AI application. It ensures consistent deployments across environments, maintains high code quality through automated testing, and provides comprehensive monitoring and alerting for operational excellence.