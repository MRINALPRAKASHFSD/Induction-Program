// admin.js
const Admin = {
    isAuthenticated: false,
    activeSession: null,
    liveInterval: null,
    qrcodeObj: null,

    init() {
        if (!this.isAuthenticated) {
            App.showView('view-admin-login');
            this.bindLogin();
        } else {
            App.showView('view-admin');
            this.bindDashboard();
            this.switchTab('create-session');
            
            // Auto-fill date and time
            const now = new Date();
            document.getElementById('session-date').valueAsDate = now;
            document.getElementById('session-time').value = now.toTimeString().slice(0,5);
        }
    },
    
    bindLogin() {
        const form = document.getElementById('admin-login-form');
        form.onsubmit = (e) => {
            e.preventDefault();
            const pin = document.getElementById('admin-pin').value;
            if (pin === '1234') {
                this.isAuthenticated = true;
                document.getElementById('admin-pin').value = '';
                Utils.showToast('Login successful!');
                App.hideAllViews();
                this.init();
            } else {
                Utils.showToast('Invalid PIN', 'error');
            }
        };
    },
    
    bindDashboard() {
        // Tab switching
        document.querySelectorAll('.admin-nav .nav-btn').forEach(btn => {
            btn.onclick = (e) => {
                document.querySelectorAll('.admin-nav .nav-btn').forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');
                this.switchTab(e.target.dataset.tab);
            };
        });
        
        // Logout
        document.getElementById('btn-admin-logout').onclick = () => {
            this.isAuthenticated = false;
            this.stopLiveTracking();
            window.location.hash = '#student';
            Utils.showToast('Logged out');
        };
        
        // Session creation
        const form = document.getElementById('create-session-form');
        form.onsubmit = (e) => {
            e.preventDefault();
            this.createSession();
        };
        
        // Live refresh button
        document.getElementById('btn-refresh-live').onclick = () => {
            this.updateLiveAttendance();
        };

        // Export CSV button
        document.getElementById('btn-export-csv').onclick = () => {
            this.exportAttendance();
        };

        // Filters
        document.getElementById('btn-apply-filters').onclick = () => {
            this.renderAllAttendance();
        };
    },
    
    switchTab(tabId) {
        document.querySelectorAll('.admin-tab').forEach(tab => tab.classList.add('hidden'));
        document.getElementById(`tab-${tabId}`).classList.remove('hidden');
        
        if (tabId === 'view-attendance') {
            this.renderAllAttendance();
        }
    },
    
    createSession() {
        const sessionData = {
            sessionId: Utils.generateUUID(),
            subject: document.getElementById('session-subject').value,
            date: document.getElementById('session-date').value,
            time: document.getElementById('session-time').value,
            type: document.getElementById('session-type').value,
            duration: parseInt(document.getElementById('session-duration').value),
            generatedAt: new Date().toISOString()
        };
        
        Storage.push('admin_sessions', sessionData);
        this.activeSession = sessionData;
        
        // Generate QR Code
        this.generateQRCode(sessionData);
        
        // Show live tracking
        document.getElementById('active-session-attendance').classList.remove('hidden');
        this.startLiveTracking();
        Utils.showToast('Session created and QR generated!');
    },
    
    generateQRCode(data) {
        const container = document.getElementById('qrcode-box');
        container.innerHTML = '';
        container.classList.remove('hidden');
        document.getElementById('live-counter').classList.remove('hidden');
        
        const jsonStr = JSON.stringify(data);
        
        this.qrcodeObj = new QRCode(container, {
            text: jsonStr,
            width: 300,
            height: 300,
            colorDark : "#0b1120",
            colorLight : "#ffffff",
            correctLevel : QRCode.CorrectLevel.M
        });
    },
    
    startLiveTracking() {
        this.stopLiveTracking();
        this.updateLiveAttendance();
        this.liveInterval = setInterval(() => {
            this.updateLiveAttendance();
        }, 3000);
    },
    
    stopLiveTracking() {
        if (this.liveInterval) {
            clearInterval(this.liveInterval);
            this.liveInterval = null;
        }
    },
    
    updateLiveAttendance() {
        if (!this.activeSession) return;
        
        Storage.initArray('attendance_records');
        const allRecords = Storage.get('attendance_records');
        const liveRecords = allRecords.filter(r => r.sessionId === this.activeSession.sessionId);
        
        // Update Counter
        document.querySelector('.counter-number').innerText = liveRecords.length;
        
        // Update Table
        const tbody = document.querySelector('#live-attendance-table tbody');
        tbody.innerHTML = '';
        
        if (liveRecords.length === 0) {
            tbody.innerHTML = `<tr><td colspan="3" class="text-center text-muted">No one has marked attendance yet.</td></tr>`;
            return;
        }
        
        // Sort newest first
        liveRecords.sort((a, b) => new Date(b.markedAt) - new Date(a.markedAt));
        
        liveRecords.forEach(record => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${record.name}</td>
                <td>${record.enrollmentId}</td>
                <td>${Utils.formatDateTime(record.markedAt).split(' ')[1]}</td>
            `;
            tbody.appendChild(tr);
        });
    },
    
    renderAllAttendance() {
        Storage.initArray('attendance_records');
        let records = Storage.get('attendance_records');
        Storage.initArray('admin_sessions');
        const sessions = Storage.get('admin_sessions');
        
        // Apply filters
        const filterSubject = document.getElementById('filter-subject').value.toLowerCase();
        const filterDate = document.getElementById('filter-date').value;
        
        if (filterSubject) {
            records = records.filter(r => r.subject.toLowerCase().includes(filterSubject));
        }
        if (filterDate) {
            records = records.filter(r => r.date === filterDate);
        }
        
        // Update Stats
        const uniqueStudents = new Set(records.map(r => r.enrollmentId)).size;
        document.getElementById('stat-sessions').innerText = sessions.length;
        document.getElementById('stat-records').innerText = records.length;
        document.getElementById('stat-students').innerText = uniqueStudents;
        
        // Update Table
        const tbody = document.querySelector('#all-attendance-table tbody');
        tbody.innerHTML = '';
        
        if (records.length === 0) {
            tbody.innerHTML = `<tr><td colspan="5" class="text-center text-muted">No attendance records found.</td></tr>`;
            return;
        }
        
        // Sort descending
        records.sort((a, b) => new Date(b.markedAt) - new Date(a.markedAt));
        
        records.forEach(record => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${record.name}</td>
                <td>${record.enrollmentId}</td>
                <td>${record.subject}</td>
                <td>${Utils.formatDate(record.date)}</td>
                <td>${Utils.formatDateTime(record.markedAt)}</td>
            `;
            tbody.appendChild(tr);
        });
    },
    
    exportAttendance() {
        Storage.initArray('attendance_records');
        let records = Storage.get('attendance_records');
        
        if (records.length === 0) {
            Utils.showToast('No records to export', 'warning');
            return;
        }
        
        const headers = ["Session ID", "Subject", "Session Date", "Session Time", "Marked At", "Name", "Enrollment ID", "Email", "Branch", "Semester"];
        const data = records.map(r => [
            r.sessionId,
            r.subject,
            r.date,
            r.sessionTime,
            r.markedAt,
            r.name,
            r.enrollmentId,
            r.email,
            r.branch,
            r.semester
        ]);
        
        Utils.exportCSV(headers, data, `attendance_export_${new Date().getTime()}.csv`);
    }
};
