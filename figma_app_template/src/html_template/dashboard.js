// Oral AI - Dashboard Logic
// Built: 2026-04-13 | Strictly follows design-tokens.css

class Dashboard {
    constructor() {
        this.init();
    }

    init() {
        // Initialize bottom navigation
        this.initNavigation();
        
        // Initialize scenario cards
        this.initScenarios();
        
        // Initialize goal check
        this.initGoalCheck();
        
        // Load user data
        this.loadUserData();
    }

    initNavigation() {
        const navItems = document.querySelectorAll('.nav-item');
        
        navItems.forEach(item => {
            item.addEventListener('click', () => {
                navItems.forEach(i => i.classList.remove('active'));
                item.classList.add('active');
            });
        });
    }

    initScenarios() {
        const scenarioCards = document.querySelectorAll('.scenario-card:not(.add-new)');
        
        scenarioCards.forEach(card => {
            card.addEventListener('click', () => {
                scenarioCards.forEach(c => c.classList.remove('active'));
                card.classList.add('active');
                
                const name = card.querySelector('.scenario-name')?.textContent;
                if (name) {
                    this.showToast(`正在进入「${name}」场景...`);
                }
            });
        });
    }

    initGoalCheck() {
        const checkBtn = document.querySelector('.check-btn');
        const goalCard = document.querySelector('.goal-card');
        
        if (checkBtn) {
            checkBtn.addEventListener('click', () => {
                goalCard.style.opacity = '0.6';
                checkBtn.style.background = 'var(--text-muted)';
                checkBtn.textContent = '✓';
                this.showToast('🎉 今日目标已完成！');
            });
        }
    }

    loadUserData() {
        // Simulated user data loading
        console.log('Dashboard loaded');
    }

    showToast(message) {
        const toast = document.createElement('div');
        toast.className = 'toast';
        toast.textContent = message;
        toast.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: rgba(0, 0, 0, 0.8);
            color: white;
            padding: 12px 24px;
            border-radius: var(--radius-lg);
            font-size: 14px;
            z-index: 1000;
            animation: fadeIn 0.3s ease;
        `;
        
        document.body.appendChild(toast);
        
        setTimeout(() => {
            toast.style.opacity = '0';
            setTimeout(() => toast.remove(), 300);
        }, 2000);
    }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    new Dashboard();
});