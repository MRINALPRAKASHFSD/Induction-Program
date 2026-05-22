// scanner.js
const Scanner = {
    video: null,
    canvasElement: null,
    canvas: null,
    isScanning: false,
    stream: null,
    
    init() {
        App.showView('view-scan');
        
        // Redirect to student if not registered
        if (!Student.profile) {
            window.location.hash = '#student';
            return;
        }

        this.video = document.getElementById('qr-video');
        this.canvasElement = document.getElementById('qr-canvas');
        this.canvas = this.canvasElement.getContext('2d');
        
        document.getElementById('btn-close-scanner').onclick = () => {
            window.location.hash = '#student';
        };
        
        document.getElementById('btn-manual-submit').onclick = () => {
            const val = document.getElementById('manual-qr-input').value;
            if (val) {
                this.processQR(val);
                document.getElementById('manual-qr-input').value = '';
            }
        };

        this.startCamera();
    },
    
    async startCamera() {
        this.isScanning = true;
        try {
            this.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
            this.video.srcObject = this.stream;
            this.video.setAttribute("playsinline", true); // required to tell iOS safari we don't want fullscreen
            this.video.play();
            requestAnimationFrame(this.tick.bind(this));
        } catch (err) {
            console.error("Camera error:", err);
            Utils.showToast("Could not access camera. Please enter QR data manually.", "error");
        }
    },
    
    stop() {
        this.isScanning = false;
        if (this.stream) {
            this.stream.getTracks().forEach(track => track.stop());
            this.stream = null;
        }
    },
    
    tick() {
        if (!this.isScanning) return;
        
        if (this.video.readyState === this.video.HAVE_ENOUGH_DATA) {
            this.canvasElement.height = this.video.videoHeight;
            this.canvasElement.width = this.video.videoWidth;
            this.canvas.drawImage(this.video, 0, 0, this.canvasElement.width, this.canvasElement.height);
            
            const imageData = this.canvas.getImageData(0, 0, this.canvasElement.width, this.canvasElement.height);
            const code = jsQR(imageData.data, imageData.width, imageData.height, {
                inversionAttempts: "dontInvert",
            });
            
            if (code) {
                this.processQR(code.data);
                // Pause scanning briefly
                this.isScanning = false;
                setTimeout(() => {
                    if (window.location.hash === '#scan') {
                        this.isScanning = true;
                        requestAnimationFrame(this.tick.bind(this));
                    }
                }, 4000);
                return;
            }
        }
        requestAnimationFrame(this.tick.bind(this));
    },
    
    processQR(dataStr) {
        try {
            const data = JSON.parse(dataStr);
            
            // Validate expected fields
            if (!data.sessionId || !data.subject || !data.generatedAt) {
                throw new Error("Invalid QR code format");
            }
            
            // Expiration check (> 120 mins)
            const generatedTime = new Date(data.generatedAt).getTime();
            const now = new Date().getTime();
            const diffMins = (now - generatedTime) / (1000 * 60);
            
            if (diffMins > 120) {
                Utils.showToast("This session QR code has expired.", "error");
                return;
            }
            
            // Duplicate check
            Storage.initArray('attendance_records');
            const allRecords = Storage.get('attendance_records');
            const duplicate = allRecords.find(r => 
                r.sessionId === data.sessionId && r.enrollmentId === Student.profile.enrollmentId
            );
            
            if (duplicate) {
                Utils.showToast("Attendance already marked for this session.", "warning");
                return;
            }
            
            // Create record
            const record = {
                sessionId: data.sessionId,
                subject: data.subject,
                date: data.date,
                sessionTime: data.time,
                markedAt: new Date().toISOString(),
                enrollmentId: Student.profile.enrollmentId,
                name: Student.profile.name,
                email: Student.profile.email,
                branch: Student.profile.branch,
                semester: Student.profile.semester
            };
            
            Storage.push('attendance_records', record);
            
            // Show Success Screen
            this.showSuccess(record);
            
        } catch (err) {
            console.error("QR Parse Error", err);
            Utils.showToast("Invalid QR code.", "error");
        }
    },
    
    showSuccess(record) {
        document.getElementById('success-student-name').innerText = record.name;
        document.getElementById('success-subject').innerText = record.subject;
        document.getElementById('success-time').innerText = Utils.formatDateTime(record.markedAt);
        
        const overlay = document.getElementById('scan-success-overlay');
        overlay.classList.remove('hidden');
        
        setTimeout(() => {
            overlay.classList.add('hidden');
            window.location.hash = '#student';
        }, 3000);
    }
};
