      {phase === "dashboard" && (
        <div className="min-h-screen bg-background pb-16">
          <SiteHeader />
          <div className="ambient-bg hidden md:block" aria-hidden="true">
            <div className="ambient-blob ambient-blob-1" />
            <div className="ambient-blob ambient-blob-2" />
            <div className="ambient-blob ambient-blob-3" />
          </div>

          <main 
            className="relative mx-auto mt-8 lg:mt-12 space-y-6 md:space-y-8"
            style={{ maxWidth: "1600px", width: "min(94vw, 1600px)", paddingInline: "clamp(20px, 3vw, 48px)" }}
          >
            {/* Header */}
            <motion.div 
              initial={{ opacity: 0, y: 10 }} 
              animate={{ opacity: 1, y: 0 }} 
              className="md:hidden text-center space-y-1 mb-6"
            >
              <h1 className="text-2xl font-bold text-primary">Attendance Pass</h1>
              <p className="text-xs text-muted-foreground">Fast • Secure • Verified</p>
            </motion.div>

            <div className="grid grid-cols-1 md:grid-cols-12 gap-6 md:gap-8 lg:gap-12">
              
              {/* LEFT COLUMN: Identity Pass */}
              <div className="md:col-span-5 lg:col-span-4 flex flex-col gap-6">
                {!profile ? (
                  <div className="glass-premium-v2 rounded-3xl p-6 space-y-6 min-h-[400px]">
                    <div className="skeleton-glass w-full h-8 rounded-lg" />
                    <div className="skeleton-glass w-3/4 h-6 rounded-lg" />
                    <div className="skeleton-glass w-full h-32 rounded-xl mt-8" />
                  </div>
                ) : (
                  <motion.div 
                    initial={{ opacity: 0, y: 10 }} 
                    animate={{ opacity: 1, y: 0 }}
                    className="glass-premium-v2 rounded-[32px] overflow-hidden relative border border-white/40 dark:border-white/10 shadow-xl"
                  >
                    {/* Noise texture overlay */}
                    <div className="absolute inset-0 bg-[url('/noise.png')] opacity-10 mix-blend-overlay pointer-events-none" />
                    
                    {/* Pass Header */}
                    <div className="bg-primary/5 p-6 border-b border-white/20 dark:border-white/5 relative overflow-hidden">
                      <div className="absolute -right-12 -top-12 w-40 h-40 bg-primary/10 blur-3xl rounded-full" />
                      <div className="relative z-10 flex justify-between items-start">
                        <div>
                          <div className="text-[10px] uppercase tracking-widest text-primary/70 font-bold mb-1">Aarambh 2026</div>
                          <h2 className="text-2xl md:text-3xl font-black text-primary tracking-tight leading-none uppercase">{profile.full_name}</h2>
                        </div>
                        <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0 border border-primary/20 backdrop-blur-md">
                          <Shield className="w-6 h-6 text-primary" />
                        </div>
                      </div>
                      
                      <div className="mt-6 inline-flex items-center gap-2 bg-emerald-500/15 border border-emerald-500/20 text-emerald-700 dark:text-emerald-400 px-3 py-1.5 rounded-full text-xs font-bold">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Verified Student
                      </div>
                    </div>

                    {/* Pass Details */}
                    <div className="p-6 space-y-5 relative bg-gradient-to-b from-transparent to-black/5 dark:to-white/5">
                      <div className="grid grid-cols-2 gap-y-5 gap-x-4">
                        <div>
                          <div className="text-[10px] uppercase tracking-wider text-tertiary font-bold mb-1">Programme</div>
                          <div className="text-sm font-semibold text-secondary">{profile.course || "B.Tech CSE"}</div>
                        </div>
                        <div>
                          <div className="text-[10px] uppercase tracking-wider text-tertiary font-bold mb-1">School</div>
                          <div className="text-sm font-semibold text-secondary">{DEPARTMENTS[profile.department_id as keyof typeof DEPARTMENTS] || "SOET"}</div>
                        </div>
                        <div>
                          <div className="text-[10px] uppercase tracking-wider text-tertiary font-bold mb-1">Enrollment</div>
                          <div className="text-sm font-semibold text-secondary uppercase font-mono tracking-wide">{profile.registration_number || profile.id.split('-')[0]}</div>
                        </div>
                        <div>
                          <div className="text-[10px] uppercase tracking-wider text-tertiary font-bold mb-1">Academic Session</div>
                          <div className="text-sm font-semibold text-secondary">2026-27</div>
                        </div>
                      </div>

                      <div className="pt-4 border-t border-dashed border-primary/20 flex justify-between items-center">
                        <div className="font-mono text-xs text-tertiary font-semibold uppercase tracking-widest">
                          ID: {profile.id.split('-').pop()}
                        </div>
                        <div className="text-xs font-bold text-primary bg-primary/10 px-2 py-1 rounded">
                          DAY 2
                        </div>
                      </div>
                    </div>
                  </motion.div>
                )}

                {/* Desktop CTA */}
                <div className="hidden md:block mt-2">
                  <ScanButton onScan={startAttendanceFlow} />
                </div>
              </div>

              {/* RIGHT COLUMN: Stats & Journey */}
              <div className="md:col-span-7 lg:col-span-8 flex flex-col gap-6 md:gap-8">
                
                {/* Stats Grid */}
                <motion.div 
                  initial={{ opacity: 0, y: 10 }} 
                  animate={{ opacity: 1, y: 0 }} 
                  transition={{ delay: 0.1 }}
                  className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4"
                >
                  <StatCard 
                    icon={CheckCircle2}
                    value={attendanceCount}
                    label="Completed"
                    color="emerald"
                  />
                  <StatCard 
                    icon={Clock}
                    value={2}
                    label="Today's Sessions"
                    color="blue"
                  />
                  <StatCard 
                    icon={QrCode}
                    value={1}
                    label="Remaining Today"
                    color="amber"
                  />
                  <StatCard 
                    icon={Shield}
                    value="Day 1"
                    label="Verified Since"
                    color="primary"
                  />
                </motion.div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 md:gap-8">
                  {/* Attendance History (Boarding Pass style) */}
                  <div className="space-y-4">
                    <div className="flex items-center justify-between px-1">
                      <h3 className="text-sm text-primary uppercase font-bold tracking-wider flex items-center gap-2">
                        <History className="w-4 h-4" />
                        Recent Attendance
                      </h3>
                    </div>

                    {loadingRecords ? (
                      <div className="space-y-3">
                        {[1,2].map(i => <div key={i} className="skeleton-glass rounded-[20px] min-h-[80px]" />)}
                      </div>
                    ) : records.length === 0 ? (
                      <div className="glass-premium-v2 rounded-[24px] p-8 text-center border border-dashed border-primary/20">
                        <History className="w-10 h-10 mx-auto mb-3 opacity-20 text-primary" />
                        <p className="text-sm font-bold text-primary">No records yet</p>
                        <p className="text-xs mt-1 text-tertiary">Scan your first QR code to begin your journey.</p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {records.map(rec => (
                          <motion.div 
                            initial={{ opacity: 0, scale: 0.98 }}
                            animate={{ opacity: 1, scale: 1 }}
                            key={rec.id} 
                            className="glass-premium-v2 rounded-[20px] p-4 flex items-center justify-between relative overflow-hidden group hover:border-primary/30 transition-colors"
                          >
                            <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-emerald-500" />
                            <div className="flex items-center gap-4 pl-2">
                              <div className="w-10 h-10 rounded-xl bg-primary/5 flex items-center justify-center text-primary group-hover:bg-primary/10 transition-colors">
                                <MapPin className="w-5 h-5" />
                              </div>
                              <div>
                                <div className="text-sm font-bold text-primary">{rec.event_id || rec.session_id || "Main Auditorium"}</div>
                                <div className="text-[11px] text-tertiary font-medium mt-0.5 flex items-center gap-1.5">
                                  <Clock className="w-3 h-3" />
                                  {rec.scanned_at?.toDate?.()
                                    ? rec.scanned_at.toDate().toLocaleString("en-IN", {
                                        day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
                                      })
                                    : "—"}
                                </div>
                              </div>
                            </div>
                            <div className="text-right">
                              <span className="text-[10px] font-bold text-emerald-600 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 rounded-full uppercase tracking-wider">
                                Verified
                              </span>
                            </div>
                          </motion.div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Security Timeline */}
                  <div className="space-y-4 hidden lg:block">
                    <div className="flex items-center justify-between px-1">
                      <h3 className="text-sm text-primary uppercase font-bold tracking-wider flex items-center gap-2">
                        <Shield className="w-4 h-4" />
                        Security Check
                      </h3>
                    </div>

                    <div className="glass-premium-v2 rounded-3xl p-6 relative overflow-hidden h-[calc(100%-2rem)] border border-primary/10">
                      <div className="absolute right-0 top-0 w-32 h-32 bg-primary/5 blur-3xl rounded-full" />
                      
                      <div className="absolute left-9 top-10 bottom-10 w-0.5 bg-primary/10" />
                      
                      <div className="space-y-8 relative z-10">
                        <TimelineStep 
                          icon={MapPin} 
                          title="Campus Location Verified" 
                          status="completed" 
                        />
                        <TimelineStep 
                          icon={Shield} 
                          title="Device Identity Authenticated" 
                          status="completed" 
                        />
                        <TimelineStep 
                          icon={QrCode} 
                          title="Ready for Rotating QR Scan" 
                          status="current" 
                        />
                        <TimelineStep 
                          icon={CheckCircle2} 
                          title="Attendance Logged" 
                          status="upcoming" 
                          isLast
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Mobile CTA */}
                <div className="md:hidden mt-4 pb-8">
                  <ScanButton onScan={startAttendanceFlow} />
                </div>

              </div>
            </div>
          </main>
        </div>
      )}
