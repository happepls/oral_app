#!/usr/bin/env node

/**
 * Security Audit Script for Oral AI Application
 * This script performs basic security checks on the codebase
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Security patterns to check for
const SECURITY_PATTERNS = {
  // Vulnerable patterns
  vulnerabilities: [
    {
      pattern: /process\.env\.[A-Z_]*PASSWORD[A-Z_]*/g,
      severity: 'high',
      message: 'Hardcoded passwords in environment variables'
    },
    {
      pattern: /password\s*=\s*['"]\w+['"]/g,
      severity: 'critical',
      message: 'Hardcoded password detected'
    },
    {
      pattern: /api[_-]?key\s*=\s*['"]\w+['"]/g,
      severity: 'critical',
      message: 'Hardcoded API key detected'
    },
    {
      pattern: /secret\s*=\s*['"]\w+['"]/g,
      severity: 'critical',
      message: 'Hardcoded secret detected'
    },
    {
      pattern: /jwt\.sign.*{.*expiresIn.*:\s*['"]\d+[smhd]['"]}/g,
      severity: 'medium',
      message: 'JWT token expiry might be too long'
    },
    {
      pattern: /bcrypt\.hashSync/g,
      severity: 'medium',
      message: 'Using synchronous bcrypt (blocks event loop)'
    },
    {
      pattern: /eval\(/g,
      severity: 'critical',
      message: 'Use of eval() detected'
    },
    {
      pattern: /innerHTML\s*=/g,
      severity: 'high',
      message: 'Potential XSS vulnerability with innerHTML'
    }
  ],
  
  // Security best practices
  bestPractices: [
    {
      pattern: /helmet\(/g,
      severity: 'info',
      message: 'Helmet security headers detected'
    },
    {
      pattern: /rateLimit\(/g,
      severity: 'info',
      message: 'Rate limiting detected'
    },
    {
      pattern: /express-validator/g,
      severity: 'info',
      message: 'Input validation detected'
    },
    {
      pattern: /bcrypt\.compare/g,
      severity: 'info',
      message: 'Secure password comparison detected'
    },
    {
      pattern: /jwt\.verify/g,
      severity: 'info',
      message: 'JWT verification detected'
    },
    {
      pattern: /httpsOnly.*true/g,
      severity: 'info',
      message: 'Secure cookie configuration detected'
    }
  ]
};

// Environment variables to check
const REQUIRED_ENV_VARS = [
  'JWT_SECRET',
  'JWT_REFRESH_SECRET',
  'DATABASE_URL',
  'REDIS_URL',
  'NODE_ENV'
];

const SENSITIVE_ENV_VARS = [
  'JWT_SECRET',
  'JWT_REFRESH_SECRET',
  'OPENAI_API_KEY',
  'AI_INTEGRATIONS_OPENROUTER_API_KEY',
  'STRIPE_SECRET_KEY',
  'DATABASE_URL',
  'REDIS_URL'
];

class SecurityAuditor {
  constructor() {
    this.findings = [];
    this.scannedFiles = 0;
    this.vulnerabilities = 0;
    this.warnings = 0;
  }

  async scan() {
    console.log('🔍 Starting security audit...\n');
    
    await this.checkEnvironmentVariables();
    await this.scanCodebase();
    await this.checkConfigurationFiles();
    await this.checkDependencies();
    
    this.generateReport();
  }

  async checkEnvironmentVariables() {
    console.log('📋 Checking environment variables...');
    
    const envFiles = ['.env', '.env.local', '.env.production', '.env.development'];
    
    for (const envFile of envFiles) {
      const envPath = path.join(__dirname, envFile);
      if (fs.existsSync(envPath)) {
        const content = fs.readFileSync(envPath, 'utf8');
        
        // Check for required variables
        for (const varName of REQUIRED_ENV_VARS) {
          if (!content.includes(varName)) {
            this.addFinding('warning', `Missing required environment variable: ${varName}`, envFile);
          }
        }
        
        // Check for sensitive data in plain text
        for (const varName of SENSITIVE_ENV_VARS) {
          const pattern = new RegExp(`${varName}=([^\s]+)`, 'g');
          const matches = content.match(pattern);
          if (matches) {
            for (const match of matches) {
              const value = match.split('=')[1];
              if (value && value.length < 16) {
                this.addFinding('high', `Weak ${varName} value (too short)`, envFile);
              }
              if (value && ['password123', 'admin', 'secret'].includes(value.toLowerCase())) {
                this.addFinding('critical', `Weak ${varName} value (common password)`, envFile);
              }
            }
          }
        }
      }
    }
    
    console.log('✅ Environment variables check completed\n');
  }

  async scanCodebase() {
    console.log('🔍 Scanning codebase for security issues...');
    
    const extensions = ['.js', '.ts', '.jsx', '.tsx'];
    const excludeDirs = ['node_modules', '.git', 'dist', 'build', 'coverage'];
    
    await this.scanDirectory(__dirname, extensions, excludeDirs);
    
    console.log(`✅ Scanned ${this.scannedFiles} files\n`);
  }

  async scanDirectory(dir, extensions, excludeDirs) {
    const files = fs.readdirSync(dir);
    
    for (const file of files) {
      const filePath = path.join(dir, file);
      const stat = fs.statSync(filePath);
      
      if (stat.isDirectory() && !excludeDirs.includes(file)) {
        await this.scanDirectory(filePath, extensions, excludeDirs);
      } else if (stat.isFile() && extensions.includes(path.extname(file))) {
        await this.scanFile(filePath);
      }
    }
  }

  async scanFile(filePath) {
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      this.scannedFiles++;
      
      // Check for vulnerabilities
      for (const pattern of SECURITY_PATTERNS.vulnerabilities) {
        const matches = content.match(pattern.pattern);
        if (matches) {
          for (const match of matches) {
            this.addFinding(pattern.severity, pattern.message, filePath, match);
            if (pattern.severity === 'critical') this.vulnerabilities++;
            if (pattern.severity === 'high') this.vulnerabilities++;
            if (pattern.severity === 'medium') this.warnings++;
          }
        }
      }
      
      // Check for best practices
      for (const pattern of SECURITY_PATTERNS.bestPractices) {
        const matches = content.match(pattern.pattern);
        if (matches) {
          this.addFinding('info', pattern.message, filePath);
        }
      }
      
      // Check for potential SQL injection
      if (content.includes('SELECT') || content.includes('INSERT') || content.includes('UPDATE')) {
        if (!content.includes('?') && !content.includes('$') && !content.includes(' parameterized')) {
          this.addFinding('high', 'Potential SQL injection vulnerability', filePath);
        }
      }
      
      // Check for CORS configuration
      if (content.includes('cors(') && content.includes('origin: *')) {
        this.addFinding('medium', 'Permissive CORS configuration (allows all origins)', filePath);
      }
      
    } catch (error) {
      console.warn(`Warning: Could not scan file ${filePath}: ${error.message}`);
    }
  }

  async checkConfigurationFiles() {
    console.log('🔧 Checking configuration files...');
    
    // Check package.json for security-related dependencies
    const packagePath = path.join(__dirname, 'package.json');
    if (fs.existsSync(packagePath)) {
      const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
      
      const securityDeps = [
        'helmet', 'express-rate-limit', 'express-validator', 
        'bcrypt', 'jsonwebtoken', 'cors', 'express-mongo-sanitize',
        'xss-clean', 'hpp'
      ];
      
      const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
      
      for (const dep of securityDeps) {
        if (!allDeps[dep]) {
          this.addFinding('medium', `Missing security dependency: ${dep}`, 'package.json');
        }
      }
    }
    
    // Check Docker configuration
    const dockerfilePath = path.join(__dirname, 'Dockerfile');
    if (fs.existsSync(dockerfilePath)) {
      const dockerfile = fs.readFileSync(dockerfilePath, 'utf8');
      if (dockerfile.includes('USER root')) {
        this.addFinding('medium', 'Docker container runs as root user', 'Dockerfile');
      }
    }
    
    console.log('✅ Configuration files check completed\n');
  }

  async checkDependencies() {
    console.log('📦 Checking dependencies for known vulnerabilities...');
    
    try {
      // Check if package-lock.json exists
      const packageLockPath = path.join(__dirname, 'package-lock.json');
      if (fs.existsSync(packageLockPath)) {
        console.log('✅ package-lock.json found - consider running npm audit');
      }
      
      // Check if yarn.lock exists
      const yarnLockPath = path.join(__dirname, 'yarn.lock');
      if (fs.existsSync(yarnLockPath)) {
        console.log('✅ yarn.lock found - consider running yarn audit');
      }
      
    } catch (error) {
      console.warn('Warning: Could not check dependencies:', error.message);
    }
    
    console.log('✅ Dependencies check completed\n');
  }

  addFinding(severity, message, file, match = null) {
    this.findings.push({
      severity,
      message,
      file: file.replace(__dirname, '.'),
      match: match ? match.substring(0, 100) + (match.length > 100 ? '...' : '') : null,
      timestamp: new Date().toISOString()
    });
  }

  generateReport() {
    console.log('\n' + '='.repeat(60));
    console.log('🔒 SECURITY AUDIT REPORT');
    console.log('='.repeat(60));
    
    const critical = this.findings.filter(f => f.severity === 'critical').length;
    const high = this.findings.filter(f => f.severity === 'high').length;
    const medium = this.findings.filter(f => f.severity === 'medium').length;
    const low = this.findings.filter(f => f.severity === 'low').length;
    const info = this.findings.filter(f => f.severity === 'info').length;
    
    console.log(`\n📊 Summary:`);
    console.log(`  Files scanned: ${this.scannedFiles}`);
    console.log(`  Critical issues: ${critical}`);
    console.log(`  High severity: ${high}`);
    console.log(`  Medium severity: ${medium}`);
    console.log(`  Low severity: ${low}`);
    console.log(`  Info items: ${info}`);
    
    if (this.findings.length > 0) {
      console.log(`\n🚨 Findings (ordered by severity):`);
      
      // Sort by severity
      const severityOrder = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
      this.findings.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);
      
      this.findings.forEach((finding, index) => {
        const severityEmoji = {
          critical: '🔴',
          high: '🟠',
          medium: '🟡',
          low: '🟢',
          info: '🔵'
        };
        
        console.log(`\n${severityEmoji[finding.severity]} ${index + 1}. ${finding.message}`);
        console.log(`   File: ${finding.file}`);
        if (finding.match) {
          console.log(`   Match: ${finding.match}`);
        }
      });
    } else {
      console.log('\n✅ No security issues found!');
    }
    
    console.log('\n' + '='.repeat(60));
    console.log('📋 Recommendations:');
    console.log('='.repeat(60));
    
    if (critical > 0) {
      console.log('🔴 CRITICAL: Address these issues immediately!');
      console.log('   - Remove hardcoded secrets and passwords');
      console.log('   - Use environment variables for sensitive data');
      console.log('   - Implement proper secret management');
    }
    
    if (high > 0) {
      console.log('\n🟠 HIGH: Address these issues as soon as possible');
      console.log('   - Implement input validation and sanitization');
      console.log('   - Use parameterized queries to prevent SQL injection');
      console.log('   - Implement proper XSS protection');
    }
    
    if (medium > 0) {
      console.log('\n🟡 MEDIUM: Address these issues in the next sprint');
      console.log('   - Add missing security dependencies');
      console.log('   - Configure CORS properly');
      console.log('   - Implement rate limiting');
    }
    
    console.log('\n🔵 GENERAL: Ongoing security practices');
    console.log('   - Run npm audit regularly');
    console.log('   - Keep dependencies updated');
    console.log('   - Implement security monitoring');
    console.log('   - Conduct regular security reviews');
    console.log('   - Use HTTPS in production');
    console.log('   - Implement proper logging and monitoring');
    
    console.log('\n' + '='.repeat(60));
    
    // Generate detailed report file
    const reportPath = path.join(__dirname, 'security-audit-report.json');
    fs.writeFileSync(reportPath, JSON.stringify({
      timestamp: new Date().toISOString(),
      summary: {
        filesScanned: this.scannedFiles,
        findings: this.findings.length,
        critical,
        high,
        medium,
        low,
        info
      },
      findings: this.findings,
      recommendations: this.generateRecommendations(critical, high, medium)
    }, null, 2));
    
    console.log(`📄 Detailed report saved to: ${reportPath}`);
    
    // Exit with appropriate code
    process.exit(critical > 0 ? 1 : 0);
  }

  generateRecommendations(critical, high, medium) {
    const recommendations = [];
    
    if (critical > 0) {
      recommendations.push({
        priority: 'critical',
        action: 'Remove all hardcoded secrets and passwords',
        timeframe: 'immediate'
      });
    }
    
    if (high > 0) {
      recommendations.push({
        priority: 'high',
        action: 'Implement input validation and SQL injection protection',
        timeframe: '1 week'
      });
    }
    
    if (medium > 0) {
      recommendations.push({
        priority: 'medium',
        action: 'Add missing security dependencies and configure CORS',
        timeframe: '1 month'
      });
    }
    
    recommendations.push({
      priority: 'ongoing',
      action: 'Regular dependency updates and security monitoring',
      timeframe: 'continuous'
    });
    
    return recommendations;
  }
}

// Run the audit
if (require.main === module) {
  const auditor = new SecurityAuditor();
  auditor.scan().catch(error => {
    console.error('Audit failed:', error);
    process.exit(1);
  });
}

module.exports = SecurityAuditor;