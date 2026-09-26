import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as DocumentPicker from "expo-document-picker";

import { API_BASE_URL } from "./src/config";
import { api, apiAuth } from "./src/api";

type AuthMode = "login" | "register" | "forgot" | "verify" | "reset";
type AppTab = "workspace" | "applications";

const APP_NAME = "ApplyAI";
const TAGLINE = "Your AI-powered job application workspace";

const BLOCKED_EMAIL_DOMAINS = new Set([
  "example.com",
  "example.org",
  "example.net",
  "test.com",
  "test.org",
  "invalid.com",
  "mailinator.com",
  "guerrillamail.com",
  "10minutemail.com",
  "tempmail.com",
  "yopmail.com",
]);

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

function isValidEmail(email: string) {
  const value = normalizeEmail(email);
  if (!/^[^\s@]+@[^\s@]+\.[A-Za-z]{2,}$/.test(value)) return false;

  const domain = value.split("@")[1];
  if (!domain || BLOCKED_EMAIL_DOMAINS.has(domain)) return false;

  // Prevent obvious placeholder addresses.
  const local = value.split("@")[0];
  if (/^(test|testing|demo|dummy|fake|example|user123)$/i.test(local)) {
    return false;
  }

  return true;
}

function passwordError(password: string) {
  if (password.length < 8) return "Password must contain at least 8 characters.";
  if (!/[A-Z]/.test(password)) return "Add at least one uppercase letter.";
  if (!/[a-z]/.test(password)) return "Add at least one lowercase letter.";
  if (!/\d/.test(password)) return "Add at least one number.";
  return "";
}

async function readError(error: any) {
  return error?.message || "Something went wrong. Please try again.";
}

export default function App() {
  const [token, setToken] = useState("");
  const [mode, setMode] = useState<AuthMode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [loading, setLoading] = useState(false);

  const [resume, setResume] = useState("");
  const [job, setJob] = useState("");
  const [title, setTitle] = useState("");
  const [company, setCompany] = useState("");

  const [analysis, setAnalysis] = useState<any>(null);
  const [letter, setLetter] = useState("");
  const [applications, setApplications] = useState<any[]>([]);

  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem("token").then((value) => {
      if (value) setToken(value);
    });
  }, []);

  useEffect(() => {
    if (token) loadApplications();
  }, [token]);

  const emailIsValid = useMemo(() => isValidEmail(email), [email]);

  function showMessage(titleText: string, message: string) {
    Alert.alert(titleText, message);
  }

  async function authenticate() {
    const cleanEmail = normalizeEmail(email);

    if (!emailIsValid) {
      showMessage(
        "Use a real email",
        "Enter a valid email address. Placeholder, test and temporary email domains are not accepted."
      );
      return;
    }

    const pwdError = passwordError(password);
    if (mode === "register" && pwdError) {
      showMessage("Password requirements", pwdError);
      return;
    }

    if (!password.trim()) {
      showMessage("Password required", "Enter your password.");
      return;
    }

    try {
      setLoading(true);

      const result = await api(
        `/api/auth/${mode === "login" ? "login" : "register"}`,
        {
          method: "POST",
          body: JSON.stringify({
            email: cleanEmail,
            password,
          }),
        }
      );

      // Backend should return email_verified.
      if (result.email_verified === false || result.requires_verification === true) {
        setEmail(cleanEmail);
        setMode("verify");
        showMessage(
          "Verify your email",
          "We sent a verification code to your email address. Verify it before continuing."
        );
        return;
      }

      if (!result.access_token) {
        throw new Error("Authentication succeeded but no access token was returned.");
      }

      await AsyncStorage.setItem("token", result.access_token);
      setToken(result.access_token);
    } catch (error: any) {
      showMessage("Authentication failed", await readError(error));
    } finally {
      setLoading(false);
    }
  }

  async function requestVerificationCode() {
    const cleanEmail = normalizeEmail(email);

    if (!isValidEmail(cleanEmail)) {
      showMessage("Invalid email", "Enter a valid email address first.");
      return;
    }

    try {
      setLoading(true);

      await api("/api/auth/send-verification", {
        method: "POST",
        body: JSON.stringify({ email: cleanEmail }),
      });

      setMode("verify");
      showMessage(
        "Code sent",
        `A verification code was sent to ${cleanEmail}.`
      );
    } catch (error: any) {
      showMessage("Could not send code", await readError(error));
    } finally {
      setLoading(false);
    }
  }

  async function verifyEmail() {
    const cleanEmail = normalizeEmail(email);
    const code = verificationCode.trim();

    if (!isValidEmail(cleanEmail)) {
      showMessage("Invalid email", "Enter a valid email address.");
      return;
    }

    if (!/^\d{6}$/.test(code)) {
      showMessage("Invalid code", "Enter the 6-digit verification code.");
      return;
    }

    try {
      setLoading(true);

      const result = await api("/api/auth/verify-email", {
        method: "POST",
        body: JSON.stringify({
          email: cleanEmail,
          code,
        }),
      });

      // Some backends issue a token immediately after verification.
      if (result.access_token) {
        await AsyncStorage.setItem("token", result.access_token);
        setToken(result.access_token);
        return;
      }

      showMessage("Email verified", "Your email has been verified. You can now log in.");
      setMode("login");
      setPassword("");
      setVerificationCode("");
    } catch (error: any) {
      showMessage("Verification failed", await readError(error));
    } finally {
      setLoading(false);
    }
  }

  async function requestPasswordReset() {
    const cleanEmail = normalizeEmail(email);

    if (!isValidEmail(cleanEmail)) {
      showMessage("Invalid email", "Enter the real email address connected to your account.");
      return;
    }

    try {
      setLoading(true);

      await api("/api/auth/forgot-password", {
        method: "POST",
        body: JSON.stringify({ email: cleanEmail }),
      });

      setMode("reset");
      showMessage(
        "Reset code sent",
        "If an account exists for this address, a password reset code has been sent."
      );
    } catch (error: any) {
      showMessage("Request failed", await readError(error));
    } finally {
      setLoading(false);
    }
  }

  async function resetPassword() {
    const cleanEmail = normalizeEmail(email);
    const code = verificationCode.trim();

    if (!isValidEmail(cleanEmail)) {
      showMessage("Invalid email", "Enter a valid email address.");
      return;
    }

    if (!/^\d{6}$/.test(code)) {
      showMessage("Invalid code", "Enter the 6-digit reset code.");
      return;
    }

    const pwdError = passwordError(password);
    if (pwdError) {
      showMessage("Password requirements", pwdError);
      return;
    }

    if (password !== confirmPassword) {
      showMessage("Passwords do not match", "Enter the same password in both fields.");
      return;
    }

    try {
      setLoading(true);

      await api("/api/auth/reset-password", {
        method: "POST",
        body: JSON.stringify({
          email: cleanEmail,
          code,
          new_password: password,
        }),
      });

      showMessage("Password updated", "Your password was changed successfully.");
      setPassword("");
      setConfirmPassword("");
      setVerificationCode("");
      setMode("login");
    } catch (error: any) {
      showMessage("Reset failed", await readError(error));
    } finally {
      setLoading(false);
    }
  }

  async function uploadCV() {
    const result = await DocumentPicker.getDocumentAsync({
      type: "application/pdf",
      copyToCacheDirectory: true,
    });

    if (result.canceled) return;

    const file = result.assets[0];

    try {
      setLoading(true);

      const form = new FormData();

      if (file.base64) {
        const response = await fetch(file.base64);
        const blob = await response.blob();

        form.append(
          "file",
          new File([blob], file.name || "resume.pdf", {
            type: file.mimeType || "application/pdf",
          })
        );
      } else {
        form.append(
          "file",
          {
            uri: file.uri,
            name: file.name || "resume.pdf",
            type: file.mimeType || "application/pdf",
          } as any
        );
      }

      const response = await fetch(`${API_BASE_URL}/api/resume/upload`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });

      const responseText = await response.text();

      let data: any;
      try {
        data = JSON.parse(responseText);
      } catch {
        data = { detail: responseText };
      }

      if (!response.ok) {
        const detail =
          typeof data.detail === "string"
            ? data.detail
            : JSON.stringify(data.detail, null, 2);
        throw new Error(`HTTP ${response.status}: ${detail}`);
      }

      setResume(data.text || "");
      showMessage("CV uploaded", "Your PDF was processed successfully.");
    } catch (error: any) {
      showMessage("Upload failed", await readError(error));
    } finally {
      setLoading(false);
    }
  }

  async function analyzeJob() {
    if (!resume.trim()) {
      showMessage("CV required", "Upload or paste your CV first.");
      return;
    }

    if (!job.trim()) {
      showMessage("Job description required", "Paste the complete job description first.");
      return;
    }

    try {
      setLoading(true);
      setAnalysis(null);

      const result = await apiAuth("/api/jobs/analyze", token, {
        method: "POST",
        body: JSON.stringify({
          resume_text: resume,
          job_description: job,
          title,
          company,
        }),
      });

      const ai =
        result?.analysis ??
        result?.data?.analysis ??
        result?.result?.analysis ??
        result?.data ??
        result;

      const requiredSkills = Array.isArray(ai?.required_skills)
        ? ai.required_skills
        : [];

      const matchedSkills = Array.isArray(ai?.matched_skills)
        ? ai.matched_skills
        : requiredSkills.filter((skill: any) =>
            resume.toLowerCase().includes(String(skill).toLowerCase().trim())
          );

      const missingSkills = Array.isArray(ai?.missing_skills)
        ? ai.missing_skills
        : requiredSkills.filter(
            (skill: any) =>
              !resume.toLowerCase().includes(String(skill).toLowerCase().trim())
          );

      const atsKeywords = Array.isArray(ai?.ats_keywords)
        ? ai.ats_keywords
        : requiredSkills;

      let matchScore = Number(ai?.match_score ?? 0);
      if (Number.isNaN(matchScore)) matchScore = 0;

      const strengths = Array.isArray(ai?.strengths)
        ? ai.strengths
        : matchedSkills.slice(0, 5);

      const weaknesses = Array.isArray(ai?.weaknesses)
        ? ai.weaknesses
        : missingSkills.slice(0, 5);

      setAnalysis({
        match_score: matchScore,
        recommendation: ai?.recommendation || "Review the match details below",
        required_skills: requiredSkills,
        matched_skills: matchedSkills,
        missing_skills: missingSkills,
        ats_keywords: atsKeywords,
        experience_match: ai?.experience_match || "Review required",
        education_match: ai?.education_match || "Review required",
        strengths,
        weaknesses,
      });
    } catch (error: any) {
      showMessage("Analysis failed", await readError(error));
    } finally {
      setLoading(false);
    }
  }

  async function generateCoverLetter() {
    if (!resume.trim() || !job.trim()) {
      showMessage("Missing information", "Add your CV and job description first.");
      return;
    }

    try {
      setLoading(true);

      const result = await apiAuth("/api/jobs/cover-letter", token, {
        method: "POST",
        body: JSON.stringify({
          resume_text: resume,
          job_description: job,
          title,
          company,
        }),
      });

      setLetter(result.cover_letter || result.data?.cover_letter || "");
    } catch (error: any) {
      showMessage("AI error", await readError(error));
    } finally {
      setLoading(false);
    }
  }

  async function saveApplication() {
    try {
      await apiAuth("/api/applications", token, {
        method: "POST",
        body: JSON.stringify({
          job_title: title,
          company,
          match_score: analysis?.match_score || 0,
          status: "SAVED",
          cover_letter: letter,
        }),
      });

      showMessage("Application saved", "Added to your application tracker.");
      loadApplications();
    } catch (error: any) {
      showMessage("Save failed", await readError(error));
    }
  }

  async function loadApplications() {
    if (!token) return;

    try {
      const data = await apiAuth("/api/applications", token);
      setApplications(
        Array.isArray(data) ? data : data?.applications || []
      );
    } catch {
      // Keep UI usable if the tracker request fails.
    }
  }

  async function logout() {
    await AsyncStorage.removeItem("token");
    setToken("");
    setAnalysis(null);
    setLetter("");
    setResume("");
    setJob("");
    setTitle("");
    setCompany("");
  }

  if (!token) {
    return (
      <SafeAreaView style={styles.authBackground}>
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <ScrollView
            contentContainerStyle={styles.authScroll}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.brandMark}>
              <Text style={styles.brandMarkText}>A</Text>
            </View>

            <Text style={styles.authBrand}>{APP_NAME}</Text>
            <Text style={styles.authTagline}>{TAGLINE}</Text>

            <View style={styles.authCard}>
              {mode === "login" && (
                <>
                  <Text style={styles.authTitle}>Welcome back</Text>
                  <Text style={styles.authDescription}>
                    Sign in to continue building smarter job applications.
                  </Text>

                  <Field
                    label="Email address"
                    placeholder="you@company.com"
                    value={email}
                    onChangeText={setEmail}
                    keyboardType="email-address"
                    autoCapitalize="none"
                  />

                  <PasswordField
                    label="Password"
                    value={password}
                    onChangeText={setPassword}
                    showPassword={showPassword}
                    setShowPassword={setShowPassword}
                  />

                  <Pressable
                    onPress={() => setMode("forgot")}
                    style={styles.forgotButton}
                  >
                    <Text style={styles.forgotText}>Forgot password?</Text>
                  </Pressable>

                  <PrimaryButton
                    title="Sign in"
                    loading={loading}
                    onPress={authenticate}
                  />

                  <Divider />

                  <Text style={styles.bottomText}>
                    New to {APP_NAME}?
                  </Text>
                  <SecondaryButton
                    title="Create an account"
                    onPress={() => {
                      setPassword("");
                      setMode("register");
                    }}
                  />
                </>
              )}

              {mode === "register" && (
                <>
                  <Text style={styles.authTitle}>Create your account</Text>
                  <Text style={styles.authDescription}>
                    Use an email you can access. Your email must be verified before account access.
                  </Text>

                  <Field
                    label="Email address"
                    placeholder="you@company.com"
                    value={email}
                    onChangeText={setEmail}
                    keyboardType="email-address"
                    autoCapitalize="none"
                  />

                  <PasswordField
                    label="Password"
                    value={password}
                    onChangeText={setPassword}
                    showPassword={showPassword}
                    setShowPassword={setShowPassword}
                  />

                  <View style={styles.passwordRules}>
                    <Rule ok={password.length >= 8} text="8+ characters" />
                    <Rule ok={/[A-Z]/.test(password)} text="Uppercase letter" />
                    <Rule ok={/[a-z]/.test(password)} text="Lowercase letter" />
                    <Rule ok={/\d/.test(password)} text="Number" />
                  </View>

                  <PrimaryButton
                    title="Create account"
                    loading={loading}
                    onPress={authenticate}
                  />

                  <Divider />

                  <SecondaryButton
                    title="I already have an account"
                    onPress={() => setMode("login")}
                  />
                </>
              )}

              {mode === "forgot" && (
                <>
                  <Text style={styles.authTitle}>Reset your password</Text>
                  <Text style={styles.authDescription}>
                    Enter your account email. We'll send a secure one-time reset code.
                  </Text>

                  <Field
                    label="Account email"
                    placeholder="you@company.com"
                    value={email}
                    onChangeText={setEmail}
                    keyboardType="email-address"
                    autoCapitalize="none"
                  />

                  <PrimaryButton
                    title="Send reset code"
                    loading={loading}
                    onPress={requestPasswordReset}
                  />

                  <SecondaryButton
                    title="Back to sign in"
                    onPress={() => setMode("login")}
                  />
                </>
              )}

              {mode === "verify" && (
                <>
                  <Text style={styles.authTitle}>Verify your email</Text>
                  <Text style={styles.authDescription}>
                    Enter the 6-digit code sent to{" "}
                    <Text style={styles.strong}>{normalizeEmail(email)}</Text>.
                  </Text>

                  <Field
                    label="Verification code"
                    placeholder="123456"
                    value={verificationCode}
                    onChangeText={setVerificationCode}
                    keyboardType="number-pad"
                    maxLength={6}
                  />

                  <PrimaryButton
                    title="Verify email"
                    loading={loading}
                    onPress={verifyEmail}
                  />

                  <Pressable
                    onPress={requestVerificationCode}
                    disabled={loading}
                    style={styles.centerLink}
                  >
                    <Text style={styles.linkText}>Resend verification code</Text>
                  </Pressable>

                  <SecondaryButton
                    title="Back to sign in"
                    onPress={() => setMode("login")}
                  />
                </>
              )}

              {mode === "reset" && (
                <>
                  <Text style={styles.authTitle}>Choose a new password</Text>
                  <Text style={styles.authDescription}>
                    Enter the reset code from your email and create a strong new password.
                  </Text>

                  <Field
                    label="Reset code"
                    placeholder="123456"
                    value={verificationCode}
                    onChangeText={setVerificationCode}
                    keyboardType="number-pad"
                    maxLength={6}
                  />

                  <PasswordField
                    label="New password"
                    value={password}
                    onChangeText={setPassword}
                    showPassword={showPassword}
                    setShowPassword={setShowPassword}
                  />

                  <PasswordField
                    label="Confirm new password"
                    value={confirmPassword}
                    onChangeText={setConfirmPassword}
                    showPassword={showPassword}
                    setShowPassword={setShowPassword}
                  />

                  <PrimaryButton
                    title="Update password"
                    loading={loading}
                    onPress={resetPassword}
                  />

                  <SecondaryButton
                    title="Back to sign in"
                    onPress={() => setMode("login")}
                  />
                </>
              )}
            </View>

            <Text style={styles.securityNote}>
              Secure authentication • Email verification • Password recovery
            </Text>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.appBackground}>
      <ScrollView
        contentContainerStyle={styles.appContent}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.topBar}>
          <View style={styles.brandRow}>
            <View style={styles.smallMark}>
              <Text style={styles.smallMarkText}>A</Text>
            </View>
            <View>
              <Text style={styles.appBrand}>{APP_NAME}</Text>
              <Text style={styles.appSubtitle}>AI Job Workspace</Text>
            </View>
          </View>

          <Pressable onPress={logout} style={styles.logoutButton}>
            <Text style={styles.logoutText}>Sign out</Text>
          </Pressable>
        </View>

        <View style={styles.hero}>
          <Text style={styles.eyebrow}>AI CAREER WORKSPACE</Text>
          <Text style={styles.heroTitle}>Apply with clarity.</Text>
          <Text style={styles.heroText}>
            Analyze opportunities, tailor your applications and keep every application organized in one place.
          </Text>
        </View>

        <View style={styles.tabs}>
          <Pressable
            onPress={() => {}}
            style={[styles.tab, styles.tabActive]}
          >
            <Text style={[styles.tabText, styles.tabTextActive]}>Workspace</Text>
          </Pressable>
          <Pressable
            onPress={loadApplications}
            style={styles.tab}
          >
            <Text style={styles.tabText}>
              Applications {applications.length ? `(${applications.length})` : ""}
            </Text>
          </Pressable>
        </View>

        <Card
          number="01"
          title="Your CV"
          description="Upload a PDF or paste your resume text."
        >
          <PrimaryButton title="Upload PDF CV" loading={loading} onPress={uploadCV} />
          <Field
            label="Resume content"
            placeholder="Paste your CV text here..."
            value={resume}
            onChangeText={setResume}
            multiline
          />
          {resume ? (
            <View style={styles.statusPill}>
              <View style={styles.statusDot} />
              <Text style={styles.statusText}>CV ready for analysis</Text>
            </View>
          ) : null}
        </Card>

        <Card
          number="02"
          title="Job opportunity"
          description="Add the role you want to evaluate."
        >
          <Field
            label="Job title"
            placeholder="e.g. Frontend Developer"
            value={title}
            onChangeText={setTitle}
          />
          <Field
            label="Company"
            placeholder="e.g. Acme Technologies"
            value={company}
            onChangeText={setCompany}
          />
          <Field
            label="Job description"
            placeholder="Paste the complete job description..."
            value={job}
            onChangeText={setJob}
            multiline
          />
          <PrimaryButton
            title="Analyze job match"
            loading={loading}
            onPress={analyzeJob}
          />
        </Card>

        {loading ? (
          <View style={styles.loadingCard}>
            <ActivityIndicator size="small" />
            <Text style={styles.loadingText}>AI is processing your request...</Text>
          </View>
        ) : null}

        {analysis && (
          <Card
            number="03"
            title="AI analysis"
            description="A structured view of the role and your current CV."
          >
            <View style={styles.scoreBox}>
              <Text style={styles.score}>{analysis.match_score}%</Text>
              <Text style={styles.scoreLabel}>CV / role match</Text>
            </View>

            <View style={styles.infoBox}>
              <Text style={styles.infoLabel}>Analysis</Text>
              <Text style={styles.infoText}>{analysis.recommendation}</Text>
            </View>

            <Label title="Matched skills" items={analysis.matched_skills} />
            <Label title="Missing skills" items={analysis.missing_skills} />
            <Label title="ATS keywords" items={analysis.ats_keywords} />

            <View style={styles.twoButtons}>
              <View style={styles.buttonHalf}>
                <PrimaryButton
                  title="Generate cover letter"
                  loading={loading}
                  onPress={generateCoverLetter}
                />
              </View>
              <View style={styles.buttonHalf}>
                <SecondaryButton title="Save application" onPress={saveApplication} />
              </View>
            </View>
          </Card>
        )}

        {letter ? (
          <Card
            number="04"
            title="Cover letter"
            description="AI-generated draft based on your CV and the job description."
          >
            <View style={styles.letterBox}>
              <Text style={styles.body}>{letter}</Text>
            </View>
          </Card>
        ) : null}

        <Card
          number="05"
          title="Application tracker"
          description="Keep your saved opportunities in one place."
        >
          <SecondaryButton title="Refresh applications" onPress={loadApplications} />

          {applications.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyTitle}>No applications yet</Text>
              <Text style={styles.emptyText}>
                Analyze a job and save it here to start building your application pipeline.
              </Text>
            </View>
          ) : (
            applications.map((item) => (
              <View key={item.id} style={styles.applicationRow}>
                <View style={styles.applicationMain}>
                  <Text style={styles.applicationTitle}>
                    {item.job_title || "Untitled job"}
                  </Text>
                  <Text style={styles.applicationCompany}>
                    {item.company || "Company"}
                  </Text>
                </View>
                <View style={styles.applicationScore}>
                  <Text style={styles.applicationScoreNumber}>
                    {item.match_score ?? 0}%
                  </Text>
                  <Text style={styles.applicationStatus}>
                    {item.status || "SAVED"}
                  </Text>
                </View>
              </View>
            ))
          )}
        </Card>

        <Text style={styles.footer}>© {new Date().getFullYear()} {APP_NAME}</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function Field(props: any) {
  return (
    <View style={styles.field}>
      {props.label ? <Text style={styles.fieldLabel}>{props.label}</Text> : null}
      <TextInput
        {...props}
        style={[styles.input, props.multiline && styles.textarea]}
        placeholderTextColor="#8B95A7"
      />
    </View>
  );
}

function PasswordField({
  label,
  value,
  onChangeText,
  showPassword,
  setShowPassword,
}: any) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.passwordWrap}>
        <TextInput
          style={styles.passwordInput}
          placeholder="••••••••"
          placeholderTextColor="#8B95A7"
          secureTextEntry={!showPassword}
          value={value}
          onChangeText={onChangeText}
          autoCapitalize="none"
        />
        <Pressable onPress={() => setShowPassword((v: boolean) => !v)}>
          <Text style={styles.showText}>{showPassword ? "Hide" : "Show"}</Text>
        </Pressable>
      </View>
    </View>
  );
}

function Rule({ ok, text }: { ok: boolean; text: string }) {
  return (
    <Text style={[styles.rule, ok && styles.ruleOk]}>
      {ok ? "✓" : "○"} {text}
    </Text>
  );
}

function PrimaryButton({
  title,
  onPress,
  loading = false,
}: {
  title: string;
  onPress: () => void;
  loading?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={loading}
      style={({ pressed }) => [
        styles.primaryButton,
        pressed && styles.buttonPressed,
        loading && styles.buttonDisabled,
      ]}
    >
      {loading ? (
        <ActivityIndicator color="#fff" size="small" />
      ) : (
        <Text style={styles.primaryButtonText}>{title}</Text>
      )}
    </Pressable>
  );
}

function SecondaryButton({
  title,
  onPress,
}: {
  title: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.secondaryButton,
        pressed && styles.buttonPressed,
      ]}
    >
      <Text style={styles.secondaryButtonText}>{title}</Text>
    </Pressable>
  );
}

function Divider() {
  return (
    <View style={styles.dividerRow}>
      <View style={styles.divider} />
      <Text style={styles.dividerText}>OR</Text>
      <View style={styles.divider} />
    </View>
  );
}

function Card({
  number,
  title,
  description,
  children,
}: {
  number: string;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.numberBadge}>
          <Text style={styles.numberText}>{number}</Text>
        </View>
        <View style={styles.cardHeading}>
          <Text style={styles.cardTitle}>{title}</Text>
          <Text style={styles.cardDescription}>{description}</Text>
        </View>
      </View>
      {children}
    </View>
  );
}

function Label({ title, items }: { title: string; items: any[] }) {
  return (
    <View style={styles.labelSection}>
      <Text style={styles.labelTitle}>{title}</Text>
      {Array.isArray(items) && items.length > 0 ? (
        <View style={styles.chips}>
          {items.map((item, index) => (
            <View style={styles.chip} key={`${String(item)}-${index}`}>
              <Text style={styles.chipText}>{String(item)}</Text>
            </View>
          ))}
        </View>
      ) : (
        <Text style={styles.muted}>None detected</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },

  authBackground: {
    flex: 1,
    backgroundColor: "#F5F7FB",
  },

  authScroll: {
    flexGrow: 1,
    padding: 24,
    justifyContent: "center",
    maxWidth: 560,
    width: "100%",
    alignSelf: "center",
  },

  brandMark: {
    width: 58,
    height: 58,
    borderRadius: 17,
    backgroundColor: "#111827",
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
    marginBottom: 14,
  },

  brandMarkText: {
    color: "#fff",
    fontSize: 28,
    fontWeight: "900",
  },

  authBrand: {
    textAlign: "center",
    fontSize: 34,
    fontWeight: "900",
    color: "#111827",
    letterSpacing: -1,
  },

  authTagline: {
    textAlign: "center",
    color: "#667085",
    marginTop: 6,
    marginBottom: 26,
    fontSize: 15,
  },

  authCard: {
    backgroundColor: "#fff",
    borderRadius: 24,
    padding: 24,
    borderWidth: 1,
    borderColor: "#E7EAF0",
    shadowColor: "#101828",
    shadowOpacity: 0.08,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 10 },
    elevation: 4,
  },

  authTitle: {
    fontSize: 25,
    fontWeight: "900",
    color: "#101828",
    letterSpacing: -0.5,
  },

  authDescription: {
    color: "#667085",
    lineHeight: 21,
    marginTop: 7,
    marginBottom: 22,
  },

  strong: {
    fontWeight: "800",
    color: "#344054",
  },

  field: {
    marginBottom: 14,
  },

  fieldLabel: {
    fontSize: 13,
    fontWeight: "800",
    color: "#344054",
    marginBottom: 7,
  },

  input: {
    width: "100%",
    minHeight: 50,
    borderWidth: 1,
    borderColor: "#D9DEE8",
    backgroundColor: "#FBFCFE",
    borderRadius: 13,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: "#101828",
    fontSize: 15,
  },

  textarea: {
    minHeight: 150,
    textAlignVertical: "top",
  },

  passwordWrap: {
    minHeight: 50,
    borderWidth: 1,
    borderColor: "#D9DEE8",
    backgroundColor: "#FBFCFE",
    borderRadius: 13,
    flexDirection: "row",
    alignItems: "center",
    paddingLeft: 14,
    paddingRight: 12,
  },

  passwordInput: {
    flex: 1,
    color: "#101828",
    fontSize: 15,
    paddingVertical: 12,
  },

  showText: {
    color: "#344054",
    fontWeight: "800",
    padding: 5,
  },

  passwordRules: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: -4,
    marginBottom: 16,
  },

  rule: {
    color: "#98A2B3",
    fontSize: 12,
    fontWeight: "700",
  },

  ruleOk: {
    color: "#1570EF",
  },

  forgotButton: {
    alignSelf: "flex-end",
    marginTop: -4,
    marginBottom: 14,
  },

  forgotText: {
    color: "#175CD3",
    fontWeight: "800",
    fontSize: 13,
  },

  primaryButton: {
    minHeight: 52,
    borderRadius: 13,
    backgroundColor: "#111827",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 18,
    marginBottom: 10,
  },

  primaryButtonText: {
    color: "#fff",
    fontWeight: "900",
    fontSize: 15,
  },

  secondaryButton: {
    minHeight: 50,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: "#D9DEE8",
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 18,
    marginBottom: 10,
  },

  secondaryButtonText: {
    color: "#344054",
    fontWeight: "800",
    fontSize: 14,
  },

  buttonPressed: {
    opacity: 0.75,
  },

  buttonDisabled: {
    opacity: 0.55,
  },

  dividerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginVertical: 12,
  },

  divider: {
    flex: 1,
    height: 1,
    backgroundColor: "#EAECF0",
  },

  dividerText: {
    color: "#98A2B3",
    fontSize: 11,
    fontWeight: "800",
  },

  bottomText: {
    textAlign: "center",
    color: "#667085",
    fontSize: 13,
    marginBottom: 8,
  },

  centerLink: {
    alignItems: "center",
    paddingVertical: 10,
  },

  linkText: {
    color: "#175CD3",
    fontWeight: "800",
  },

  securityNote: {
    textAlign: "center",
    color: "#98A2B3",
    fontSize: 11,
    marginTop: 18,
  },

  appBackground: {
    flex: 1,
    backgroundColor: "#F5F7FB",
  },

  appContent: {
    padding: 20,
    paddingBottom: 70,
    maxWidth: 1000,
    width: "100%",
    alignSelf: "center",
  },

  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 28,
  },

  brandRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },

  smallMark: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "#111827",
    alignItems: "center",
    justifyContent: "center",
  },

  smallMarkText: {
    color: "#fff",
    fontSize: 19,
    fontWeight: "900",
  },

  appBrand: {
    fontSize: 19,
    fontWeight: "900",
    color: "#101828",
  },

  appSubtitle: {
    fontSize: 11,
    color: "#98A2B3",
    marginTop: 1,
  },

  logoutButton: {
    borderWidth: 1,
    borderColor: "#E4E7EC",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    backgroundColor: "#fff",
  },

  logoutText: {
    color: "#344054",
    fontSize: 12,
    fontWeight: "800",
  },

  hero: {
    backgroundColor: "#111827",
    borderRadius: 25,
    padding: 25,
    marginBottom: 16,
  },

  eyebrow: {
    color: "#98A2B3",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.5,
    marginBottom: 8,
  },

  heroTitle: {
    color: "#fff",
    fontSize: 34,
    fontWeight: "900",
    letterSpacing: -1,
  },

  heroText: {
    color: "#D0D5DD",
    fontSize: 14,
    lineHeight: 21,
    marginTop: 8,
    maxWidth: 650,
  },

  tabs: {
    flexDirection: "row",
    backgroundColor: "#EAECF0",
    padding: 4,
    borderRadius: 13,
    marginBottom: 16,
  },

  tab: {
    flex: 1,
    paddingVertical: 11,
    alignItems: "center",
    borderRadius: 10,
  },

  tabActive: {
    backgroundColor: "#fff",
  },

  tabText: {
    color: "#667085",
    fontSize: 13,
    fontWeight: "800",
  },

  tabTextActive: {
    color: "#101828",
  },

  card: {
    backgroundColor: "#fff",
    borderRadius: 22,
    padding: 19,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#E7EAF0",
  },

  cardHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 18,
  },

  numberBadge: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: "#F2F4F7",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 11,
  },

  numberText: {
    fontSize: 11,
    fontWeight: "900",
    color: "#475467",
  },

  cardHeading: {
    flex: 1,
  },

  cardTitle: {
    fontSize: 18,
    fontWeight: "900",
    color: "#101828",
  },

  cardDescription: {
    color: "#667085",
    fontSize: 13,
    lineHeight: 18,
    marginTop: 2,
  },

  statusPill: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#ECFDF3",
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
    marginBottom: 5,
  },

  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 7,
    backgroundColor: "#12B76A",
    marginRight: 7,
  },

  statusText: {
    color: "#027A48",
    fontSize: 12,
    fontWeight: "800",
  },

  loadingCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
    padding: 15,
    backgroundColor: "#fff",
    borderRadius: 15,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#E7EAF0",
  },

  loadingText: {
    color: "#667085",
    fontSize: 13,
    fontWeight: "700",
  },

  scoreBox: {
    backgroundColor: "#F8FAFC",
    borderRadius: 18,
    alignItems: "center",
    padding: 22,
    marginBottom: 16,
  },

  score: {
    fontSize: 48,
    fontWeight: "900",
    color: "#101828",
    letterSpacing: -2,
  },

  scoreLabel: {
    color: "#667085",
    fontSize: 12,
    fontWeight: "700",
  },

  infoBox: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E4E7EC",
    padding: 14,
    marginBottom: 17,
  },

  infoLabel: {
    color: "#667085",
    fontSize: 11,
    fontWeight: "900",
    textTransform: "uppercase",
    marginBottom: 5,
  },

  infoText: {
    color: "#344054",
    lineHeight: 20,
    fontSize: 14,
  },

  labelSection: {
    marginBottom: 17,
  },

  labelTitle: {
    color: "#344054",
    fontSize: 13,
    fontWeight: "900",
    marginBottom: 8,
  },

  chips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 7,
  },

  chip: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 7,
    backgroundColor: "#F2F4F7",
  },

  chipText: {
    color: "#475467",
    fontSize: 12,
    fontWeight: "700",
  },

  muted: {
    color: "#98A2B3",
    fontSize: 13,
  },

  twoButtons: {
    gap: 8,
  },

  buttonHalf: {
    width: "100%",
  },

  letterBox: {
    backgroundColor: "#F8FAFC",
    borderRadius: 15,
    padding: 16,
    borderWidth: 1,
    borderColor: "#EAECF0",
  },

  body: {
    color: "#344054",
    fontSize: 14,
    lineHeight: 22,
  },

  emptyState: {
    alignItems: "center",
    paddingVertical: 28,
    paddingHorizontal: 15,
  },

  emptyTitle: {
    color: "#344054",
    fontWeight: "900",
    fontSize: 15,
  },

  emptyText: {
    color: "#98A2B3",
    textAlign: "center",
    lineHeight: 19,
    marginTop: 5,
    fontSize: 13,
  },

  applicationRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopColor: "#EAECF0",
    paddingVertical: 14,
  },

  applicationMain: {
    flex: 1,
    paddingRight: 10,
  },

  applicationTitle: {
    color: "#101828",
    fontSize: 14,
    fontWeight: "900",
  },

  applicationCompany: {
    color: "#667085",
    fontSize: 12,
    marginTop: 3,
  },

  applicationScore: {
    alignItems: "flex-end",
  },

  applicationScoreNumber: {
    color: "#101828",
    fontWeight: "900",
    fontSize: 15,
  },

  applicationStatus: {
    color: "#667085",
    fontSize: 10,
    fontWeight: "800",
    marginTop: 2,
  },

  footer: {
    textAlign: "center",
    color: "#98A2B3",
    fontSize: 11,
    marginTop: 10,
  },
});
