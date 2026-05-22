// app.js
const App = {
    init() {
        window.addEventListener('hashchange', this.router.bind(this));
        // Initialize based on current hash
        if (!window.location.hash) {
            window.location.hash = '#student';
        } else {
            this.router();
        }
    },
    router() {
        const hash = window.location.hash;
        this.hideAllViews();
        
        if (hash === '#student') {
            if (typeof Student !== 'undefined') Student.init();
        } else if (hash === '#admin') {
            if (typeof Admin !== 'undefined') Admin.init();
        } else if (hash === '#scan') {
            if (typeof Scanner !== 'undefined') Scanner.init();
        } else {
            window.location.hash = '#student';
        }
    },
    hideAllViews() {
        document.querySelectorAll('.view').forEach(view => {
            view.classList.add('hidden');
        });
        // Stop scanner if we leave scan view
        if (window.location.hash !== '#scan' && typeof Scanner !== 'undefined') {
            Scanner.stop();
        }
    },
    showView(id) {
        const el = document.getElementById(id);
        if (el) el.classList.remove('hidden');
    }
};

document.addEventListener('DOMContentLoaded', () => {
    App.init();
});
