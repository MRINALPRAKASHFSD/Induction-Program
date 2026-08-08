import { GeofenceError } from "@/lib/geofence";

export function ErrorPhase({
  errorObj,
  errorMsg,
  goBack,
  retryOrResume
}: {
  errorObj: Error | null;
  errorMsg: string;
  goBack: () => void;
  retryOrResume: () => void;
}) {
  const isGeofence = errorObj instanceof GeofenceError;
  const distance = isGeofence ? errorObj.distance : undefined;
  const accuracy = isGeofence ? errorObj.accuracy : undefined;
  const errorCode = isGeofence ? errorObj.code : (errorObj?.name !== 'Error' ? errorObj?.name : 'ERR_ATTENDANCE');

  const formatDistance = (dist: number) => {
    if (dist < 1000) return `${dist} m`;
    return `${(dist / 1000).toFixed(1)} km`;
  };

  const getStatusText = (step: string) => {
    if (step === 'location') {
      if (isGeofence) return 'Failed';
      return 'Unknown';
    }
    // For Identity, QR, Session, if we are in this flow, they were verified
    return 'Verified';
  };

  const CampusRadius = typeof CAMPUS_RADIUS_METERS !== 'undefined' ? CAMPUS_RADIUS_METERS : 300;

  return (
    <div className="min-h-screen bg-[#FFFDFB] dark:bg-background pb-16">
      <SiteHeader />
      <main className="container mx-auto px-4 py-8 md:py-16">
        
        {/* Top Header */}
        <div className="mb-8 md:mb-12 text-center md:text-left">
          <div className="flex items-center justify-center md:justify-start gap-2 text-sm font-medium text-muted-foreground mb-3">
            <Shield className="w-4 h-4" />
            <span>Secure Attendance</span>
          </div>
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-foreground mb-3">
            Attendance Not Recorded
          </h1>
          <p className="text-muted-foreground text-lg max-w-xl">
            {isGeofence 
              ? "Your location could not be verified for this attendance session." 
              : "We couldn't verify your attendance due to a technical issue."}
          </p>
          {errorCode && (
            <p className="text-xs text-muted-foreground mt-2 opacity-60 font-mono">
              Code: {errorCode}
            </p>
          )}
        </div>

        {/* Pipeline Progress */}
        <div className="max-w-4xl mx-auto md:mx-0 mb-12">
          <div className="flex items-center justify-between relative">
            <div className="absolute left-0 top-1/2 w-full h-0.5 bg-border -translate-y-1/2 z-0"></div>
            {[
              { id: 'identity', label: 'Identity', valid: true },
              { id: 'qr', label: 'QR', valid: true },
              { id: 'session', label: 'Session', valid: true },
              { id: 'location', label: 'Location', valid: !isGeofence }
            ].map((step, i) => (
              <div key={step.id} className="relative z-10 flex flex-col items-center gap-2 bg-[#FFFDFB] dark:bg-background px-2">
                <div className={cn(
                  "w-8 h-8 rounded-full flex items-center justify-center border-2",
                  step.valid ? "bg-[#18B87A]/10 border-[#18B87A] text-[#18B87A]" : "bg-[#C05A67]/10 border-[#C05A67] text-[#C05A67]"
                )}>
                  {step.valid ? <Check className="w-4 h-4" /> : <X className="w-4 h-4" />}
                </div>
                <span className="text-xs font-medium">{step.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Desktop Split Layout */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-8 items-start">
          
          {/* Left Column - Main Status */}
          <div className="md:col-span-7 space-y-6">
            
            {/* Status Card */}
            <motion.div 
              initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
              className="bg-white/70 dark:bg-card/50 backdrop-blur-[24px] border border-black/5 dark:border-white/10 rounded-[32px] p-8 shadow-[0_8px_32px_-8px_rgba(0,0,0,0.04)]"
            >
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-6 mb-8">
                <div className="w-16 h-16 rounded-2xl bg-[#C05A67]/10 flex items-center justify-center shrink-0">
                  <MapPin className="w-8 h-8 text-[#C05A67]" />
                </div>
                <div>
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#C05A67]/10 text-[#C05A67] text-sm font-medium mb-3">
                    <ShieldAlert className="w-4 h-4" />
                    Campus Verification Failed
                  </div>
                  <h2 className="text-2xl font-bold text-foreground">Security Verification</h2>
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex justify-between items-center py-3 border-b border-border/50">
                  <span className="text-muted-foreground">Identity</span>
                  <span className="flex items-center gap-2 font-medium text-[#18B87A]">
                    <CheckCircle2 className="w-4 h-4" /> Verified
                  </span>
                </div>
                <div className="flex justify-between items-center py-3 border-b border-border/50">
                  <span className="text-muted-foreground">QR Code</span>
                  <span className="flex items-center gap-2 font-medium text-[#18B87A]">
                    <CheckCircle2 className="w-4 h-4" /> Verified
                  </span>
                </div>
                <div className="flex justify-between items-center py-3 border-b border-border/50">
                  <span className="text-muted-foreground">Attendance Session</span>
                  <span className="flex items-center gap-2 font-medium text-[#18B87A]">
                    <CheckCircle2 className="w-4 h-4" /> Active
                  </span>
                </div>
                <div className="flex justify-between items-center py-3">
                  <span className="text-muted-foreground">Campus Location</span>
                  <span className="flex items-center gap-2 font-medium text-[#C05A67]">
                    <XCircle className="w-4 h-4" /> Outside Allowed Radius
                  </span>
                </div>
              </div>
            </motion.div>

            {/* Actions */}
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="flex flex-col sm:flex-row gap-4 pt-4">
              <Button 
                onClick={retryOrResume}
                className="h-14 px-8 rounded-2xl text-base font-medium bg-gradient-to-r from-primary to-primary/90 hover:from-primary/90 hover:to-primary text-white shadow-lg shadow-primary/25 transition-all active:scale-[0.98] w-full sm:w-auto"
              >
                <RefreshCw className="w-5 h-5 mr-2" /> Try Again
              </Button>
              <Button 
                variant="outline"
                onClick={goBack}
                className="h-14 px-8 rounded-2xl text-base font-medium bg-white/50 dark:bg-black/50 backdrop-blur-md border-border hover:bg-black/5 transition-all active:scale-[0.98] w-full sm:w-auto"
              >
                <ArrowLeft className="w-5 h-5 mr-2" /> Go Back
              </Button>
            </motion.div>
          </div>

          {/* Right Column - Metrics & Tips */}
          <div className="md:col-span-5 space-y-4">
            
            {/* Distance Card */}
            {distance !== undefined && (
              <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.15 }}>
                <Card className="bg-white/70 dark:bg-card/50 backdrop-blur-xl border-border/50 shadow-sm overflow-hidden">
                  <CardContent className="p-6 flex flex-col justify-center">
                    <div className="flex items-center gap-2 text-muted-foreground mb-4">
                      <Navigation2 className="w-4 h-4" />
                      <span className="text-sm font-medium uppercase tracking-wider">Current Distance</span>
                    </div>
                    <div className="text-4xl font-bold tracking-tight text-foreground mb-2">
                      {formatDistance(distance)}
                    </div>
                    <div className="inline-flex w-fit items-center gap-1.5 px-2.5 py-1 rounded-md bg-[#C05A67]/10 text-[#C05A67] text-xs font-semibold uppercase tracking-wide">
                      Outside Campus
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            )}

            {/* Campus Mini Card */}
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.2 }}>
              <Card className="bg-white/70 dark:bg-card/50 backdrop-blur-xl border-border/50 shadow-sm overflow-hidden">
                <CardContent className="p-6">
                  <div className="flex items-start gap-4">
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-1">
                      <MapPin className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-foreground mb-1">K.R. Mangalam University</h3>
                      <p className="text-sm text-muted-foreground leading-snug">Sohna Road<br/>Gurugram, Haryana</p>
                      
                      <div className="mt-4 grid grid-cols-2 gap-4">
                        <div>
                          <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Radius</p>
                          <p className="text-sm font-medium">{CampusRadius} m</p>
                        </div>
                        {accuracy !== undefined && (
                          <div>
                            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">GPS Accuracy</p>
                            <p className="text-sm font-medium">±{Math.round(accuracy)}m</p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>

            {/* Helpful Tips */}
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }} className="pt-4">
              <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-4 px-1">How to Fix</h3>
              <div className="space-y-3">
                {[
                  { icon: Navigation, text: `Move within ${CampusRadius}m of campus` },
                  { icon: Smartphone, text: "Enable High Accuracy / Precise Location" },
                  { icon: Signal, text: "Stay outdoors for better GPS signal" }
                ].map((tip, i) => (
                  <div key={i} className="flex items-center gap-3 p-4 rounded-xl bg-white/50 dark:bg-card/30 backdrop-blur-md border border-black/5 dark:border-white/5">
                    <div className="w-8 h-8 rounded-full bg-primary/5 flex items-center justify-center shrink-0">
                      <tip.icon className="w-4 h-4 text-primary" />
                    </div>
                    <span className="text-sm font-medium text-foreground">{tip.text}</span>
                  </div>
                ))}
              </div>
            </motion.div>

          </div>
        </div>
      </main>
    </div>
  );
}
