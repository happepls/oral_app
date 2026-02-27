# Deployment Scripts for Oral AI Application

This directory contains scripts for deploying the Oral AI application to different environments.

## Available Scripts

### Production Deployment
- **Script**: `prod-deploy.sh`
- **Purpose**: Deploy to production environment
- **Usage**: 
  ```bash
  ./prod-deploy.sh deploy
  ```

### Staging Deployment
- **Script**: `staging-deploy.sh`
- **Purpose**: Deploy to staging environment
- **Usage**:
  ```bash
  ./staging-deploy.sh deploy
  ```

### Development Setup
- **Script**: `dev-setup.sh`
- **Purpose**: Set up development environment
- **Usage**:
  ```bash
  ./dev-setup.sh setup
  ```

## Common Commands

All scripts support the following commands:

- `deploy` - Deploy the application
- `start` - Start the services
- `stop` - Stop the services
- `health-check` - Run health checks
- `rollback` - Rollback to previous version (where applicable)
- `logs` - Tail service logs (development only)

## Environment Configuration

Before running the deployment scripts, ensure you have the required environment variables set in your `.env` file:

```bash
POSTGRES_PASSWORD=your_postgres_password
MONGO_PASSWORD=your_mongo_password
JWT_SECRET=your_jwt_secret
```

## Docker Compose Files

Different Docker Compose files are used for each environment:

- `docker-compose.prod.yml` - Production environment
- `docker-compose.staging.yml` - Staging environment
- `docker-compose.dev.yml` - Development environment

## Security Considerations

- Store sensitive information in environment variables, not in scripts
- Use encrypted secrets for production deployments
- Regularly rotate deployment credentials
- Restrict access to deployment scripts and environments