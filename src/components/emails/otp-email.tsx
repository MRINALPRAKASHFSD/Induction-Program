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
} from '@react-email/components';
import * as React from 'react';

interface OtpEmailProps {
  otp?: string;
}

export const OtpEmail = ({ otp = '123456' }: OtpEmailProps) => {
  return (
    <Html>
      <Head />
      <Preview>Your Verification Code — Aarambh 2026</Preview>
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

            {/* Divider */}
            <Section style={{ textAlign: 'center', paddingBottom: '28px' }}>
              <div style={divider} />
            </Section>

            {/* Greeting */}
            <Text style={greeting}>Hello there,</Text>
            <Text style={instructions}>
              Use the code below to verify your email and complete your registration for the KRMU Induction program.
            </Text>

            {/* OTP Box */}
            <Section style={otpBoxContainer}>
              <div style={otpBox}>
                <Text style={otpText}>{otp}</Text>
              </div>
            </Section>

            {/* Timer notice */}
            <Section style={timerSection}>
              <Row>
                <Column style={{ width: '16px', paddingRight: '8px' }}>
                  <div style={timerDot} />
                </Column>
                <Column>
                  <Text style={timerText}>
                    This code expires in <span style={timerTextBold}>5 minutes</span>
                  </Text>
                </Column>
              </Row>
            </Section>

            {/* Warning */}
            <Section style={warningBox}>
              <Row>
                <Column style={{ width: '20px', verticalAlign: 'top', paddingRight: '12px' }}>
                  <Text style={warningIcon}>&#128274;</Text>
                </Column>
                <Column>
                  <Text style={warningText}>
                    If you didn't request this code, you can safely ignore this email. Someone may have entered your email by mistake.
                  </Text>
                </Column>
              </Row>
            </Section>
          </Section>

          {/* Footer */}
          <Section style={footer}>
            <Text style={footerTitle}>KRMU Induction 2026</Text>
            <Text style={footerText}>
              KR Mangalam University, Sohna Road, Gurugram, Haryana<br />
              &copy; 2026 All rights reserved
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
};

// Styles
const main = {
  backgroundColor: '#f8f4ef',
  fontFamily: "'Segoe UI',Roboto,Arial,sans-serif",
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
  paddingBottom: '28px',
};

const divider = {
  width: '60px',
  height: '2px',
  background: 'linear-gradient(90deg,transparent,#c87038,transparent)',
  margin: '0 auto',
};

const greeting = {
  fontSize: '16px',
  color: '#2d0d12',
  lineHeight: '1.7',
  margin: '0',
  paddingBottom: '12px',
};

const instructions = {
  fontSize: '15px',
  color: '#555',
  lineHeight: '1.7',
  margin: '0',
  paddingBottom: '32px',
};

const otpBoxContainer = {
  textAlign: 'center' as const,
  paddingBottom: '32px',
};

const otpBox = {
  background: 'linear-gradient(135deg,#5a1018 0%,#7b2018 50%,#5a1018 100%)',
  borderRadius: '16px',
  padding: '28px 48px',
  display: 'inline-block',
};

const otpText = {
  fontSize: '42px',
  fontWeight: '800',
  letterSpacing: '14px',
  color: '#ffffff',
  fontFamily: "'SF Mono','Fira Code','Courier New',monospace",
  textShadow: '0 2px 8px rgba(0,0,0,0.3)',
  margin: '0',
};

const timerSection = {
  paddingBottom: '28px',
};

const timerDot = {
  width: '8px',
  height: '8px',
  borderRadius: '50%',
  backgroundColor: '#c87038',
  display: 'inline-block',
  marginTop: '4px',
};

const timerText = {
  fontSize: '13px',
  color: '#888',
  margin: '0',
};

const timerTextBold = {
  color: '#5a1018',
  fontWeight: '600',
};

const warningBox = {
  backgroundColor: '#fdf8f2',
  border: '1px solid #ede4d8',
  borderRadius: '12px',
  padding: '16px 20px',
};

const warningIcon = {
  fontSize: '16px',
  margin: '0',
};

const warningText = {
  fontSize: '12px',
  color: '#8c6239',
  lineHeight: '1.6',
  margin: '0',
};

const footer = {
  backgroundColor: '#2d0d12',
  padding: '24px 36px',
  borderRadius: '0 0 8px 8px',
  textAlign: 'center' as const,
};

const footerTitle = {
  fontSize: '13px',
  color: '#d4a254',
  fontWeight: '600',
  letterSpacing: '1px',
  margin: '0',
  paddingBottom: '8px',
};

const footerText = {
  fontSize: '11px',
  color: '#8b6e55',
  lineHeight: '1.6',
  margin: '0',
};

export default OtpEmail;
