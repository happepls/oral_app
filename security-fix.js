#!/usr/bin/env node

/**
 * Security Fix Script for Oral AI Application
 * This script helps fix common security issues
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

class SecurityFixer {
  constructor() {
    this.fixedIssues = [];
    this.warnings = [];
  }

  async run() {
    console.log('🔧 Starting security fixes...\n');
    
    await this.generateSecureKeys();
    await this.createSecureEnvFile();
    await this.fixCorsConfiguration();
    await this.updateDockerSecurity();
    
    this.generateReport();
  }

  async generateSecureKeys() {
    console.log('🔑 Generating secure keys...');
    
    const keys = {
      JWT_SECRET: this.generateSecureString(64),
      JWT_REFRESH_SECRET: this.generateSecureString(64),
      ENCRYPTION_KEY: this.generateSecureString(32),
      SESSION_SECRET: this.generateSecureString(32)
    };
    
    // Save keys to a secure file
    const keysPath = path.join(__dirname, '.security-keys.json');
    fs.writeFileSync(keysPath, JSON.stringify(keys, null, 2));
    
    console.log('✅ Secure keys generated and saved to .security-keys.json');
    console.log('⚠️  IMPORTANT: Keep this file secure and never commit it to version control!\n');
    
    this.fixedIssues.push('Generated secure cryptographic keys');
  }

  generateSecureString(length) {
    return crypto.randomBytes(Math.ceil(length / 2)).toString('hex').slice(0, length);
  }

  async createSecureEnvFile() {
    console.log('📝 Creating secure environment configuration...');
    
    const envExamplePath = path.join(__dirname, '.env.example');
    const envPath = path.join(__dirname, '.env');
    
    if (!fs.existsSync(envPath)) {
      if (fs.existsSync(envExamplePath)) {
        // Copy from example
        const content = fs.readFileSync(envExamplePath, 'utf8');
        fs.writeFileSync(envPath, content);
        console.log('✅ Created .env file from .env.example');
      } else {
        // Create basic .env file
        const basicEnv = `# Basic environment configuration
NODE_ENV=development
PORT=8080

# Generate secure keys using: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
JWT_SECRET=change-this-to-a-secure-random-string-minimum-32-characters
JWT_REFRESH_SECRET=change-this-to-a-different-secure-random-string-minimum-32-characters

# Database
DATABASE_URL=postgresql://username:password@localhost:5432/oral_app

# Redis
REDIS_URL=redis://localhost:6379

# MongoDB
MONGODB_URI=mongodb://localhost:27017/oral_app
`;
        fs.writeFileSync(envPath, basicEnv);
        console.log('✅ Created basic .env file');
      }
      
      this.fixedIssues.push('Created secure environment configuration');
    } else {
      console.log('⚠️  .env file already exists, skipping creation');
      this.warnings.push('.env file already exists - review manually');
    }
    
    console.log('');
  }

  async fixCorsConfiguration() {
    console.log('🌐 Fixing CORS configuration...');
    
    // Update API gateway CORS configuration
    const gatewayPath = path.join(__dirname, 'api-gateway/server.js');
    if (fs.existsSync(gatewayPath)) {
      let content = fs.readFileSync(gatewayPath, 'utf8');
      
      // Replace permissive CORS with specific origins
      if (content.includes("origin: true") && !content.includes("ALLOWED_ORIGINS")) {
        content = content.replace(
          /origin: true/g,
          'origin: process.env.ALLOWED_ORIGINS?.split(",") || ["http://localhost:3000", "http://localhost:5001"]'
        );
        
        fs.writeFileSync(gatewayPath, content);
        console.log('✅ Updated API gateway CORS configuration');
        this.fixedIssues.push('Fixed permissive CORS configuration in API gateway');
      }
    }
    
    console.log('');
  }

  async updateDockerSecurity() {
    console.log('🐳 Updating Docker security...');
    
    // Check Dockerfiles for security issues
    const dockerfiles = [
      'Dockerfile',
      'services/user-service/Dockerfile',
      'services/ai-omni-service/Dockerfile',
      'api-gateway/Dockerfile'
    ];
    
    for (const dockerfile of dockerfiles) {
      const dockerPath = path.join(__dirname, dockerfile);
      if (fs.existsSync(dockerPath)) {
        let content = fs.readFileSync(dockerPath, 'utf8');
        
        // Check for root user
        if (content.includes('USER root') || !content.includes('USER')) {
          // Add non-root user if not present
          if (!content.includes('USER node')) {
            content = content.replace(
              /FROM node:\d+/g,
              '$&\nRUN groupadd -r appuser && useradd -r -g appuser appuser'
            );
            content += '\nUSER appuser\n';
            
            fs.writeFileSync(dockerPath, content);
            console.log(`✅ Updated ${dockerfile} to use non-root user`);
            this.fixedIssues.push(`Fixed Docker security in ${dockerfile}`);
          }
        }
        
        // Check for exposed secrets
        if (content.includes('ENV JWT_SECRET=') || content.includes('ENV API_KEY=')) {
          this.warnings.push(`Dockerfile ${dockerfile} may contain hardcoded secrets`);
        }
      }
    }
    
    console.log('');
  }

  generateReport() {
    console.log('📋 Security Fix Report');
    console.log('='.repeat(50));
    
    console.log('\n✅ Fixed Issues:');
    this.fixedIssues.forEach((issue, index) => {
      console.log(`  ${index + 1}. ${issue}`);
    });
    
    if (this.warnings.length > 0) {
      console.log('\n⚠️  Warnings (Manual Review Required):');
      this.warnings.forEach((warning, index) => {
        console.log(`  ${index + 1}. ${warning}`);
      });
    }
    
    console.log('\n🔧 Next Steps:');
    console.log('1. Review and update the generated .env file with your actual configuration');
    console.log('2. Run npm install to install security dependencies');
    console.log('3. Run npm audit to check for vulnerabilities');
    console.log('4. Review the security documentation in docs/SECURITY.md');
    console.log('5. Test the application with the new security configurations');
    console.log('6. Consider implementing additional security measures:');
    console.log('   - Two-factor authentication (2FA)');
    console.log('   - API key rotation');
    console.log('   - Security monitoring and alerting');
    console.log('   - Regular security audits');
    
    console.log('\n📚 Security Resources:');
    console.log('- OWASP Top 10: https://owasp.org/www-project-top-ten/');
    console.log('- Node.js Security Checklist: https://nodejs.org/en/docs/guides/security/');
    console.log('- Express Security Best Practices: https://expressjs.com/en/advanced/best-practice-security.html');
    
    console.log('\n' + '='.repeat(50));
    console.log('✅ Security fixes completed!');
    
    // Save report
    const reportPath = path.join(__dirname, 'security-fix-report.json');
    fs.writeFileSync(reportPath, JSON.stringify({
      timestamp: new Date().toISOString(),
      fixedIssues: this.fixedIssues,
      warnings: this.warnings,
      nextSteps: [
        'Review and update .env file',
        'Install security dependencies',
        'Run security audit',
        'Test application security'
      ]
    }, null, 2));
    
    console.log(`📄 Report saved to: ${reportPath}`);
  }
}

// Run the security fixes
if (require.main === module) {
  const fixer = new SecurityFixer();
  fixer.run().catch(error => {
    console.error('❌ Security fixes failed:', error);
    process.exit(1);
  });
}

module.exports = SecurityFixer;