import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as DocumentPicker from "expo-document-picker";

/* ============================ API CONFIG ============================ */

const PRODUCTION_API_URL = "https://apply-job-xp27.vercel.app";
const LOCAL_NATIVE_API_URL = "http://localhost:8000";
const API_BASE_URL =
  Platform.OS === "web" ? PRODUCTION_API_URL : LOCAL_NATIVE_API_URL;

const KEYS = {
  token: "applyai_token",
  theme: "applyai_theme",
  profile: "applyai_profile",
  resumeName: "applyai_resume_name",
  resumeText: "applyai_resume_text",
};

/* ============================== TYPES =============================== */

type AuthMode = "login" | "register" | "forgot" | "verify" | "reset";
type Tab = "workspace" | "applications";
type ThemeMode = "dark" | "light";

type Application = {
  id: number;
  job_id?: number;
  job_title?: string;
  company?: string;
  job_url?: string;
  match_score?: number;
  status?: string;
  cover_letter?: string;
  notes?: string;
  created_at?: string;
};

type JobAnalysis = {
  title?: string;
  company?: string;
  match_score?: number;
  score?: number;
  summary?: string;
  strengths?: string[];
  weaknesses?: string[];
  missing_skills?: string[];
  recommendations?: string[];
  [key: string]: any;
};

type Profile = {
  name: string;
  phone: string;
  email: string;
  linkedin: string;
  address: string;
};

/* ============================ PURE HELPERS ========================== */

function extractProfileFromResume(text: string): Profile {
  const empty: Profile = { name: "", phone: "", email: "", linkedin: "", address: "" };
  if (!text || !text.trim()) return empty;

  const emailMatch = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
  const linkedinMatch = text.match(
    /(?:https?:\/\/)?(?:www\.)?linkedin\.com\/in\/[a-zA-Z0-9\-_%]+/i
  );

  const phone = Array.from(text.matchAll(/(\+?\d[\d\s().-]{6,17}\d)/g))
    .map((m) => m[1].trim())
    .find((c) => {
      const d = c.replace(/\D/g, "");
      return d.length >= 9 && d.length <= 14;
    });

  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .slice(0, 10);

  const skipWords =
    /resume|curriculum|vitae|^cv$|objective|summary|profile|experience|education|skills|projects|contact|technical|certification|reference|language|achievement|award|publication|interest|hobbies|declaration|core|proficienc/i;

  const nameLine = lines.find((line) => {
    if (line.includes("@")) return false;
    if (/\d/.test(line)) return false;
    if (line.length < 3 || line.length > 60) return false;
    const words = line.split(/\s+/);
    if (words.length < 2 || words.length > 5) return false;
    const looksLikeName = words.every((w) => /^[A-Za-z][A-Za-z.'-]*$/.test(w));
    return looksLikeName && !skipWords.test(line);
  });

  return {
    name: nameLine || "",
    phone: phone || "",
    email: emailMatch ? emailMatch[0] : "",
    linkedin: linkedinMatch ? linkedinMatch[0] : "",
    address: "",
  };
}

function formatCoverLetterForDisplay(letter: string) {
  if (!letter) return letter;
  let r = letter;
  r = r.replace(/\*\*(.+?)\*\*/g, "$1");
  r = r.replace(/(^|\s)\*(\S.*?\S|\S)\*(?=\s|$)/g, "$1$2");
  r = r.replace(/^[ \t]*[*-][ \t]+/gm, "• ");
  r = r.replace(/^[ \t]+•/gm, "  •");
  r = r.replace(/\*+/g, "");
  r = r.replace(/\n{3,}/g, "\n\n");
  return r.trim();
}

function extractTextFromResponse(data: any): string {
  const candidates = [
    data?.text,
    data?.resume_text,
    data?.resumeText,
    data?.content,
    data?.extracted_text,
    data?.parsed_text,
    data?.raw_text,
    data?.resume?.text,
    data?.data?.text,
    data?.result?.text,
    Array.isArray(data) ? data[0]?.text : undefined,
  ];
  return (
    candidates.find((c) => typeof c === "string" && c.trim().length > 0) || ""
  );
}

async function parseResponse(response: Response) {
  const text = await response.text();
  let data: any = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { detail: text || "Unexpected server response" };
  }
  return data;
}

function errorFromData(data: any, status: number) {
  const d = data?.detail ?? data?.message;
  if (typeof d === "string") return d;
  if (d) return JSON.stringify(d);
  return `Request failed (${status})`;
}

/* ================================ APP =============================== */

export default function App() {
  /* ---- auth ---- */
  const [token, setToken] = useState<string | null>(null);
  const [initializing, setInitializing] = useState(true);
  const [authMode, setAuthMode] = useState<AuthMode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [resetCode, setResetCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [resetCodeVerified, setResetCodeVerified] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);

  /* ---- dashboard ---- */
  const [activeTab, setActiveTab] = useState<Tab>("workspace");
  const [theme, setTheme] = useState<ThemeMode>("dark");

  /* ---- resume ---- */
  const [resumeName, setResumeName] = useState("");
  const [resumeText, setResumeText] = useState("");

  /* ---- job ---- */
  const [jobDescription, setJobDescription] = useState("");
  const [jobUrl, setJobUrl] = useState("");
  const [analysis, setAnalysis] = useState<JobAnalysis | null>(null);
  const [coverLetter, setCoverLetter] = useState("");

  /* ---- applications ---- */
  const [applications, setApplications] = useState<Application[]>([]);
  const [selectedApplication, setSelectedApplication] =
    useState<Application | null>(null);

  /* ---- profile ---- */
  const [profileName, setProfileName] = useState("");
  const [profilePhone, setProfilePhone] = useState("");
  const [profileEmail, setProfileEmail] = useState("");
  const [profileLinkedIn, setProfileLinkedIn] = useState("");
  const [profileAddress, setProfileAddress] = useState("");

  /* ============================== COLORS ============================ */

  const colors = useMemo(() => {
    if (theme === "dark") {
      return {
        background: "#080C14",
        surface: "#101722",
        surface2: "#151E2D",
        surface3: "#1A2535",
        primary: "#6366F1",
        primaryDark: "#4F46E5",
        primarySoft: "#202554",
        text: "#F8FAFC",
        textSecondary: "#94A3B8",
        textMuted: "#64748B",
        border: "#243044",
        success: "#22C55E",
        danger: "#EF4444",
        warning: "#F59E0B",
        input: "#0D1420",
        white: "#FFFFFF",
      };
    }
    return {
      background: "#F6F8FC",
      surface: "#FFFFFF",
      surface2: "#F1F5F9",
      surface3: "#E8EEF7",
      primary: "#4F46E5",
      primaryDark: "#4338CA",
      primarySoft: "#EEF2FF",
      text: "#0F172A",
      textSecondary: "#64748B",
      textMuted: "#94A3B8",
      border: "#E2E8F0",
      success: "#16A34A",
      danger: "#DC2626",
      warning: "#D97706",
      input: "#FFFFFF",
      white: "#FFFFFF",
    };
  }, [theme]);

  /* ============================ INITIALIZATION ====================== */

  useEffect(() => {
    initializeApp();
  }, []);

  async function initializeApp() {
    try {
      const [
        savedToken,
        savedTheme,
        savedProfile,
        savedResumeName,
        savedResumeText,
      ] = await Promise.all([
        AsyncStorage.getItem(KEYS.token),
        AsyncStorage.getItem(KEYS.theme),
        AsyncStorage.getItem(KEYS.profile),
        AsyncStorage.getItem(KEYS.resumeName),
        AsyncStorage.getItem(KEYS.resumeText),
      ]);

      if (savedTheme === "dark" || savedTheme === "light") setTheme(savedTheme);

      if (savedProfile) {
        try {
          const p = JSON.parse(savedProfile);
          setProfileName(p?.name || "");
          setProfilePhone(p?.phone || "");
          setProfileEmail(p?.email || "");
          setProfileLinkedIn(p?.linkedin || "");
          setProfileAddress(p?.address || "");
        } catch (e) {
          console.log("Profile parse error:", e);
        }
      }

      if (savedResumeName) setResumeName(savedResumeName);
      if (savedResumeText) setResumeText(savedResumeText);

      if (savedToken) {
        setToken(savedToken);
        setActiveTab("workspace");
      }
    } catch (error) {
      console.log("Initialization error:", error);
    } finally {
      setInitializing(false);
    }
  }

  /* Contact details always come from the resume text */
  useEffect(() => {
    if (!resumeText.trim()) return;
    const d = extractProfileFromResume(resumeText);
    const next: Profile = {
      name: d.name || profileName,
      phone: d.phone || profilePhone,
      email: d.email || profileEmail,
      linkedin: d.linkedin || profileLinkedIn,
      address: profileAddress,
    };
    setProfileName(next.name);
    setProfilePhone(next.phone);
    setProfileEmail(next.email);
    setProfileLinkedIn(next.linkedin);
    AsyncStorage.setItem(KEYS.profile, JSON.stringify(next)).catch(() => {});
  }, [resumeText]);

  /* ============================== PROFILE =========================== */

  async function saveProfile(next: Partial<Profile>) {
    const merged: Profile = {
      name: next.name ?? profileName,
      phone: next.phone ?? profilePhone,
      email: next.email ?? profileEmail,
      linkedin: next.linkedin ?? profileLinkedIn,
      address: next.address ?? profileAddress,
    };
    try {
      await AsyncStorage.setItem(KEYS.profile, JSON.stringify(merged));
    } catch (e) {
      console.log("Profile save error:", e);
    }
  }

  /* Persist resume to device storage */
  async function persistResume(name: string, text: string) {
    try {
      await AsyncStorage.setItem(KEYS.resumeName, name);
      await AsyncStorage.setItem(KEYS.resumeText, text);
    } catch (e) {
      console.log("Resume save error:", e);
    }
  }

  /* Fill profile from resume text, but never wipe existing values */
  async function applyDetectedProfile(text: string) {
    const d = extractProfileFromResume(text);
    const next: Profile = {
      name: d.name || profileName,
      phone: d.phone || profilePhone,
      email: d.email || profileEmail,
      linkedin: d.linkedin || profileLinkedIn,
      address: profileAddress,
    };
    setProfileName(next.name);
    setProfilePhone(next.phone);
    setProfileEmail(next.email);
    setProfileLinkedIn(next.linkedin);
    await saveProfile(next);
  }

  /* ===================== COVER LETTER CLEANUP ======================= */

  function fillCoverLetterPlaceholders(letter: string) {
    if (!letter) return letter;
    let result = letter;

    const replacements: [RegExp, string][] = [
      [/\[\s*Your Name\s*\]/gi, profileName],
      [/\[\s*Your Address\s*\]/gi, profileAddress],
      [/\[\s*Phone\s*\]/gi, profilePhone],
      [/\[\s*Your Phone\s*\]/gi, profilePhone],
      [/\[\s*Email\s*\]/gi, profileEmail],
      [/\[\s*Your Email\s*\]/gi, profileEmail],
      [/\[\s*LinkedIn\s*\]/gi, profileLinkedIn],
    ];
    replacements.forEach(([pattern, value]) => {
      if (value) result = result.replace(pattern, value);
    });

    const dash = "[\\s.\\-\\u2010\\u2011\\u2012\\u2013\\u2014]{0,2}";
    const fakePhone = new RegExp(
      `\\+?\\d{0,3}${dash}x{2,3}${dash}x{6,8}`,
      "gi"
    );
    result = result.replace(fakePhone, profilePhone || "");
    result = result.replace(
      /linkedin\.com\/in\/(yourprofile|yourname|your-name)/gi,
      profileLinkedIn || ""
    );
    result = result.replace(/your\.?email@example\.com/gi, profileEmail || "");
    result = result.replace(/\[\s*[^\]\n]*\s*\]/g, "");
    result = result.replace(/\*{2,}\s*\*{2,}/g, "");
    result = result.replace(/^\s*\*{2,}\s*$/gm, "");
    result = result.replace(/[ \t]*\|[ \t]*\|[ \t]*/g, " | ");
    result = result.replace(/^[ \t]*\|[ \t]*/gm, "");
    result = result.replace(/[ \t]*\|[ \t]*$/gm, "");
    result = result.replace(/[ \t]+\n/g, "\n");
    result = result.replace(/\n{3,}/g, "\n\n");
    return result.trim();
  }

  function buildResumeTextForCoverLetter() {
    const lines: string[] = [];
    if (profileName) lines.push(`Name: ${profileName}`);
    if (profilePhone) lines.push(`Phone: ${profilePhone}`);
    if (profileEmail) lines.push(`Email: ${profileEmail}`);
    if (profileLinkedIn) lines.push(`LinkedIn: ${profileLinkedIn}`);
    if (profileAddress) lines.push(`Address: ${profileAddress}`);
    if (lines.length === 0) return resumeText;
    return `CONTACT INFORMATION\n${lines.join("\n")}\n\n${resumeText}`;
  }

  function buildFinalCoverLetter(rawLetter: string) {
    const fb = extractProfileFromResume(resumeText);
    const name = fb.name || profileName;
    const phone = fb.phone || profilePhone;
    const mail = fb.email || profileEmail;
    const linkedin = fb.linkedin || profileLinkedIn;
    const address = profileAddress || fb.address;

    const cleaned = formatCoverLetterForDisplay(
      fillCoverLetterPlaceholders(rawLetter)
    );
    const lines = cleaned.split(/\n/).map((l) => l.trim());
    const dearIndex = lines.findIndex((l) => /^dear\s/i.test(l));

    let body = dearIndex >= 0 ? lines.slice(dearIndex) : lines;

    if (dearIndex === -1) {
      const salutation = analysis?.company
        ? `Dear ${analysis.company} Hiring Team,`
        : "Dear Hiring Manager,";
      body = [salutation, "", ...body];
    }

    const closingPattern =
      /^(sincerely|best regards|kind regards|regards|yours\s+(faithfully|sincerely|truly)|respectfully|warm regards|thank you for your consideration)[,.]?$/i;

    const closingIndex = body
      .map((line, index) => ({ line, index }))
      .reverse()
      .find(({ line }) => closingPattern.test(line.trim()))?.index;

    if (closingIndex !== undefined) {
      body = body.slice(0, closingIndex);
    } else {
      const last = body[body.length - 1];
      if (!!last && name && last.trim() === name.trim()) {
        body = body.slice(0, -1);
      }
    }

    while (body.length && body[body.length - 1].trim() === "") {
      body = body.slice(0, -1);
    }

    const sender: string[] = [];
    if (name) sender.push(name);
    if (address) sender.push(address);
    const bits: string[] = [];
    if (phone) bits.push(phone);
    if (mail) bits.push(mail);
    if (linkedin) bits.push(linkedin);
    if (bits.length) sender.push(bits.join(" | "));
    sender.push(
      new Date().toLocaleDateString("en-GB", {
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    );

    const recipient: string[] = [];
    if (analysis?.company) {
      recipient.push("Hiring Manager");
      recipient.push(analysis.company);
    }

    const closing = ["Sincerely,", "", name || ""].filter(
      (line, i, arr) => !(i === arr.length - 1 && line === "" && !name)
    );

    if (
      (!profileName && name) ||
      (!profilePhone && phone) ||
      (!profileEmail && mail) ||
      (!profileLinkedIn && linkedin)
    ) {
      setProfileName(name);
      setProfilePhone(phone);
      setProfileEmail(mail);
      setProfileLinkedIn(linkedin);
      setProfileAddress(address);
      saveProfile({ name, phone, email: mail, linkedin, address });
    }

    return [
      sender.join("\n"),
      recipient.length ? recipient.join("\n") : "",
      body.join("\n").trim(),
      closing.join("\n"),
    ]
      .filter((s) => s.trim().length > 0)
      .join("\n\n")
      .trim();
  }

  /* =============================== THEME ============================ */

  async function toggleTheme() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    try {
      await AsyncStorage.setItem(KEYS.theme, next);
    } catch (e) {
      console.log("Theme save error:", e);
    }
  }

  /* =============================== ERRORS =========================== */

  function showError(error: any) {
    const detail = error?.message || "Something went wrong. Please try again.";
    setMessage(detail);
    if (Platform.OS !== "web") Alert.alert("ApplyAI", detail);
  }

  /* ================================ API ============================= */

  async function apiRequest(endpoint: string, options: RequestInit = {}) {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {}),
      },
    });
    const data = await parseResponse(response);
    if (!response.ok) throw new Error(errorFromData(data, response.status));
    return data;
  }

  async function apiAuth(endpoint: string, options: RequestInit = {}) {
    if (!token) throw new Error("You are not signed in.");
    return apiRequest(endpoint, {
      ...options,
      headers: {
        ...(options.headers || {}),
        Authorization: `Bearer ${token}`,
      },
    });
  }

  /* ================================ AUTH ============================ */

  async function saveToken(accessToken: string) {
    await AsyncStorage.setItem(KEYS.token, accessToken);
    setToken(accessToken);
    setActiveTab("workspace");
    setSelectedApplication(null);
  }

  function validateEmail() {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  }

  const cleanEmail = () => email.trim().toLowerCase();

  async function loginUser() {
    if (!validateEmail()) return setMessage("Please enter a valid email address.");
    if (!password) return setMessage("Please enter your password.");

    setLoading(true);
    setMessage("");
    try {
      const response = await apiRequest("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email: cleanEmail(), password }),
      });
      if (!response?.access_token) {
        throw new Error("Login succeeded but no access token was returned.");
      }
      await saveToken(response.access_token);
      setPassword("");
      setVerificationCode("");
      setMessage("");
    } catch (error: any) {
      if (error?.message?.toLowerCase().includes("verify your email")) {
        setAuthMode("verify");
        setMessage("Please verify your email to continue.");
      } else {
        showError(error);
      }
    } finally {
      setLoading(false);
    }
  }

  async function registerUser() {
    if (!validateEmail()) return setMessage("Please enter a valid email address.");
    if (password.length < 8)
      return setMessage("Password must be at least 8 characters.");

    setLoading(true);
    setMessage("");
    try {
      await apiRequest("/api/auth/register", {
        method: "POST",
        body: JSON.stringify({ email: cleanEmail(), password }),
      });
      setVerificationCode("");
      setAuthMode("verify");
      setMessage("Account created. Check your email for the verification code.");
      if (Platform.OS !== "web") {
        Alert.alert(
          "Verify your email",
          "We sent a verification code to your email address."
        );
      }
    } catch (error: any) {
      showError(error);
    } finally {
      setLoading(false);
    }
  }

  async function resendVerificationCode() {
    if (!validateEmail()) return setMessage("Enter your email first.");
    setLoading(true);
    setMessage("");
    try {
      await apiRequest("/api/auth/send-verification", {
        method: "POST",
        body: JSON.stringify({ email: cleanEmail() }),
      });
      setMessage("A new verification code has been sent to your email.");
    } catch (error: any) {
      showError(error);
    } finally {
      setLoading(false);
    }
  }

  async function verifyEmail() {
    if (!validateEmail()) return setMessage("Please enter a valid email.");
    if (!verificationCode.trim())
      return setMessage("Please enter the verification code.");

    setLoading(true);
    setMessage("");
    try {
      await apiRequest("/api/auth/verify-email", {
        method: "POST",
        body: JSON.stringify({
          email: cleanEmail(),
          code: verificationCode.trim(),
        }),
      });

      if (!password) {
        setAuthMode("login");
        setVerificationCode("");
        setMessage("Email verified successfully. Please sign in.");
        return;
      }

      const loginResponse = await apiRequest("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email: cleanEmail(), password }),
      });
      if (!loginResponse?.access_token) {
        throw new Error("Verification succeeded, but automatic login failed.");
      }

      await saveToken(loginResponse.access_token);
      setVerificationCode("");
      setPassword("");
      setMessage("");

      if (Platform.OS !== "web") {
        setTimeout(() => {
          Alert.alert(
            "Welcome to ApplyAI",
            "Your email has been verified successfully."
          );
        }, 250);
      }
    } catch (error: any) {
      showError(error);
    } finally {
      setLoading(false);
    }
  }

  async function requestPasswordReset() {
    if (!validateEmail()) return setMessage("Please enter a valid email.");
    setLoading(true);
    setMessage("");
    setResetCodeVerified(false);
    try {
      await apiRequest("/api/auth/forgot-password", {
        method: "POST",
        body: JSON.stringify({ email: cleanEmail() }),
      });
      setResetCode("");
      setAuthMode("reset");
      setMessage("Password reset code sent to your email.");
    } catch (error: any) {
      showError(error);
    } finally {
      setLoading(false);
    }
  }

  async function verifyResetCode() {
    if (!resetCode.trim()) return setMessage("Please enter the reset code.");
    setLoading(true);
    setMessage("");
    try {
      await apiRequest("/api/auth/verify-reset-code", {
        method: "POST",
        body: JSON.stringify({ email: cleanEmail(), code: resetCode.trim() }),
      });
      setResetCodeVerified(true);
      setMessage("Code verified. You can now create a new password.");
    } catch (error: any) {
      setResetCodeVerified(false);
      showError(error);
    } finally {
      setLoading(false);
    }
  }

  async function resetPassword() {
    if (!resetCodeVerified)
      return setMessage("Please verify your reset code first.");
    if (newPassword.length < 8)
      return setMessage("New password must be at least 8 characters.");

    setLoading(true);
    setMessage("");
    try {
      await apiRequest("/api/auth/reset-password", {
        method: "POST",
        body: JSON.stringify({
          email: cleanEmail(),
          code: resetCode.trim(),
          new_password: newPassword,
        }),
      });
      setPassword("");
      setNewPassword("");
      setResetCode("");
      setResetCodeVerified(false);
      setAuthMode("login");
      setMessage("Password updated successfully. Please sign in.");
    } catch (error: any) {
      showError(error);
    } finally {
      setLoading(false);
    }
  }

  async function logout() {
    try {
      await AsyncStorage.multiRemove([
        KEYS.token,
        KEYS.resumeName,
        KEYS.resumeText,
      ]);
    } catch (e) {
      console.log("Logout storage error:", e);
    }

    setToken(null);
    setApplications([]);
    setAnalysis(null);
    setCoverLetter("");
    setResumeName("");
    setResumeText("");
    setSelectedApplication(null);
    setActiveTab("workspace");
    setAuthMode("login");
    setPassword("");
    setVerificationCode("");
    setResetCode("");
    setNewPassword("");
  }

  /* ============================== RESUME ============================ */

  /*
   * Needs GET /api/resume/latest on the backend (see instructions).
   * Returns { filename, text } or null.
   */
  async function fetchLatestResume(): Promise<{
    filename: string;
    text: string;
  } | null> {
    try {
      const data = await apiAuth("/api/resume/latest");
      const text = extractTextFromResponse(data);
      if (!text) return null;
      return { filename: data?.filename || "Resume", text };
    } catch {
      return null;
    }
  }

  async function refreshResumeTextFromServer() {
    if (!token) return;
    setLoading(true);
    setMessage("");
    try {
      const latest = await fetchLatestResume();
      if (latest) {
        setResumeText(latest.text);
        if (!resumeName) setResumeName(latest.filename);
        await persistResume(resumeName || latest.filename, latest.text);
        await applyDetectedProfile(latest.text);
        setMessage("Full resume text refreshed successfully.");
      } else {
        setMessage(
          "Couldn't find your resume on the server. Upload it again or check GET /api/resume/latest."
        );
      }
    } catch (error: any) {
      showError(error);
    } finally {
      setLoading(false);
    }
  }

  async function pickResume() {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ["application/pdf"],
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (result.canceled) return;

      const file = result.assets?.[0];
      if (!file) return setMessage("No file selected.");

      if (file.name && !file.name.toLowerCase().endsWith(".pdf")) {
        return setMessage("Only PDF files are supported.");
      }

      setLoading(true);
      setMessage("");

      const formData = new FormData();
      if (Platform.OS === "web") {
        if (!file.file) {
          throw new Error(
            "Browser file data is unavailable. Please select the resume again."
          );
        }
        formData.append("file", file.file);
      } else {
        formData.append("file", {
          uri: file.uri,
          name: file.name || "resume.pdf",
          type: file.mimeType || "application/pdf",
        } as any);
      }

      const response = await fetch(`${API_BASE_URL}/api/resume/upload`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });

      const data = await parseResponse(response);

      if (!response.ok) {
        console.log("RESUME UPLOAD STATUS:", response.status, data);
        throw new Error(errorFromData(data, response.status));
      }

      const name =
        data?.filename || data?.name || file.name || "Resume uploaded";
      const extractedText = extractTextFromResponse(data);

      setResumeName(name);
      setResumeText(extractedText);
      await persistResume(name, extractedText);

      if (extractedText) {
        await applyDetectedProfile(extractedText);
        setMessage("Resume uploaded. Full resume text is shown below.");
      } else {
        console.log("RESPONSE KEYS:", Object.keys(data || {}));
        setMessage(
          "Resume uploaded, but no readable text was returned. Try 'Refresh from server'."
        );
      }
    } catch (error: any) {
      console.log("RESUME UPLOAD ERROR:", error);
      setMessage(error?.message || "Resume upload failed.");
    } finally {
      setLoading(false);
    }
  }

  function onResumeTextChange(value: string) {
    setResumeText(value);
    AsyncStorage.setItem(KEYS.resumeText, value).catch(() => {});
  }

  /* =========================== JOB ANALYSIS ========================= */

  async function analyzeJob() {
    if (!jobDescription.trim())
      return setMessage("Please paste the job description first.");

    setLoading(true);
    setMessage("");
    setAnalysis(null);
    setCoverLetter("");

    try {
      const response = await fetch(`${API_BASE_URL}/api/jobs/analyze`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          resume_text: resumeText || "",
          job_description: jobDescription || "",
          title: "",
          company: "",
          url: "",
        }),
      });

      const data = await parseResponse(response);
      console.log("ANALYZE STATUS:", response.status);

      if (!response.ok) throw new Error(errorFromData(data, response.status));

      setAnalysis(data?.analysis || data?.data || data);
      setMessage("Job analysis completed successfully.");
    } catch (error: any) {
      showError(error);
    } finally {
      setLoading(false);
    }
  }

  /* ============================ COVER LETTER ======================== */

  async function generateCoverLetter() {
    if (!token) return setMessage("Please login first.");
    if (!resumeText.trim()) return setMessage("Please upload your resume first.");
    if (!jobDescription.trim())
      return setMessage("Please enter a job description first.");
    const fb = extractProfileFromResume(resumeText);

    setLoading(true);
    setMessage("");

    try {
      const response = await fetch(`${API_BASE_URL}/api/jobs/cover-letter`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          resume_text: buildResumeTextForCoverLetter(),
          job_description: jobDescription,
          full_name: fb.name || profileName,
          phone: fb.phone || profilePhone,
          email: fb.email || profileEmail,
          linkedin: fb.linkedin || profileLinkedIn,
          address: profileAddress || fb.address,
        }),
      });

      const data = await parseResponse(response);
      console.log("COVER LETTER STATUS:", response.status);

      if (!response.ok) throw new Error(errorFromData(data, response.status));

      const generated =
        data?.cover_letter ||
        data?.coverLetter ||
        data?.letter ||
        data?.result ||
        data?.content ||
        "";

      setCoverLetter(
        typeof generated === "string"
          ? buildFinalCoverLetter(generated)
          : JSON.stringify(generated, null, 2)
      );
      setMessage("Cover letter generated successfully.");
    } catch (error: any) {
      console.error("COVER LETTER ERROR:", error);
      setMessage(error?.message || "Failed to generate cover letter.");
    } finally {
      setLoading(false);
    }
  }

  /* =========================== SAVE APPLICATION ===================== */

  async function saveApplication() {
    if (!jobDescription.trim())
      return setMessage("Please analyze a job before saving it.");

    setLoading(true);
    setMessage("");
    try {
      await apiAuth("/api/applications", {
        method: "POST",
        body: JSON.stringify({
          job_title: analysis?.title || "Job Application",
          company: analysis?.company || "",
          job_url: jobUrl.trim(),
          match_score: analysis?.match_score ?? analysis?.score ?? 0,
          status: "SAVED",
          cover_letter: coverLetter,
          notes: "",
          description: jobDescription.trim(),
        }),
      });
      setMessage("Application saved successfully.");
      await loadApplications();
    } catch (error: any) {
      showError(error);
    } finally {
      setLoading(false);
    }
  }

  async function loadApplications() {
    if (!token) return;
    try {
      const response = await apiAuth("/api/applications");
      const list = Array.isArray(response)
        ? response
        : response?.applications || response?.items || [];
      setApplications(list);
    } catch (error) {
      console.log("Application loading error:", error);
    }
  }

  /* On login / app start: load applications and restore resume from server */
  useEffect(() => {
    if (!token) return;
    loadApplications();

    (async () => {
      const latest = await fetchLatestResume();
      if (latest) {
        setResumeText((current) => current || latest.text);
        setResumeName((current) => current || latest.filename);
        const savedText = await AsyncStorage.getItem(KEYS.resumeText);
        if (!savedText) await persistResume(latest.filename, latest.text);
      }
    })();
  }, [token]);

  /* ============================== UI HELPERS ======================== */

  function clearMessage() {
    if (message) setMessage("");
  }

  function renderThemeButton() {
    return (
      <TouchableOpacity
        onPress={toggleTheme}
        activeOpacity={0.8}
        style={[
          styles.themeButton,
          { backgroundColor: colors.surface2, borderColor: colors.border },
        ]}
      >
        <Text style={styles.themeIcon}>{theme === "dark" ? "☀️" : "🌙"}</Text>
      </TouchableOpacity>
    );
  }

  function renderBrand(subtitle: string) {
    return (
      <View style={styles.brandRow}>
        <View style={[styles.logoSmall, { backgroundColor: colors.primary }]}>
          <Text style={styles.logoText}>A</Text>
        </View>
        <View>
          <Text style={[styles.brandName, { color: colors.text }]}>ApplyAI</Text>
          <Text style={[styles.brandSubtitle, { color: colors.textSecondary }]}>
            {subtitle}
          </Text>
        </View>
      </View>
    );
  }

  function renderBrandHeader() {
    return (
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        {renderBrand("AI Career Assistant")}
        <View style={styles.headerActions}>{renderThemeButton()}</View>
      </View>
    );
  }

  function renderMessage() {
    if (!message) return null;
    return (
      <View
        style={[
          styles.messageBox,
          { backgroundColor: colors.primarySoft, borderColor: colors.primary },
        ]}
      >
        <Text style={[styles.messageText, { color: colors.primary }]}>
          {message}
        </Text>
      </View>
    );
  }

  function renderInput(
    placeholder: string,
    value: string,
    onChangeText: (v: string) => void,
    options?: {
      secure?: boolean;
      multiline?: boolean;
      keyboardType?: any;
      right?: React.ReactNode;
    }
  ) {
    return (
      <View
        style={[
          styles.inputWrapper,
          { backgroundColor: colors.input, borderColor: colors.border },
        ]}
      >
        <TextInput
          placeholder={placeholder}
          placeholderTextColor={colors.textMuted}
          value={value}
          onChangeText={(v) => {
            onChangeText(v);
            clearMessage();
          }}
          secureTextEntry={options?.secure || false}
          multiline={options?.multiline || false}
          keyboardType={options?.keyboardType || "default"}
          autoCapitalize="none"
          style={[
            styles.input,
            {
              color: colors.text,
              minHeight: options?.multiline ? 130 : undefined,
              textAlignVertical: options?.multiline ? "top" : "center",
            },
          ]}
        />
        {options?.right}
      </View>
    );
  }

  function renderPrimaryButton(
    title: string,
    onPress: () => void,
    disabled = false
  ) {
    return (
      <TouchableOpacity
        onPress={onPress}
        disabled={disabled || loading}
        activeOpacity={0.85}
        style={[
          styles.primaryButton,
          {
            backgroundColor: colors.primary,
            opacity: disabled || loading ? 0.6 : 1,
          },
        ]}
      >
        {loading ? (
          <ActivityIndicator color="#FFFFFF" />
        ) : (
          <Text style={styles.primaryButtonText}>{title}</Text>
        )}
      </TouchableOpacity>
    );
  }

  function renderLabel(text: string) {
    return <Text style={[styles.label, { color: colors.text }]}>{text}</Text>;
  }

  function renderLink(
    text: string,
    onPress: () => void,
    muted = false
  ) {
    return (
      <TouchableOpacity onPress={onPress} style={styles.backButton}>
        <Text
          style={[
            muted ? styles.secondaryLink : styles.linkText,
            { color: muted ? colors.textSecondary : colors.primary },
          ]}
        >
          {text}
        </Text>
      </TouchableOpacity>
    );
  }

  function passwordToggle(shown: boolean, toggle: () => void) {
    return (
      <TouchableOpacity onPress={toggle} style={styles.eyeButton}>
        <Text style={{ color: colors.textSecondary }}>
          {shown ? "Hide" : "Show"}
        </Text>
      </TouchableOpacity>
    );
  }

  function renderEmailBadge(label: string) {
    return (
      <View
        style={[
          styles.emailBadge,
          { backgroundColor: colors.surface2, borderColor: colors.border },
        ]}
      >
        <Text style={{ color: colors.textSecondary }}>{label}</Text>
        <Text style={{ color: colors.text, fontWeight: "700", marginTop: 4 }}>
          {email}
        </Text>
      </View>
    );
  }

  /* ============================== AUTH SCREEN ======================= */

  function renderAuth() {
    let title = "Welcome back";
    let subtitle = "Sign in to continue your AI-powered job search.";

    if (authMode === "register") {
      title = "Create your account";
      subtitle = "Build your AI-powered career workspace.";
    } else if (authMode === "forgot") {
      title = "Forgot password?";
      subtitle = "Enter your email and we'll send you a reset code.";
    } else if (authMode === "verify") {
      title = "Verify your email";
      subtitle = "Enter the verification code sent to your email.";
    } else if (authMode === "reset") {
      title = "Reset your password";
      subtitle = "Create a new secure password for your account.";
    }

    const goLogin = () => {
      setAuthMode("login");
      setMessage("");
    };

    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
        <StatusBar
          barStyle={theme === "dark" ? "light-content" : "dark-content"}
          backgroundColor={colors.background}
        />
        {renderBrandHeader()}

        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <ScrollView
            contentContainerStyle={styles.authScroll}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator
            persistentScrollbar
          >
            <View
              style={[
                styles.authCard,
                { backgroundColor: colors.surface, borderColor: colors.border },
              ]}
            >
              <View
                style={[styles.heroIcon, { backgroundColor: colors.primarySoft }]}
              >
                <Text style={styles.heroIconText}>✦</Text>
              </View>

              <Text style={[styles.authTitle, { color: colors.text }]}>{title}</Text>
              <Text style={[styles.authSubtitle, { color: colors.textSecondary }]}>
                {subtitle}
              </Text>

              {authMode !== "verify" && authMode !== "reset" && (
                <>
                  {renderLabel("Email address")}
                  {renderInput("you@example.com", email, setEmail, {
                    keyboardType: "email-address",
                  })}
                </>
              )}

              {authMode === "login" && (
                <>
                  {renderLabel("Password")}
                  {renderInput("Enter your password", password, setPassword, {
                    secure: !showPassword,
                    right: passwordToggle(showPassword, () =>
                      setShowPassword(!showPassword)
                    ),
                  })}

                  <TouchableOpacity
                    onPress={() => {
                      setAuthMode("forgot");
                      setMessage("");
                    }}
                    style={styles.forgotButton}
                  >
                    <Text style={[styles.linkText, { color: colors.primary }]}>
                      Forgot password?
                    </Text>
                  </TouchableOpacity>

                  {renderPrimaryButton("Sign in", loginUser)}

                  <View style={styles.dividerRow}>
                    <View style={[styles.divider, { backgroundColor: colors.border }]} />
                    <Text style={[styles.dividerText, { color: colors.textMuted }]}>
                      OR
                    </Text>
                    <View style={[styles.divider, { backgroundColor: colors.border }]} />
                  </View>

                  <TouchableOpacity
                    onPress={() => {
                      setAuthMode("register");
                      setMessage("");
                    }}
                    style={[styles.secondaryButton, { borderColor: colors.border }]}
                  >
                    <Text style={[styles.secondaryButtonText, { color: colors.text }]}>
                      Create an account
                    </Text>
                  </TouchableOpacity>
                </>
              )}

              {authMode === "register" && (
                <>
                  {renderLabel("Password")}
                  {renderInput("Minimum 8 characters", password, setPassword, {
                    secure: !showPassword,
                    right: passwordToggle(showPassword, () =>
                      setShowPassword(!showPassword)
                    ),
                  })}
                  {renderPrimaryButton("Create account", registerUser)}
                  {renderLink("Already have an account? Sign in", goLogin)}
                </>
              )}

              {authMode === "forgot" && (
                <>
                  {renderPrimaryButton("Send reset code", requestPasswordReset)}
                  {renderLink("Back to sign in", goLogin)}
                </>
              )}

              {authMode === "verify" && (
                <>
                  {renderEmailBadge("Verification email")}
                  {renderLabel("Verification code")}
                  {renderInput(
                    "Enter 6-digit code",
                    verificationCode,
                    setVerificationCode,
                    { keyboardType: "number-pad" }
                  )}
                  {renderPrimaryButton("Verify & continue", verifyEmail)}
                  {renderLink("Resend verification code", resendVerificationCode)}
                  {renderLink(
                    "Back to sign in",
                    () => {
                      goLogin();
                      setVerificationCode("");
                    },
                    true
                  )}
                </>
              )}

              {authMode === "reset" && (
                <>
                  {renderEmailBadge("Resetting password for")}
                  {renderLabel("Reset code")}
                  {renderInput("Enter reset code", resetCode, setResetCode, {
                    keyboardType: "number-pad",
                  })}

                  {!resetCodeVerified &&
                    renderPrimaryButton("Verify reset code", verifyResetCode)}

                  {resetCodeVerified && (
                    <>
                      <View
                        style={[
                          styles.successBox,
                          {
                            backgroundColor:
                              theme === "dark" ? "#102A1A" : "#ECFDF5",
                            borderColor: colors.success,
                          },
                        ]}
                      >
                        <Text style={{ color: colors.success, fontWeight: "700" }}>
                          ✓ Code verified
                        </Text>
                      </View>

                      {renderLabel("New password")}
                      {renderInput(
                        "Minimum 8 characters",
                        newPassword,
                        setNewPassword,
                        {
                          secure: !showNewPassword,
                          right: passwordToggle(showNewPassword, () =>
                            setShowNewPassword(!showNewPassword)
                          ),
                        }
                      )}
                      {renderPrimaryButton("Update password", resetPassword)}
                    </>
                  )}

                  {renderLink("Back to sign in", () => {
                    setAuthMode("login");
                    setResetCode("");
                    setNewPassword("");
                    setResetCodeVerified(false);
                  })}
                </>
              )}

              {renderMessage()}
            </View>

            <Text style={[styles.footerText, { color: colors.textMuted }]}>
              ApplyAI • AI-powered career assistant
            </Text>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  /* ========================= DASHBOARD HEADER ======================= */

  function renderDashboardHeader() {
    return (
      <View
        style={[
          styles.dashboardTop,
          { backgroundColor: colors.surface, borderBottomColor: colors.border },
        ]}
      >
        {renderBrand("Career workspace")}
        <View style={styles.headerActions}>
          {renderThemeButton()}
          <TouchableOpacity
            onPress={logout}
            activeOpacity={0.8}
            style={[
              styles.logoutButton,
              { backgroundColor: colors.surface2, borderColor: colors.border },
            ]}
          >
            <Text style={{ color: colors.text, fontSize: 18 }}>↪</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  /* ============================== WORKSPACE ========================= */

  function renderWorkspace() {
    const cardStyle = [
      styles.card,
      { backgroundColor: colors.surface, borderColor: colors.border },
    ];
    const hasResume = !!resumeName || !!resumeText;

    return (
      <>
        <View style={styles.welcomeSection}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.dashboardTitle, { color: colors.text }]}>
              Your career workspace
            </Text>
            <Text style={[styles.dashboardSubtitle, { color: colors.textSecondary }]}>
              Analyze jobs, tailor applications and move faster with AI.
            </Text>
          </View>
        </View>

        {/* stats */}
        <View style={styles.statsGrid}>
          <View
            style={[
              styles.statCard,
              { backgroundColor: colors.surface, borderColor: colors.border },
            ]}
          >
            <Text style={[styles.statNumber, { color: colors.primary }]}>
              {applications.length}
            </Text>
            <Text style={[styles.statLabel, { color: colors.textSecondary }]}>
              Applications
            </Text>
          </View>
          <View
            style={[
              styles.statCard,
              { backgroundColor: colors.surface, borderColor: colors.border },
            ]}
          >
            <Text
              style={[
                styles.statNumber,
                { color: hasResume ? colors.success : colors.textMuted },
              ]}
            >
              {hasResume ? "✓" : "—"}
            </Text>
            <Text style={[styles.statLabel, { color: colors.textSecondary }]}>
              Resume
            </Text>
          </View>
        </View>

        {/* ---------------- RESUME CARD ---------------- */}
        <View style={cardStyle}>
          <View style={styles.cardHeader}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.cardTitle, { color: colors.text }]}>
                Your resume
              </Text>
              <Text style={[styles.cardSubtitle, { color: colors.textSecondary }]}>
                Upload your latest resume (PDF) for AI matching. We automatically
                pull your name, phone, email and LinkedIn from it.
              </Text>
            </View>
            <Text style={styles.cardEmoji}>📄</Text>
          </View>

          {hasResume ? (
            <View
              style={[
                styles.fileBox,
                { backgroundColor: colors.surface2, borderColor: colors.border },
              ]}
            >
              <Text style={{ fontSize: 22 }}>✓</Text>
              <View style={{ flex: 1 }}>
                <Text
                  style={[styles.fileName, { color: colors.text }]}
                  numberOfLines={1}
                >
                  {resumeName || "Resume"}
                </Text>
                <Text style={{ color: colors.success, marginTop: 3 }}>
                  Resume ready
                </Text>
              </View>
            </View>
          ) : (
            <View style={[styles.emptyUpload, { borderColor: colors.border }]}>
              <Text style={{ color: colors.textSecondary, textAlign: "center" }}>
                No resume uploaded yet
              </Text>
            </View>
          )}

          <TouchableOpacity
            onPress={pickResume}
            activeOpacity={0.85}
            disabled={loading}
            style={[
              styles.secondaryButton,
              { borderColor: colors.border, marginTop: 14 },
            ]}
          >
            {loading ? (
              <ActivityIndicator color={colors.primary} />
            ) : (
              <Text style={[styles.secondaryButtonText, { color: colors.text }]}>
                {hasResume ? "Replace resume" : "Upload resume (PDF)"}
              </Text>
            )}
          </TouchableOpacity>

          {/* -------- FULL RESUME TEXT -------- */}
          {hasResume && (
            <View
              style={[
                styles.resumeTextContainer,
                { backgroundColor: colors.surface2, borderColor: colors.border },
              ]}
            >
              <View style={styles.resumeTextHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.resumeTextTitle, { color: colors.text }]}>
                    Full resume text
                  </Text>
                  <Text
                    style={[styles.resumeTextSubtitle, { color: colors.textSecondary }]}
                  >
                    The complete text extracted from your uploaded resume. You can
                    edit it before AI analysis.
                  </Text>
                </View>
                <Text style={{ fontSize: 22 }}>📝</Text>
              </View>

              <TextInput
                value={resumeText}
                onChangeText={onResumeTextChange}
                placeholder="Your full resume text will appear here..."
                placeholderTextColor={colors.textMuted}
                multiline
                textAlignVertical="top"
                scrollEnabled
                style={[
                  styles.resumeTextInput,
                  {
                    backgroundColor: colors.input,
                    borderColor: colors.border,
                    color: colors.text,
                  },
                ]}
              />

              {!resumeText.trim() && (
                <Text style={[styles.resumeTextWarning, { color: colors.warning }]}>
                  No readable text yet. Try "Refresh from server" or upload the
                  PDF again.
                </Text>
              )}

              <View style={styles.resumeTextFooter}>
                <Text style={{ color: colors.textMuted, fontSize: 11 }}>
                  {resumeText
                    ? `${resumeText.length.toLocaleString()} characters`
                    : "No text extracted"}
                </Text>
                <TouchableOpacity
                  onPress={refreshResumeTextFromServer}
                  activeOpacity={0.8}
                  disabled={loading}
                >
                  <Text
                    style={{ color: colors.primary, fontSize: 12, fontWeight: "800" }}
                  >
                    🔄 Refresh from server
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          </View>

        {/* ---------------- JOB ANALYSIS ---------------- */}
        <View style={cardStyle}>
          <View style={styles.cardHeader}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.cardTitle, { color: colors.text }]}>
                Analyze a job
              </Text>
              <Text style={[styles.cardSubtitle, { color: colors.textSecondary }]}>
                Paste a job description and let ApplyAI analyze the opportunity.
              </Text>
            </View>
            <Text style={styles.cardEmoji}>✨</Text>
          </View>

          {renderLabel("Job URL")}
          {renderInput("https://company.com/jobs/...", jobUrl, setJobUrl)}

          {renderLabel("Job description")}
          {renderInput(
            "Paste the complete job description here...",
            jobDescription,
            setJobDescription,
            { multiline: true }
          )}

          {renderPrimaryButton("Analyze job", analyzeJob)}
        </View>

        {/* ---------------- ANALYSIS RESULT ---------------- */}
        {analysis && (
          <View style={cardStyle}>
            <View style={styles.cardHeader}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.cardTitle, { color: colors.text }]}>
                  AI job analysis
                </Text>
                <Text style={[styles.cardSubtitle, { color: colors.textSecondary }]}>
                  AI-generated assessment based on your resume and job description.
                </Text>
              </View>
              <View
                style={[styles.scoreCircle, { backgroundColor: colors.primarySoft }]}
              >
                <Text style={{ color: colors.primary, fontWeight: "800" }}>
                  {Math.round(analysis.match_score ?? analysis.score ?? 0)}
                </Text>
              </View>
            </View>

            {!!analysis.summary && (
              <View style={styles.analysisSection}>
                <Text style={[styles.analysisHeading, { color: colors.text }]}>
                  Summary
                </Text>
                <Text style={[styles.bodyText, { color: colors.textSecondary }]}>
                  {analysis.summary}
                </Text>
              </View>
            )}

            {!!analysis.strengths?.length && (
              <View style={styles.analysisSection}>
                <Text style={[styles.analysisHeading, { color: colors.text }]}>
                  Strengths
                </Text>
                {analysis.strengths.map((item, i) => (
                  <Text
                    key={i}
                    style={[styles.listItem, { color: colors.textSecondary }]}
                  >
                    • {item}
                  </Text>
                ))}
              </View>
            )}

            {!!analysis.missing_skills?.length && (
              <View style={styles.analysisSection}>
                <Text style={[styles.analysisHeading, { color: colors.text }]}>
                  Missing skills
                </Text>
                {analysis.missing_skills.map((item, i) => (
                  <Text
                    key={i}
                    style={[styles.listItem, { color: colors.textSecondary }]}
                  >
                    • {item}
                  </Text>
                ))}
              </View>
            )}

            <View style={styles.actionRow}>
              <TouchableOpacity
                onPress={generateCoverLetter}
                activeOpacity={0.85}
                style={[styles.actionButton, { backgroundColor: colors.primary }]}
              >
                <Text style={styles.actionButtonText}>Generate cover letter</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={saveApplication}
                activeOpacity={0.85}
                style={[
                  styles.actionButton,
                  {
                    backgroundColor: colors.surface2,
                    borderWidth: 1,
                    borderColor: colors.border,
                  },
                ]}
              >
                <Text style={[styles.actionButtonText, { color: colors.text }]}>
                  Save application
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* ---------------- COVER LETTER ---------------- */}
        {!!coverLetter && (
          <View style={cardStyle}>
            <Text style={[styles.cardTitle, { color: colors.text }]}>
              AI cover letter
            </Text>
            <Text
              selectable
              style={[styles.coverLetter, { color: colors.textSecondary }]}
            >
              {coverLetter}
            </Text>
          </View>
        )}

        {renderMessage()}
      </>
    );
  }

  /* ============================ APPLICATIONS ======================== */

  function renderApplications() {
    return (
      <>
        <View style={styles.welcomeSection}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.dashboardTitle, { color: colors.text }]}>
              Applications
            </Text>
            <Text style={[styles.dashboardSubtitle, { color: colors.textSecondary }]}>
              Keep track of your saved opportunities.
            </Text>
          </View>
          <TouchableOpacity
            onPress={loadApplications}
            activeOpacity={0.8}
            style={[
              styles.refreshButton,
              { backgroundColor: colors.surface, borderColor: colors.border },
            ]}
          >
            <Text style={{ color: colors.text, fontSize: 18 }}>↻</Text>
          </TouchableOpacity>
        </View>

        {applications.length === 0 ? (
          <View
            style={[
              styles.emptyCard,
              { backgroundColor: colors.surface, borderColor: colors.border },
            ]}
          >
            <Text style={{ fontSize: 42 }}>📋</Text>
            <Text style={[styles.emptyTitle, { color: colors.text }]}>
              No applications yet
            </Text>
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
              Analyze a job from your workspace and save it here.
            </Text>
          </View>
        ) : (
          applications.map((application, index) => (
            <TouchableOpacity
              key={application.id ?? index}
              activeOpacity={0.85}
              onPress={() => setSelectedApplication(application)}
              style={[
                styles.applicationCard,
                { backgroundColor: colors.surface, borderColor: colors.border },
              ]}
            >
              <View style={styles.applicationTop}>
                <View style={{ flex: 1 }}>
                  <Text
                    style={[styles.applicationTitle, { color: colors.text }]}
                    numberOfLines={2}
                  >
                    {application.job_title || "Job Application"}
                  </Text>
                  <Text
                    style={[styles.applicationCompany, { color: colors.textSecondary }]}
                  >
                    {application.company || "Company not specified"}
                  </Text>
                </View>
                <View
                  style={[styles.matchBadge, { backgroundColor: colors.primarySoft }]}
                >
                  <Text style={{ color: colors.primary, fontWeight: "800" }}>
                    {Math.round(application.match_score ?? 0)}
                  </Text>
                </View>
              </View>

              <View style={styles.applicationBottom}>
                <Text style={{ color: colors.textMuted }}>
                  {application.status || "SAVED"}
                </Text>
                <Text style={{ color: colors.primary, fontWeight: "700" }}>
                  View →
                </Text>
              </View>
            </TouchableOpacity>
          ))
        )}

        {selectedApplication && (
          <View
            style={[
              styles.modalCard,
              { backgroundColor: colors.surface, borderColor: colors.border },
            ]}
          >
            <View style={styles.cardHeader}>
              <Text style={[styles.cardTitle, { color: colors.text }]}>
                Application details
              </Text>
              <TouchableOpacity onPress={() => setSelectedApplication(null)}>
                <Text style={{ color: colors.textSecondary, fontSize: 20 }}>×</Text>
              </TouchableOpacity>
            </View>

            <Text style={[styles.detailTitle, { color: colors.text }]}>
              {selectedApplication.job_title || "Job Application"}
            </Text>
            <Text style={[styles.detailCompany, { color: colors.textSecondary }]}>
              {selectedApplication.company || "Company not specified"}
            </Text>

            <View
              style={[styles.detailRow, { borderBottomColor: colors.border }]}
            >
              <Text style={{ color: colors.textSecondary }}>Match score</Text>
              <Text style={{ color: colors.primary, fontWeight: "800" }}>
                {Math.round(selectedApplication.match_score ?? 0)}
              </Text>
            </View>

            <View
              style={[styles.detailRow, { borderBottomColor: colors.border }]}
            >
              <Text style={{ color: colors.textSecondary }}>Status</Text>
              <Text style={{ color: colors.text, fontWeight: "700" }}>
                {selectedApplication.status || "SAVED"}
              </Text>
            </View>

            {!!selectedApplication.cover_letter && (
              <View style={{ marginTop: 18 }}>
                <Text style={[styles.analysisHeading, { color: colors.text }]}>
                  Cover letter
                </Text>
                <Text
                  selectable
                  style={[styles.bodyText, { color: colors.textSecondary }]}
                >
                  {selectedApplication.cover_letter}
                </Text>
              </View>
            )}
          </View>
        )}
      </>
    );
  }

  /* ============================== DASHBOARD ========================= */

  function renderDashboard() {
    const navItem = (tab: Tab, icon: string, label: string) => (
      <TouchableOpacity
        onPress={() => setActiveTab(tab)}
        activeOpacity={0.8}
        style={styles.navItem}
      >
        <Text style={{ fontSize: 20 }}>{icon}</Text>
        <Text
          style={[
            styles.navLabel,
            { color: activeTab === tab ? colors.primary : colors.textMuted },
          ]}
        >
          {label}
        </Text>
      </TouchableOpacity>
    );

    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
        <StatusBar
          barStyle={theme === "dark" ? "light-content" : "dark-content"}
          backgroundColor={colors.surface}
        />
        {renderDashboardHeader()}

        <ScrollView
          showsVerticalScrollIndicator
          persistentScrollbar
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.dashboardContent}
        >
          {activeTab === "workspace" ? renderWorkspace() : renderApplications()}
        </ScrollView>

        <View
          style={[
            styles.bottomNav,
            { backgroundColor: colors.surface, borderTopColor: colors.border },
          ]}
        >
          {navItem("workspace", "⌂", "Workspace")}
          {navItem("applications", "▣", "Applications")}
        </View>
      </SafeAreaView>
    );
  }

  /* ================================ SPLASH ========================== */

  if (initializing) {
    return (
      <SafeAreaView style={[styles.splash, { backgroundColor: colors.background }]}>
        <StatusBar
          barStyle={theme === "dark" ? "light-content" : "dark-content"}
          backgroundColor={colors.background}
        />
        <View style={[styles.splashLogo, { backgroundColor: colors.primary }]}>
          <Text style={styles.splashLogoText}>A</Text>
        </View>
        <Text style={[styles.splashTitle, { color: colors.text }]}>ApplyAI</Text>
        <Text style={[styles.splashSubtitle, { color: colors.textSecondary }]}>
          AI-powered career assistant
        </Text>
        <ActivityIndicator
          color={colors.primary}
          size="small"
          style={{ marginTop: 30 }}
        />
      </SafeAreaView>
    );
  }

  if (!token) return renderAuth();
  return renderDashboard();
}

/* ================================ STYLES ============================ */

const styles = StyleSheet.create({
  safe: { flex: 1 },

  splash: { flex: 1, alignItems: "center", justifyContent: "center" },
  splashLogo: {
    width: 92,
    height: 92,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    elevation: 10,
  },
  splashLogoText: { color: "#FFFFFF", fontSize: 52, fontWeight: "900" },
  splashTitle: {
    fontSize: 34,
    fontWeight: "900",
    marginTop: 22,
    letterSpacing: -1,
  },
  splashSubtitle: { fontSize: 14, marginTop: 8 },

  header: {
    height: 72,
    paddingHorizontal: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 1,
  },
  dashboardTop: {
    minHeight: 72,
    paddingHorizontal: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 1,
  },
  brandRow: { flexDirection: "row", alignItems: "center" },
  logoSmall: {
    width: 42,
    height: 42,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 11,
  },
  logoText: { color: "#FFFFFF", fontSize: 23, fontWeight: "900" },
  brandName: { fontSize: 18, fontWeight: "900" },
  brandSubtitle: { fontSize: 11, marginTop: 1 },
  headerActions: { flexDirection: "row", alignItems: "center", gap: 8 },
  themeButton: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  themeIcon: { fontSize: 18 },
  logoutButton: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },

  authScroll: {
    flexGrow: 1,
    justifyContent: "center",
    padding: 20,
    paddingTop: 32,
    paddingBottom: 40,
  },
  authCard: {
    width: "100%",
    maxWidth: 480,
    alignSelf: "center",
    borderWidth: 1,
    borderRadius: 28,
    padding: 24,
  },
  heroIcon: {
    width: 58,
    height: 58,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
  },
  heroIconText: { color: "#6366F1", fontSize: 29, fontWeight: "900" },
  authTitle: { fontSize: 29, fontWeight: "900", letterSpacing: -0.7 },
  authSubtitle: { fontSize: 14, lineHeight: 21, marginTop: 8, marginBottom: 25 },
  label: { fontSize: 13, fontWeight: "700", marginBottom: 8, marginTop: 12 },
  inputWrapper: {
    minHeight: 54,
    borderRadius: 15,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 15,
  },
  input: { flex: 1, fontSize: 15, paddingVertical: 14 },
  eyeButton: { paddingLeft: 10, paddingVertical: 10 },
  primaryButton: {
    minHeight: 54,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 20,
  },
  primaryButtonText: { color: "#FFFFFF", fontSize: 15, fontWeight: "800" },
  secondaryButton: {
    minHeight: 52,
    borderRadius: 15,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryButtonText: { fontSize: 14, fontWeight: "700" },
  forgotButton: { alignSelf: "flex-end", marginTop: 10 },
  linkText: { fontSize: 13, fontWeight: "700" },
  secondaryLink: { fontSize: 13, fontWeight: "600" },
  backButton: { alignItems: "center", marginTop: 18 },
  dividerRow: { flexDirection: "row", alignItems: "center", marginVertical: 22 },
  divider: { height: 1, flex: 1 },
  dividerText: { fontSize: 11, fontWeight: "700", marginHorizontal: 12 },
  messageBox: { borderRadius: 14, borderWidth: 1, padding: 13, marginTop: 18 },
  messageText: { fontSize: 13, lineHeight: 19, fontWeight: "600" },
  emailBadge: { borderRadius: 15, borderWidth: 1, padding: 14, marginBottom: 6 },
  successBox: { borderRadius: 14, borderWidth: 1, padding: 13, marginTop: 14 },
  footerText: { textAlign: "center", fontSize: 11, marginTop: 20 },

  dashboardContent: { padding: 18, paddingBottom: 100 },
  welcomeSection: { flexDirection: "row", alignItems: "center", marginBottom: 18 },
  dashboardTitle: { fontSize: 26, fontWeight: "900", letterSpacing: -0.5 },
  dashboardSubtitle: { fontSize: 13, lineHeight: 19, marginTop: 5, maxWidth: 600 },
  statsGrid: { flexDirection: "row", gap: 12, marginBottom: 14 },
  statCard: {
    flex: 1,
    minHeight: 100,
    borderRadius: 20,
    borderWidth: 1,
    padding: 17,
    justifyContent: "center",
  },
  statNumber: { fontSize: 27, fontWeight: "900" },
  statLabel: { fontSize: 12, marginTop: 4 },

  card: { borderWidth: 1, borderRadius: 22, padding: 18, marginBottom: 14 },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 14,
  },
  cardTitle: { fontSize: 18, fontWeight: "800" },
  cardSubtitle: { fontSize: 12, lineHeight: 18, marginTop: 5, maxWidth: 500 },
  cardEmoji: { fontSize: 25, marginLeft: 12 },
  fileBox: {
    borderRadius: 15,
    borderWidth: 1,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  fileName: { fontSize: 14, fontWeight: "700" },
  emptyUpload: {
    minHeight: 90,
    borderRadius: 15,
    borderWidth: 1,
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
  },

  resumeTextContainer: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 15,
    marginTop: 14,
  },
  resumeTextHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 12,
  },
  resumeTextTitle: { fontSize: 15, fontWeight: "800" },
  resumeTextSubtitle: { fontSize: 12, lineHeight: 18, marginTop: 4 },
  resumeTextInput: {
    width: "100%",
    minHeight: 320,
    maxHeight: 600,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontSize: 13,
    lineHeight: 20,
  },
  resumeTextWarning: { fontSize: 12, lineHeight: 18, marginTop: 10 },
  resumeTextFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 10,
    gap: 10,
  },

  scoreCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 12,
  },
  analysisSection: { marginTop: 15 },
  analysisHeading: { fontSize: 14, fontWeight: "800", marginBottom: 7 },
  bodyText: { fontSize: 13, lineHeight: 21 },
  listItem: { fontSize: 13, lineHeight: 21, marginBottom: 3 },
  actionRow: { gap: 10, marginTop: 20 },
  actionButton: {
    minHeight: 50,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  actionButtonText: { color: "#FFFFFF", fontSize: 13, fontWeight: "800" },
  coverLetter: { fontSize: 13, lineHeight: 22, marginTop: 12 },

  bottomNav: {
    height: 72,
    borderTopWidth: 1,
    flexDirection: "row",
    justifyContent: "space-around",
    alignItems: "center",
    paddingBottom: Platform.OS === "ios" ? 8 : 0,
  },
  navItem: { alignItems: "center", justifyContent: "center", minWidth: 110 },
  navLabel: { fontSize: 11, fontWeight: "700", marginTop: 4 },

  refreshButton: {
    width: 44,
    height: 44,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyCard: {
    minHeight: 260,
    borderRadius: 22,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 28,
  },
  emptyTitle: { fontSize: 19, fontWeight: "800", marginTop: 15 },
  emptyText: {
    fontSize: 13,
    lineHeight: 20,
    textAlign: "center",
    marginTop: 8,
    maxWidth: 330,
  },
  applicationCard: { borderRadius: 20, borderWidth: 1, padding: 17, marginBottom: 12 },
  applicationTop: { flexDirection: "row", alignItems: "flex-start" },
  applicationTitle: { fontSize: 16, fontWeight: "800", lineHeight: 21 },
  applicationCompany: { fontSize: 12, marginTop: 5 },
  matchBadge: {
    minWidth: 48,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 10,
  },
  applicationBottom: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 17,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "rgba(148,163,184,0.15)",
  },
  modalCard: { borderRadius: 22, borderWidth: 1, padding: 18, marginTop: 8 },
  detailTitle: { fontSize: 20, fontWeight: "800" },
  detailCompany: { fontSize: 13, marginTop: 5, marginBottom: 15 },
  detailRow: {
    minHeight: 48,
    borderBottomWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
});
