import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Section,
  Text,
  Preview,
  Row,
  Column,
  Link,
} from '@react-email/components';
import * as React from 'react';

interface OtpEmailProps {
  otp?: string;
  name?: string;
}

export const OtpEmail = ({ otp = '292648', name = 'Student' }: OtpEmailProps) => {
  // Add spaces between digits to make it feel deliberate and more readable
  const formattedOtp = otp.split('').join('   ');

  return (
    <Html>
      <Head />
      <Preview>Verify your email • AARAMBH 2026</Preview>
      <Body style={main}>
        <Container style={container}>
          {/* Top accent bar */}
          <div style={topAccent} />

          {/* Main Card */}
          <Section style={card}>
            {/* Logo / Brand */}
            <Section style={logoSection}>
              <Heading style={logo}>AARAMBH</Heading>
              <Text style={logoSubtitle}>KR Mangalam University &bull; 2026</Text>
            </Section>

            {/* Verification Badge */}
            <Section style={badgeSection}>
              <Text style={badgeText}>🛡️ Official Verification Email</Text>
            </Section>

            {/* Divider */}
            <Section style={{ textAlign: 'center', paddingBottom: '28px' }}>
              <div style={divider} />
            </Section>

            {/* Stronger Heading */}
            <Heading style={mainHeading}>Verify Your Email Address</Heading>

            {/* Greeting */}
            <Text style={greeting}>Hello, {name} 👋</Text>
            <Text style={greetingSub}>Welcome to AARAMBH 2026.</Text>
            
            <Text style={instructions}>
              Use the one-time verification code below to activate your induction account.
            </Text>

            {/* OTP Box */}
            <Section style={otpBoxContainer}>
              <div style={otpBox}>
                <Text style={otpText}>{formattedOtp}</Text>
              </div>
            </Section>

            {/* Expiry / Info Card */}
            <Section style={expiryCard}>
              <Row>
                <Column style={{ width: '24px', verticalAlign: 'top', paddingRight: '12px' }}>
                  <Text style={expiryIcon}>⏰</Text>
                </Column>
                <Column>
                  <Text style={expiryTitle}>Expires in 5 minutes</Text>
                  <Text style={expiryText}>
                    For your security, this code can only be used once.
                  </Text>
                </Column>
              </Row>
            </Section>

            {/* Security Notice */}
            <Section style={securityCard}>
              <Row>
                <Column style={{ width: '24px', verticalAlign: 'top', paddingRight: '12px' }}>
                  <Text style={securityIcon}>⚠️</Text>
                </Column>
                <Column>
                  <Text style={securityTitle}>Never share this code</Text>
                  <Text style={securityText}>
                    AARAMBH or K.R. Mangalam University will never ask for your OTP. 
                  </Text>
                </Column>
              </Row>
            </Section>
            
            <Section style={whySection}>
              <Text style={whyTitle}>Why am I receiving this?</Text>
              <Text style={whyText}>
                Someone used this email address to register for AARAMBH 2026. If you didn't request this code, you can safely ignore this email.
              </Text>
            </Section>
          </Section>

          {/* Footer */}
          <Section style={footer}>
            <Section style={contactSection}>
              <Text style={contactText}>
                Need help? <br />
                <Link href="mailto:induction@krmangalam.edu.in" style={contactLink}>induction@krmangalam.edu.in</Link>
              </Text>
            </Section>

            <Text style={footerTitle}>AARAMBH 2026</Text>
            <Text style={footerText}>Powered by AARAMBH</Text>
            <Text style={footerText}>
              Developed for<br />
              K.R. Mangalam University
            </Text>
            <Text style={footerCopyright}>&copy; 2026 AARAMBH Technologies</Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
};

// Styles
const main = {
  backgroundColor: '#f8f4ef',
  fontFamily: "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
  padding: '40px 16px',
};

const container = {
  maxWidth: '520px',
  margin: '0 auto',
  width: '100%',
};

const topAccent = {
  height: '6px',
  background: 'linear-gradient(90deg,#5a1018,#8b2c1a,#c87038,#d4a254)',
  borderRadius: '8px 8px 0 0',
};

const card = {
  backgroundColor: '#ffffff',
  padding: '40px 36px 36px',
  borderLeft: '1px solid #ede4d8',
  borderRight: '1px solid #ede4d8',
};

const logoSection = {
  textAlign: 'center' as const,
};

const logo = {
  fontFamily: "'Georgia',serif",
  fontSize: '28px',
  fontWeight: '700',
  color: '#5a1018',
  letterSpacing: '2px',
  margin: '0',
  paddingBottom: '8px',
};

const logoSubtitle = {
  fontSize: '11px',
  letterSpacing: '3px',
  textTransform: 'uppercase' as const,
  color: '#b08850',
  fontWeight: '600',
  margin: '0',
  paddingBottom: '16px',
};

const badgeSection = {
  textAlign: 'center' as const,
  paddingBottom: '24px',
};

const badgeText = {
  backgroundColor: '#f5f5f5',
  border: '1px solid #e5e5e5',
  borderRadius: '16px',
  padding: '6px 12px',
  fontSize: '12px',
  color: '#555555',
  display: 'inline-block',
  margin: '0',
  fontWeight: '500',
};

const divider = {
  width: '60px',
  height: '2px',
  background: 'linear-gradient(90deg,transparent,#c87038,transparent)',
  margin: '0 auto',
};

const mainHeading = {
  fontSize: '22px',
  fontWeight: '700',
  color: '#2d0d12',
  margin: '0',
  paddingBottom: '20px',
  letterSpacing: '-0.5px',
};

const greeting = {
  fontSize: '16px',
  color: '#2d0d12',
  fontWeight: '600',
  margin: '0',
  paddingBottom: '4px',
};

const greetingSub = {
  fontSize: '15px',
  color: '#555',
  margin: '0',
  paddingBottom: '12px',
};

const instructions = {
  fontSize: '15px',
  color: '#555',
  lineHeight: '1.6',
  margin: '0',
  paddingBottom: '32px',
};

const otpBoxContainer = {
  textAlign: 'center' as const,
  paddingBottom: '32px',
};

const otpBox = {
  background: 'linear-gradient(135deg, #4a0c12 0%, #6b1a13 100%)',
  borderRadius: '20px',
  padding: '32px 24px',
  display: 'inline-block',
  boxShadow: 'inset 0 2px 10px rgba(0,0,0,0.3), 0 4px 14px rgba(90,16,24,0.15)',
};

const otpText = {
  fontSize: '36px',
  fontWeight: '700',
  color: '#ffffff',
  fontFamily: "'SF Mono','Fira Code','Courier New',monospace",
  textShadow: '0 2px 4px rgba(0,0,0,0.2)',
  margin: '0',
  whiteSpace: 'nowrap' as const,
};

const expiryCard = {
  backgroundColor: '#fcf6f0',
  border: '1px solid #f2e2d5',
  borderRadius: '12px',
  padding: '16px 20px',
  marginBottom: '16px',
};

const expiryIcon = {
  fontSize: '18px',
  margin: '0',
};

const expiryTitle = {
  color: '#a85b28',
  fontSize: '14px',
  fontWeight: '600',
  margin: '0 0 4px 0',
};

const expiryText = {
  color: '#8c6239',
  fontSize: '13px',
  lineHeight: '1.5',
  margin: '0',
};

const securityCard = {
  backgroundColor: '#fff0f0',
  border: '1px solid #ffd6d6',
  borderRadius: '12px',
  padding: '16px 20px',
  marginBottom: '24px',
};

const securityIcon = {
  fontSize: '18px',
  margin: '0',
};

const securityTitle = {
  color: '#d32f2f',
  fontSize: '14px',
  fontWeight: '600',
  margin: '0 0 4px 0',
};

const securityText = {
  color: '#b71c1c',
  fontSize: '13px',
  lineHeight: '1.5',
  margin: '0',
};

const whySection = {
  paddingTop: '20px',
  borderTop: '1px solid #ede4d8',
};

const whyTitle = {
  fontSize: '13px',
  fontWeight: '600',
  color: '#2d0d12',
  margin: '0 0 6px 0',
};

const whyText = {
  fontSize: '13px',
  color: '#777',
  lineHeight: '1.5',
  margin: '0',
};

const footer = {
  backgroundColor: '#2d0d12',
  padding: '32px 36px',
  borderRadius: '0 0 8px 8px',
  textAlign: 'center' as const,
};

const contactSection = {
  paddingBottom: '24px',
  marginBottom: '24px',
  borderBottom: '1px solid rgba(255,255,255,0.1)',
};

const contactText = {
  fontSize: '14px',
  color: '#a8a8a8',
  margin: '0',
  lineHeight: '1.8',
};

const contactLink = {
  color: '#d4a254',
  textDecoration: 'none',
  fontWeight: '500',
};

const footerTitle = {
  fontSize: '14px',
  color: '#d4a254',
  fontWeight: '600',
  letterSpacing: '1px',
  margin: '0',
  paddingBottom: '12px',
};

const footerText = {
  fontSize: '12px',
  color: '#8b6e55',
  lineHeight: '1.6',
  margin: '0',
  paddingBottom: '8px',
};

const footerCopyright = {
  fontSize: '11px',
  color: '#6b5442',
  margin: '16px 0 0 0',
};

export default OtpEmail;

