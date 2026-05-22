// student.js
const Student = {
    profile: null,
    
    init() {
        this.profile = Storage.get('student_profile');
        if (!this.profile) {
            App.showView('view-registration');
            this.bindRegistration();
        } else {
            App.showView('view-student');
            this.renderDashboard();
            this.bindDashboard();
        }
    },
    
    bindRegistration() {
        const form = document.getElementById('registration-form');
        form.onsubmit = (e) => {
            e.preventDefault();
            this.profile = {
                name: document.getElementById('reg-name').value,
                enrollmentId: document.getElementById('reg-enrollment').value.toUpperCase(),
                email: document.getElementById('reg-email').value,
                branch: document.getElementById('reg-branch').value,
                semester: document.getElementById('reg-semester').value,
                phone: document.getElementById('reg-phone').value || ''
            };
            Storage.set('student_profile', this.profile);
            Utils.showToast('Registration successful!');
            
            // Re-init to show dashboard
            App.hideAllViews();
            this.init();
        };
    },
    
    bindDashboard() {
        document.getElementById('btn-open-scanner').onclick = () => {
            window.location.hash = '#scan';
        };
        document.getElementById('btn-edit-profile').onclick = () => {
            // Simple prompt based edit for demo
            const newName = prompt("Edit your name:", this.profile.name);
            if (newName && newName.trim() !== "") {
                this.profile.name = newName;
                Storage.set('student_profile', this.profile);
                this.renderDashboard();
                Utils.showToast("Profile updated!");
            }
        };
    },
    
    renderDashboard() {
        document.getElementById('student-greeting').innerText = `Hello, ${this.profile.name}!`;
        document.getElementById('display-enrollment').innerText = this.profile.enrollmentId;
        document.getElementById('display-branch').innerText = this.profile.branch;
        document.getElementById('display-semester').innerText = this.profile.semester;
        
        this.renderAttendanceHistory();
    },
    
    renderAttendanceHistory() {
        const tbody = document.querySelector('#student-attendance-table tbody');
        tbody.innerHTML = '';
        
        Storage.initArray('attendance_records');
        const allRecords = Storage.get('attendance_records');
        
        // Filter records for this student
        const myRecords = allRecords.filter(r => r.enrollmentId === this.profile.enrollmentId);
        
        if (myRecords.length === 0) {
            tbody.innerHTML = `<tr><td colspan="3" class="text-center text-muted">No attendance marked yet.</td></tr>`;
            return;
        }
        
        // Sort descending
        myRecords.sort((a, b) => new Date(b.markedAt) - new Date(a.markedAt));
        
        myRecords.forEach(record => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${record.subject}</td>
                <td>${Utils.formatDateTime(record.markedAt)}</td>
                <td><span style="color: var(--success); font-weight: 600;">Present</span></td>
            `;
            tbody.appendChild(tr);
        });
    }
};
