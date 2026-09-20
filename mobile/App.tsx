import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
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

export default function App() {
  const [token, setToken] = useState("");
  const [mode, setMode] = useState<"login" | "register">("login");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [resume, setResume] = useState("");
  const [job, setJob] = useState("");
  const [title, setTitle] = useState("");
  const [company, setCompany] = useState("");

  const [analysis, setAnalysis] = useState<any>(null);
  const [letter, setLetter] = useState("");
  const [applications, setApplications] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  // --------------------------------------------------
  // Load saved token
  // --------------------------------------------------

  useEffect(() => {
    AsyncStorage.getItem("token").then((value) => {
      if (value) {
        setToken(value);
      }
    });
  }, []);

  // --------------------------------------------------
  // Login / Register
  // --------------------------------------------------

  async function authenticate() {
    try {
      setLoading(true);

      const result = await api(
        `/api/auth/${mode === "login" ? "login" : "register"}`,
        {
          method: "POST",
          body: JSON.stringify({
            email,
            password,
          }),
        }
      );

      await AsyncStorage.setItem(
        "token",
        result.access_token
      );

      setToken(result.access_token);

    } catch (error: any) {
      Alert.alert(
        "Error",
        error.message || "Authentication failed"
      );

    } finally {
      setLoading(false);
    }
  }

  // --------------------------------------------------
  // Upload CV
  // --------------------------------------------------

  async function uploadCV() {
    const result =
      await DocumentPicker.getDocumentAsync({
        type: "application/pdf",
        copyToCacheDirectory: true,
      });

    if (result.canceled) {
      return;
    }

    const file = result.assets[0];

    console.log(
      "SELECTED FILE:",
      file
    );

    try {
      setLoading(true);

      const form = new FormData();

      // --------------------------------------------------
      // Expo Web
      // --------------------------------------------------

      if (file.base64) {
        const response = await fetch(
          file.base64
        );

        const blob =
          await response.blob();

        form.append(
          "file",
          new File(
            [blob],
            file.name || "resume.pdf",
            {
              type:
                file.mimeType ||
                "application/pdf",
            }
          )
        );

      } else {

        // --------------------------------------------------
        // Native Android / iOS
        // --------------------------------------------------

        form.append(
          "file",
          {
            uri: file.uri,
            name:
              file.name ||
              "resume.pdf",
            type:
              file.mimeType ||
              "application/pdf",
          } as any
        );
      }

      console.log(
        "Uploading to:",
        `${API_BASE_URL}/api/resume/upload`
      );

      const response =
        await fetch(
          `${API_BASE_URL}/api/resume/upload`,
          {
            method: "POST",
            headers: {
              Authorization:
                `Bearer ${token}`,
            },
            body: form,
          }
        );

      const responseText =
        await response.text();

      console.log(
        "UPLOAD STATUS:",
        response.status
      );

      console.log(
        "UPLOAD RESPONSE:",
        responseText
      );

      let data: any;

      try {
        data =
          JSON.parse(responseText);
      } catch {
        data = {
          detail: responseText,
        };
      }

      if (!response.ok) {
        const detail =
          typeof data.detail === "string"
            ? data.detail
            : JSON.stringify(
                data.detail,
                null,
                2
              );

        throw new Error(
          `HTTP ${response.status}: ${detail}`
        );
      }

      setResume(data.text || "");

      Alert.alert(
        "CV Uploaded",
        "Your PDF text was extracted successfully."
      );

    } catch (error: any) {

      console.log(
        "UPLOAD ERROR:",
        error
      );

      Alert.alert(
        "Upload Error",
        error.message ||
          "CV upload failed"
      );

    } finally {
      setLoading(false);
    }
  }

  // --------------------------------------------------
  // Analyze Job
  // --------------------------------------------------

  async function analyzeJob() {
    if (!resume.trim()) {
      Alert.alert(
        "CV required",
        "Upload or paste your CV first."
      );
      return;
    }

    if (!job.trim()) {
      Alert.alert(
        "Job description required",
        "Paste the job description first."
      );
      return;
    }

    try {
      setLoading(true);

      // Clear previous analysis
      setAnalysis(null);

      const result = await apiAuth(
        "/api/jobs/analyze",
        token,
        {
          method: "POST",
          body: JSON.stringify({
            resume_text: resume,
            job_description: job,
            title,
            company,
          }),
        }
      );

      // --------------------------------------------------
      // DEBUG: Show complete backend response
      // --------------------------------------------------

      console.log(
        "===================================="
      );

      console.log(
        "FULL ANALYSIS API RESPONSE:"
      );

      console.log(
        JSON.stringify(
          result,
          null,
          2
        )
      );

      console.log(
        "===================================="
      );

      // --------------------------------------------------
      // Find analysis object
      //
      // Supports:
      // result.analysis
      // result.data.analysis
      // result.result.analysis
      // result.data
      // direct result
      // --------------------------------------------------

      const ai =
        result?.analysis ??
        result?.data?.analysis ??
        result?.result?.analysis ??
        result?.data ??
        result;

      console.log(
        "EXTRACTED ANALYSIS:"
      );

      console.log(
        JSON.stringify(
          ai,
          null,
          2
        )
      );

      // --------------------------------------------------
      // Normalize all frontend fields
      // --------------------------------------------------

      let matchedSkills =
        Array.isArray(
          ai?.matched_skills
        )
          ? ai.matched_skills
          : [];

      let missingSkills =
        Array.isArray(
          ai?.missing_skills
        )
          ? ai.missing_skills
          : [];

      let atsKeywords =
        Array.isArray(
          ai?.ats_keywords
        )
          ? ai.ats_keywords
          : [];

      let requiredSkills =
        Array.isArray(
          ai?.required_skills
        )
          ? ai.required_skills
          : [];

      // --------------------------------------------------
      // If backend only returned required_skills,
      // calculate matched/missing from CV
      // --------------------------------------------------

      if (
        requiredSkills.length > 0
      ) {
        if (
          matchedSkills.length === 0
        ) {
          matchedSkills =
            requiredSkills.filter(
              (skill: any) => {
                const skillText =
                  String(skill)
                    .toLowerCase()
                    .trim();

                return (
                  skillText.length > 0 &&
                  resume
                    .toLowerCase()
                    .includes(skillText)
                );
              }
            );
        }

        if (
          missingSkills.length === 0
        ) {
          missingSkills =
            requiredSkills.filter(
              (skill: any) => {
                const skillText =
                  String(skill)
                    .toLowerCase()
                    .trim();

                return (
                  skillText.length > 0 &&
                  !resume
                    .toLowerCase()
                    .includes(skillText)
                );
              }
            );
        }
      }

      // --------------------------------------------------
      // ATS keywords fallback
      // --------------------------------------------------

      if (
        atsKeywords.length === 0
      ) {
        atsKeywords =
          requiredSkills;
      }

      // --------------------------------------------------
      // Match score
      // --------------------------------------------------

      let matchScore =
        ai?.match_score ?? 0;

      if (
        typeof matchScore ===
        "string"
      ) {
        matchScore =
          parseFloat(
            matchScore
          );
      }

      if (
        Number.isNaN(matchScore)
      ) {
        matchScore = 0;
      }

      // --------------------------------------------------
      // Recommendation
      // --------------------------------------------------

      const recommendation =
        ai?.recommendation ||
        (
          matchScore >= 60
            ? "Apply"
            : "Consider skill gap first"
        );

      // --------------------------------------------------
      // Strengths
      // --------------------------------------------------

      let strengths =
        Array.isArray(
          ai?.strengths
        )
          ? ai.strengths
          : [];

      if (
        strengths.length === 0
      ) {
        strengths =
          matchedSkills.slice(
            0,
            5
          );
      }

      // --------------------------------------------------
      // Weaknesses
      // --------------------------------------------------

      let weaknesses =
        Array.isArray(
          ai?.weaknesses
        )
          ? ai.weaknesses
          : [];

      if (
        weaknesses.length === 0
      ) {
        weaknesses =
          missingSkills.slice(
            0,
            5
          );
      }

      // --------------------------------------------------
      // Final frontend analysis object
      // --------------------------------------------------

      const normalizedAnalysis = {
        match_score:
          matchScore,

        recommendation:
          recommendation,

        required_skills:
          requiredSkills,

        matched_skills:
          matchedSkills,

        missing_skills:
          missingSkills,

        ats_keywords:
          atsKeywords,

        experience_match:
          ai?.experience_match ||
          "Review required",

        education_match:
          ai?.education_match ||
          "Review required",

        strengths:
          strengths,

        weaknesses:
          weaknesses,
      };

      console.log(
        "===================================="
      );

      console.log(
        "FINAL FRONTEND ANALYSIS:"
      );

      console.log(
        JSON.stringify(
          normalizedAnalysis,
          null,
          2
        )
      );

      console.log(
        "===================================="
      );

      // --------------------------------------------------
      // Update UI
      // --------------------------------------------------

      setAnalysis(
        normalizedAnalysis
      );

    } catch (error: any) {

      console.error(
        "ANALYSIS ERROR:",
        error
      );

      Alert.alert(
        "Analysis Error",
        error.message ||
          "Could not analyze job."
      );

    } finally {
      setLoading(false);
    }
  }

  // --------------------------------------------------
  // Generate Cover Letter
  // --------------------------------------------------

  async function generateCoverLetter() {
    if (!resume.trim()) {
      Alert.alert(
        "CV required",
        "Upload or paste your CV first."
      );
      return;
    }

    if (!job.trim()) {
      Alert.alert(
        "Job description required",
        "Paste the job description first."
      );
      return;
    }

    try {
      setLoading(true);

      const result =
        await apiAuth(
          "/api/jobs/cover-letter",
          token,
          {
            method: "POST",
            body: JSON.stringify({
              resume_text:
                resume,
              job_description:
                job,
              title,
              company,
            }),
          }
        );

      console.log(
        "COVER LETTER RESULT:",
        result
      );

      setLetter(
        result.cover_letter ||
          result.data?.cover_letter ||
          ""
      );

    } catch (error: any) {

      Alert.alert(
        "AI Error",
        error.message ||
          "Could not generate cover letter."
      );

    } finally {
      setLoading(false);
    }
  }

  // --------------------------------------------------
  // Save Application
  // --------------------------------------------------

  async function saveApplication() {
    try {
      await apiAuth(
        "/api/applications",
        token,
        {
          method: "POST",
          body: JSON.stringify({
            job_title:
              title,

            company:
              company,

            match_score:
              analysis?.match_score ||
              0,

            status:
              "SAVED",

            cover_letter:
              letter,
          }),
        }
      );

      Alert.alert(
        "Saved",
        "Application added to your tracker."
      );

      loadApplications();

    } catch (error: any) {

      Alert.alert(
        "Error",
        error.message ||
          "Could not save application."
      );
    }
  }

  // --------------------------------------------------
  // Load Applications
  // --------------------------------------------------

  async function loadApplications() {
    try {
      const data =
        await apiAuth(
          "/api/applications",
          token
        );

      console.log(
        "APPLICATIONS:",
        data
      );

      setApplications(
        Array.isArray(data)
          ? data
          : data?.applications || []
      );

    } catch (error) {

      console.log(
        "LOAD APPLICATIONS ERROR:",
        error
      );

      // User can retry
    }
  }

  // --------------------------------------------------
  // Logout
  // --------------------------------------------------

  async function logout() {
    await AsyncStorage.removeItem(
      "token"
    );

    setToken("");

    setAnalysis(null);
    setLetter("");
    setResume("");
    setJob("");
  }

  // --------------------------------------------------
  // Login / Register Screen
  // --------------------------------------------------

  if (!token) {
    return (
      <SafeAreaView
        style={styles.container}
      >
        <View
          style={styles.authCard}
        >
          <Text
            style={styles.logo}
          >
            ApplyAI
          </Text>

          <Text
            style={styles.subtitle}
          >
            Your AI Job Application Agent
          </Text>

          <TextInput
            style={styles.input}
            placeholder="Email"
            autoCapitalize="none"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
          />

          <TextInput
            style={styles.input}
            placeholder="Password"
            secureTextEntry
            value={password}
            onChangeText={setPassword}
          />

          <Button
            title={
              loading
                ? "Please wait..."
                : mode === "login"
                ? "Login"
                : "Create Account"
            }
            onPress={
              authenticate
            }
          />

          <Pressable
            onPress={() =>
              setMode(
                mode === "login"
                  ? "register"
                  : "login"
              )
            }
          >
            <Text
              style={styles.link}
            >
              {mode === "login"
                ? "Create a new account"
                : "Already have an account? Login"}
            </Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  // --------------------------------------------------
  // Main App
  // --------------------------------------------------

  return (
    <SafeAreaView
      style={styles.container}
    >
      <ScrollView
        contentContainerStyle={
          styles.content
        }
      >

        {/* Header */}

        <View
          style={styles.header}
        >
          <View>
            <Text
              style={styles.logo}
            >
              ApplyAI
            </Text>

            <Text
              style={styles.subtitle}
            >
              AI Job Application Agent
            </Text>
          </View>

          <Pressable
            onPress={logout}
          >
            <Text
              style={styles.logout}
            >
              Logout
            </Text>
          </Pressable>
        </View>

        {/* CV */}

        <Card title="1. My CV">

          <Button
            title="Upload PDF CV"
            onPress={uploadCV}
          />

          <TextInput
            style={[
              styles.input,
              styles.textarea,
            ]}
            multiline
            placeholder="Or paste your CV text here..."
            value={resume}
            onChangeText={
              setResume
            }
          />

        </Card>

        {/* Job Details */}

        <Card title="2. Job Details">

          <TextInput
            style={styles.input}
            placeholder="Job title"
            value={title}
            onChangeText={
              setTitle
            }
          />

          <TextInput
            style={styles.input}
            placeholder="Company"
            value={company}
            onChangeText={
              setCompany
            }
          />

          <TextInput
            style={[
              styles.input,
              styles.textarea,
            ]}
            multiline
            placeholder="Paste complete job description..."
            value={job}
            onChangeText={
              setJob
            }
          />

          <Button
            title="Analyze Job Match"
            onPress={
              analyzeJob
            }
          />

        </Card>

        {/* Loading */}

        {loading && (
          <ActivityIndicator
            size="large"
            style={{
              marginBottom: 16,
            }}
          />
        )}

        {/* AI Analysis */}

        {analysis && (
          <Card title="3. AI Analysis">

            <Text
              style={styles.score}
            >
              {analysis.match_score}%
            </Text>

            <Text
              style={styles.center}
            >
              Match Score
            </Text>

            {analysis.recommendation ? (
              <Text
                style={
                  styles.recommend
                }
              >
                {analysis.recommendation}
              </Text>
            ) : null}

            <Label
              title="Matched Skills"
              items={
                analysis.matched_skills ||
                []
              }
            />

            <Label
              title="Missing Skills"
              items={
                analysis.missing_skills ||
                []
              }
            />

            <Label
              title="ATS Keywords"
              items={
                analysis.ats_keywords ||
                []
              }
            />

            <Button
              title="Generate Cover Letter"
              onPress={
                generateCoverLetter
              }
            />

            <Button
              title="Save Application"
              onPress={
                saveApplication
              }
            />

          </Card>
        )}

        {/* Cover Letter */}

        {letter && (
          <Card title="4. Cover Letter">

            <Text
              style={styles.body}
            >
              {letter}
            </Text>

          </Card>
        )}

        {/* Application Tracker */}

        <Card title="5. Application Tracker">

          <Button
            title="Refresh Applications"
            onPress={
              loadApplications
            }
          />

          {applications.length === 0 ? (
            <Text
              style={styles.body}
            >
              No saved applications yet.
            </Text>
          ) : (
            applications.map(
              (item) => (
                <View
                  key={item.id}
                  style={styles.row}
                >

                  <Text
                    style={
                      styles.appTitle
                    }
                  >
                    {
                      item.job_title ||
                      "Untitled Job"
                    }
                  </Text>

                  <Text>
                    {
                      item.company ||
                      "Company"
                    }{" "}
                    •{" "}
                    {
                      item.status
                    }
                  </Text>

                  <Text>
                    Match:{" "}
                    {
                      item.match_score
                    }%
                  </Text>

                </View>
              )
            )
          )}

        </Card>

      </ScrollView>
    </SafeAreaView>
  );
}

// --------------------------------------------------
// Card Component
// --------------------------------------------------

function Card({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <View
      style={styles.card}
    >
      <Text
        style={
          styles.cardTitle
        }
      >
        {title}
      </Text>

      {children}
    </View>
  );
}

// --------------------------------------------------
// Label Component
// --------------------------------------------------

function Label({
  title,
  items,
}: {
  title: string;
  items: any[];
}) {
  return (
    <View
      style={{
        marginBottom: 14,
      }}
    >

      <Text
        style={styles.label}
      >
        {title}
      </Text>

      {Array.isArray(items) &&
      items.length > 0 ? (

        <View
          style={{
            marginTop: 4,
          }}
        >

          {items.map(
            (
              item,
              index
            ) => (
              <Text
                key={`${String(
                  item
                )}-${index}`}
                style={
                  styles.body
                }
              >
                •{" "}
                {String(item)}
              </Text>
            )
          )}

        </View>

      ) : (

        <Text
          style={styles.body}
        >
          None detected
        </Text>

      )}

    </View>
  );
}

// --------------------------------------------------
// Button Component
// --------------------------------------------------

function Button({
  title,
  onPress,
}: {
  title: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={styles.button}
      onPress={onPress}
    >
      <Text
        style={
          styles.buttonText
        }
      >
        {title}
      </Text>
    </Pressable>
  );
}

// --------------------------------------------------
// Styles
// --------------------------------------------------

const styles =
  StyleSheet.create({

    container: {
      flex: 1,
      backgroundColor:
        "#f5f7fb",
    },

    content: {
      padding: 18,
      paddingBottom: 60,
    },

    authCard: {
      margin: 20,
      marginTop: 100,
      padding: 24,
      backgroundColor:
        "#fff",
      borderRadius: 18,
    },

    header: {
      flexDirection:
        "row",
      justifyContent:
        "space-between",
      alignItems:
        "center",
      marginBottom: 18,
    },

    logo: {
      fontSize: 30,
      fontWeight:
        "800",
      color:
        "#111827",
    },

    subtitle: {
      color:
        "#6b7280",
      marginTop: 2,
    },

    logout: {
      color:
        "#dc2626",
      fontWeight:
        "700",
    },

    card: {
      backgroundColor:
        "#fff",
      borderRadius: 18,
      padding: 16,
      marginBottom: 16,
    },

    cardTitle: {
      fontSize: 19,
      fontWeight:
        "800",
      marginBottom: 12,
      color:
        "#111827",
    },

    input: {
      borderWidth: 1,
      borderColor:
        "#d1d5db",
      borderRadius: 12,
      padding: 12,
      marginBottom: 10,
      backgroundColor:
        "#fff",
    },

    textarea: {
      minHeight: 120,
      textAlignVertical:
        "top",
    },

    button: {
      backgroundColor:
        "#111827",
      padding: 13,
      borderRadius: 12,
      alignItems:
        "center",
      marginBottom: 10,
    },

    buttonText: {
      color:
        "#fff",
      fontWeight:
        "700",
    },

    link: {
      textAlign:
        "center",
      marginTop: 8,
      color:
        "#2563eb",
      fontWeight:
        "600",
    },

    score: {
      fontSize: 46,
      fontWeight:
        "900",
      textAlign:
        "center",
    },

    center: {
      textAlign:
        "center",
      color:
        "#6b7280",
    },

    recommend: {
      textAlign:
        "center",
      fontWeight:
        "800",
      marginVertical: 14,
    },

    label: {
      fontWeight:
        "800",
      marginBottom: 4,
    },

    body: {
      lineHeight: 21,
      color:
        "#374151",
    },

    row: {
      borderTopWidth: 1,
      borderTopColor:
        "#e5e7eb",
      paddingVertical: 12,
    },

    appTitle: {
      fontWeight:
        "800",
      fontSize: 16,
      marginBottom: 3,
    },

  });
